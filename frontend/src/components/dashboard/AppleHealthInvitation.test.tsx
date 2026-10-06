import { cleanup,fireEvent,render,screen,waitFor } from "@testing-library/react";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { AppleHealthInvitation,AppleHealthReminder,appleHealthInvitationStorageKey,useAppleHealthInvitation } from "./AppleHealthInvitation";

const mocks=vi.hoisted(() => ({ bridge:vi.fn(),nativeStatus:vi.fn(),serverStatus:vi.fn() }));
vi.mock("@/lib/appleHealth",() => ({
  hasAppleHealthBridge:mocks.bridge,
  AppleHealth:{ status:mocks.nativeStatus }
}));
vi.mock("@/lib/ascendApi",() => ({ getHealthActivityStatus:mocks.serverStatus }));

function Harness({ accountId="account-1" }: { accountId?: string | null }) {
  const invitation=useAppleHealthInvitation(accountId);
  return <><AppleHealthInvitation state={invitation.state} onPostpone={invitation.postpone} /><AppleHealthReminder state={invitation.state} /></>;
}

function native(overrides:Record<string,unknown>={}) {
  return { available:true,capability:"appleHealthReadV1",installationId:"phone-1",connected:false,accountId:null,connectionGeneration:null,calendarGeneration:null,lastReadAt:null,pendingCount:0,paused:false,...overrides };
}
function server(overrides:Record<string,unknown>={}) {
  return { status:{ enabled:true,consentVersion:"v1",timezone:null,calendarGeneration:null,connections:[],summary:null,...overrides } };
}

beforeEach(() => {
  window.localStorage.clear();
  mocks.bridge.mockReturnValue(true);
  mocks.nativeStatus.mockResolvedValue(native());
  mocks.serverStatus.mockResolvedValue(server());
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Apple Health dashboard invitation",() => {
  it("offers an eligible account without requesting Health access",async () => {
    render(<Harness />);
    expect(await screen.findByText("Keep your activity up to date")).toBeInTheDocument();
    expect(screen.getByRole("link",{ name:/Connect Apple Health/ })).toHaveAttribute("href","/profile/health-sync");
    expect(mocks.nativeStatus).toHaveBeenCalledOnce();
  });

  it("turns Maybe later into a quiet account-specific reminder",async () => {
    render(<Harness />);
    fireEvent.click(await screen.findByRole("button",{ name:"Maybe later" }));
    await waitFor(() => expect(screen.queryByText("Keep your activity up to date")).not.toBeInTheDocument());
    expect(screen.getByText("Fill Move with steps, active calories and workouts.")).toBeInTheDocument();
    expect(window.localStorage.getItem(appleHealthInvitationStorageKey("account-1"))).toBe("later");
  });

  it("restores only the quiet reminder after dismissal",async () => {
    window.localStorage.setItem(appleHealthInvitationStorageKey("account-1"),"later");
    render(<Harness />);
    expect(await screen.findByText("Fill Move with steps, active calories and workouts.")).toBeInTheDocument();
    expect(screen.queryByText("Keep your activity up to date")).not.toBeInTheDocument();
  });

  it("stays hidden on an older build or an account outside the rollout",async () => {
    mocks.bridge.mockReturnValue(false);
    const first=render(<Harness />);
    await waitFor(() => expect(screen.queryByText("Keep your activity up to date")).not.toBeInTheDocument());
    expect(mocks.nativeStatus).not.toHaveBeenCalled();
    first.unmount();

    mocks.bridge.mockReturnValue(true);
    mocks.serverStatus.mockResolvedValue(server({ enabled:false }));
    render(<Harness accountId="account-2" />);
    await waitFor(() => expect(mocks.serverStatus).toHaveBeenCalledOnce());
    expect(screen.queryByText("Keep your activity up to date")).not.toBeInTheDocument();
  });

  it("stays hidden when Apple Health is already connected",async () => {
    mocks.nativeStatus.mockResolvedValue(native({ connected:true }));
    render(<Harness />);
    await waitFor(() => expect(mocks.serverStatus).toHaveBeenCalledOnce());
    expect(screen.queryByText("Keep your activity up to date")).not.toBeInTheDocument();
    expect(screen.queryByText("Fill Move with steps, active calories and workouts.")).not.toBeInTheDocument();
  });

  it("does not return after a deliberate disconnect",async () => {
    mocks.serverStatus.mockResolvedValue(server({ connections:[{ installationId:"phone-1",connected:false }] }));
    render(<Harness />);
    await waitFor(() => expect(mocks.serverStatus).toHaveBeenCalledOnce());
    expect(screen.queryByText("Keep your activity up to date")).not.toBeInTheDocument();
    expect(screen.queryByText("Fill Move with steps, active calories and workouts.")).not.toBeInTheDocument();
  });
});

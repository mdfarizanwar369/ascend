import { cleanup,fireEvent,render,screen,waitFor } from "@testing-library/react";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { AppleHealthClient } from "./AppleHealthClient";
const mocks=vi.hoisted(() => ({ status:vi.fn(),native:vi.fn(),connect:vi.fn(),sync:vi.fn(),disconnect:vi.fn(),adjust:vi.fn(),select:vi.fn(),export:vi.fn() }));
vi.mock("@/components/BackButton",() => ({ BackButton:() => null }));
vi.mock("./PrivateActivityHistory",() => ({ PrivateActivityHistory:() => null }));
vi.mock("./HealthWorkoutHistory",() => ({ HealthWorkoutHistory:() => null }));
vi.mock("@/lib/appleHealth",() => ({ AppleHealth:{ status:mocks.native },connectAppleHealth:mocks.connect,runAppleHealthSync:mocks.sync,disconnectAppleHealth:mocks.disconnect }));
vi.mock("@/lib/ascendApi",() => ({ getHealthActivityStatus:mocks.status,saveHealthManualAdjustment:mocks.adjust,selectHealthActivitySource:mocks.select,exportHealthActivity:mocks.export }));
const connection={ id:"source",installationId:"phone",generation:"generation",provider:"apple_health",connected:true,selected:true,pendingSelection:false,lastUploadedAt:null,disconnectedAt:null };
const summary={ displayedCalories:0,steps:0,energyBasis:"active",coverage:"provider_daily",excludedManual:[],manualActiveCalories:0,manualAdjustments:[] };
const status=(changes:Record<string,unknown>={}) => ({ status:{ enabled:true,timezone:"Asia/Singapore",connections:[],summary:null,...changes } });
beforeEach(() => {
  vi.clearAllMocks(); mocks.status.mockResolvedValue(status());
  mocks.native.mockResolvedValue({ available:true,installationId:"phone",connected:false,pendingCount:0,lastReadAt:null });
  mocks.connect.mockResolvedValue(undefined); mocks.sync.mockResolvedValue(undefined); mocks.disconnect.mockResolvedValue(undefined);
});
afterEach(cleanup);
describe("Apple Health connection controls",() => {
  it("requires explicit account consent and does not connect on render",async () => {
    render(<AppleHealthClient />);
    const button=await screen.findByRole("button",{ name:"Connect Apple Health" });
    expect(button).toBeDisabled(); expect(mocks.connect).not.toHaveBeenCalled();
    const consent=screen.getByRole("checkbox",{ name:/I agree to store/ }); expect(consent).not.toBeChecked();
    fireEvent.click(consent); expect(button).toBeEnabled(); fireEvent.click(button);
    await waitFor(() => expect(mocks.connect).toHaveBeenCalledWith(false));
  });
  it("does not enable a connection for an ineligible account",async () => {
    mocks.status.mockResolvedValue(status({ enabled:false })); render(<AppleHealthClient />);
    fireEvent.click(await screen.findByRole("checkbox",{ name:/I agree to store/ }));
    expect(screen.getByRole("button",{ name:"Connect Apple Health" })).toBeDisabled();
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it("displays observed zero instead of missing data",async () => {
    mocks.status.mockResolvedValue(status({ connections:[connection],summary }));
    mocks.native.mockResolvedValue({ available:true,installationId:"phone",connected:true,pendingCount:0 });
    render(<AppleHealthClient />); await screen.findByText("Connected on this device");
    expect(screen.getAllByText("0")).toHaveLength(2);
    expect(screen.queryByText("No readable data")).not.toBeInTheDocument();
  });
  it("does not claim permission denial for missing observations",async () => {
    mocks.status.mockResolvedValue(status({ summary:{ ...summary,steps:null,displayedCalories:null } })); render(<AppleHealthClient />);
    await screen.findByRole("button",{ name:"Connect Apple Health" });
    expect(screen.getAllByText("No readable data")).toHaveLength(2);
    expect(screen.queryByText(/Permission denied/)).not.toBeInTheDocument();
  });
  it("separates disconnect from explicit imported-history deletion",async () => {
    mocks.status.mockResolvedValue(status({ connections:[connection],summary }));
    mocks.native.mockResolvedValue({ available:true,installationId:"phone",connected:true,pendingCount:0 }); render(<AppleHealthClient />);
    const remove=await screen.findByRole("button",{ name:"Delete imported history" }); expect(remove).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox",{ name:/Delete this device's imported history/ })); fireEvent.click(remove);
    await waitFor(() => expect(mocks.disconnect).toHaveBeenCalledWith(true));
  });
  it("allows removal of a confirmed untracked estimate",async () => {
    mocks.status.mockResolvedValue(status({ summary:{ ...summary,manualActiveCalories:150,manualAdjustments:[{ id:"manual",label:"Walk",activeCalories:150 }] } }));
    render(<AppleHealthClient />); fireEvent.click(await screen.findByRole("button",{ name:"Remove untracked adjustment" }));
    await waitFor(() => expect(mocks.adjust).toHaveBeenCalledWith("manual",null,false));
  });
  it("does not claim a successful sync on failure",async () => {
    mocks.status.mockResolvedValue(status({ connections:[connection] }));
    mocks.native.mockResolvedValue({ available:true,installationId:"phone",connected:true,pendingCount:0 }); mocks.sync.mockRejectedValue(new Error("Offline"));
    render(<AppleHealthClient />); fireEvent.click(await screen.findByRole("button",{ name:"Sync now" }));
    await screen.findByText("Offline"); expect(screen.queryByText("Available Health records refreshed.")).not.toBeInTheDocument();
  });
  it("reports automatic failures while retaining uploaded data",async () => {
    render(<AppleHealthClient />); await screen.findByRole("button",{ name:"Connect Apple Health" });
    window.dispatchEvent(new Event("ascend:health-sync-error"));
    await screen.findByText(/Last uploaded values are retained/);
  });
});

import { cleanup,render,waitFor } from "@testing-library/react";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";

const mocks=vi.hoisted(() => ({
  authCallback:null as ((user:unknown) => void) | null,
  currentUser:null as { uid:string;getIdToken:ReturnType<typeof vi.fn> } | null,
  status:vi.fn(),connect:vi.fn(),disconnect:vi.fn(),refreshWidget:vi.fn(),addListener:vi.fn(),remove:vi.fn()
}));
vi.mock("firebase/auth",() => ({ onAuthStateChanged:vi.fn((_auth,callback) => { mocks.authCallback=callback; callback(mocks.currentUser); return vi.fn(); }) }));
vi.mock("@capacitor/app",() => ({ App:{ addListener:mocks.addListener } }));
vi.mock("@/lib/api",() => ({ API_URL:"https://api.example.com/api/v1" }));
vi.mock("@/lib/firebase",() => ({
  getFirebaseClientAuth:() => ({ currentUser:mocks.currentUser }),
  waitForFirebasePersistence:vi.fn().mockResolvedValue(undefined)
}));
vi.mock("@/lib/nativePlatform",() => ({ getNativeCapacitorPlatform:() => "ios" }));
vi.mock("@/lib/ascendSiri",() => ({ ascendSiri:{ status:mocks.status,connect:mocks.connect,disconnect:mocks.disconnect,refreshWidget:mocks.refreshWidget } }));

import { AscendSiriCoordinator } from "./AscendSiriCoordinator";

beforeEach(() => {
  mocks.currentUser={ uid:"member-uid",getIdToken:vi.fn().mockResolvedValue("firebase-token") };
  mocks.authCallback=null;
  mocks.status.mockReset().mockResolvedValue({ supported:true,connected:false });
  mocks.connect.mockReset().mockResolvedValue({ connected:true,expiresAt:"2026-11-01T00:00:00Z" });
  mocks.disconnect.mockReset().mockResolvedValue(undefined);
  mocks.refreshWidget.mockReset().mockResolvedValue({ refreshed:true });
  mocks.remove.mockReset().mockResolvedValue(undefined);
  mocks.addListener.mockReset().mockResolvedValue({ remove:mocks.remove });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("silent Siri account coordinator",() => {
  it("renders no setup UI and silently connects the signed-in account",async () => {
    const { container }=render(<AscendSiriCoordinator />);
    expect(container).toBeEmptyDOMElement();
    await waitFor(() => expect(mocks.connect).toHaveBeenCalledWith({
      apiBaseUrl:"https://api.example.com/api/v1",firebaseToken:"firebase-token",firebaseUid:"member-uid"
    }));
  });

  it("renews the same account without disconnecting it",async () => {
    mocks.status.mockResolvedValue({ supported:true,connected:true,firebaseUid:"member-uid",expiresAt:"2026-10-07T00:00:00Z" });
    render(<AscendSiriCoordinator />);
    await waitFor(() => expect(mocks.connect).toHaveBeenCalledOnce());
    expect(mocks.disconnect).not.toHaveBeenCalled();
  });

  it("disconnects a former account before connecting the current account",async () => {
    mocks.status.mockResolvedValue({ supported:true,connected:true,firebaseUid:"former-uid" });
    render(<AscendSiriCoordinator />);
    await waitFor(() => expect(mocks.disconnect).toHaveBeenCalledOnce());
    expect(mocks.connect).toHaveBeenCalledWith(expect.objectContaining({ firebaseUid:"member-uid" }));
  });

  it("revokes the device credential after sign-out",async () => {
    mocks.currentUser=null;
    mocks.status.mockResolvedValue({ supported:true,connected:true,firebaseUid:"member-uid" });
    render(<AscendSiriCoordinator />);
    await waitFor(() => expect(mocks.disconnect).toHaveBeenCalledOnce());
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("does nothing on unsupported iOS versions",async () => {
    mocks.status.mockResolvedValue({ supported:false,connected:false });
    render(<AscendSiriCoordinator />);
    await waitFor(() => expect(mocks.status).toHaveBeenCalledOnce());
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("refreshes the widget after relevant dashboard data changes",async () => {
    render(<AscendSiriCoordinator />);
    await waitFor(() => expect(mocks.connect).toHaveBeenCalledOnce());

    window.dispatchEvent(new CustomEvent("ascend:dashboard-record-updated",{ detail:{ type:"water" } }));

    await waitFor(() => expect(mocks.refreshWidget).toHaveBeenCalledOnce());
  });

  it("refreshes the widget after an Apple Health upload",async () => {
    render(<AscendSiriCoordinator />);
    await waitFor(() => expect(mocks.connect).toHaveBeenCalledOnce());

    window.dispatchEvent(new Event("ascend:health-updated"));

    await waitFor(() => expect(mocks.refreshWidget).toHaveBeenCalledOnce());
  });
});

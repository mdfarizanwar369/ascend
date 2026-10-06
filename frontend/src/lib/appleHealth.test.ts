import { beforeEach,describe,expect,it,vi } from "vitest";
const mocks=vi.hoisted(() => ({ native:{ status:vi.fn(),requestAccess:vi.fn(),configure:vi.fn(),collect:vi.fn(),peek:vi.fn(),acknowledge:vi.fn(),disconnect:vi.fn(),pause:vi.fn() },
  connect:vi.fn(),serverStatus:vi.fn(),me:vi.fn(),import:vi.fn(),serverDisconnect:vi.fn(),auth:{ currentUser:{ uid:"one" } as { uid:string } | null },bridge:vi.fn() }));
vi.mock("@capacitor/core",() => ({ Capacitor:{ isPluginAvailable:mocks.bridge },registerPlugin:() => mocks.native }));
vi.mock("./nativePlatform",() => ({ isNativeCapacitorPlatform:() => true,getNativeCapacitorPlatform:() => "ios" }));
vi.mock("./firebase",() => ({ getFirebaseClientAuth:() => mocks.auth }));
vi.mock("./ascendApi",() => ({ connectHealthActivity:mocks.connect,getHealthActivityStatus:mocks.serverStatus,getMe:mocks.me,importHealthActivity:mocks.import,disconnectHealthActivity:mocks.serverDisconnect }));
import { connectAppleHealth,runAppleHealthSync } from "./appleHealth";
const native={ available:true,capability:"appleHealthReadV1",installationId:"phone",connected:true,accountId:"account",connectionGeneration:"generation",calendarGeneration:"calendar",pendingCount:0,paused:false };
const connection={ installationId:"phone",connected:true,generation:"generation" };
const status={ enabled:true,connections:[connection],timezone:"Asia/Singapore",calendarGeneration:"calendar" };
beforeEach(() => {
  vi.clearAllMocks(); mocks.auth.currentUser={ uid:"one" }; mocks.bridge.mockReturnValue(true);
  mocks.native.status.mockResolvedValue(native); mocks.serverStatus.mockResolvedValue({ status }); mocks.me.mockResolvedValue({ user:{ id:"account" } });
  mocks.native.collect.mockResolvedValue({ packet:null }); mocks.native.peek.mockResolvedValue({ packet:null });
  mocks.native.disconnect.mockResolvedValue(undefined); mocks.native.pause.mockResolvedValue(undefined); mocks.native.configure.mockResolvedValue(undefined);
});
describe("Apple Health account isolation and protected uploads",() => {
  it("does not offer connection through an old native binary",async () => {
    mocks.bridge.mockReturnValue(false); await expect(connectAppleHealth()).rejects.toThrow("Update the Ascend iOS app");
    expect(mocks.native.requestAccess).not.toHaveBeenCalled();
  });
  it("does not save consent if the account changes during the Apple sheet",async () => {
    mocks.native.requestAccess.mockImplementationOnce(async () => { mocks.auth.currentUser={ uid:"two" }; });
    await expect(connectAppleHealth()).rejects.toThrow("account changed"); expect(mocks.connect).not.toHaveBeenCalled();
  });
  it("clears the local association rather than uploading to a different account",async () => {
    mocks.me.mockResolvedValue({ user:{ id:"other-account" } }); await runAppleHealthSync(true);
    expect(mocks.native.disconnect).toHaveBeenCalledOnce(); expect(mocks.import).not.toHaveBeenCalled();
  });
  it("rejects a rotated server connection before reading or uploading",async () => {
    mocks.serverStatus.mockResolvedValue({ status:{ ...status,connections:[{ ...connection,generation:"rotated" }] } }); await runAppleHealthSync(true);
    expect(mocks.native.disconnect).toHaveBeenCalledOnce(); expect(mocks.native.collect).not.toHaveBeenCalled();
  });
  it("pauses collection without deleting queued updates when rollout is disabled",async () => {
    mocks.serverStatus.mockResolvedValue({ status:{ ...status,enabled:false } }); await runAppleHealthSync(true);
    expect(mocks.native.pause).toHaveBeenCalledOnce(); expect(mocks.native.disconnect).not.toHaveBeenCalled(); expect(mocks.import).not.toHaveBeenCalled();
  });
  it("serializes foreground uploads and only acknowledges the exact accepted request",async () => {
    const packet={ requestId:"request",sequence:1 };
    mocks.native.peek.mockResolvedValueOnce({ packet }).mockResolvedValue({ packet:null }); mocks.import.mockResolvedValue({ accepted:true,requestId:"request" });
    await Promise.all([runAppleHealthSync(true),runAppleHealthSync(true),runAppleHealthSync(true)]);
    expect(mocks.import).toHaveBeenCalledOnce(); expect(mocks.native.collect).toHaveBeenCalledOnce();
    expect(mocks.native.acknowledge).toHaveBeenCalledWith({ accountId:"account",requestId:"request" });
  });
  it("leaves an offline packet queued for immutable retry",async () => {
    mocks.native.peek.mockResolvedValueOnce({ packet:{ requestId:"retry" } }); mocks.import.mockRejectedValueOnce(new Error("Offline"));
    await expect(runAppleHealthSync(true)).rejects.toThrow("Offline"); expect(mocks.native.acknowledge).not.toHaveBeenCalled();
  });
  it("never removes a packet based on a mismatched acknowledgment",async () => {
    mocks.native.peek.mockResolvedValueOnce({ packet:{ requestId:"request" } }); mocks.import.mockResolvedValueOnce({ accepted:true,requestId:"other" });
    await expect(runAppleHealthSync(true)).rejects.toThrow("not acknowledged"); expect(mocks.native.acknowledge).not.toHaveBeenCalled();
  });
  it("restores observers after an authorized rollout pause",async () => {
    mocks.native.status.mockResolvedValue({ ...native,paused:true }); await runAppleHealthSync(true);
    expect(mocks.native.configure).toHaveBeenCalledWith({ accountId:"account",installationId:"phone",connectionGeneration:"generation",calendarGeneration:"calendar",timezone:"Asia/Singapore" });
  });
  it("clears device data on logout without sending imports",async () => {
    mocks.auth.currentUser=null; await runAppleHealthSync(true); expect(mocks.native.disconnect).toHaveBeenCalledOnce(); expect(mocks.import).not.toHaveBeenCalled();
  });
});

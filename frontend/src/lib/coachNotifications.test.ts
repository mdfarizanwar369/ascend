import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ uid: "account-a", permission: "prompt", callbacks: new Map<string, (value: unknown) => void>(),
  request: vi.fn(), register: vi.fn(), unregister: vi.fn(), save: vi.fn(), revoke: vi.fn(), signOut: vi.fn(), deviceStatus: vi.fn() }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true, getPlatform: () => "android", isPluginAvailable: () => true } }));
vi.mock("@capacitor/push-notifications", () => ({ PushNotifications: {
  checkPermissions: async () => ({ receive: state.permission }), requestPermissions: state.request,
  createChannel: async () => {}, addListener: async (name: string, callback: (v: unknown) => void) => {
    state.callbacks.set(name, callback); return { remove: async () => { state.callbacks.delete(name); } };
  }, register: state.register, unregister: state.unregister, removeAllDeliveredNotifications: async () => {}
} }));
vi.mock("firebase/messaging", () => ({ deleteToken: vi.fn(), getToken: vi.fn(), isSupported: vi.fn(), onMessage: vi.fn() }));
vi.mock("firebase/auth", () => ({ signOut: state.signOut }));
vi.mock("@/lib/firebase", () => ({ getFirebaseClientAuth: () => ({ currentUser: { uid: state.uid } }), getFirebaseClientApp: vi.fn() }));
vi.mock("@/lib/ascendApi", () => ({ registerNotificationDevice: state.save, unregisterNotificationDevice: state.revoke,
  notificationDeviceStatus: state.deviceStatus,
  recordNotificationActivity: vi.fn(), getSmartNudgePreferences: async () => ({ apnsAvailable: true }), clearAscendResponseCache: vi.fn() }));
vi.mock("@/lib/accountSession", () => ({ clearCachedAccountProfile: vi.fn() }));
vi.mock("@/lib/nativePlatform", () => ({ supportsNativeSocialAuth: () => false, getNativeCapacitorPlatform: () => "android" }));
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); localStorage.clear(); state.uid = "account-a"; state.permission = "prompt"; state.callbacks.clear();
  state.request.mockResolvedValue({ receive: "granted" }); state.save.mockResolvedValue({ device: { enabled: true } });
  state.revoke.mockResolvedValue({ disabled: true }); state.unregister.mockResolvedValue(undefined);
  state.register.mockImplementation(async () => {
    expect(state.callbacks.has("registrationError")).toBe(true);
    state.callbacks.get("registration")?.({ value: "fake-token-for-local-tests-only" });
  });
});
it("registers only after explicit permission and attaches listeners before requesting a token", async () => {
  const notifications = await import("./coachNotifications");
  expect(await notifications.refreshNativeCoachNotificationToken()).toBeNull(); expect(state.request).not.toHaveBeenCalled();
  await notifications.enableCoachNotifications(); expect(state.request).toHaveBeenCalledOnce(); expect(state.save).toHaveBeenCalledWith(expect.objectContaining({ platform: "android", provider: "fcm" }));
  expect(state.callbacks.size).toBe(0);
});
it("does not nag for denied permission during token refresh and disables the old token", async () => {
  const notifications = await import("./coachNotifications"); await notifications.enableCoachNotifications(); state.permission="denied";
  await notifications.refreshNativeCoachNotificationToken(); expect(state.request).toHaveBeenCalledOnce(); expect(state.revoke).toHaveBeenCalledOnce();
  expect(state.save).toHaveBeenCalledOnce();
});
it("does not carry device opt-in across accounts or bind a registration after an account switch", async () => {
  const notifications = await import("./coachNotifications"); await notifications.enableCoachNotifications(); state.uid="account-b";
  expect(await notifications.refreshNativeCoachNotificationToken()).toBeNull(); expect(state.save).toHaveBeenCalledOnce();
  state.register.mockImplementation(async () => { state.uid="account-c"; state.callbacks.get("registration")?.({value:"another-fake-token"}); });
  await expect(notifications.enableCoachNotifications()).rejects.toThrow("sign in again"); expect(state.save).toHaveBeenCalledOnce();
});
it("unregisters while authentication is still available, before signing out", async () => {
  const notifications = await import("./coachNotifications"); await notifications.enableCoachNotifications();
  const order: string[]=[]; state.revoke.mockImplementation(async()=>{order.push("revoke")}); state.signOut.mockImplementation(async()=>{order.push("signout")});
  await (await import("./authSession")).clearLocalAscendSession(); expect(order).toEqual(["revoke","signout"]);
});
it("preserves legacy permission only when the token belongs to the signed-in account", async () => {
  localStorage.setItem("ascend.notifications.enabled.v1","true"); localStorage.setItem("ascend.notifications.token.v1","legacy-fake-token-for-test");
  state.permission="granted"; state.deviceStatus.mockResolvedValue({registered:false});
  const notifications=await import("./coachNotifications"); await notifications.refreshNativeCoachNotificationToken(); expect(state.save).not.toHaveBeenCalled();
  state.deviceStatus.mockResolvedValue({registered:true}); await notifications.refreshNativeCoachNotificationToken();
  expect(state.save).toHaveBeenCalledOnce(); expect(state.request).not.toHaveBeenCalled();
});

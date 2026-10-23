import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { native, verify, config, auth } = vi.hoisted(() => ({
  native: { finish: vi.fn(), restore: vi.fn(), getTransactions: vi.fn() }, verify: vi.fn(), config: vi.fn(), auth: { currentUser: { uid: "member-one" } }
}));
vi.mock("@capacitor/core", () => ({ registerPlugin: () => native }));
vi.mock("./ascendApi", () => ({ verifyAppleSubscription: verify, getAppleBillingConfig: config }));
vi.mock("./firebase", () => ({ getFirebaseClientAuth: () => auth }));
import { clearAutomaticAppleSyncAttempts, confirmAppleTransaction, supportsAppleBilling, syncAppleTransactions } from "./appleBilling";
const transaction = { transactionId: "1001", signedTransaction: "signed-by-apple", environment: "Production" as const };
beforeEach(() => { vi.resetAllMocks(); clearAutomaticAppleSyncAttempts(); auth.currentUser.uid = "member-one"; config.mockResolvedValue({ enabled: true }); native.finish.mockResolvedValue(undefined); verify.mockResolvedValue({ subscription: { plan: "premium" } }); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("native Apple purchase delivery", () => {
  it("finishes the native transaction only after the backend grants access", async () => {
    const order: string[] = [];
    verify.mockImplementation(async () => { order.push("verified"); return {}; });
    native.finish.mockImplementation(async () => { order.push("finished"); });
    await confirmAppleTransaction(transaction);
    expect(order).toEqual(["verified", "finished"]);
    expect(native.finish).toHaveBeenCalledWith({ transactionId: "1001" });
  });
  it("leaves a paid transaction unfinished if the backend is unavailable", async () => {
    verify.mockRejectedValue(new Error("network unavailable"));
    await expect(confirmAppleTransaction(transaction)).rejects.toThrow("network unavailable");
    expect(native.finish).not.toHaveBeenCalled();
  });
  it("uses explicit Apple restore only when requested by the customer", async () => {
    native.getTransactions.mockResolvedValue({ transactions: [transaction] });
    native.restore.mockResolvedValue({ transactions: [transaction] });
    expect(await syncAppleTransactions()).toBe(1);
    expect(native.restore).not.toHaveBeenCalled();
    expect(await syncAppleTransactions(true)).toBe(1);
    expect(native.restore).toHaveBeenCalledOnce();
  });
  it("verifies a repeatedly returned entitlement once during automatic sync", async () => {
    native.getTransactions.mockResolvedValue({ transactions: [transaction] });
    native.restore.mockResolvedValue({ transactions: [transaction] });
    expect(await syncAppleTransactions()).toBe(1);
    expect(await syncAppleTransactions()).toBe(0);
    expect(verify).toHaveBeenCalledOnce();
    expect(await syncAppleTransactions(true)).toBe(1);
    expect(verify).toHaveBeenCalledTimes(2);
  });
  it("cools down an automatically rejected transaction while allowing an explicit restore", async () => {
    native.getTransactions.mockResolvedValue({ transactions: [transaction] });
    native.restore.mockResolvedValue({ transactions: [transaction] });
    const forbidden = Object.assign(new Error("Sandbox purchase unavailable"), { status: 403 });
    verify.mockRejectedValue(forbidden);
    await expect(syncAppleTransactions()).rejects.toBe(forbidden);
    expect(await syncAppleTransactions()).toBe(0);
    expect(verify).toHaveBeenCalledOnce();
    await expect(syncAppleTransactions(true)).rejects.toBe(forbidden);
    expect(verify).toHaveBeenCalledTimes(2);
    expect(native.finish).not.toHaveBeenCalled();
  });
  it("retries a signed transaction for a different account", async () => {
    native.getTransactions.mockResolvedValue({ transactions: [transaction] });
    expect(await syncAppleTransactions()).toBe(1);
    auth.currentUser.uid = "member-two";
    expect(await syncAppleTransactions()).toBe(1);
    expect(verify).toHaveBeenCalledTimes(2);
  });
  it("does not open StoreKit when billing is disabled", async () => {
    config.mockResolvedValue({ enabled: false });
    expect(await syncAppleTransactions(true)).toBe(0);
    expect(native.restore).not.toHaveBeenCalled();
  });
  it("recovers signed current purchases when Apple's restore refresh fails", async () => {
    native.restore.mockRejectedValue(new Error("Restore was not completed. Please try again."));
    native.getTransactions.mockResolvedValue({ transactions: [transaction] });
    expect(await syncAppleTransactions(true)).toBe(1);
    expect(verify).toHaveBeenCalledWith(transaction);
    expect(native.finish).toHaveBeenCalledWith({ transactionId: "1001" });
  });
  it("preserves the restore error when no signed purchases can be recovered", async () => {
    const error = new Error("Restore was not completed. Please try again.");
    native.restore.mockRejectedValue(error);
    native.getTransactions.mockResolvedValue({ transactions: [] });
    await expect(syncAppleTransactions(true)).rejects.toBe(error);
    expect(verify).not.toHaveBeenCalled();
    expect(native.finish).not.toHaveBeenCalled();
  });
  it("preserves the restore error when reading current purchases also fails", async () => {
    const error = new Error("Restore was not completed. Please try again.");
    native.restore.mockRejectedValue(error);
    native.getTransactions.mockRejectedValue(new Error("StoreKit unavailable"));
    await expect(syncAppleTransactions(true)).rejects.toBe(error);
    expect(verify).not.toHaveBeenCalled();
  });
  it("does not restore an unverified purchase recovered after a refresh failure", async () => {
    native.restore.mockRejectedValue(new Error("Restore was not completed. Please try again."));
    native.getTransactions.mockResolvedValue({ transactions: [transaction] });
    verify.mockRejectedValue(new Error("Purchase belongs to another account"));
    await expect(syncAppleTransactions(true)).rejects.toThrow("Purchase belongs to another account");
    expect(native.finish).not.toHaveBeenCalled();
  });
  it("does not read fallback transactions after a successful restore", async () => {
    native.restore.mockResolvedValue({ transactions: [transaction] });
    expect(await syncAppleTransactions(true)).toBe(1);
    expect(native.getTransactions).not.toHaveBeenCalled();
  });
  it("does not expose the plugin to the existing 1.0 binary or a website", () => {
    vi.stubGlobal("Capacitor", { isNativePlatform: () => true, getPlatform: () => "ios" });
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("AscendIOS/2 Capacitor");
    expect(supportsAppleBilling()).toBe(false);
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("AscendIOS/5 AscendFree/1 Capacitor");
    expect(supportsAppleBilling()).toBe(false);
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("AscendIOS/6 AscendSubscriptions/1 Capacitor");
    expect(supportsAppleBilling()).toBe(true);
    vi.stubGlobal("Capacitor", undefined);
    expect(supportsAppleBilling()).toBe(false);
  });
});

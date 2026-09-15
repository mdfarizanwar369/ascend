import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { native, verify, config } = vi.hoisted(() => ({
  native: { finish: vi.fn(), restore: vi.fn(), getTransactions: vi.fn() }, verify: vi.fn(), config: vi.fn()
}));
vi.mock("@capacitor/core", () => ({ registerPlugin: () => native }));
vi.mock("./ascendApi", () => ({ verifyAppleSubscription: verify, getAppleBillingConfig: config }));
import { confirmAppleTransaction, supportsAppleBilling, syncAppleTransactions } from "./appleBilling";
const transaction = { transactionId: "1001", signedTransaction: "signed-by-apple", environment: "Production" as const };
beforeEach(() => { vi.clearAllMocks(); config.mockResolvedValue({ enabled: true }); native.finish.mockResolvedValue(undefined); verify.mockResolvedValue({ subscription: { plan: "premium" } }); });
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
  it("does not open StoreKit when billing is disabled", async () => {
    config.mockResolvedValue({ enabled: false });
    expect(await syncAppleTransactions(true)).toBe(0);
    expect(native.restore).not.toHaveBeenCalled();
  });
  it("does not expose the plugin to the existing 1.0 binary or a website", () => {
    vi.stubGlobal("Capacitor", { isNativePlatform: () => true, getPlatform: () => "ios" });
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("AscendIOS/2 Capacitor");
    expect(supportsAppleBilling()).toBe(false);
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("AscendIOS/3 Capacitor");
    expect(supportsAppleBilling()).toBe(true);
    vi.stubGlobal("Capacitor", undefined);
    expect(supportsAppleBilling()).toBe(false);
  });
});

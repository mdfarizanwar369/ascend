import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { api, native, confirm, sync } = vi.hoisted(() => ({
  api: { getAppleBillingConfig: vi.fn(), getMySubscription: vi.fn() },
  native: { getProducts: vi.fn(), purchase: vi.fn(), manageSubscriptions: vi.fn(), getPurchaseIntent: vi.fn(), clearPurchaseIntent: vi.fn() }, confirm: vi.fn(), sync: vi.fn()
}));
vi.mock("@/components/BackButton", () => ({ BackButton: () => null }));
vi.mock("@/lib/ascendApi", () => api);
vi.mock("@/lib/appleBilling", () => ({ AppleBilling: native, confirmAppleTransaction: confirm, syncAppleTransactions: sync }));
import { AppleSubscriptionClient } from "./AppleSubscriptionClient";
const config = { enabled: true, purchaseBlocked: false, appAccountToken: "account-uuid", productIds: ["fit.getascend.app.premium.monthly"] };
beforeEach(() => {
  vi.clearAllMocks(); api.getAppleBillingConfig.mockResolvedValue(config);
  native.getPurchaseIntent.mockResolvedValue({}); native.clearPurchaseIntent.mockResolvedValue(undefined);
  api.getMySubscription.mockResolvedValue({ subscription: { plan: "free", status: "active", provider: "manual" } });
  native.getProducts.mockResolvedValue({ products: [{ id: config.productIds[0], title: "Ascend Premium", description: "Your personal fitness coach.", displayPrice: "RM19.99" }] });
  native.manageSubscriptions.mockResolvedValue(undefined); confirm.mockResolvedValue({}); sync.mockResolvedValue(1);
});
afterEach(cleanup);
describe("Apple subscription screen", () => {
  it("requires an explicit confirmation for a product selected outside the app", async () => {
    native.getPurchaseIntent.mockResolvedValue({ productId: config.productIds[0] });
    render(<AppleSubscriptionClient />);
    await screen.findByText(/Selected in the App Store/);
    expect(native.purchase).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss App Store request" }));
    await waitFor(() => expect(screen.queryByText(/Selected in the App Store/)).not.toBeInTheDocument());
    expect(native.clearPurchaseIntent).toHaveBeenCalledOnce();
  });
  it.each(["cancelled", "pending"])("does not verify or unlock access for a %s purchase", async outcome => {
    native.purchase.mockResolvedValue({ outcome }); render(<AppleSubscriptionClient />);
    fireEvent.click(await screen.findByRole("button", { name: "Subscribe to Ascend Premium" }));
    await waitFor(() => expect(native.purchase).toHaveBeenCalledWith({ productId: config.productIds[0], appAccountToken: "account-uuid" }));
    await screen.findByText(outcome === "pending" ? /Awaiting approval/ : /Purchase cancelled/);
    expect(confirm).not.toHaveBeenCalled();
  });
  it("delivers a completed purchase to the backend before reporting success", async () => {
    const transaction = { transactionId: "1001", signedTransaction: "signed", environment: "Sandbox" };
    native.purchase.mockResolvedValue({ outcome: "purchased", transaction }); render(<AppleSubscriptionClient />);
    fireEvent.click(await screen.findByRole("button", { name: "Subscribe to Ascend Premium" }));
    await screen.findByText("Your Apple subscription has been confirmed.");
    expect(confirm).toHaveBeenCalledWith(transaction);
  });
  it("rechecks server eligibility before Apple can charge for a second subscription", async () => {
    render(<AppleSubscriptionClient />);
    const buy = await screen.findByRole("button", { name: "Subscribe to Ascend Premium" });
    api.getAppleBillingConfig.mockResolvedValue({ ...config, purchaseBlocked: true });
    fireEvent.click(buy);
    await waitFor(() => expect(buy).toBeDisabled());
    expect(native.purchase).not.toHaveBeenCalled();
  });
  it("offers restore and Apple subscription management", async () => {
    render(<AppleSubscriptionClient />);
    await screen.findByRole("button", { name: "Subscribe to Ascend Premium" });
    fireEvent.click(screen.getByRole("button", { name: "Restore Purchases" }));
    await screen.findByText("Your Apple purchases have been restored.");
    expect(sync).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "Manage Apple Subscriptions" }));
    expect(native.manageSubscriptions).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "Terms of Use" })).toBeInTheDocument();
  });
});

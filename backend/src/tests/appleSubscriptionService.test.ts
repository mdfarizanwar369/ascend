import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppStoreServerAPIClient, Environment, SignedDataVerifier, Status, VerificationException, VerificationStatus } from "@apple/app-store-server-library";

const { db, connection, release } = vi.hoisted(() => ({ db: vi.fn(), connection: vi.fn(), release: vi.fn() }));
vi.mock("../db/pool", () => ({ query: db, pool: { connect: async () => ({ query: connection, release }) } }));
const userId = "11111111-1111-4111-8111-111111111111";
const otherUserId = "22222222-2222-4222-8222-222222222222";
const now = Date.now();
const transaction = {
  bundleId: "fit.getascend.app", environment: Environment.PRODUCTION, productId: "fit.getascend.app.premium.monthly",
  type: "Auto-Renewable Subscription", appAccountToken: userId, transactionId: "2002", originalTransactionId: "1001",
  inAppOwnershipType: "PURCHASED", purchaseDate: now - 10_000, expiresDate: now + 60_000, price: 19_990, currency: "MYR"
};
const renewal = { originalTransactionId: "1001", environment: Environment.PRODUCTION, autoRenewStatus: 1 };

beforeEach(() => {
  vi.resetModules(); db.mockReset(); connection.mockReset(); release.mockReset();
  vi.stubEnv("DATABASE_URL", "postgres://unused:unused@localhost/unused");
  vi.stubEnv("APPLE_IAP_ENABLED", "true"); vi.stubEnv("APPLE_IAP_KEY_ID", "test-key-id");
  vi.stubEnv("APPLE_IAP_ISSUER_ID", "test-issuer"); vi.stubEnv("APPLE_IAP_PRIVATE_KEY", "unused-by-mocked-api");
  vi.stubEnv("APPLE_IAP_SANDBOX_USER_IDS", userId);
  vi.stubEnv("APPLE_IAP_ALLOWED_ENVIRONMENT", "Both");
  db.mockResolvedValue({ rows: [], rowCount: 0 });
  connection.mockResolvedValue({ rows: [{ id: "saved", plan: "premium", provider: "app_store" }], rowCount: 1 });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("Apple entitlement rules", () => {
  it.each([
    { label: "renewing", tx: {}, re: {}, status: Status.ACTIVE, expected: "active" },
    { label: "cancelled with time remaining", tx: {}, re: { autoRenewStatus: 0 }, status: Status.ACTIVE, expected: "canceled" },
    { label: "expired despite stale active status", tx: { expiresDate: now - 1 }, re: {}, status: Status.ACTIVE, expected: "expired" },
    { label: "refunded", tx: { revocationDate: now - 1 }, re: {}, status: Status.ACTIVE, expected: "expired" },
    { label: "upgraded old transaction", tx: { isUpgraded: true }, re: {}, status: Status.ACTIVE, expected: "expired" },
    { label: "billing retry without grace", tx: {}, re: {}, status: Status.BILLING_RETRY, expected: "past_due" },
    { label: "billing grace", tx: { expiresDate: now - 1 }, re: { gracePeriodExpiresDate: now + 120_000 }, status: Status.BILLING_GRACE_PERIOD, expected: "active" },
    { label: "expired grace", tx: {}, re: { gracePeriodExpiresDate: now - 1 }, status: Status.BILLING_GRACE_PERIOD, expected: "expired" }
  ])("handles $label", async ({ tx, re, status, expected }) => {
    const { normalizeAppleSubscription } = await import("../services/appleSubscriptionService");
    const actual = normalizeAppleSubscription({ ...transaction, ...tx }, { ...renewal, ...re }, status, userId, "Production", now);
    expect(actual).toMatchObject({ status: expected, plan: "premium", amountCents: 1999, currency: "MYR" });
  });
  it.each([
    { bundleId: "another.app" }, { environment: Environment.SANDBOX }, { productId: "unapproved.product" },
    { appAccountToken: otherUserId }, { appAccountToken: undefined },
    { inAppOwnershipType: "FAMILY_SHARED" }, { type: "Consumable" }, { expiresDate: undefined }
  ])("rejects an invalid entitlement: %j", async override => {
    const { normalizeAppleSubscription } = await import("../services/appleSubscriptionService");
    expect(() => normalizeAppleSubscription({ ...transaction, ...override }, renewal, Status.ACTIVE, userId, "Production", now)).toThrow();
  });
});

function mockApple(status: Status = Status.ACTIVE, current = transaction) {
  vi.spyOn(SignedDataVerifier.prototype, "verifyAndDecodeTransaction").mockImplementation(async value => value === "current" ? current : transaction);
  vi.spyOn(SignedDataVerifier.prototype, "verifyAndDecodeRenewalInfo").mockResolvedValue(renewal);
  return vi.spyOn(AppStoreServerAPIClient.prototype, "getAllSubscriptionStatuses").mockResolvedValue({ data: [{ lastTransactions: [{ originalTransactionId: "1001", status, signedTransactionInfo: "current", signedRenewalInfo: "renewal" }] }] });
}

describe("Apple purchase verification and notifications", () => {
  it.each([undefined, "Production" as const])("rejects live purchases on the sandbox server, with hint %s", async hint => {
    vi.stubEnv("APPLE_IAP_ALLOWED_ENVIRONMENT", "Sandbox");
    const api = mockApple();
    const { verifyApplePurchase } = await import("../services/appleSubscriptionService");
    await expect(verifyApplePurchase(userId, "signed-production", hint)).rejects.toMatchObject({ status: 403 });
    expect(api).not.toHaveBeenCalled();
    expect(connection).not.toHaveBeenCalled();
  });
  it("does not offer sandbox checkout to accounts outside the test allowlist", async () => {
    vi.stubEnv("APPLE_IAP_ALLOWED_ENVIRONMENT", "Sandbox");
    const { appleBillingAvailableForUser } = await import("../services/appleSubscriptionService");
    expect(appleBillingAvailableForUser(userId)).toBe(true);
    expect(appleBillingAvailableForUser(otherUserId)).toBe(false);
  });
  it("rejects production notifications on the sandbox server before any database write", async () => {
    vi.stubEnv("APPLE_IAP_ALLOWED_ENVIRONMENT", "Sandbox");
    vi.spyOn(SignedDataVerifier.prototype, "verifyAndDecodeNotification").mockResolvedValue({ notificationUUID: "live-notification", notificationType: "TEST" });
    const { processAppleNotification } = await import("../services/appleSubscriptionService");
    await expect(processAppleNotification("signed-production-notification")).rejects.toMatchObject({ status: 403 });
    expect(db).not.toHaveBeenCalled();
  });
  it("detects sandbox from Apple's verified JWS for iOS 15 without trusting a client hint", async () => {
    vi.stubEnv("APPLE_IAP_ALLOWED_ENVIRONMENT", "Sandbox");
    mockApple();
    vi.mocked(SignedDataVerifier.prototype.verifyAndDecodeTransaction)
      .mockRejectedValueOnce(new VerificationException(VerificationStatus.INVALID_ENVIRONMENT))
      .mockResolvedValue({ ...transaction, environment: Environment.SANDBOX });
    vi.mocked(SignedDataVerifier.prototype.verifyAndDecodeRenewalInfo).mockResolvedValue({ ...renewal, environment: Environment.SANDBOX });
    const { verifyApplePurchase } = await import("../services/appleSubscriptionService");
    await verifyApplePurchase(userId, "signed");
    const values = connection.mock.calls.find(([sql]) => sql.includes("insert into subscriptions"))![1];
    expect(values[8]).toBe("Sandbox");
  });
  it("uses Apple's current status when restoring an older receipt", async () => {
    const api = mockApple(Status.EXPIRED, { ...transaction, expiresDate: now - 1 });
    const { verifyApplePurchase } = await import("../services/appleSubscriptionService");
    await verifyApplePurchase(userId, "historical", "Production");
    expect(api).toHaveBeenCalledWith("1001");
    const values = connection.mock.calls.find(([sql]) => sql.includes("insert into subscriptions"))![1];
    expect(values[3]).toBe("expired");
    expect(release).toHaveBeenCalled();
  });
  it("rejects a forged JWS using the actual Apple verifier before writing anything", async () => {
    const { verifyApplePurchase, appleRequestError } = await import("../services/appleSubscriptionService");
    const error = await verifyApplePurchase(userId, "not.a.valid-apple-signature", "Production").catch(error => error);
    expect(appleRequestError(error)).toMatchObject({ status: 400 });
    expect(connection).not.toHaveBeenCalled(); expect(db).not.toHaveBeenCalled();
  });
  it("rejects another Ascend account before querying Apple or the database", async () => {
    const api = mockApple();
    const { verifyApplePurchase } = await import("../services/appleSubscriptionService");
    await expect(verifyApplePurchase(otherUserId, "historical", "Production")).rejects.toMatchObject({ status: 409 });
    expect(api).not.toHaveBeenCalled(); expect(connection).not.toHaveBeenCalled();
  });
  it("rolls back when an original transaction is already linked to someone else", async () => {
    mockApple(); connection.mockResolvedValue({ rows: [], rowCount: 0 });
    const { verifyApplePurchase } = await import("../services/appleSubscriptionService");
    await expect(verifyApplePurchase(userId, "historical", "Production")).rejects.toMatchObject({ status: 409 });
    expect(connection).toHaveBeenCalledWith("rollback"); expect(release).toHaveBeenCalled();
  });
  it("keeps sandbox purchases restricted to named testing accounts", async () => {
    vi.stubEnv("APPLE_IAP_SANDBOX_USER_IDS", "");
    const { verifyApplePurchase } = await import("../services/appleSubscriptionService");
    await expect(verifyApplePurchase(userId, "historical", "Sandbox")).rejects.toMatchObject({ status: 403 });
    expect(connection).not.toHaveBeenCalled();
  });
  it("keeps billing off until both the feature flag and credentials are ready", async () => {
    vi.stubEnv("APPLE_IAP_ENABLED", "false");
    const { verifyApplePurchase, appleBillingConfigured } = await import("../services/appleSubscriptionService");
    expect(appleBillingConfigured()).toBe(false);
    await expect(verifyApplePurchase(userId, "historical", "Production")).rejects.toMatchObject({ status: 503 });
    expect(connection).not.toHaveBeenCalled();
  });
  it("does not mark a notification complete when Apple's status API fails", async () => {
    mockApple().mockRejectedValue(new Error("temporary Apple outage"));
    vi.spyOn(SignedDataVerifier.prototype, "verifyAndDecodeNotification").mockResolvedValue({ notificationUUID: "notification-1", notificationType: "DID_RENEW", data: { signedTransactionInfo: "historical" } });
    db.mockResolvedValueOnce({ rows: [], rowCount: 0 }).mockResolvedValueOnce({ rows: [{ id: userId }], rowCount: 1 });
    const { processAppleNotification } = await import("../services/appleSubscriptionService");
    await expect(processAppleNotification("signed-notification")).rejects.toThrow("temporary Apple outage");
    expect(db.mock.calls.some(([sql]) => sql.includes("insert into apple_notification_receipts"))).toBe(false);
    expect(connection).toHaveBeenCalledWith("rollback");
  });
  it("acknowledges duplicate signed notifications without applying them again", async () => {
    const api = mockApple();
    vi.spyOn(SignedDataVerifier.prototype, "verifyAndDecodeNotification").mockResolvedValue({ notificationUUID: "notification-1", notificationType: "DID_RENEW" });
    db.mockResolvedValue({ rows: [{}], rowCount: 1 });
    const { processAppleNotification } = await import("../services/appleSubscriptionService");
    await expect(processAppleNotification("signed-notification")).resolves.toMatchObject({ duplicate: true });
    expect(api).not.toHaveBeenCalled();
  });
  it("verifies sandbox notifications that omit the production Apple app ID", async () => {
    vi.spyOn(SignedDataVerifier.prototype, "verifyAndDecodeNotification")
      .mockRejectedValueOnce(new VerificationException(VerificationStatus.INVALID_APP_IDENTIFIER))
      .mockResolvedValueOnce({ notificationUUID: "sandbox-test-notification", notificationType: "TEST" });
    const { processAppleNotification } = await import("../services/appleSubscriptionService");
    await expect(processAppleNotification("signed-sandbox-notification")).resolves.toEqual({ received: true });
    expect(connection).not.toHaveBeenCalled();
  });
  it("returns retryable verification failures as service unavailable", async () => {
    const { appleRequestError } = await import("../services/appleSubscriptionService");
    expect(appleRequestError(new VerificationException(VerificationStatus.RETRYABLE_VERIFICATION_FAILURE))).toMatchObject({ status: 503 });
  });
});

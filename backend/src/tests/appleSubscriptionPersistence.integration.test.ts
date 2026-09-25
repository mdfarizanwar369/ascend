import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppStoreServerAPIClient, Environment, SignedDataVerifier, Status } from "@apple/app-store-server-library";
import type { NextFunction, Request, Response } from "express";

vi.mock("../integrations/firebase", () => ({ getFirebaseAuth: () => ({ verifyIdToken: async () => ({ uid: "apple-integration-user" }) }) }));
const testUrl = process.env.APPLE_TEST_DATABASE_URL;
const userId = randomUUID();
const secondUserId = randomUUID();
let db: typeof import("../db/pool");
let service: typeof import("../services/appleSubscriptionService");
let currentUser = userId;
let currentStatus = Status.ACTIVE;
let currentExpiry = Date.now() + 3_600_000;
let autoRenew = 1;
const originalId = `integration-${randomUUID()}`;
const notificationId = randomUUID();

describe.skipIf(!testUrl)("Apple subscriptions with PostgreSQL", () => {
  beforeAll(async () => {
    const url = new URL(testUrl!);
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/ascend_apple_test") throw new Error("Use only the isolated local ascend_apple_test database");
    vi.stubEnv("DATABASE_URL", testUrl!); vi.stubEnv("APPLE_IAP_ENABLED", "true");
    vi.stubEnv("APPLE_IAP_KEY_ID", "test"); vi.stubEnv("APPLE_IAP_ISSUER_ID", "test"); vi.stubEnv("APPLE_IAP_PRIVATE_KEY", "unused-by-mock");
    db = await import("../db/pool"); service = await import("../services/appleSubscriptionService");
    await db.query("insert into users(id,firebase_uid,email,full_name) values ($1,'apple-integration-user','apple-integration@example.invalid','Apple test'),($2,'apple-integration-user-2','apple-integration-2@example.invalid','Apple test 2')", [userId, secondUserId]);
    vi.spyOn(SignedDataVerifier.prototype, "verifyAndDecodeTransaction").mockImplementation(async () => ({
      bundleId: "fit.getascend.app", environment: Environment.PRODUCTION, productId: "fit.getascend.app.premium.monthly",
      type: "Auto-Renewable Subscription", appAccountToken: currentUser, transactionId: `${originalId}-transaction`, originalTransactionId: originalId,
      inAppOwnershipType: "PURCHASED", purchaseDate: Date.now() - 100_000, expiresDate: currentExpiry, price: 19990, currency: "MYR"
    }));
    vi.spyOn(SignedDataVerifier.prototype, "verifyAndDecodeRenewalInfo").mockImplementation(async () => ({ originalTransactionId: originalId, environment: Environment.PRODUCTION, autoRenewStatus: autoRenew }));
    vi.spyOn(AppStoreServerAPIClient.prototype, "getAllSubscriptionStatuses").mockImplementation(async () => ({ data: [{ lastTransactions: [{ originalTransactionId: originalId, status: currentStatus, signedTransactionInfo: "current", signedRenewalInfo: "renewal" }] }] }));
    vi.spyOn(SignedDataVerifier.prototype, "verifyAndDecodeNotification").mockResolvedValue({ notificationUUID: notificationId, notificationType: "DID_RENEW", data: { signedTransactionInfo: "signed" } });
  });
  beforeEach(async () => {
    currentUser = userId; currentStatus = Status.ACTIVE; currentExpiry = Date.now() + 3_600_000; autoRenew = 1;
    await db.query("delete from subscriptions where user_id in ($1,$2)", [userId, secondUserId]);
    await db.query("delete from apple_notification_receipts where notification_id=$1", [notificationId]);
  });
  afterAll(async () => {
    if (db) {
      await db.query("delete from subscriptions where user_id in ($1,$2)", [userId, secondUserId]);
      await db.query("delete from users where id in ($1,$2)", [userId, secondUserId]);
      await db.query("delete from apple_notification_receipts where notification_id=$1", [notificationId]);
      await db.pool.end();
    }
    vi.restoreAllMocks(); vi.unstubAllEnvs();
  });
  it("serializes simultaneous purchase and restore without duplicate entitlements", async () => {
    await Promise.all(Array.from({ length: 5 }, () => service.verifyApplePurchase(userId, "signed", "Production")));
    const result = await db.query("select * from subscriptions where user_id=$1", [userId]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ provider: "app_store", status: "active", plan: "premium", apple_original_transaction_id: originalId });
  });
  it("enforces ownership in the database even if a newly signed token names another account", async () => {
    await service.verifyApplePurchase(userId, "signed", "Production"); currentUser = secondUserId;
    await expect(service.verifyApplePurchase(secondUserId, "signed", "Production")).rejects.toMatchObject({ status: 409 });
    const result = await db.query("select user_id from subscriptions where apple_original_transaction_id=$1", [originalId]);
    expect(result.rows).toEqual([{ user_id: userId }]);
  });
  it("deduplicates notifications and updates canceled access through its paid period", async () => {
    autoRenew = 0;
    await service.processAppleNotification("signed");
    expect(await service.processAppleNotification("signed")).toMatchObject({ duplicate: true });
    const result = await db.query("select status, apple_auto_renew from subscriptions where user_id=$1", [userId]);
    expect(result.rows).toEqual([{ status: "canceled", apple_auto_renew: false }]);
    expect((await db.query("select * from apple_notification_receipts where notification_id=$1", [notificationId])).rowCount).toBe(1);
  });
  it("expires access before an authenticated request even when renewal notifications are missing", async () => {
    await service.verifyApplePurchase(userId, "signed", "Production");
    await db.query("update subscriptions set current_period_end=now()-interval '1 second' where user_id=$1", [userId]);
    const { requireAuth } = await import("../middleware/auth");
    const next = vi.fn(); const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await requireAuth({ path: "/food-logs", header: () => "Bearer test" } as unknown as Request, res as unknown as Response, next as NextFunction);
    expect(next).toHaveBeenCalledOnce();
    expect((await db.query("select status from subscriptions where user_id=$1", [userId])).rows[0].status).toBe("expired");
  });
  it("preserves web subscription state and reports it as a duplicate-payment risk", async () => {
    await db.query("insert into subscriptions(user_id,plan,provider,provider_subscription_id,status,amount_cents,currency) values ($1,'premium','stripe',$2,'active',1999,'MYR')", [userId, `stripe-${originalId}`]);
    expect(await service.hasOtherPaidSubscription(userId)).toBe(true);
    await service.verifyApplePurchase(userId, "signed", "Production");
    expect((await db.query("select status from subscriptions where user_id=$1 and provider='stripe'", [userId])).rows[0].status).toBe("active");
  });
});

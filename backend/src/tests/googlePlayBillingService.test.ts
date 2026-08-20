import crypto from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Google Play billing verification", () => {
  beforeEach(() => {
    const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 1024 });
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", "postgres://test:test@localhost:5432/test");
    vi.stubEnv("GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL", "service-account@getascend.iam.gserviceaccount.com");
    vi.stubEnv(
      "GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY",
      privateKey.export({ type: "pkcs8", format: "pem" }).toString().replace(/\n/g, "\\n")
    );
    vi.stubEnv("GOOGLE_PLAY_PACKAGE_NAME", "fit.getascend.app");
    vi.stubEnv("GOOGLE_PLAY_PREMIUM_MONTHLY_PRODUCT_ID", "ascend_premium_monthly");
    vi.stubEnv("GOOGLE_PLAY_PREMIUM_YEARLY_PRODUCT_ID", "ascend_premium_yearly");
    vi.stubEnv("GOOGLE_PLAY_PREMIUM_MONTHLY_PRICE_CENTS", "1999");
    vi.stubEnv("GOOGLE_PLAY_PREMIUM_YEARLY_PRICE_CENTS", "19999");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("maps an active subscriptionsv2 purchase into an Ascend premium subscription", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "google-access-token" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          startTime: "2026-07-01T00:00:00Z",
          subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
          latestOrderId: "GPA.1234-5678-9012-34567",
          acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING",
          lineItems: [
            {
              productId: "ascend_premium_monthly",
              expiryTime: "2026-08-01T00:00:00Z",
              autoRenewingPlan: { autoRenewEnabled: true },
              offerDetails: { basePlanId: "monthly" },
            },
          ],
        }),
      });

    vi.stubGlobal("fetch", fetchMock);
    const { verifyGooglePlaySubscriptionPurchase } = await import("../services/googlePlayBillingService");

    const purchase = await verifyGooglePlaySubscriptionPurchase({
      purchaseToken: "token-123",
      productId: "ascend_premium_monthly",
      packageName: "fit.getascend.app",
    });

    expect(purchase).toMatchObject({
      purchaseToken: "token-123",
      packageName: "fit.getascend.app",
      plan: "premium",
      productId: "ascend_premium_monthly",
      amountCents: 1999,
      status: "active",
      currentPeriodStart: "2026-07-01T00:00:00Z",
      currentPeriodEnd: "2026-08-01T00:00:00Z",
      latestOrderId: "GPA.1234-5678-9012-34567",
      acknowledgementState: "pending",
      autoRenewEnabled: true,
      basePlanId: "monthly",
      rawState: "SUBSCRIPTION_STATE_ACTIVE",
    });
  });

  it("decodes the official Pub/Sub RTDN envelope data without logging raw records", async () => {
    const { parseGooglePlayRtdnData } = await import("../services/googlePlayBillingService");
    const encoded = Buffer.from(JSON.stringify({
      version: "1.0",
      packageName: "fit.getascend.app",
      eventTimeMillis: "1786579200000",
      subscriptionNotification: {
        version: "1.0",
        notificationType: 2,
        purchaseToken: "purchase-token"
      }
    })).toString("base64");

    expect(parseGooglePlayRtdnData(encoded)).toMatchObject({
      packageName: "fit.getascend.app",
      subscriptionNotification: { notificationType: 2, purchaseToken: "purchase-token" }
    });
  });

  it("rejects malformed RTDN data before entitlement processing", async () => {
    const { parseGooglePlayRtdnData } = await import("../services/googlePlayBillingService");
    expect(() => parseGooglePlayRtdnData("not-base64-json")).toThrow("malformed");
  });

  it("avoids a synchronous Google lookup for a recently verified subscription", async () => {
    const { shouldRefreshGooglePlaySubscription } = await import("../services/googlePlayBillingService");
    const now = new Date("2026-08-21T12:00:00.000Z");
    expect(shouldRefreshGooglePlaySubscription("2026-08-21T10:00:00.000Z", "2026-09-21T12:00:00.000Z", now)).toBe(false);
    expect(shouldRefreshGooglePlaySubscription("2026-08-21T05:00:00.000Z", "2026-09-21T12:00:00.000Z", now)).toBe(true);
  });

  it("refreshes more often near the subscription period end", async () => {
    const { shouldRefreshGooglePlaySubscription } = await import("../services/googlePlayBillingService");
    const now = new Date("2026-08-21T12:00:00.000Z");
    expect(shouldRefreshGooglePlaySubscription("2026-08-21T11:50:00.000Z", "2026-08-21T18:00:00.000Z", now)).toBe(true);
    expect(shouldRefreshGooglePlaySubscription(null, null, now)).toBe(true);
  });
});

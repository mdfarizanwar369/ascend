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
    vi.stubEnv("GOOGLE_PLAY_BILLING_ENABLED", "true");
    vi.stubEnv("GOOGLE_PLAY_ACCOUNT_OBFUSCATION_SECRET", "test-account-obfuscation-secret-at-least-32-bytes");
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
      userId: "user-123",
    });

    expect(purchase).toMatchObject({
      purchaseToken: "token-123",
      packageName: "fit.getascend.app",
      plan: "premium",
      productId: "ascend_premium_monthly",
      amountCents: 1999,
      status: "active",
      startedAt: "2026-07-01T00:00:00Z",
      expiresAt: "2026-08-01T00:00:00Z",
      orderId: "GPA.1234-5678-9012-34567",
      acknowledged: false,
      autoRenewEnabled: true,
      basePlanId: "monthly",
      rawState: "SUBSCRIPTION_STATE_ACTIVE",
    });
  });

  it("rejects a purchase presented for another Android package before contacting Google", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { verifyGooglePlaySubscriptionPurchase } = await import("../services/googlePlayBillingService");

    await expect(verifyGooglePlaySubscriptionPurchase({
      purchaseToken: "token-123",
      productId: "ascend_premium_monthly",
      packageName: "com.example.impostor",
      userId: "user-123",
    })).rejects.toThrow("package does not match");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a purchase bound to a different Ascend account", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "google-access-token" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
        acknowledgementState: "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
        externalAccountIdentifiers: { obfuscatedExternalAccountId: "another-account" },
        lineItems: [{ productId: "ascend_premium_monthly", offerDetails: { basePlanId: "monthly" } }],
      }) });
    vi.stubGlobal("fetch", fetchMock);
    const { verifyGooglePlaySubscriptionPurchase } = await import("../services/googlePlayBillingService");

    await expect(verifyGooglePlaySubscriptionPurchase({
      purchaseToken: "token-123",
      productId: "ascend_premium_monthly",
      packageName: "fit.getascend.app",
      userId: "user-123",
    })).rejects.toThrow("another Ascend account");
  });
});

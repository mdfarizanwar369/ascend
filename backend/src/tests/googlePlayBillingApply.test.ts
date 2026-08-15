import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VerifiedGooglePlayPurchase } from "../services/googlePlayBillingService";

const purchase: VerifiedGooglePlayPurchase = {
  purchaseToken: "token-123",
  tokenHash: "token-hash",
  packageName: "fit.getascend.app",
  plan: "premium",
  productId: "ascend_premium_monthly",
  basePlanId: "monthly",
  offerId: null,
  amountCents: 1999,
  status: "active",
  rawState: "SUBSCRIPTION_STATE_ACTIVE",
  startedAt: "2026-08-15T00:00:00Z",
  expiresAt: "2026-09-15T00:00:00Z",
  orderId: "GPA.test",
  acknowledged: false,
  autoRenewEnabled: true,
  accountId: "account-hash",
  testPurchase: true,
};

describe("Google Play entitlement application", () => {
  beforeEach(() => {
    const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 1024 });
    vi.resetModules();
    vi.stubEnv("GOOGLE_PLAY_BILLING_ENABLED", "true");
    vi.stubEnv("GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL", "service-account@getascend.iam.gserviceaccount.com");
    vi.stubEnv("GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY", privateKey.export({ type: "pkcs8", format: "pem" }).toString().replace(/\n/g, "\\n"));
    vi.stubEnv("GOOGLE_PLAY_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.doUnmock("../db/pool");
    vi.doUnmock("../services/entitlementService");
  });

  it("commits the verified entitlement before server acknowledgement", async () => {
    const order: string[] = [];
    const clientQuery = vi.fn(async (sql: string) => {
      order.push(sql.includes("insert into subscription_entitlements") ? "entitlement" : "transaction-write");
      return sql.includes("insert into subscription_entitlements") ? { rows: [{ id: "entitlement-1" }], rowCount: 1 } : { rows: [], rowCount: 1 };
    });
    const query = vi.fn(async () => ({ rows: [], rowCount: 1 }));
    const withBillingTransaction = vi.fn(async (work: (client: { query: typeof clientQuery }) => Promise<unknown>) => work({ query: clientQuery }));
    vi.doMock("../db/pool", () => ({ query }));
    vi.doMock("../services/entitlementService", () => ({ withBillingTransaction }));
    vi.stubGlobal("fetch", vi.fn()
      .mockImplementationOnce(async () => {
        order.push("oauth");
        return { ok: true, json: async () => ({ access_token: "access-token" }) };
      })
      .mockImplementationOnce(async () => {
        order.push("acknowledgement");
        return { ok: true };
      }));

    const { applyVerifiedGooglePlaySubscription } = await import("../services/googlePlayBillingService");
    const result = await applyVerifiedGooglePlaySubscription("user-1", purchase);

    expect(order.indexOf("entitlement")).toBeLessThan(order.indexOf("acknowledgement"));
    expect(result.acknowledged).toBe(true);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("acknowledged=true"), ["entitlement-1"]);
  });

  it("retains access and queues reconciliation when acknowledgement is temporarily unavailable", async () => {
    const clientQuery = vi.fn(async (sql: string) => sql.includes("insert into subscription_entitlements")
      ? { rows: [{ id: "entitlement-1" }], rowCount: 1 }
      : { rows: [], rowCount: 1 });
    const query = vi.fn(async () => ({ rows: [], rowCount: 1 }));
    const withBillingTransaction = vi.fn(async (work: (client: { query: typeof clientQuery }) => Promise<unknown>) => work({ query: clientQuery }));
    vi.doMock("../db/pool", () => ({ query }));
    vi.doMock("../services/entitlementService", () => ({ withBillingTransaction }));
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "access-token" }) })
      .mockResolvedValueOnce({ ok: false }));

    const { applyVerifiedGooglePlaySubscription } = await import("../services/googlePlayBillingService");
    const result = await applyVerifiedGooglePlaySubscription("user-1", purchase);

    expect(result).toMatchObject({ id: "entitlement-1", status: "active", acknowledged: false });
    expect(withBillingTransaction).toHaveBeenCalledTimes(2);
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining("google_play_reconciliation_jobs"), ["entitlement-1", "acknowledgement_failed"]);
  });
});

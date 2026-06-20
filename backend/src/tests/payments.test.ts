import crypto from "crypto";
import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("ToyyibPay provider", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", "postgres://test:test@localhost:5432/test");
  });

  it("accepts successful callbacks using the external reference", async () => {
    const { ToyyibPayProvider } = await import("../integrations/payments");
    const provider = new ToyyibPayProvider();

    await expect(provider.verifyWebhook({
      payload: { billExternalReferenceNo: "ASC-user-123", status_id: "1" }
    })
    ).resolves.toEqual({
      provider: "toyyibpay",
      eventType: "active",
      reference: "ASC-user-123",
      status: "active",
      payload: { billExternalReferenceNo: "ASC-user-123", status_id: "1" }
    });
  });

  it("accepts common alternate callback field names", async () => {
    const { ToyyibPayProvider } = await import("../integrations/payments");
    const provider = new ToyyibPayProvider();

    await expect(
      provider.verifyWebhook({ payload: { refno: "ASC-user-456", status: "cancelled" } })
    ).resolves.toEqual({
      provider: "toyyibpay",
      eventType: "canceled",
      reference: "ASC-user-456",
      status: "canceled",
      payload: { refno: "ASC-user-456", status: "cancelled" }
    });
  });

  it("rejects callbacks that cannot be matched to an Ascend checkout", async () => {
    const { ToyyibPayProvider } = await import("../integrations/payments");
    const provider = new ToyyibPayProvider();

    await expect(provider.verifyWebhook({ payload: { status_id: "1" } })).rejects.toThrow("missing the Ascend reference");
  });
});

describe("Lemon Squeezy provider", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", "postgres://test:test@localhost:5432/test");
    vi.stubEnv("PAYMENT_PROVIDER", "lemonsqueezy");
    vi.stubEnv("LEMONSQUEEZY_API_KEY", "test-api-key");
    vi.stubEnv("LEMONSQUEEZY_STORE_ID", "101");
    vi.stubEnv("LEMONSQUEEZY_PREMIUM_VARIANT_ID", "201");
    vi.stubEnv("LEMONSQUEEZY_TRAINER_PRO_VARIANT_ID", "202");
    vi.stubEnv("LEMONSQUEEZY_WEBHOOK_SECRET", "test-webhook-secret");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("creates a checkout with Ascend user and plan metadata", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: "checkout-123", attributes: { url: "https://checkout.lemonsqueezy.com/test" } } })
    });
    vi.stubGlobal("fetch", fetchMock);
    const { LemonSqueezyProvider } = await import("../integrations/payments");
    const provider = new LemonSqueezyProvider();
    const result = await provider.createCheckoutSession({
      userId: "user-123",
      email: "member@example.com",
      fullName: "Ascend Member",
      plan: "premium",
      amountRm: 19
    });

    expect(result).toEqual({
      provider: "lemonsqueezy",
      providerReference: "checkout-123",
      checkoutUrl: "https://checkout.lemonsqueezy.com/test"
    });
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestBody.data.attributes.checkout_data.custom).toEqual({
      ascend_user_id: "user-123",
      ascend_plan: "premium"
    });
    expect(requestBody.data.relationships.variant.data.id).toBe("201");
  });

  it("accepts a correctly signed subscription webhook", async () => {
    const payload = {
      meta: {
        event_name: "subscription_created",
        custom_data: { ascend_user_id: "user-123", ascend_plan: "premium" }
      },
      data: {
        type: "subscriptions",
        id: "subscription-123",
        attributes: {
          status: "active",
          customer_id: 456,
          created_at: "2026-06-19T00:00:00Z",
          renews_at: "2026-07-19T00:00:00Z"
        }
      }
    };
    const rawBody = Buffer.from(JSON.stringify(payload));
    const signature = crypto.createHmac("sha256", "test-webhook-secret").update(rawBody).digest("hex");
    const { LemonSqueezyProvider } = await import("../integrations/payments");
    const provider = new LemonSqueezyProvider();

    await expect(provider.verifyWebhook({ payload, rawBody, signature })).resolves.toMatchObject({
      provider: "lemonsqueezy",
      eventType: "subscription_created",
      reference: "subscription-123",
      subscriptionId: "subscription-123",
      customerId: "456",
      userId: "user-123",
      plan: "premium",
      status: "active",
      currentPeriodEnd: "2026-07-19T00:00:00Z"
    });
  });

  it("rejects an invalid webhook signature", async () => {
    const payload = { meta: { event_name: "subscription_created" }, data: { type: "subscriptions", id: "sub-1", attributes: {} } };
    const rawBody = Buffer.from(JSON.stringify(payload));
    const { LemonSqueezyProvider } = await import("../integrations/payments");
    const provider = new LemonSqueezyProvider();
    await expect(provider.verifyWebhook({ payload, rawBody, signature: "bad" })).rejects.toThrow("signature is invalid");
  });

  it("keeps a successful recurring payment active", async () => {
    const payload = {
      meta: { event_name: "subscription_payment_success", custom_data: {} },
      data: { type: "subscription-invoices", id: "invoice-1", attributes: { status: "paid", subscription_id: 123 } }
    };
    const rawBody = Buffer.from(JSON.stringify(payload));
    const signature = crypto.createHmac("sha256", "test-webhook-secret").update(rawBody).digest("hex");
    const { LemonSqueezyProvider } = await import("../integrations/payments");
    const provider = new LemonSqueezyProvider();
    await expect(provider.verifyWebhook({ payload, rawBody, signature })).resolves.toMatchObject({
      subscriptionId: "123",
      status: "active"
    });
  });
});

describe("Stripe provider", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", "postgres://test:test@localhost:5432/test");
    vi.stubEnv("PAYMENT_PROVIDER", "stripe");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_ascend");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_ascend_test");
    vi.stubEnv("STRIPE_PREMIUM_PRICE_ID", "price_premium");
    vi.stubEnv("STRIPE_TRAINER_PRO_PRICE_ID", "price_trainer");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("accepts a signed subscription update with Ascend metadata", async () => {
    const payload = JSON.stringify({
      id: "evt_subscription_updated",
      object: "event",
      api_version: "2026-03-25.basil",
      created: 1_750_000_000,
      livemode: false,
      pending_webhooks: 1,
      request: null,
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_ascend",
          object: "subscription",
          customer: "cus_ascend",
          status: "active",
          metadata: { ascend_user_id: "user-123", ascend_plan: "premium" },
          items: { data: [{ current_period_start: 1_750_000_000, current_period_end: 1_752_592_000 }] }
        }
      }
    });
    const stripe = new Stripe("sk_test_ascend");
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_ascend_test" });
    const { StripeProvider } = await import("../integrations/payments");

    await expect(new StripeProvider().verifyWebhook({
      payload: JSON.parse(payload),
      rawBody: Buffer.from(payload),
      signature
    })).resolves.toMatchObject({
      provider: "stripe",
      eventType: "customer.subscription.updated",
      reference: "evt_subscription_updated",
      subscriptionId: "sub_ascend",
      customerId: "cus_ascend",
      userId: "user-123",
      plan: "premium",
      status: "active"
    });
  });

  it("rejects an invalid Stripe signature", async () => {
    const { StripeProvider } = await import("../integrations/payments");
    await expect(new StripeProvider().verifyWebhook({
      payload: {},
      rawBody: Buffer.from("{}"),
      signature: "bad"
    })).rejects.toThrow("signature is invalid");
  });
});

import crypto from "crypto";
import { SubscriptionPlan, SubscriptionProvider, SubscriptionStatus } from "@ascend/shared";
import { env } from "../config/env";

export interface CheckoutRequest {
  userId: string;
  email: string;
  fullName: string;
  plan: Exclude<SubscriptionPlan, "free">;
  amountRm: number;
}

export interface CheckoutSession {
  provider: Extract<SubscriptionProvider, "lemonsqueezy" | "toyyibpay">;
  checkoutUrl: string;
  providerReference: string;
}

export interface PaymentWebhookInput {
  payload: unknown;
  rawBody?: Buffer;
  signature?: string;
}

export interface PaymentWebhookEvent {
  provider: Extract<SubscriptionProvider, "lemonsqueezy" | "toyyibpay">;
  eventType: string;
  reference: string;
  subscriptionId?: string;
  customerId?: string;
  userId?: string;
  plan?: Exclude<SubscriptionPlan, "free">;
  status: SubscriptionStatus;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  payload: unknown;
}

export interface PaymentProvider {
  readonly provider: CheckoutSession["provider"];
  createCheckoutSession(request: CheckoutRequest): Promise<CheckoutSession>;
  verifyWebhook(input: PaymentWebhookInput): Promise<PaymentWebhookEvent>;
  getCustomerPortalUrl?(subscriptionId: string): Promise<string>;
}

export class PaymentProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentProviderError";
  }
}

function readPayloadValue(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = payload[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function lemonHeaders() {
  if (!env.LEMONSQUEEZY_API_KEY) {
    throw new PaymentProviderError("Lemon Squeezy is not configured yet. Add the API key in Railway.");
  }
  return {
    Accept: "application/vnd.api+json",
    "Content-Type": "application/vnd.api+json",
    Authorization: `Bearer ${env.LEMONSQUEEZY_API_KEY}`
  };
}

function mapLemonStatus(status: string): SubscriptionStatus {
  switch (status.toLowerCase()) {
    case "active": return "active";
    case "on_trial": return "trialing";
    case "cancelled":
    case "canceled": return "canceled";
    case "expired": return "expired";
    default: return "past_due";
  }
}

function mapLemonEventStatus(eventType: string, status: unknown): SubscriptionStatus {
  if (eventType === "subscription_cancelled") return "canceled";
  if (eventType === "subscription_expired") return "expired";
  if (eventType === "subscription_resumed" || eventType === "subscription_payment_success") return "active";
  if (eventType === "subscription_payment_failed") return "past_due";
  return mapLemonStatus(String(status ?? "past_due"));
}

function parsePaidPlan(value: unknown): Exclude<SubscriptionPlan, "free"> | undefined {
  return value === "premium" || value === "trainer_pro" ? value : undefined;
}

export class LemonSqueezyProvider implements PaymentProvider {
  readonly provider = "lemonsqueezy" as const;

  async createCheckoutSession(request: CheckoutRequest): Promise<CheckoutSession> {
    const variantId = request.plan === "premium"
      ? env.LEMONSQUEEZY_PREMIUM_VARIANT_ID
      : env.LEMONSQUEEZY_TRAINER_PRO_VARIANT_ID;

    if (!env.LEMONSQUEEZY_STORE_ID || !variantId) {
      throw new PaymentProviderError("Lemon Squeezy products are not configured yet. Add the store and variant IDs in Railway.");
    }

    const response = await fetch(`${env.LEMONSQUEEZY_API_BASE_URL}/checkouts`, {
      method: "POST",
      headers: lemonHeaders(),
      body: JSON.stringify({
        data: {
          type: "checkouts",
          attributes: {
            checkout_options: {
              embed: false,
              media: false,
              logo: true
            },
            checkout_data: {
              email: request.email,
              name: request.fullName,
              custom: {
                ascend_user_id: request.userId,
                ascend_plan: request.plan
              }
            },
            product_options: {
              redirect_url: `${env.FRONTEND_URL.replace(/\/$/, "")}/subscription?checkout=success`,
              enabled_variants: [Number(variantId)]
            }
          },
          relationships: {
            store: { data: { type: "stores", id: String(env.LEMONSQUEEZY_STORE_ID) } },
            variant: { data: { type: "variants", id: String(variantId) } }
          }
        }
      })
    });

    const body = await response.json().catch(() => null) as {
      data?: { id?: string; attributes?: { url?: string } };
      errors?: Array<{ detail?: string }>;
    } | null;
    if (!response.ok) {
      throw new PaymentProviderError(body?.errors?.[0]?.detail ?? "Lemon Squeezy checkout could not be created.");
    }

    const checkoutUrl = body?.data?.attributes?.url;
    const providerReference = body?.data?.id;
    if (!checkoutUrl || !providerReference) {
      throw new PaymentProviderError("Lemon Squeezy returned an incomplete checkout response.");
    }

    return { provider: this.provider, checkoutUrl, providerReference };
  }

  async verifyWebhook(input: PaymentWebhookInput): Promise<PaymentWebhookEvent> {
    if (!env.LEMONSQUEEZY_WEBHOOK_SECRET) {
      throw new PaymentProviderError("Lemon Squeezy webhook secret is not configured.");
    }
    if (!input.rawBody || !input.signature) {
      throw new PaymentProviderError("Lemon Squeezy webhook signature is missing.");
    }

    const expected = crypto.createHmac("sha256", env.LEMONSQUEEZY_WEBHOOK_SECRET).update(input.rawBody).digest("hex");
    const expectedBuffer = Buffer.from(expected, "utf8");
    const providedBuffer = Buffer.from(input.signature, "utf8");
    if (expectedBuffer.length !== providedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, providedBuffer)) {
      throw new PaymentProviderError("Lemon Squeezy webhook signature is invalid.");
    }

    const body = typeof input.payload === "object" && input.payload !== null
      ? input.payload as {
          meta?: { event_name?: string; custom_data?: Record<string, unknown> };
          data?: { id?: string; type?: string; attributes?: Record<string, unknown> };
        }
      : {};
    const attributes = body.data?.attributes ?? {};
    const custom = body.meta?.custom_data ?? {};
    const reference = String(body.data?.id ?? "").trim();
    const eventType = String(body.meta?.event_name ?? "subscription_updated");
    if (!reference) throw new PaymentProviderError("Lemon Squeezy webhook is missing its reference.");

    const subscriptionId = body.data?.type === "subscriptions"
      ? reference
      : String(attributes.subscription_id ?? "").trim() || undefined;

    return {
      provider: this.provider,
      eventType,
      reference,
      subscriptionId,
      customerId: attributes.customer_id ? String(attributes.customer_id) : undefined,
      userId: custom.ascend_user_id ? String(custom.ascend_user_id) : undefined,
      plan: parsePaidPlan(custom.ascend_plan),
      status: mapLemonEventStatus(eventType, attributes.status),
      currentPeriodStart: typeof attributes.created_at === "string" ? attributes.created_at : null,
      currentPeriodEnd:
        typeof attributes.renews_at === "string" ? attributes.renews_at
          : typeof attributes.ends_at === "string" ? attributes.ends_at
            : null,
      payload: input.payload
    };
  }

  async getCustomerPortalUrl(subscriptionId: string) {
    const response = await fetch(`${env.LEMONSQUEEZY_API_BASE_URL}/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      headers: lemonHeaders()
    });
    const body = await response.json().catch(() => null) as {
      data?: { attributes?: { urls?: { customer_portal?: string } } };
      errors?: Array<{ detail?: string }>;
    } | null;
    const url = body?.data?.attributes?.urls?.customer_portal;
    if (!response.ok || !url) {
      throw new PaymentProviderError(body?.errors?.[0]?.detail ?? "Billing portal could not be opened.");
    }
    return url;
  }
}

export class ToyyibPayProvider implements PaymentProvider {
  readonly provider = "toyyibpay" as const;

  async createCheckoutSession(request: CheckoutRequest): Promise<CheckoutSession> {
    const reference = `ASC-${request.userId}-${Date.now()}`;
    if (!env.TOYYIBPAY_SECRET_KEY || !env.TOYYIBPAY_CATEGORY_CODE) {
      throw new PaymentProviderError("ToyyibPay is not configured.");
    }

    const form = new URLSearchParams({
      userSecretKey: env.TOYYIBPAY_SECRET_KEY,
      categoryCode: env.TOYYIBPAY_CATEGORY_CODE,
      billName: `Ascend ${request.plan}`,
      billDescription: `Ascend ${request.plan} monthly subscription`,
      billPriceSetting: "1",
      billPayorInfo: "1",
      billAmount: String(Math.round(request.amountRm * 100)),
      billReturnUrl: env.TOYYIBPAY_RETURN_URL ?? "",
      billCallbackUrl: env.TOYYIBPAY_CALLBACK_URL ?? "",
      billExternalReferenceNo: reference,
      billTo: request.fullName,
      billEmail: request.email,
      billPhone: "",
      billSplitPayment: "0",
      billPaymentChannel: "0",
      billDisplayMerchant: "1"
    });

    const response = await fetch(`${env.TOYYIBPAY_BASE_URL}/index.php/api/createBill`, { method: "POST", body: form });
    if (!response.ok) throw new PaymentProviderError("ToyyibPay checkout could not be created.");
    const data = await response.json().catch(() => null) as Array<{ BillCode?: string; msg?: string }> | null;
    const billCode = Array.isArray(data) ? data[0]?.BillCode : undefined;
    if (!billCode) throw new PaymentProviderError(data?.[0]?.msg ?? "ToyyibPay did not return a checkout bill code.");
    return { provider: this.provider, providerReference: reference, checkoutUrl: `${env.TOYYIBPAY_BASE_URL}/${billCode}` };
  }

  async verifyWebhook(input: PaymentWebhookInput): Promise<PaymentWebhookEvent> {
    const body = typeof input.payload === "object" && input.payload !== null ? input.payload as Record<string, unknown> : {};
    const reference = readPayloadValue(body, ["billExternalReferenceNo", "bill_external_reference_no", "externalReferenceNo", "reference", "refno", "order_id"]);
    if (!reference) throw new PaymentProviderError("ToyyibPay callback is missing the Ascend reference.");
    const value = readPayloadValue(body, ["status_id", "status", "billpaymentStatus", "payment_status"]);
    const status = value === "1" || value.toLowerCase() === "success" || value.toLowerCase() === "paid"
      ? "active" : value === "3" || /cancelled|canceled/i.test(value) ? "canceled" : "past_due";
    return { provider: this.provider, eventType: status, reference, status, payload: input.payload };
  }
}

export const paymentProvider: PaymentProvider = env.PAYMENT_PROVIDER === "toyyibpay"
  ? new ToyyibPayProvider()
  : new LemonSqueezyProvider();

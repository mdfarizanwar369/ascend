import { SubscriptionPlan } from "@ascend/shared";
import { env } from "../config/env";

export interface CheckoutRequest {
  userId: string;
  email: string;
  fullName: string;
  plan: SubscriptionPlan;
  amountRm: number;
}

export interface CheckoutSession {
  provider: "toyyibpay";
  checkoutUrl: string;
  providerReference: string;
}

export interface PaymentProvider {
  createCheckoutSession(request: CheckoutRequest): Promise<CheckoutSession>;
  verifyWebhook(payload: unknown): Promise<{ reference: string; status: "active" | "past_due" | "canceled" }>;
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
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return "";
}

export class ToyyibPayProvider implements PaymentProvider {
  async createCheckoutSession(request: CheckoutRequest): Promise<CheckoutSession> {
    const reference = `ASC-${request.userId}-${Date.now()}`;

    if (!env.TOYYIBPAY_SECRET_KEY || !env.TOYYIBPAY_CATEGORY_CODE) {
      return {
        provider: "toyyibpay",
        providerReference: reference,
        checkoutUrl: `${env.TOYYIBPAY_RETURN_URL ?? "http://localhost:3000" }?pilot_reference=${reference}`
      };
    }

    const form = new URLSearchParams({
      userSecretKey: env.TOYYIBPAY_SECRET_KEY,
      categoryCode: env.TOYYIBPAY_CATEGORY_CODE,
      billName: `Ascend ${request.plan}`,
      billDescription: `Ascend ${request.plan} monthly subscription`,
      billPriceSetting: "1",
      billPayorInfo: "1",
      billAmount: String(request.amountRm * 100),
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

    const response = await fetch(`${env.TOYYIBPAY_BASE_URL}/index.php/api/createBill`, {
      method: "POST",
      body: form
    });

    if (!response.ok) {
      throw new PaymentProviderError("ToyyibPay checkout could not be created. Please try again.");
    }

    const data = (await response.json().catch(() => null)) as Array<{ BillCode?: string; msg?: string }> | null;
    if (!Array.isArray(data)) {
      throw new PaymentProviderError("ToyyibPay returned an unexpected checkout response.");
    }

    const providerError = data.find((item) => item.msg && !item.BillCode)?.msg;
    if (providerError) {
      throw new PaymentProviderError(providerError);
    }

    const billCode = data[0]?.BillCode;
    if (!billCode) {
      throw new PaymentProviderError("ToyyibPay did not return a checkout bill code.");
    }

    return {
      provider: "toyyibpay",
      providerReference: reference,
      checkoutUrl: `${env.TOYYIBPAY_BASE_URL}/${billCode}`
    };
  }

  async verifyWebhook(payload: unknown) {
    const body = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};
    const reference = readPayloadValue(body, [
      "billExternalReferenceNo",
      "bill_external_reference_no",
      "externalReferenceNo",
      "reference",
      "refno",
      "order_id"
    ]);
    if (!reference) {
      throw new PaymentProviderError("ToyyibPay callback is missing the Ascend reference.");
    }

    const status = readPayloadValue(body, ["status_id", "status", "billpaymentStatus", "payment_status"]);
    const normalizedStatus = status === "1" || status.toLowerCase() === "success" || status.toLowerCase() === "paid"
      ? "active"
      : status === "3" || status.toLowerCase() === "cancelled" || status.toLowerCase() === "canceled"
        ? "canceled"
        : "past_due";

    return {
      reference,
      status: normalizedStatus
    } as const;
  }
}

export const paymentProvider = new ToyyibPayProvider();

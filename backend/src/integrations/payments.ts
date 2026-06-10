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

export class ToyyibPayProvider implements PaymentProvider {
  async createCheckoutSession(request: CheckoutRequest): Promise<CheckoutSession> {
    const reference = `ASC-${request.userId}-${Date.now()}`;

    if (!env.TOYYIBPAY_SECRET_KEY || !env.TOYYIBPAY_CATEGORY_CODE) {
      return {
        provider: "toyyibpay",
        providerReference: reference,
        checkoutUrl: `${env.TOYYIBPAY_RETURN_URL ?? "http://localhost:3000" }?demo_reference=${reference}`
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
    const data = (await response.json()) as Array<{ BillCode: string }>;
    const billCode = data[0]?.BillCode;

    return {
      provider: "toyyibpay",
      providerReference: reference,
      checkoutUrl: `${env.TOYYIBPAY_BASE_URL}/${billCode}`
    };
  }

  async verifyWebhook(payload: unknown) {
    const body = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};
    return {
      reference: String(body.billExternalReferenceNo ?? body.reference ?? ""),
      status: body.status_id === "1" || body.status === "1" ? "active" : "past_due"
    } as const;
  }
}

export const paymentProvider = new ToyyibPayProvider();

import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Refund and Cancellation Policy | Ascend" };

export default function RefundPolicyPage() {
  return (
    <LegalPage
      eyebrow="Subscriptions"
      title="Refund and Cancellation Policy"
      introduction="We want Ascend subscriptions to be straightforward. This policy explains renewals, cancellations, refunds, and how to get billing help."
      sections={[
        {
          title: "Subscription renewal",
          paragraphs: [
            "Premium and Trainer Pro are recurring subscriptions. Checkout displays the price, currency, taxes, billing period, and renewal terms before payment. Unless cancelled, the subscription renews automatically through the billing provider used at purchase."
          ]
        },
        {
          title: "Cancellation",
          bullets: [
            "Web subscriptions may be managed from Ascend's subscription page by selecting Manage billing. Android subscriptions purchased through Google Play must be managed in Google Play subscriptions.",
            "Cancellation stops future renewals. Access normally continues until the end of the paid billing period.",
            "Deleting the app, stopping usage, or leaving a gym does not automatically cancel a subscription.",
            "If you cannot access the billing portal, contact support@getascend.fit before the next renewal date."
          ]
        },
        {
          title: "First-payment refund window",
          paragraphs: [
            "For web subscriptions processed by Stripe, you may request a refund within 7 days of your first payment if Ascend is not suitable for you. Google Play purchases are also subject to Google Play's refund policies and request process. Include the account email and payment reference when contacting Ascend."
          ]
        },
        {
          title: "Renewals and exceptional refunds",
          paragraphs: [
            "Subscription renewals and partially used billing periods are generally non-refundable. We will review duplicate charges, unauthorized transactions, confirmed technical failures, and requests required by applicable consumer law. Contact us as soon as possible, preferably within 7 days of the charge."
          ]
        },
        {
          title: "Processing time",
          paragraphs: [
            "Approved refunds may take several business days to appear depending on Stripe, Google Play, the bank, or the card issuer. Currency conversion or bank charges outside our control may not be refundable."
          ]
        },
        {
          title: "How to request help",
          bullets: [
            "Email support@getascend.fit with the subject Billing Support or Refund Request.",
            "Include your Ascend account email, payment reference or receipt, payment date, billing provider, and a short explanation.",
            "Do not email full card numbers, passwords, identity documents, or other unnecessary sensitive information."
          ]
        }
      ]}
    />
  );
}

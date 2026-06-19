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
          title: "Monthly renewal",
          paragraphs: [
            "Premium and Trainer Pro are recurring monthly subscriptions. The checkout displays the price, currency, taxes, and renewal terms before payment. Unless cancelled, the subscription renews automatically on the billing date."
          ]
        },
        {
          title: "Cancellation",
          bullets: [
            "You may cancel at any time from Ascend's subscription page by selecting Manage billing.",
            "Cancellation stops future renewals. Access normally continues until the end of the paid billing period.",
            "Deleting the app, stopping usage, or leaving a gym does not automatically cancel a subscription.",
            "If you cannot access the billing portal, contact support@getascend.fit before the next renewal date."
          ]
        },
        {
          title: "First-payment refund window",
          paragraphs: [
            "You may request a refund within 7 days of your first payment if Ascend is not suitable for you. Include the account email and order number. Approved refunds are returned to the original payment method through Lemon Squeezy."
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
            "Lemon Squeezy is the Merchant of Record for supported purchases. Approved refunds may take several business days to appear, depending on the bank or card issuer. Currency conversion or bank charges outside our control may not be refundable."
          ]
        },
        {
          title: "How to request help",
          bullets: [
            "Email support@getascend.fit with the subject Billing Support or Refund Request.",
            "Include your Ascend account email, Lemon Squeezy order number, payment date, and a short explanation.",
            "Do not email full card numbers, passwords, identity documents, or other unnecessary sensitive information."
          ]
        }
      ]}
    />
  );
}

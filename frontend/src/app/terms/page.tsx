import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Terms of Service | Ascend" };

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Using Ascend"
      title="Terms of Service"
      introduction="These Terms govern access to Ascend. By creating an account or using the service, you agree to use Ascend responsibly and understand the limits of fitness and AI guidance."
      sections={[
        {
          title: "The Ascend service",
          paragraphs: [
            "Ascend is a fitness accountability platform supporting Self-Coached, AI-Coached, and Human-Coached experiences. Features may include tracking, trainer communication, progress photos, AI estimates, reports, assignments, subscription management, and gym engagement tools."
          ]
        },
        {
          title: "Accounts and eligibility",
          bullets: [
            "You must provide accurate information, keep login credentials secure, and notify us of unauthorized access.",
            "You must be at least 18 years old, unless participation is approved through a gym with appropriate parent or guardian consent.",
            "Trainer and administrator access is subject to approval. Users may not claim qualifications, roles, or gym authority they do not possess.",
            "We may suspend accounts used for abuse, fraud, harassment, unlawful activity, security interference, or deliberate misuse."
          ]
        },
        {
          title: "Health, nutrition, and AI disclaimer",
          paragraphs: [
            "Ascend provides general fitness accountability and educational guidance. It does not provide medical diagnosis, medical treatment, emergency services, or individualized clinical nutrition advice. Consult a qualified professional before making significant changes, particularly if you are pregnant, injured, taking medication, or have a health condition.",
            "Calories, macros, activity burn, risk signals, AI responses, and progress calculations are estimates. They may be incomplete or inaccurate. Users and trainers remain responsible for professional judgment and real-world decisions."
          ]
        },
        {
          title: "Human coaching and gym relationships",
          paragraphs: [
            "Trainers and gyms are independent participants responsible for their own qualifications, services, conduct, and advice. Ascend helps them communicate and monitor accountability but does not guarantee coaching outcomes, member results, gym services, or trainer availability."
          ]
        },
        {
          title: "Subscriptions and billing",
          bullets: [
            "Paid plans renew for the billing period shown at purchase until cancelled through the provider used for that subscription.",
            "Web subscriptions are processed by Stripe. Eligible Android in-app subscriptions are processed by Google Play. Ascend remains responsible for providing the subscribed service.",
            "The price, currency, taxes, renewal period, and billing provider are displayed before purchase. Plan access begins after successful payment confirmation.",
            "If a subscription expires or payment fails, paid features may be restricted until billing is resolved. Cancellation and refund details are explained in the Refund and Cancellation Policy."
          ]
        },
        {
          title: "Your content",
          paragraphs: [
            "You retain ownership of content you upload. You grant Ascend a limited permission to host, process, display, and transmit that content only as needed to operate the service and provide authorized trainer or gym access. You must have the right to upload all content you submit."
          ]
        },
        {
          title: "Service availability and liability",
          paragraphs: [
            "Ascend is provided on an as-available basis. We work to keep it reliable but do not promise uninterrupted operation or guaranteed fitness results. To the maximum extent permitted by law, Ascend is not responsible for indirect losses, lost profits, or decisions made solely from estimates or AI output. Nothing in these Terms excludes rights or liability that cannot legally be excluded."
          ]
        },
        {
          title: "Changes and contact",
          paragraphs: [
            "We may improve, modify, or discontinue parts of Ascend and update these Terms when reasonably necessary. Material changes will be communicated through the service or published here. Questions may be sent to support@getascend.fit."
          ]
        }
      ]}
    />
  );
}

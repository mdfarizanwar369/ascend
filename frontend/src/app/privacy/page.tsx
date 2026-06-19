import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Privacy Policy | Ascend" };

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Your data"
      title="Privacy Policy"
      introduction="Ascend helps members, trainers, and gym owners stay aligned between sessions. This policy explains what information we collect, how we use it, and the choices available to you."
      sections={[
        {
          title: "Information we collect",
          bullets: [
            "Account information such as your name, email address, authentication identifier, role, gym, trainer assignment, and referral source.",
            "Fitness profile information such as your goals, age, sex selection, height, weight, target weight, activity level, and coaching preference.",
            "Information you choose to log, including food, water, activity, habits, progress photos, messages, AI coach conversations, and weekly check-ins.",
            "Subscription metadata such as plan, payment status, renewal period, and provider references. Ascend does not store complete payment card details.",
            "Technical and usage information needed for security, troubleshooting, service performance, and aggregate product analytics."
          ]
        },
        {
          title: "How we use information",
          bullets: [
            "Provide, personalize, secure, and improve Ascend.",
            "Calculate supportive nutrition, consistency, and progress guidance.",
            "Connect clients with their assigned trainer and authorized gym administrators.",
            "Process subscriptions, provide customer support, prevent abuse, and comply with legal obligations.",
            "Generate aggregated insights that help trainers and gym owners understand engagement."
          ]
        },
        {
          title: "Trainer and gym visibility",
          paragraphs: [
            "When you are connected to a trainer or gym, authorized trainers and gym administrators may see information needed for accountability, including your logs, progress, plan, risk signals, assignments, and messages. Self-Coached users are not automatically assigned to a trainer."
          ]
        },
        {
          title: "AI and service providers",
          paragraphs: [
            "Ascend uses specialist providers to operate the service, including Firebase for authentication, Railway and PostgreSQL infrastructure, Cloudflare R2 or compatible storage, Google Gemini for configured AI features, and Lemon Squeezy for subscription billing. Relevant data is shared only as needed to provide these services.",
            "Food photos and AI coach messages may be processed by the configured AI provider. AI estimates can be inaccurate and should be reviewed before you rely on or save them."
          ]
        },
        {
          title: "Retention and security",
          paragraphs: [
            "We retain information while your account is active and as reasonably required for service delivery, security, dispute resolution, accounting, and legal compliance. We use access controls and reasonable technical safeguards, but no online system can guarantee absolute security."
          ]
        },
        {
          title: "Your choices and rights",
          paragraphs: [
            "You may ask to access, correct, export, or delete personal information, subject to identity verification and applicable legal requirements. You may also disconnect from a trainer or stop uploading optional photos and logs."
          ],
          bullets: [
            "For privacy requests, email support@getascend.fit with the subject Privacy Request.",
            "Ascend does not sell personal information or use health and fitness data for third-party advertising.",
            "International processing may occur where our service providers operate, with reasonable safeguards applied."
          ]
        },
        {
          title: "Age and policy updates",
          paragraphs: [
            "Ascend is intended for users aged 18 or older. A younger user may only participate through an approved gym arrangement with appropriate parent or guardian consent. We may update this policy as the service evolves and will publish the revised date here."
          ]
        }
      ]}
    />
  );
}

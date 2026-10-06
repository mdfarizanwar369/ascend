import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
import { AI_DATA_CATEGORIES } from "@ascend/shared";

export const metadata: Metadata = { title: "Privacy Policy | Ascend" };

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Your data"
      title="Privacy Policy"
      updatedAt="6 October 2026"
      introduction="Ascend helps members, trainers, and gym owners stay aligned between sessions. This policy explains what information we collect, how we use it, and the choices available to you."
      sections={[
        {
          title: "Information we collect",
          bullets: [
            "Account information such as your name, email address, authentication identifier, role, gym, trainer assignment, and referral source.",
            "Fitness profile information such as your goals, age, sex selection, height, weight, target weight, activity level, and coaching preference.",
            "Information you choose to log, including food, water, activity, habits, progress photos, messages, AI coach conversations, and weekly check-ins. We collect these through your entries, uploads and optional connected services, and keep your AI sharing choice with its provider, disclosure version and date.",
            "If you choose Speak meal, your microphone is used only while you are speaking. Your device or browser speech-recognition service converts the audio into editable text; Ascend does not store the audio recording.",
            "If you connect Android Health Connect, Ascend imports only daily steps, exercise sessions, and active calories burned so your activity summary and Coach Zoe guidance can be more useful.",
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
          title: "Health Connect",
          paragraphs: [
            "Health Connect syncing is optional. If you connect it, Ascend reads only steps, exercise sessions, and active calories burned. We do not read sleep, heart rate, blood pressure, medical records, location, or nutrition from Health Connect.",
            "Health Connect data is sent securely to Ascend so it can appear in your dashboard, support Coach Zoe, and help your assigned trainer understand your activity when you are on a coached plan. You can disconnect Health Connect from Ascend in Settings. You can also revoke device permissions from Android Health Connect settings."
          ]
        },
        {
          title: "Apple Health imports",
          paragraphs: [
            "Supported iPhone and iPad releases offer an optional, read-only Apple Health connection for steps, active energy and workouts. You choose readable categories in Apple's permission screen and separately consent to storing imported daily totals, workout identifiers, timing, type, energy estimates and source names in your Ascend account. No subscription is required. Your food target does not automatically change.",
            "The initial Apple Health release uses imports and derived consistency scores only in your private dashboard and activity history. They are excluded from AI, trainer, gym and marketing views; existing sharing choices do not silently authorize these new categories. Pending native updates are protected on the device and excluded from backups.",
            "Disconnect stops future sync and retains history. Export or delete imported history in the connection screen. Deletion preserves manual logs and does not change Apple Health records. Account deletion removes account-linked imports, subject to normal backup and legal retention limits. Device read access remains controlled separately in Apple's Health settings. See /privacy/ios for the iPhone and iPad disclosure."
          ]
        },
        {
          title: "Siri shortcuts",
          paragraphs: [
            "Supported iPhone releases make Ascend App Shortcuts available through Siri and Apple's Shortcuts system without a separate in-app setup screen. After you sign in, Ascend keeps a limited device credential in the iPhone Keychain so a shortcut can retrieve the Ascend information you request. The server stores only a one-way hash of that credential, it expires automatically, and signing out revokes the credential on that device.",
            "Ascend answers only after you invoke its shortcut. It does not listen in the background. Your spoken request is handled by Apple's Siri services under your Apple settings; Ascend receives the shortcut question or category needed to produce the answer. These answers use your Ascend records and deterministic calculations and are not sent to an AI provider."
          ]
        },
        {
          title: "Trainer and gym visibility",
          paragraphs: [
            "When you are connected to a trainer or gym, authorized trainers and gym administrators may see information needed for accountability, including your logs, Health Connect activity summary, progress, plan, risk signals, assignments, and messages. Self-Coached users are not automatically assigned to a trainer."
          ]
        },
        {
          title: "AI and service providers",
          paragraphs: [
            "Ascend uses Firebase for authentication and Android crash diagnostics, Railway and PostgreSQL infrastructure for hosting and data storage, Cloudflare R2 or compatible storage for uploaded images, Stripe for web payments, Google Play for Android purchases and Apple for iOS purchases where available. We share only information needed for each service.",
            "AI features use Google Gemini, provided by Google, or OpenAI when configured. Before personal data is sent, the in-app AI privacy screen names the current provider, describes the data and purpose, and asks you to allow or decline. No AI sharing permission is inferred from registration, a subscription, or agreeing to this policy. Changing provider or materially changing the disclosure requires a new choice.",
            "With your permission, relevant information listed below is sent to the named AI provider for meal estimates, workout interpretation, body composition explanations and personalized fitness guidance, including daily suggestions and progress reflections. Your choice also applies when an assigned trainer requests AI guidance using your records. A trainer cannot grant consent for you. AI estimates can be inaccurate and are not medical advice.",
            "We require service providers handling personal data to provide the same or equal protection described in this policy: limited processing for the specified service, confidentiality, access controls, secure transfer and applicable retention and deletion obligations. Google's paid Gemini API processes prompts and responses under its data-processing terms and does not use them to improve Google's products. Providers may retain limited records for abuse prevention or legal requirements. We do not use unpaid Gemini services for personal fitness data.",
            "When you use Speak meal, speech recognition may be provided by your device platform or browser and may require a network connection under that provider's settings. Ascend receives the resulting text and does not retain the microphone recording."
          ],
          bullets: [...AI_DATA_CATEGORIES]
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
            "AI sharing is optional and off until you allow it. Go to Profile → AI privacy to decline or turn it off at any time. Manual tracking remains available. Turning sharing off stops new AI requests, including trainer requests for your records; it cannot recall data already sent. Contact support for deletion requests concerning previously processed data.",
            "For privacy requests, email support@getascend.fit with the subject Privacy Request.",
            "Ascend also provides a public account deletion resource at /delete-account and an in-app self-service path under Profile -> Account -> Delete Account.",
            "Deleting your Ascend account removes Ascend-held Health Connect records from our systems subject to normal backup and legal retention limits. Revoking Health Connect on your Android device stops future Health Connect access.",
            "Ascend does not sell personal information or use health and fitness data for third-party advertising.",
            "International processing may occur where our service providers operate, with reasonable safeguards applied."
          ]
        },
        {
          title: "Age and policy updates",
          paragraphs: [
            "Ascend is intended for users aged 18 or older. We do not knowingly allow people under 18 to create or manage an Ascend account. We may update this policy as the service evolves and will publish the revised date here."
          ]
        }
      ]}
    />
  );
}

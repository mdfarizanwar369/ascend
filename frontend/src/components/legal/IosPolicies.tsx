import { LegalPage } from "./LegalPage";
import { iosAiDataCategories } from "@/lib/iosPrivacyCopy";

export function IosPrivacyPolicy() {
  return <LegalPage iosEdition eyebrow="Your data" title="Privacy Policy" updatedAt="20 September 2026"
    introduction="This policy describes Ascend's free iPhone and iPad app: personal fitness tracking and optional AI guidance. It explains what we collect, how we use it, and your choices."
    sections={[
      { title: "Information we collect", bullets: [
        "Account information such as your name, email address and authentication identifier, provided when you register or sign in.",
        "Fitness profile information such as goals, age, sex selection, height, weight, target weight and activity level.",
        "Information you choose to enter or upload, including meals, water, activity, habits, workout notes, weight and AI conversations. Existing account records, including relevant images and activity imported from connected services, may be used to personalize guidance. This app does not connect device health-data services.",
        "If you choose Speak meal, your microphone is used only while speaking. Your device or browser speech-recognition service converts audio into editable text; Ascend does not store the audio recording.",
        "Your AI sharing choice, including its provider, disclosure version and date; technical and usage information needed for security, troubleshooting, service performance and aggregate analytics."
      ] },
      { title: "How we use information", paragraphs: [
        "We use this information to provide, personalize, secure and improve Ascend, maintain your logs, calculate fitness estimates and consistency guidance, support you, prevent abuse and comply with legal obligations. The iPhone and iPad edition has no paid subscription or checkout."
      ] },
      { title: "AI sharing is your choice", paragraphs: [
        "AI features use Google Gemini, provided by Google, or OpenAI when configured. Before sharing personal data, the AI privacy screen names the current provider, explains the data and purpose, and asks you to allow or decline. Registration or agreeing to this policy does not grant AI permission. A provider change or material disclosure change requires a new choice.",
        "With your permission, relevant data listed below is sent to the named provider for meal estimates, workout interpretation and personalized fitness guidance, including daily suggestions and progress reflections. AI estimates can be inaccurate and are not medical advice. Existing account records may include scan data from earlier use. Permission can also apply to an assigned trainer's requests using your account records; trainers cannot give consent for you. This free app does not provide trainer workspaces or paid features.",
        "Google's paid Gemini API processes prompts and responses under its data-processing terms and does not use them to improve Google's products. We do not use unpaid Gemini services for personal fitness data. Providers may retain limited records for abuse prevention or legal requirements."
      ], bullets: [...iosAiDataCategories] },
      { title: "Service providers and protection", paragraphs: [
        "Ascend uses Firebase for authentication, Railway and PostgreSQL infrastructure for hosting and data storage, and Cloudflare R2 or compatible storage for uploaded images. Device or browser speech recognition may require a network connection under that provider's settings. Ascend receives the resulting text and does not retain microphone audio.",
        "We share only information needed for each service. Providers handling personal data must provide the same or equal protection described here: processing limited to the specified service, confidentiality, access controls, secure transfer, and applicable retention and deletion obligations. We do not send your password or payment card details to AI providers."
      ] },
      { title: "Existing account relationships", paragraphs: [
        "If your account already has a trainer or gym relationship, authorized participants may continue to see account records needed for that relationship, including logs, activity summaries, progress and messages. Self-Coached accounts are not automatically assigned to a trainer. You may disconnect from a trainer or contact support about those relationships. Signing into this free app does not create a trainer relationship or enable paid features."
      ] },
      { title: "Retention and security", paragraphs: [
        "We retain information while your account is active and as reasonably required for service delivery, security, dispute resolution, accounting and legal compliance. Access controls and reasonable technical safeguards protect information, but no online system can guarantee absolute security. International processing may occur where our providers operate, with reasonable safeguards applied."
      ] },
      { title: "Your choices and rights", bullets: [
        "AI sharing is optional and off until you allow it. In Profile → AI privacy, decline or turn sharing off at any time. Manual tracking remains available. Turning it off stops new AI requests, including trainer requests for your records; it cannot recall data already sent. Contact support for deletion requests concerning previously processed data.",
        "You may request access, correction, export or deletion of personal information, subject to identity verification and applicable legal requirements. Contact support@getascend.fit with the subject Privacy Request.",
        "Delete your account in Profile → Open Account Settings → Delete Account, or use /delete-account. Deletion removes account-linked records and uploaded images subject to normal backup and legal retention limits.",
        "Ascend does not sell personal information or use health and fitness data for third-party advertising."
      ] },
      { title: "Age and policy updates", paragraphs: [
        "Ascend is intended for adults aged 18 or older. We do not knowingly allow people under 18 to create or manage an account. We publish a revised date when this policy changes."
      ] }
    ]} />;
}

export function IosTerms() {
  return <LegalPage iosEdition eyebrow="Using Ascend" title="Terms of Service" updatedAt="20 September 2026"
    introduction="These Terms cover Ascend's free iPhone and iPad app. Use Ascend responsibly and understand the limits of fitness estimates and AI guidance."
    sections={[
      { title: "The free Ascend app", paragraphs: ["This edition includes personal meal, water, weight and activity tracking, recent progress, and optional AI estimates and Zoe guidance within the allowances shown under Included with Ascend. It has no paid subscription, purchase, upgrade or checkout. All accounts receive the same free features and limits."] },
      { title: "Accounts and eligibility", bullets: ["You must be at least 18 years old, provide accurate information, keep login credentials secure and notify us of unauthorized access.", "We may suspend accounts used for abuse, fraud, harassment, unlawful activity, security interference or deliberate misuse."] },
      { title: "Health and AI guidance", paragraphs: ["Ascend provides general fitness accountability and educational guidance. It does not provide medical diagnosis, treatment, emergency services or individualized clinical nutrition advice. Consult a qualified professional before significant changes, particularly if pregnant, injured, taking medication or living with a health condition.", "Calories, macros, activity burn, AI responses and progress calculations are estimates that may be incomplete or inaccurate. Review estimates before saving them. You remain responsible for real-world decisions. AI sharing is optional and can be withdrawn in Profile → AI privacy."] },
      { title: "Your content", paragraphs: ["You retain ownership of content you upload. You grant Ascend limited permission to host, process, display and transmit it as needed to operate the service and provide access you have authorized. You must have the right to upload all submitted content."] },
      { title: "Availability and liability", paragraphs: ["Ascend is provided on an as-available basis. We work to keep it reliable but do not promise uninterrupted operation or guaranteed fitness results. To the maximum extent permitted by law, Ascend is not responsible for indirect losses, lost profits or decisions based solely on estimates or AI output. Nothing in these Terms excludes rights or liability that cannot legally be excluded."] },
      { title: "Changes and contact", paragraphs: ["We may improve, modify or discontinue parts of Ascend and update these Terms when reasonably necessary. Material changes will be communicated through the service or published here. Contact support@getascend.fit for assistance."] }
    ]} />;
}

export function IosRefundPolicy() {
  return <LegalPage iosEdition eyebrow="Your account" title="Free app and cancellation" updatedAt="20 September 2026"
    introduction="Ascend's iPhone and iPad edition is free and has no purchases or paid subscriptions."
    sections={[
      { title: "No charges in this app", paragraphs: ["This edition does not charge for access, renew a subscription or offer an upgrade. There is no purchase to cancel or refund in this app."] },
      { title: "Close your account", paragraphs: ["You can stop using Ascend at any time. To delete your account and account-linked records, open Profile → Open Account Settings → Delete Account. The public account deletion page provides a support route if you cannot sign in."] },
      { title: "Support", paragraphs: ["For questions about your account or an existing billing relationship, contact support@getascend.fit. Your statutory rights are unaffected."] }
    ]} />;
}

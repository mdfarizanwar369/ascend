# App Store copy for iOS 1.1

Draft only. Apple rejected 1.0 (9.1) on 15 September. Use this copy with the tested replacement build after completing `IOS_SUBSCRIPTIONS_1_1.md`; do not claim payment tests or physical recordings have succeeded before they do. Use a production-origin build, not the isolated payment beta.

## What's New

Subscribe to Ascend Premium or Trainer Pro using your Apple Account. Restore purchases and manage your subscription from Profile > Subscriptions. Choose whether to share data with AI after reviewing the provider and data explanation, and manage that choice from Profile > AI privacy. We've also removed website installation prompts from the iPhone and iPad app.

## Description addition

OPTIONAL SUBSCRIPTIONS
Ascend Premium includes AI-assisted food estimates, coach guidance and weekly reports. Trainer Pro offers tools for trainer accounts, including client insights, check-ins and messaging. An account and the relevant role are required. AI estimates are guidance and may be inaccurate.

Subscriptions renew monthly unless cancelled at least 24 hours before the current period ends. Payment is charged to your Apple Account when you confirm. Manage or cancel your subscription in your Apple Account settings. Restore Purchases is available from Profile > Subscriptions.

Privacy policy: https://www.getascend.fit/privacy
Terms of Use: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/

## App Review Notes addition

Version 1.1 introduces two auto-renewable monthly subscriptions, both in the Ascend Membership group:

- Premium: `fit.getascend.app.premium.monthly`
- Trainer Pro: `fit.getascend.app.trainerpro.monthly` (higher service level)

After signing in, open Profile > Subscriptions. Prices and purchase confirmation come from Apple's StoreKit. Restore Purchases and Manage Apple Subscriptions are on the same screen. Existing web subscriptions are checked before opening a new Apple purchase to reduce duplicate charges. Family Sharing and purchases outside the app are not offered.

Each transaction is linked to the signed-in Ascend account. Restore using that same Ascend account and the Apple Account that purchased the subscription. A purchase cannot be transferred to another Ascend account. Trainer Pro does not grant administrative or trainer roles; the reviewer trainer account provides access to the trainer tools.

Retain the working member/trainer review credentials in App Store Connect's private review fields. Replace the 1.0 statement that the iOS app has no IAP. Preserve the existing purpose, audience, external-services, region and content-safety explanations where still accurate.

Before submitting these notes, add the tested 1.1 build number, actual device/OS used for purchase and restore testing, and product review screenshots. Do not claim testing has been completed until it has.

AI permission: before sharing, Ascend names the configured provider (Google Gemini in production), identifies food photos, messages and relevant fitness records, and requests explicit permission. Users may decline and continue manual tracking. Profile > AI privacy supports withdrawal. The backend checks current permission before provider requests and also checks the client's choice for trainer-generated guidance. The Privacy Policy explains data collection, uses and provider protection. Include a fresh recording showing this choice and the subscription disclosures; the earlier three recordings predate these changes.

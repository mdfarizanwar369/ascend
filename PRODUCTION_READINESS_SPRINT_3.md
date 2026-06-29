# Production Readiness Sprint 3

Date: 2026-06-30

Scope: Android Google Play Internal Testing readiness. This sprint does not add product features and does not implement Google Play Billing.

## What Was Fixed

### Health Connect Compliance

- Added the Health Connect permissions rationale intent to the Android manifest.
- Added the Android 14 permission usage activity alias required for Health Connect privacy/rationale access.
- Kept Health Connect permissions limited to:
  - steps
  - exercise sessions
  - active calories burned
- Added `POST_NOTIFICATIONS` to the manifest because Ascend already supports coach notifications.
- Expanded the in-app Health Sync explanation so users understand:
  - what Health Connect data Ascend reads
  - what Ascend does not read
  - when trainer/gym visibility may apply
  - that disconnecting Ascend is separate from revoking Android device permission

### Privacy and Data Safety

- Updated the public Privacy Policy to explicitly cover Android Health Connect.
- Documented that Health Connect syncing is optional.
- Documented that Ascend reads only steps, exercise sessions, and active calories.
- Documented that Ascend does not read sleep, heart rate, blood pressure, medical records, location, or nutrition from Health Connect.
- Documented trainer/gym visibility for coached users.
- Documented deletion and revocation behavior.
- Updated the Google Play release checklist with Health Connect Data Safety items.

### Health Sync Reliability

- Updated the Health Sync coordinator so it reacts when the user enters an authenticated app route after login.
- Health Sync remains non-blocking and delayed slightly so dashboard rendering is not slowed.
- Manual Sync remains unchanged.
- Duplicate prevention remains handled by existing backend upserts and unique provider/external record logic.

### Production Logging

- Gated Body Scan frontend save diagnostics behind `NEXT_PUBLIC_BODY_COMPOSITION_SAVE_DEBUG=1` or localStorage `ascend:body-composition-save-debug=1`.
- Gated Body Scan API payload logging behind the same debug switch.
- Gated Google Auth trace logging behind the existing auth debug flag.
- Gated backend Body Scan save-route logs behind `BODY_COMPOSITION_AI_DEBUG_LOGS` outside development.
- Changed Capacitor Android logging default from `debug` to `production`.
- Disabled Android backup for the app because Ascend handles sensitive fitness, body scan, and account data.

## Google Play Billing Investigation

### Does Ascend require Google Play Billing?

For the current Android Play-distributed app, yes, if the app allows users to purchase Premium, Trainer Pro, Athlete Mode, or other digital app functionality from inside the Android app.

Google Play policy says Play-distributed apps that accept payment for access to in-app features, subscriptions, app functionality, digital content, or cloud services must use Google Play Billing unless a listed exception or approved alternative billing / external offers program applies. It also prohibits leading users to alternative payment methods through in-app webviews, buttons, links, messages, ads, calls to action, or sign-up flows.

Ascend's current web subscription flow uses Stripe Checkout and Stripe Billing Portal. That is acceptable for the web app, but risky inside the Android app distributed through Google Play if the Android app displays upgrade/payment CTAs.

### If yes, why?

- Premium and Trainer Pro are digital subscriptions.
- They unlock in-app functionality and cloud services.
- The Android app is a Play-distributed wrapper around the web app.
- The current subscription UI can lead users to Stripe Checkout / Stripe Billing Portal.

### If no, when would it not require Google Play Billing?

Google Play Billing may not be required if the Android app does not sell, promote, or link to purchase digital subscriptions inside the app, and users only consume access purchased or approved elsewhere. It also may not apply to physical gym services, but Ascend Premium and Trainer Pro are software/digital features, not merely physical gym membership.

### Compliant alternatives

1. Smallest compliant change before Play Billing:
   - Keep Stripe on the website.
   - In the Android Play build, hide or disable Stripe checkout/payment CTAs.
   - Allow users to log in and use plans already purchased or owner-approved outside the Android app.
   - Show current plan and support/billing contact without linking to external payment.

2. Full Android monetization:
   - Implement Google Play Billing for Android subscriptions.
   - Keep Stripe for the web app.
   - Reconcile subscription status server-side by provider.

3. Alternative billing/external offers:
   - Only if Ascend is eligible and enrolled in Google's applicable programs for the target countries.

### Can Android users subscribe on the website while using the app?

They can subscribe on the website outside the Android app, but the Play-distributed Android app should not lead them there through in-app CTAs, links, webviews, or sign-up flows unless Ascend is enrolled in a compliant Google program. The safest short-term approach is to let Android users use existing access and handle purchases outside the app organically or through non-app channels.

### Recommendation

Do not implement Google Play Billing for Internal Testing yet. For Internal Testing, use manual pilot access or web-purchased accounts and prevent Android in-app payment CTAs before expanding beyond trusted testers. Implement Google Play Billing before public Android monetization.

## Remaining Manual Tasks

- Create / publish `https://www.getascend.fit/.well-known/assetlinks.json`.
- Create / publish `https://getascend.fit/.well-known/assetlinks.json` if apex links are supported.
- Use the final Play App Signing SHA-256 certificate in `assetlinks.json`.
- Add debug, upload, and Play signing SHA-1/SHA-256 fingerprints to Firebase / Google Cloud OAuth settings.
- Complete Google Play Data Safety using the updated data list.
- Confirm Health Connect app access declaration in Play Console, if requested.
- Decide Android payment posture before any wider Play release:
  - internal pilot/manual access only, or
  - Android-specific no-payment UI, or
  - Google Play Billing.
- Test notification permission prompt on Android 13+.
- Build and smoke test a signed release AAB on a physical Android phone before inviting external testers.

## Readiness for Google Play Internal Testing

Estimated readiness: 85%.

Ready for a small trusted internal test after validation succeeds, provided testers use manually approved or already active accounts and no production payment flow is tested inside the Android app.

Not ready for broad public Play release until the billing decision, asset links, Firebase SHA fingerprints, and Play Data Safety form are complete.

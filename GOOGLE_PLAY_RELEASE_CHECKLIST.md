# Ascend Google Play Release Checklist

This checklist prepares Ascend for Android release without changing the existing production web app.

## 1. Google Play Console setup

- Create or confirm the Google Play developer account.
- Create app: `Ascend`
- Default package / application ID: `fit.getascend.app`
- Default language: English
- App category: `Health & Fitness`
- App type: `App`

## 2. Store listing copy

### App name

- `Ascend`

### Short description

- `Fitness accountability between sessions for members, trainers, and gym owners.`

### Full description

- `Ascend helps members stay consistent during the 166 hours between training sessions. Members can log food, weight, water, workouts, progress photos, and Body Scans while trainers and gym owners gain better visibility into engagement, coaching opportunities, and retention signals.`
- `Premium members unlock AI food guidance, weekly coaching summaries, and deeper accountability. Athlete Mode extends that with Body Scan intelligence, Ascend DNA, and advanced coach review tools. Trainers can monitor client momentum, identify who needs attention, and coach beyond the gym floor. Owners can review club health, trainer engagement, and growth opportunities from one command center.`
- `Ascend is built to support coaching, not replace it.`

## 3. Visual assets required

- App icon: generated from Ascend branding
- Feature graphic: create a 1024 x 500 marketing graphic before submission
- Phone screenshots:
  - Login
  - Member dashboard
  - Food logging
  - Body Scan
  - Trainer dashboard
  - Owner dashboard
- Tablet screenshots only if tablet support is explicitly declared

## 4. Privacy policy and support links

- Privacy policy URL: `https://www.getascend.fit/privacy`
- Terms URL: `https://www.getascend.fit/terms`
- Refund policy URL: `https://www.getascend.fit/refund-policy`
- Support URL or email: `support@getascend.fit`

## 5. Android-specific release prerequisites

- Install Android Studio
- Install Java JDK 21 or the version required by the generated Gradle project
- Install Android SDK / Platform Tools
- Confirm `adb` works locally
- Generate a release keystore
- Record:
  - keystore path
  - keystore password
  - alias
  - alias password

## 6. Deep links and return-to-app setup

Ascend uses a live hosted web app inside the Android shell. To ensure Google sign-in, Stripe checkout, and billing portal returns can come back into the app cleanly:

- Configure Android App Links for:
  - `https://www.getascend.fit/*`
  - `https://getascend.fit/*`
- Publish a valid `.well-known/assetlinks.json` on the Ascend domain using the final signing certificate SHA-256 fingerprint.
- Test:
  - login return from Google
  - Stripe checkout success return
  - Stripe billing portal return

## 7. Data Safety practical checklist

Ascend collects or processes the following categories:

- Account information
  - name
  - email
  - Firebase authentication identifiers
- Health and fitness information
  - goals
  - weight
  - water
  - habits
  - workouts
  - food logs
  - progress photos
  - body scan photos
  - body composition metrics
- Messages / communications
  - trainer messages
  - praise
  - missions
  - coach notifications
- App activity
  - AI usage tracking
  - notification activity
  - engagement analytics
- Payment information
  - subscription metadata
  - billing status
  - provider references
  - Stripe-managed checkout / portal events

Before submission:

- Confirm every collected data type in Play Data Safety.
- Distinguish:
  - data collected
  - data shared
  - whether collection is optional or required
- Confirm whether health data is encrypted in transit.
- Confirm account deletion flow and support contact.
- Confirm whether body scan images and progress photos are user-provided content.

## 8. Permissions explanation

Required or expected permissions:

- Internet: required
- Camera / photos: required only for food logs, progress photos, profile photos, and body scans
- Notifications: only if coach notifications are enabled in the Android release

Do not request:

- contacts
- location
- microphone
- SMS
- phone state

## 9. Testing checklist before internal testing

- Install debug APK on a real Android device
- Open app from launcher
- Confirm launch screen / splash looks correct
- Confirm member login works
- Confirm logout works
- Confirm dashboard loads
- Confirm food photo selection works
- Confirm camera capture works
- Confirm body scan upload works
- Confirm trainer dashboard works
- Confirm owner dashboard works
- Confirm Google sign-in return path works on a signed build
- Confirm Stripe checkout and billing portal return to the app correctly
- Confirm back navigation feels native and does not trap the user

## 10. Internal testing track steps

- Create internal testing release
- Upload signed Android App Bundle (`.aab`)
- Add tester emails
- Publish to internal track
- Test on:
  - Pixel / Android Chrome WebView
  - Samsung device / Samsung Internet-backed WebView if possible
  - lower-end Android device

## 11. Production release steps

- Pass internal testing
- Fix any app-link / auth return issues
- Complete Play Store listing
- Complete Data Safety form
- Complete content rating
- Complete privacy policy link
- Upload signed AAB
- Roll out to a closed track first

## 12. Known risks to verify before production

- Google sign-in inside Android depends on correct redirect return handling through App Links.
- Stripe checkout / billing portal returns must be tested on a signed build.
- This Android shell loads the live hosted Ascend web app. If the production site is unavailable, the app experience is degraded.
- Android build validation on this machine is currently blocked until Java / Android SDK / adb are installed.

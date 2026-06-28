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
- Generate an upload keystore
- Record:
  - keystore path
  - keystore password
  - alias
  - alias password
- Recommended local command:

```powershell
npm run android:keystore:generate
```

- Confirm `android/signing.properties` exists locally and is not committed
- Back up the keystore and signing properties outside the repo before uploading to Play Console

## 5A. App signing and Play App Signing

- In Play Console, enable **Play App Signing**
- Use Ascend's local upload key only for upload
- Keep the upload key backed up offline
- After the first upload, record:
  - upload certificate SHA-1
  - upload certificate SHA-256
  - app signing certificate SHA-1
  - app signing certificate SHA-256
- Update Android App Links / `assetlinks.json` using the final Play signing certificate if required for production app links

## 5B. Versioning

- Control Android release versions using:

```text
ASCEND_ANDROID_VERSION_CODE=
ASCEND_ANDROID_VERSION_NAME=
```

- Increase `ASCEND_ANDROID_VERSION_CODE` for every Play upload
- Keep `ASCEND_ANDROID_VERSION_NAME` human readable, for example:
  - `0.1.0`
  - `0.1.1`
  - `0.2.0`

## 5C. Release build outputs

- Signed App Bundle:

```powershell
npm run android:release-bundle
```

- Optional signed release APK:

```powershell
npm run android:release-apk
```

- Internal testing prep pipeline:

```powershell
npm run android:internal-testing:prepare
```

- Expected outputs:
  - `android/app/build/outputs/bundle/release/app-release.aab`
  - `android/app/build/outputs/apk/release/app-release.apk`

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

## 8A. Network security review

Ascend release builds now explicitly:

- disallow cleartext traffic
- use a dedicated Android `network_security_config`
- trust system certificate authorities only

Before Play submission:

- confirm all production app traffic uses HTTPS
- confirm Google sign-in, Firebase helper flows, Stripe checkout, and the live Ascend site all load over valid HTTPS
- confirm there are no `http://` production dependencies inside the Android shell

## 8B. R8 / ProGuard release optimization

Release builds now use:

- R8 code shrinking
- resource shrinking
- optimized ProGuard configuration

Before each release:

- smoke test login
- smoke test food photo upload
- smoke test trainer dashboard
- smoke test owner dashboard
- smoke test Android back navigation
- smoke test Google sign-in

## 8C. Play Integrity readiness

Ascend does not yet enforce Play Integrity server-side, but the Android wrapper should be prepared operationally.

Before or shortly after internal testing:

- enable Play Integrity API in Google Play Console / Google Cloud if desired
- decide whether to use:
  - no enforcement initially
  - warning-only telemetry
  - future backend attestation checks
- document any future backend verification so it remains additive and does not affect web/iPhone users

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
- Confirm release bundle installs cleanly through internal testing
- Confirm no WebView mixed-content or SSL errors appear on a real device

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
- Emulator-only results may be misleading if the Android emulator itself has broken network / SSL state. Real-device testing is the final source of truth.

# Ascend iOS cloud build

Apple team: `76N75VT6A7`. Bundle ID: `fit.getascend.app`. App Store Connect app: `6810864942` (Ascend: Fitness & Nutrition).

## Build without a local Mac

Run `npm ci` and `npm run ios:prepare` on Windows or macOS. Commit the native `ios/` project; generated web assets and config stay ignored. `npm run ios:check` checks the platform config, portable Swift package paths, native metadata and icon. The iOS workflow builds a simulator app on GitHub's `macos-26` runner for relevant pull requests. Download `Ascend-iOS-simulator` from the Actions run; this is a simulator artifact, not an installable iPhone IPA.

`npm run ios:sync` sets the iOS platform marker and uses `CAPACITOR_IOS_SERVER_URL` (default `https://www.getascend.fit/launch`). Existing Android commands and URL selection are preserved. The native shell loads the hosted Ascend frontend, so frontend changes must be deployed separately before a device can use them.

## Signed TestFlight upload

After review and merge to main, configure the `apple-testflight` GitHub environment. Add required reviewers if available for the repository. Store these as environment secrets, never source files:

| Secret | Value |
| --- | --- |
| `IOS_CERTIFICATE_BASE64` | Base64 Apple Distribution `.p12`, including its private key |
| `IOS_CERTIFICATE_PASSWORD` | Password protecting that `.p12` |
| `IOS_APPLE_PROFILE_BASE64` | Base64 App Store profile with Sign in with Apple for this team and bundle ID; mapped to `IOS_PROFILE_BASE64` in the release process |
| `IOS_GOOGLE_SERVICE_INFO_BASE64` | Base64 Firebase iOS `GoogleService-Info.plist` for `ascend-b2850` |
| `ASC_KEY_ID` | App Store Connect API key ID |
| `ASC_ISSUER_ID` | App Store Connect API issuer ID |
| `ASC_PRIVATE_KEY_BASE64` | Base64 downloaded `.p8` key; use a role that permits build uploads |

Apple API access and signing credentials are configured. The `apple-testflight` environment requires the seven secrets above and permits deployments only from `main`. The App Store profile is named `Ascend App Store GitHub`; its certificate and profile expire on September 11, 2027. No credential files belong in this repository.

In Actions, run **iOS build** on **main**, with **upload_testflight** checked. The simulator job must pass first. The release job validates the profile team, bundle ID, expiration and distribution type, installs signing material into a temporary keychain, archives and exports the app, and uploads through Apple's tooling. It removes signing files after the job. The workflow run and attempt form the build number. Upload does not submit the app for App Review or publish it; Apple still needs to process the build and testers need to be configured.

## Native Google and Apple authentication

The `AscendIOS/2` shell includes Firebase Authentication with Google and Apple providers. The hosted frontend exchanges native identity tokens for the existing Firebase JavaScript session and provisions the same Ascend account. Apple's original nonce is required; the name supplied on first authorization is preserved. Older `AscendIOS/1` shells use email/password and show an update message if Google is attempted. Web and Android authentication retain their existing providers.

The Firebase iOS registration uses bundle `fit.getascend.app`. The Google callback URL scheme is in Info.plist, and App.entitlements requests Sign in with Apple. Firebase's Apple provider must be enabled; native identity-token exchange does not require a web Services ID. Regenerate the App Store profile after enabling Apple's capability, then replace `IOS_PROFILE_BASE64` in the GitHub environment. The release script refuses profiles lacking the entitlement.

`ios:prepare` writes the Firebase plist from `IOS_GOOGLE_SERVICE_INFO_BASE64`, or preserves an existing local plist. PR simulator builds without a real config use the committed example with a nonfunctional API key. Signed release requires real configuration; simulator artifacts are for compile validation only. Never commit the downloaded configuration or signing credentials.

Device acceptance: install the new TestFlight build, try Google and Apple separately, cancel each sheet, sign out and back in, relaunch to verify persistence, and verify existing-account and new-account onboarding. Test Apple's Hide My Email and returning sign-in where no name is supplied. Native APNs and Android-only camera entry points remain separate work.

This is build infrastructure, not an App Store-ready release. Device testing must cover login/logout, onboarding, meals/photos, sharing, offline recovery, safe areas and external links. Remaining release work includes device verification of Google/Apple login, push setup, StoreKit for in-app paid features, screenshots, age/content/privacy/medical-device declarations and applicable business agreements. Do not enable the iOS billing flag until StoreKit exists.

The privacy manifest declares the Filesystem plugin's file timestamp reason (`C617.1`); it is not a replacement for the complete App Privacy disclosure or a claim that the hosted service collects no data.

References: [Capacitor iOS](https://capacitorjs.com/docs/ios), [GitHub signing guidance](https://docs.github.com/en/actions/how-tos/deploy/deploy-to-third-party-platforms/sign-xcode-applications).

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
| `IOS_PROFILE_BASE64` | Base64 App Store provisioning profile for this team and bundle ID |
| `ASC_KEY_ID` | App Store Connect API key ID |
| `ASC_ISSUER_ID` | App Store Connect API issuer ID |
| `ASC_PRIVATE_KEY_BASE64` | Base64 downloaded `.p8` key; use a role that permits build uploads |

Apple API access has not yet been requested on this new account. Enabling API access and issuing signing credentials is a separate account action requiring approval. No credentials were created or copied into this repository.

In Actions, run **iOS build** on **main**, with **upload_testflight** checked. The simulator job must pass first. The release job validates the profile team, bundle ID, expiration and distribution type, installs signing material into a temporary keychain, archives and exports the app, and uploads through Apple's tooling. It removes signing files after the job. The workflow run and attempt form the build number. Upload does not submit the app for App Review or publish it; Apple still needs to process the build and testers need to be configured.

## Scope of this first build

Native App, Camera, Filesystem, Share, Splash Screen and Status Bar plugins are included. Firebase native authentication and APNs are deliberately excluded pending iOS Firebase configuration. Email/password is the intended first test login. The hosted frontend still needs an iOS authentication pass: Google web redirects must not be treated as working native Google login, and Sign in with Apple needs assessment before store submission. Native camera entry points in the current frontend are Android-only; iOS file inputs remain available until those entry points are adapted.

This is build infrastructure, not an App Store-ready release. Device testing must cover login/logout, onboarding, meals/photos, sharing, offline recovery, safe areas and external links. Remaining release work includes native Google/Apple login if offered, push setup, StoreKit for in-app paid features, screenshots, age/content/privacy/medical-device declarations and applicable business agreements. Do not enable the iOS billing flag until StoreKit exists.

The privacy manifest declares the Filesystem plugin's file timestamp reason (`C617.1`); it is not a replacement for the complete App Privacy disclosure or a claim that the hosted service collects no data.

References: [Capacitor iOS](https://capacitorjs.com/docs/ios), [GitHub signing guidance](https://docs.github.com/en/actions/how-tos/deploy/deploy-to-third-party-platforms/sign-xcode-applications).

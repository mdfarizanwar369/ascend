# Ascend APNs setup — 14 October 2026

## Preparation-stage evidence

This section records the completed preparation stage before release authorization. The user subsequently requested deployment and upload for all testers on 14 October 2026; see [the approved rollout](zoe-smart-nudges-rollout.md) for that stage. The physical iPhone test remains deferred. The deployment and upload statements below describe the earlier preparation snapshot.

### Completed in Apple Developer

- Enabled Push Notifications for `fit.getascend.app`, team `76N75VT6A7`.
- Created **Ascend Zoe Push**, a production APNs key restricted to the single `fit.getascend.app` topic. Other Apple services and the widget topic are excluded.
- Downloaded the private key once and moved it outside the repository into the current Windows user's protected `~/.ascend/apns/` directory. The key file and directory have access restricted to that user and SYSTEM. No private key or device token is in source, documentation, screenshots or tool output.
- Regenerated **Ascend App Store GitHub** and **Ascend Shared 38070214984**. Both are active until 11 September 2027. Both downloaded profiles pass the release validator with `aps-environment=production`, the existing Apple Distribution certificate, HealthKit/background delivery, Sign in with Apple and `group.fit.getascend.app` preserved. The widget profile remains active.
- Updated only `IOS_APPLE_PROFILE_BASE64` in the existing GitHub `apple-testflight` signing environment with the validated profile. This secret change does not deploy an app.

The APNs server key remains in protected local storage. It has **not** been added to or enabled on the production backend. `production.json` in that protected folder records its topic, team, key ID, environment and local key path. No sandbox key was created; a Debug/development-signed build needs a separate sandbox key/profile. Ad hoc, TestFlight and App Store builds use production APNs.

## Code and checks

- Native APNs registration callbacks, Capacitor plugin packaging and environment-specific entitlements are on the review branch at `9534c51`.
- The release script now rejects a profile or archived/exported app missing the production APNs entitlement. Signing checks: **23 passed**. Native packaging checks: **11 passed**.
- The real key parsed as EC P-256 and passed a local sign/verify round trip. This proves local key usability, **not** acceptance by Apple or display on a phone.
- [Mac compile run](https://github.com/mdfarizanwar369/ascend/actions/runs/38531956932) **PASSED** on commit `9534c51`; simulator job completed in 6 minutes 33 seconds. Xcode compiled the app and packaged the `Ascend-iOS-simulator` artifact. TestFlight upload, App Store release, tester assignment/status and release preflight jobs were all skipped. A simulator artifact cannot be installed on a physical iPhone.
- The rest of the Zoe frontend/backend implementation remains local and uncommitted. The branch push contains only the eight native/signing preparation files. `main` remains at `46582ff8174775282000d48364e66c86b6ad62b9`.

## Prepared single-device provider check

`backend/scripts/apns-device-check.ts` uses the actual backend adapter for an explicitly requested one-device send. It has no database access, user enumeration, scheduler, enrollment or retries. Default invocation is an offline key check:

```powershell
npx --no-install tsx backend/scripts/apns-device-check.ts --config "$env:USERPROFILE\.ascend\apns\production.json"
```

When a consenting tester has installed a correctly signed build, save its raw APNs token to a protected file (never Git or command-line text). To test the real authenticated destination, create a test event in the same isolated backend used by the test app, then supply its UUID:

```powershell
npx --no-install tsx backend/scripts/apns-device-check.ts --config "$env:USERPROFILE\.ascend\apns\production.json" --send --token-file "$env:USERPROFILE\.ascend\apns\test-device-token.txt" --event-id <test-event-uuid>
```

The alert expires after 60 seconds. The command prints sanitized acceptance/error status; it never calls acceptance proof of device display. Do not automatically retry an unknown outcome. This direct test bypasses scheduling and therefore cannot replace the consent, due-event and opt-out tests through the normal worker. The helper passed TypeScript checking, a real-key offline check and a missing-token/event rejection check; no provider call was made.

## Physical iPhone test is deferred

Apple's Devices page currently contains no registered devices, and no iPhone was connected to this Windows computer. Preparing a directly installable development/ad hoc build needs the tester's device identifier and matching app/widget profiles. Alternatively, TestFlight requires a separately authorized upload; none was performed.

The current native configuration opens the production website. Before installing a test build for the new nudges, point it to an isolated HTTPS test frontend/backend with migration 046 and only a test account enabled. That test environment has not been published. Do not claim the old production web app exercises the local reminder UI.

When the user is ready, verify on the physical phone:

1. Explicit opt-in, permission grant and registered APNs token/environment.
2. A due event through the worker reaches APNs once and displays on the locked phone.
3. Tap from background and normal closed state reaches the correct authenticated destination.
4. Foreground delivery displays one banner; sign-in continuation and account switching preserve ownership.
5. Master/category off, completion, quiet hours and signout suppress later optional reminders.

**Not yet verified:** live APNs authentication/acceptance, iPhone display, sound, tap, restart, Focus/permission changes or full end-to-end scheduling. No live notification was sent during setup.

## Apple references

- [APNs key scope and environment configuration](https://developer.apple.com/help/account/keys/create-a-private-key/)
- [Ad hoc profiles require registered devices](https://developer.apple.com/help/account/provisioning-profiles/create-an-ad-hoc-provisioning-profile/)

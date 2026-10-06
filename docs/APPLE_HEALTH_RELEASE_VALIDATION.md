# Ascend Apple Health Release Validation

Updated 6 October 2026. This checklist records the implementation evidence and work required before Ascend can submit or advertise Apple Health support. [PR 55](https://github.com/mdfarizanwar369/ascend/pull/55) was merged into `main` after the application and macOS simulator checks passed. The backend and hosted frontend are deployed, and migration 044 is applied, but the Apple Health flags remain unset. No Health-enabled TestFlight build or App Store submission has occurred. The immediate signing blocker is verified: Apple's API returned HTTP 403 for enabling HealthKit with the existing key. Chrome control remains unavailable, so neither route can currently complete provisioning.

## Implemented scope

The new native reader requests steps, active energy and workouts only. There are no Health writes, new subscription gates, Watch app, heart-rate reads or changes to the food target. Body Scan stays hidden. Older native binaries and unsupported devices do not gain a connection control merely because the hosted frontend changes.

An explicit checkbox authorizes storage in the signed-in Ascend account separately from Apple's read sheet. The server selects one installation for the daily aggregate. Phone, Watch and workout totals are not independently added to that aggregate. Unknown manual overlap stays excluded unless the member confirms an untracked active-energy estimate or links the same workout explicitly.

Private imported records, manual reconciliation links and derived summaries stay in isolated tables. The member dashboard, private seven-day history and private Momentum use the daily summary. Existing AI contexts and shared trainer reports do not ingest these Apple records or the derived score. Optional onward sharing is intentionally unavailable in this first implementation.

Workout checkpoint recovery keeps earlier records while pages upload and removes superseded identities only on a completed recovery. Empty reads do not prove a permission state or authorize bulk historical deletion. Timezone changes rotate the reporting generation, preserve completed historical windows and reject stale-generation packets. Exports include consent metadata, snapshots, imported workouts, reconciliation links and summaries.

## Evidence recorded

| Check | Result and limitation |
| --- | --- |
| Current Apple release | Apple's read-only API reports 1.3 as READY_FOR_SALE. No 1.4 App Store version was returned; existing 1.4 TestFlight uploads are separate evidence. |
| Existing provisioning profile | Correct Ascend team and bundle; unexpired App Store distribution with Sign in with Apple. HealthKit and Health background delivery are both absent. |
| Automated reconciliation | 33 backend unit tests cover missing versus zero, lower corrections, source ownership, duplicate accounting, net estimates and conservative manual overlap. |
| Database integration | Latest CI passed all 16 isolated PostgreSQL cases, including concurrent retries, corrections, account isolation, source switching, deletion, privacy-table separation, timezone rotation and multi-chunk recovery. A millisecond-loss checkpoint comparison was fixed before this run passed. |
| Application tests | The 6 October full CI verify job passed after the production dependency audit was repaired. The local frontend suite passed 280 tests and the native packaging suite passed nine tests. |
| Signing and packaging | Ten Python signing-boundary tests and nine native packaging tests passed locally. These do not prove a correctly signed Health-enabled archive. |
| Build | The PR contents passed full CI and the complete macOS simulator build immediately before merging. This checks native compilation, not Health authorization or background operation on a device. |
| Signing preparation | Six profile safety tests passed. The authorized protected-main preparation failed at POST /v1/bundleIdCapabilities with HTTP 403 before creating or exporting a profile. A fresh read-only preflight on 6 October again found HealthKit and background delivery absent from the profile. No existing certificate, profile or secret was replaced or revoked. |
| Production | Migration 044 is applied and all seven new tables are accessible to the app database role. The production backend and hosted frontend deployed successfully; `/api/v1/health/ready` and `/launch` responded normally. Both Health flags and the Health allowlist are unset, so no account can activate Apple Health yet. |
| Physical devices | No signed-device or three-day pilot evidence supplied. |
| Browser and visuals | Chrome connection still fails after the user toggled its extension. No visual screenshot verification or App Store privacy UI update has been claimed. |

Read-only Apple inspection uses the existing protected `main` environment. No release environment protection was weakened. The signing workflow refuses an archive missing required HealthKit entitlements before upload.

## Remaining engineering checks

- [x] Latest isolated database tests passed, including multi-chunk checkpoint recovery.
- [x] Latest Swift changes compiled on the Mac runner.
- [ ] Render the real connection and history screens at supported phone and tablet sizes; inspect clipping, long labels, empty and failure states.
- [ ] Add a controllable native query test adapter or equivalent native tests for interrupted reads, durable queue replay and permission ambiguity. JavaScript mocks do not validate HealthKit behavior.
- [ ] Validate long and cross-midnight manual activity handling. Current unknown intervals are excluded conservatively; a complete interval editor and proportional allocation are not implemented.
- [ ] Decide whether to finish the planned Android adapter migration now or explicitly limit this release to Apple integration with the legacy Android path preserved. Do not describe the new ledger as active for both providers.
- [ ] Reconcile existing provider terminology outside the new Apple screens. Legacy code still contains `health_provider_actual`; the Apple interface correctly labels estimates.

## Signing and pilot deployment

1. Verify Apple API provisioning access or restore the approved Chrome connection. Enable HealthKit for the exact Ascend bundle, retaining existing capabilities, and create a matching App Store profile with Health background delivery. Never revoke an unrelated certificate or replace the app identity.
2. Validate the new profile against the source entitlements and existing signing certificate. Preserve the release environment protection and secure secret-handling path.
3. Resolve the existing 1.4 release before assigning this feature's marketing version. Do not change or replace an unrelated review submission.
4. ~~Merge only after software checks pass. Apply migration 044 with the migration credential before activation; the runtime role must not perform schema writes.~~ Completed 6 October 2026.
5. Backend and hosted frontend deployed with both flags off. The public launch page and backend readiness endpoint respond normally; verify old native iOS and Android flows on devices before enabling any pilot account.
6. Sign and upload through the existing trusted main workflow. Verify signed entitlements, Apple processing status and owner TestFlight availability.
7. Enable only designated pilot account IDs with `APPLE_HEALTH_SYNC_V1=true`, `DAILY_ACTIVITY_LEDGER_V1=true` and a nonempty `APPLE_HEALTH_USER_IDS` allowlist. These settings are not yet applied. A blank allowlist means all accounts when both flags are enabled, so it must not be used for the initial pilot.

The existing key can read the app, bundle ID and distribution certificate, but cannot enable the capability. Do not infer write access from successful reads or grant the key broader authority as a workaround. Restore Chrome control with the account holder signed into Apple Developer, then continue the exact Ascend capability and profile change through the authorized account. If another credential is proposed instead, its provisioning authority and secure setup need an explicit decision. The encrypted preparation workflow is pinned to the existing GitHub environment's public encryption key; it cannot redirect a profile to a caller-supplied key and publishes no plaintext signing file.

## Required physical device evidence

Record only the minimum evidence needed, using fictional test fixtures or explicit owner consent. Do not put member Health exports, account tokens or credentials in this repository. Record the binary version, device OS, reporting timezone, observation and upload times, and pass or fail for each case in a private release record.

| Case | Pass condition |
| --- | --- |
| Fresh Free account | Connection is optional and does not require a subscription. Normal Ascend use works without Health access. |
| Full and partial reads | Steps, energy and workouts each behave independently. Denied or empty categories do not become invented zeros or a claim of permission denial. |
| Watch and phone | Identical reporting windows agree with native statistics; no second addition of workout or step calories. Watch delay is distinguished from Ascend upload delay. |
| Real zero and correction | Observed zero remains zero; a lower correction and workout deletion change the appropriate totals once. |
| Manual overlap | Unconfirmed activity does not inflate the provider day; exact linking removes an earlier untracked addition. |
| Offline and locked | Queue survives without a stored account token. Deferred reads recover after unlock; retries do not duplicate values. |
| Background and resume | Native updates can queue without the WebView, and foreground flush restores the visible status. Force-quit limitations remain honest. |
| Account change | No pending record from the former account uploads to the new account. |
| Disconnect and delete | Stale packets cannot restore a disconnected source. Imported-history deletion preserves manual Ascend logs and other installations. Export controls remain available during a rollout pause. |
| Two installations | Switching preserves the former daily value until the requested installation supplies readable current energy. Completed historical days retain their owner. |
| Travel and midnight | No silent rebucketing; new timezone packets cannot overwrite completed old reporting windows. |
| Supported iPad | Health availability is checked at runtime; unsupported iPadOS retains manual tracking and hides native connection controls. |
| Privacy isolation | Imported values and derived private Momentum are absent from trainer views and AI requests. |
| Regression | Meals, subscriptions, Trainer Pro referrals, Siri and the hidden Body Scan state continue to behave as before. |

At least three complete reporting days are required, including a midnight transition and correction or deletion. Do not submit on the strength of simulator compilation alone: Apple states that HealthKit background queries require device testing. [Apple background delivery documentation](https://developer.apple.com/documentation/healthkit/hkhealthstore/enablebackgrounddelivery(for:frequency:withcompletion:)).

## App Store review preparation

- [ ] Verify the actual collected data against App Store privacy categories and update the answers for linked account functionality. No tracking or advertising use is introduced. The privacy source copy does not itself update App Store Connect.
- [ ] Publish matching Terms and Privacy pages and verify submitted build links.
- [ ] Capture a real-device demonstration and accurate screenshots; do not present fixtures as the reviewer's personal activity.
- [ ] Provide working review credentials only through the secure established review process.
- [ ] Confirm the feature works for the reviewer account while remaining gated for the public cohort until release.
- [ ] Complete pilot evidence, select the correct processed build, submit and verify Apple's received submission status.

Proposed reviewer instructions, to finalize only after verification:

> Sign in, then open Profile → Connected Devices → Apple Health. Review the optional account-storage consent and choose Connect Apple Health. Apple's sheet lets you choose steps, active energy and workouts individually. Imported data appears in today's activity, imported workout history and private seven-day activity. No subscription is required and the food target does not change. Missing readable records are shown as unavailable, not zero. The same screen provides Sync now, export, disconnect and a separate imported-history deletion control. Ascend does not write to Apple Health or share this imported data with trainers, AI or advertising services.

## Activation and rollback

After App Store availability and all gates pass, expand the opt-in cohort gradually while monitoring aggregate upload failures, stale observations and accounting consistency without logging personal Health values. Do not advertise Apple Health support before a usable public release exists.

If accounting, account isolation or privacy fails, disable Apple ingestion first, pause local collection when configuration next refreshes, and retain accepted history for authorized investigation. Do not drop tables, resurrect deleted data or route Apple observations through the legacy maximum-of-totals calculation. Re-enable only after the cause is fixed and validated.

# Ascend Apple Health Implementation Plan

Prepared and updated 4 October 2026. Status: implementation in draft PR 55; automated checks are underway, and signed-device verification has not started. Production activation and App Store submission have not happened. See [the release validation checklist](APPLE_HEALTH_RELEASE_VALIDATION.md) for current evidence and remaining gates.

This plan adds optional Apple Health integration to Ascend so members can automatically see steps, imported workouts, and daily active calories. The first release will use Apple Health as the daily activity energy source, reconcile manual logs without counting the same activity twice, and leave nutrition targets unchanged. It will be available to Free members as well as subscribers.

The work belongs in the next iOS feature release. Apple confirms 1.3 is public, and separate 1.4 TestFlight builds already exist. Coordinate with that release before assigning a marketing version; the Health implementation has not changed the version number. This document specifies the approved design. The audit findings below describe the source baseline before implementation, not a measurement of an installed production app.

## Product decisions

| Decision | First release |
| --- | --- |
| Access | Optional connection for all account plans; no paid subscription required |
| Data read | Steps, active energy, and workouts only |
| Apple Watch | Read its data through Apple Health on the supported device; no Ascend watch app required |
| Other watches | Supported indirectly only where their companion app writes compatible records to Apple Health; no blanket compatibility promise |
| Daily calorie card | Show active calories, not resting energy or total daily energy expenditure |
| Automatic updates | Refresh on app entry and resume; use native background delivery when iOS permits it |
| Food target | Do not automatically add exercise calories to the food allowance |
| Manual activity | Preserve logging; reconcile with imported activity before combining calories |
| Permissions | Partial access works; declining access never blocks normal Ascend use |
| AI and trainers | Device connection does not automatically permit onward sharing |
| Health writes | None; workout export is a later feature |
| Unsupported builds | Keep native connection controls hidden; preserve existing manual tracking and permitted account history |

The everyday promise should be: “Connect Apple Health to keep your steps and active calories up to date.” Do not promise instant Watch synchronization, laboratory accuracy, calorie-based weight loss, or support for every wearable.

Body Scan remains hidden. This work must not reintroduce that feature or change Trainer Pro onboarding, subscription prices, or introductory offers.

## Audit baseline and required changes

At the audit baseline, Ascend had an Android Health Connect pipeline but no HealthKit reader, HealthKit entitlement, or Health usage description. The native deployment target was iOS 15.0 and remains unchanged in the implementation. The following table records that baseline and the required work; it is not a claim that the new reader is already public.

| Area | Finding from source | Required change |
| --- | --- | --- |
| Native iOS | No HealthKit service or registered health bridge | Add native HealthKit reading, lifecycle support, and durable sync state |
| iOS connected devices | Health Sync is hidden and its route blocked for iOS | Allow it only when the installed binary exposes the new capability |
| Shared sync client | Assumes Android and requires all three permissions | Add a provider interface with Apple-specific authorization semantics |
| Backend import | Provider is restricted to `health_connect`; batches stop at 120 records | Add a versioned provider-neutral contract without breaking existing clients |
| Connections | A single connection row per user | Track provider and installation separately; select one daily aggregate source |
| Dashboard | Uses the larger of manual and synced calories | Replace this shortcut with an explainable daily activity summary |
| Momentum | Also uses a maximum and server date calculations | Consume the same daily summary and reporting calendar |
| Reports | Activity energy is based on manual burn events | Include the same reconciled totals as the dashboard |
| Manual workout estimates | MET calculation currently includes resting energy | Distinguish gross estimates from net active estimates |
| Privacy | iOS policy says the app does not connect device health services | Update the disclosure, data handling, consent, and deletion behavior |
| Sync lifecycle | Coordinator runs once and swallows errors | Add resume refresh, visible status, retries, and cache invalidation |

Do not solve this by simply accepting `apple_health` in the existing import endpoint. Native support, source selection, authorization, calorie reconciliation, and downstream consumers all need to agree before production activation.

## Research findings that shape the plan

Apple defines active energy separately from resting energy. Ascend should use active energy for this feature and avoid presenting it as total metabolism. [Apple active energy documentation](https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier/activeenergyburned), [Apple resting energy documentation](https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier/basalenergyburned).

HealthKit statistics queries merge sources by default. Use those combined results rather than adding independent phone, Watch, and app totals. Apple demonstrates overlapping phone and Watch step reconciliation; this does not establish that every third-party calorie record is free of duplication. Validate active energy against the Health app and report source-quality problems instead of silently inventing corrections. [Apple statistics documentation](https://developer.apple.com/documentation/healthkit/hkstatistics), [Apple HealthKit session](https://developer.apple.com/videos/play/wwdc2020/10664/).

Established apps use different nutrition models. Lose It uses an activity bonus relative to its estimated baseline; Cronometer can replace baseline activity with tracker-derived activity. MacroFactor instead bases expenditure adjustments on intake and weight trends. Ascend should not copy an “add every workout calorie” rule into its existing activity-adjusted food target. [Lose It Apple Watch guidance](https://loseit.zendesk.com/hc/en-us/articles/47273244741396-Using-Apple-Watch-with-Lose-It), [Cronometer expenditure guidance](https://support.cronometer.com/hc/en-us/articles/31974307318420-Energy-Expenditure), [MacroFactor expenditure guidance](https://help.macrofactorapp.com/en/articles/26-how-should-i-interpret-changes-to-my-energy-expenditure).

Workout logging and daily energy accounting are different jobs. Hevy illustrates workout-level calorie tracking, while MyFitnessPal documents its own supported Watch and Health imports. Neither app's behavior should be treated as a universal HealthKit rule. Ascend needs its own explicit counting contract. [Hevy workout calorie guidance](https://help.hevyapp.com/hc/en-us/articles/34462684813079-How-to-see-the-calories-burned-in-a-workout-Apple-iOS-Android), [MyFitnessPal Apple Watch guidance](https://support.myfitnesspal.com/hc/en-us/articles/360032625731-Apple-Watch-App).

## Member experience

### Connecting Apple Health

The supported iOS flow will be Profile → Connected Devices → Apple Health → Connect Apple Health.

Before the system permission sheet, explain that Ascend reads steps, active calories, and workouts, uploads those selected records to the member's Ascend account for dashboard and reporting use, and does not change the food target. Explain that the member controls Apple permissions and Ascend sharing separately. Offer Connect and Not now.

After the permission flow, perform the initial read and upload. Show what data is available, not a fabricated list of granted read permissions. A member who shares only steps should see steps while calories and workouts remain unavailable. A member with no readable data should see guidance rather than a failed-account screen.

Suggested screen copy:

> Connect Apple Health
>
> Bring your steps, active calories and workouts into Ascend automatically. Choose what to share in Apple's permission screen. Imported records are stored in your Ascend account for your dashboard and reports. Your food target will not change.

Suggested Health usage purpose copy, to validate in the signed build:

> Ascend reads your steps, active energy and workouts to show your daily activity and avoid counting the same workout twice.

Do not request write permission in this release. Request neither heart rate, sleep, location, nutrition, medical records, nor additional measurements just because HealthKit supports them.

### Dashboard and history

The main card will say “Active calories” rather than ambiguously implying total calories burned. It will show a source description and timestamp, such as “Apple Health · Updated 6 minutes ago.” The breakdown opens a short explanation of the provider total, any confirmed untracked activity, and manual entries excluded to prevent duplicates.

Show steps in their own metric. Imported workouts appear in activity history with source, start time, duration, and a calorie estimate when available. They must not manufacture sets, reps, exercise names, or completed Ascend workout assignments.

These are example display states, not fabricated member records:

| Situation | Display |
| --- | --- |
| Fresh daily energy | `600 kcal active · Apple Health` |
| Steps available but energy unavailable | `8,000 steps`; energy says no readable Apple Health energy |
| Only verified workout energy available | `350 kcal from recorded workouts`; identify partial coverage |
| Manual estimates only | `Estimated activity calories · Ascend logs` |
| Previously synced energy and failed refresh | Keep the saved value with its timestamp and a stale indicator |
| Successful query with no readable samples | Explain no data is available; do not infer a measured zero |
| Confirmed observed zero | Display zero with the correct source and observation state |

Avoid an arbitrary progress ring that implies a medically justified burn target. Existing workout and consistency goals can remain, with their definitions unchanged until explicitly redesigned.

### Manual activity reconciliation

When daily Health energy is present, manual workouts remain visible but do not automatically increase that total. Where a strong link proves the manual entry is the same imported workout, show “Already included in Apple Health.” Otherwise show “Not added separately to avoid double counting.”

For a genuinely unrecorded activity, the member can explicitly mark “This activity was not recorded in Apple Health.” Explain that doing so adds an estimate and may overstate energy if another device recorded it. Do not preselect this option or assume that lack of an imported workout means the activity was untracked; continuous energy can exist without a workout record.

If later data establishes a strong duplicate link, stop adding that manual estimate and show the correction. Ambiguous matches require a choice; do not silently claim exact correspondence.

### Connection controls

Provide Sync now, last successful device read, last successful account upload, readable-data status by category, the selected sync device, disconnect, and delete imported history. The last two actions must be distinct.

Apple does not disclose whether a user denied read access. Completion of the authorization request is not proof of granted reads. The UI must say “No readable data” rather than “Permission denied” unless an actual reported error supports that wording. Provide current, tested instructions for reviewing Ascend's access in Health; do not invent a Health deep-link scheme. [Apple authorization guidance](https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data).

## Calorie accounting contract

### Daily energy rule

For a reporting day with readable provider active energy:

```text
displayed active calories
  = selected provider daily active energy
  + eligible estimates explicitly marked as untracked
```

Imported workout calories are a breakdown, not an extra addition. Steps are also a separate metric, not an extra energy term. Do not calculate a second step-based calorie figure and add it to the daily energy total.

| Input | Expected result |
| --- | --- |
| Health daily active energy 600, including a 350 kcal workout | 600, not 950 |
| The same day also contains 8,000 steps | Still 600; steps do not add a second calorie allowance |
| A manual copy of that workout estimates 300 | Still 600; retain the manual workout without adding 300 |
| Health 600 plus an explicitly confirmed untracked 150 active kcal activity | 750, labelled as provider energy plus an Ascend estimate |
| Steps only and no energy samples | Show steps; do not manufacture step calories |
| No readable daily energy, but one workout has usable 350 active kcal and its manual copy estimates 300 | 350 from that workout once, with partial coverage identified |
| No readable Health energy and no usable workout energy | Use eligible manual estimates, labelled estimated; never pretend they came from Health |
| An updated Health snapshot falls from 600 to 540 after a correction | Replace with 540; do not keep the historical maximum |

Missing, unavailable, stale, and observed zero are distinct states. A failed read never replaces a successful value with zero. An empty query is not evidence that all earlier records were deleted. Preserve previous observations as historical or stale data, but allow newer readable provider observations to replace them.

When only workout energy is available, reconcile unique sessions before summing. Do not assume legacy `totalEnergyBurned` always has the net active meaning needed here. Use an explicitly active quantity where available; otherwise preserve duration and show energy as unknown. The result is workout coverage, not a complete daily activity total.

### Estimate basis

The existing MET formula is a gross activity estimate. The proposed new manual model estimates net active energy by subtracting one resting MET:

```text
estimated active kcal
  = max(MET - 1, 0) × 3.5 × body weight in kg ÷ 200 × minutes
```

This is a proposed approximation, not a measurement or a claim that a person's resting burn is exactly one MET. The Compendium notes that standard MET values do not establish precise individual energy costs. [Compendium guidance on MET limitations](https://pacompendium.com/corrected-mets/). Store the estimation method and weight used. Validate low-MET activities, missing weight, unreasonable durations, and existing Quick Activity estimates before activation. Entries with unknown calorie basis cannot become an additive active-energy adjustment until clarified or recalculated.

Preserve historical gross values and their original method; do not silently rewrite a member's history. Use explicit `active`, `gross`, and `unknown` energy basis fields. Replace new outward-facing `health_provider_actual` language with `provider_estimate`, while retaining a compatibility mapping for old records and clients. Watch estimates are not ground truth.

### Nutrition boundary

Do not change the configured coach target, custom target, or current recommended food target in V1. Do not add synced calories to any of those targets. Ascend's recommendation already includes an activity multiplier, so simple addition can count baseline movement twice.

A later dynamic allowance needs its own specification: either replace the baseline activity component with observed expenditure or calculate only an evidenced adjustment above baseline. It must preserve coach-set targets, explain incomplete-day estimates, and be validated separately. Resting energy and total expenditure are outside this first release's permission scope.

## Data architecture

```text
Phone, Apple Watch or compatible vendor app
  → Apple Health on the supported device
  → Ascend native HealthKit reader and local outbox
  → Authenticated versioned sync API
  → Selected daily snapshots and reconciled workout history
  → One daily activity summary
  → Dashboard, reports and permitted coaching views
```

The backend is the source of the account's reconciled summary; HealthKit is the source of the selected device's provider observations. A local snapshot can support a clearly labelled pending-sync view, but clients must not create a competing calorie formula.

### Proposed storage

Use a new additive migration and new V2 tables rather than changing the old tables in a way that mixes Apple imports into legacy Android queries.

| Proposed table | Responsibility and key fields |
| --- | --- |
| `health_sync_sources` | User, provider, installation UUID, connection generation, consent version, status, selected reader, last read and upload |
| `health_daily_snapshots` | Source, calendar day, reporting timezone, UTC window, steps, active kcal, observation state per metric, revision and observation time |
| `health_external_workouts` | Source store identity, workout UUID, original interval, type, duration, nullable active energy, estimate basis, deletion state |
| `activity_reconciliations` | Links between manual and external workouts, match evidence, confirmed untracked choice, method and rule version |
| `daily_activity_summaries` | One derived summary per user and reporting day, selected source, eligible manual adjustment, workout count, coverage and freshness |

These names are proposed, not existing implementation. Keep workout attribution minimal; do not import GPS, raw heart-rate series, or arbitrary third-party metadata.

Store energy with sufficient decimal precision and round only at presentation. Validate steps as nonnegative whole counts and energy as finite nonnegative values. Apply sensible anomaly checks without pretending every unusually high value is invalid. Validate IANA timezone names and actual calendar dates, not just string length or a date regex.

Uniqueness must include the appropriate source identity. Never assume an identifier is globally unique across users or unrelated Health stores. A selected aggregate snapshot replaces its previous revision; repeat imports do not accumulate values.

### Provider and device selection

Select one provider daily aggregate for a reporting period: Apple Health or Health Connect, never their sum. Within Apple Health, select one Ascend installation as the authoritative reader. An iPad and iPhone reading overlapping Health stores must not create two additions to the same account.

The first explicit connection can become the selected reader if there is none. A subsequent connection must explain the existing reader and offer a deliberate switch; latest upload does not win. Persist source selections with effective times so historic totals do not change merely because the member later switches devices.

For V1, a provider or reader switch replaces the current reporting day's provider basis only after a usable full-day snapshot from the new selection is available. Never add two full-day totals together. Preserve completed past days with their original selection; show a pending-switch state until the new current-day basis is ready, and re-evaluate manual adjustments against it. A source switch is not the same operation as disconnecting and entering manual-only mode.

Use a random installation UUID, not an advertising identifier. Installation identity is for sync ordering and source selection, not marketing attribution. A source-store identifier in this contract is Ascend's locally managed reader identity; it is not a claim that HealthKit exposes a global Apple Account or Health-store identifier. Cross-device workout merging requires explicit evidence and must not rely on an invented global store ID.

### Dates and timezone

Use one explicit reporting timezone for all activity consumers. Initialize from the device on first connection if the account lacks one. Persist it on the account. If the device timezone changes, offer to align the reporting timezone instead of silently reinterpreting history on every upload.

Build native daily windows with a Gregorian calendar in that timezone and transmit the exact UTC start and end. A day may be 23 or 25 hours; never assume midnight plus 86,400 seconds. Define day intervals as start-inclusive and end-exclusive.

Retain historical windows when the reporting timezone changes. Recompute the affected current day with a new calendar generation; reject late uploads for the superseded window. Keep workout timestamps in UTC and retain their original source interval. For a cross-midnight manual estimate, split by elapsed duration only where a usable interval exists and label the allocation estimated. Daily provider energy already comes from the provider's daily windows.

Old entries with only a creation date are approximate history. Do not invent exact workout start times for duplicate detection. Remove server `current_date` assumptions from the activity path and use the same reporting calendar for dashboard, reports, and Momentum.

## Native iOS implementation

### Native service and bridge

Add a small first-party HealthKit bridge following Ascend's existing native plugin pattern. Proposed files are `AscendHealthPlugin.swift`, `AscendHealthService.swift`, and `AscendHealthSyncStore.swift`. The bridge exposes capabilities, requests access, initiates a read, reports sync state, and disconnects the local association.

Health queries, anchors, observers, and queued results belong in the native service, not only JavaScript. Register the bridge in `AscendViewController.swift`. Restore authorized local observer configuration from `AppDelegate.swift` during application launch, without showing a permission prompt at launch.

Expose a versioned capability, for example `appleHealthReadV1`. Check both plugin presence and a successful native capability response. A user-agent marker can assist bootstrapping but is not proof that the methods are usable. Check `HKHealthStore.isHealthDataAvailable()` and runtime API availability, including supported iPadOS builds. Browser JavaScript cannot perform the HealthKit read itself. [Apple HealthKit setup](https://developer.apple.com/documentation/healthkit/setting-up-healthkit).

### Daily reads and history

Use daily statistics collection queries with `.cumulativeSum` for steps and active energy. The primary total uses the merged query result. A separate, optional source query may support diagnostics, but never sum those source-specific results back into the primary total.

Proposed initial history is today plus the preceding 29 reporting days, limited to the history actually available under the user's permission and OS. Query in bounded ranges and paginate workout retrieval; one unpaginated workout query is insufficient. The import range is an Ascend product choice, not an assertion that Apple always grants that much history.

Use anchored queries for workout additions and deletion UUIDs. Track step and energy changes sufficiently to identify affected dates, then recompute those daily snapshots. Commit query anchors only after results are durably queued; remove queued results only after an acknowledged upload. If anchors become invalid, perform a bounded refresh rather than silently skipping history. [Apple anchored queries](https://developer.apple.com/documentation/healthkit/hkanchoredobjectquery).

For workout active energy, use associated active-energy statistics where supported. `HKWorkout.statistics(for:)` starts at iOS 16; the current iOS 15 minimum requires a tested older-system path, such as associated quantity queries, or explicitly unavailable workout energy. Do not raise the deployment target accidentally. [Apple workout statistics](https://developer.apple.com/documentation/healthkit/hkworkout/statistics(for:)).

### Synchronization behavior

Proposed foreground behavior is a read on connect, authenticated launch, app resume, manual Sync now, and after a relevant manual activity change. Coalesce overlapping requests with a single-flight lock; debounce bursts for about two seconds and avoid redundant automatic reads within one minute. Manual refresh can bypass that interval.

For background support, add the HealthKit background-delivery entitlement, register observers during native launch, and acknowledge observer processing. iOS schedules delivery, not Ascend; steps have an hourly maximum delivery frequency. Background behavior must be tested on a physical device, not inferred from simulator tests. [Apple background delivery](https://developer.apple.com/documentation/healthkit/hkhealthstore/enablebackgrounddelivery(for:frequency:withcompletion:)).

For V1, background work reads and queues available changes locally. It does not introduce a new native long-lived server credential. The authenticated foreground session flushes that queue and refreshes all affected screens. This means the phone can prepare updates while the app is backgrounded, but trainer and web dashboards may lag until the member next opens Ascend. Automatic server upload while backgrounded is a later enhancement only if an existing secure session-refresh path can be verified.

When device protection prevents a read or queue access, mark the work pending and retry after unlock. Do not save an empty snapshot as a substitute. Protect the local outbox, exclude it from backups, and minimize its contents. Health data can be unavailable while the device is locked. [Apple privacy protection](https://developer.apple.com/documentation/healthkit/protecting-user-privacy).

Bound the outbox and coalesce superseded daily snapshots. Proposed ordinary payload retention is seven days, followed by regeneration on the next successful foreground sync. Maintain separate durably queued and server-acknowledged workout checkpoints. Unacknowledged workout tombstones cannot expire independently of their recovery checkpoint; preserve them or roll the query checkpoint back and replay before clearing their payloads. If the local budget is exhausted, pause new collection and report pending sync rather than losing deletions. Never promise uninterrupted sync after force quit or while offline.

### Build and signing changes

Add HealthKit and background-delivery capabilities to the app identifier, app entitlements, and matching provisioning profile. Add `NSHealthShareUsageDescription`. Do not add a misleading write-purpose string for a read-only feature; validate the complete submitted build against current SDK requirements.

Include native source files in the Xcode target and preserve Apple sign-in, billing, voice, Siri, and other existing plugins. Add structural checks to `scripts/ios-project.test.mjs` so `ios:prepare` cannot lose the bridge, entitlement, or usage description.

Use the existing macOS GitHub iOS workflow for simulator compilation and signed TestFlight builds. The current Windows workspace cannot run Xcode or prove physical-device Health behavior. The signed artifact must contain the intended entitlements; editing the source entitlement file alone is not sufficient. Review the workflow's permitted signing branches and follow its existing release path rather than assuming a new branch can upload.

## Backend contracts and synchronization safety

### Proposed API surface

Add a versioned API while retaining the current Health Connect routes:

| Proposed operation | Purpose |
| --- | --- |
| `GET /health-sync/v2/status` | Capabilities, connections, selected source, consent state and freshness |
| `POST /health-sync/v2/connect` | Record explicit account upload consent and issue a connection generation |
| `POST /health-sync/v2/import` | Upsert daily snapshots, workouts and deletion tombstones |
| `POST /health-sync/v2/select-source` | Deliberately change the selected provider or installation |
| `POST /health-sync/v2/disconnect` | Disable a connection and invalidate outstanding imports |
| `DELETE /health-sync/v2/history` | Delete the requested imported records and recompute affected summaries |
| `GET /activity/daily` | Return the common reconciled activity summary for a date range |

Extend the shared TypeScript contract before building either client. It needs provider, installation, connection generation, calendar generation, immutable request ID, schema version, observation times, per-metric observation states, source-local record identities, explicit units, and nullable workout energy.

Proposed import limits are 200 records and 256 KiB per request, whichever is reached first. Chunk larger histories and enforce an overall initial-sync range. Treat these as tunable engineering limits. A failed chunk must be retriable without replaying already acknowledged chunks or dropping the rest of the batch.

### Processing order

1. Authenticate and derive the user from the server session, never the body.
2. Verify provider, consent, connection and calendar generations, selected-source rules, and payload limits.
3. Validate the complete chunk and its immutable request identity.
4. Apply snapshots, workout changes, tombstones, and reconciliation changes transactionally.
5. Recompute the affected daily summaries under a per-user and day concurrency boundary.
6. Record the accepted request and return its acknowledgement plus new summary revisions.
7. Invalidate affected client and server caches after commit.

Reject stale generations after disconnect, deletion, account switch, or timezone reconfiguration. Sequence observations per installation to prevent an old retry from overwriting a newer snapshot. Energy can legitimately decrease after corrections, so freshness must be based on observation ordering, not the numerical value.

Deletes remove external workouts and invalidate affected summaries. Empty reads alone do not imply deletion or revoked permissions. A successful read with a missing quantity is unavailable, not observed zero. If a previously positive quantity becomes unreadable or empty, retain the last observation with an unavailable or stale state; use explicit deleted samples, verified recomputation evidence, or member deletion to remove it. Do not claim an exact zero where permission ambiguity prevents knowing one.

### Authentication and account switching

Partition pending native data by the authenticated Ascend account and its explicit connection. Do not attach the phone's Health data to every account that signs in.

Logout disables that local account association and clears its pending upload payloads. A different account must make its own connection choice. Retain or reset native anchors consistently so clearing pending data cannot strand changes beyond an advanced anchor. The server independently rejects any old generation; a client-side cleanup is not the security boundary.

A retry following history deletion must not resurrect deleted data. Explicit reconnection starts a new generation and clearly explains whether the member wants the permitted backfill again.

## Workout matching and shared consumers

### Duplicate matching

Use strong links first: stable native workout identity within the source store or an explicit existing Ascend session link. A member-confirmed merge is also authoritative. Store the match reason and rule version so it can be explained and reversed.

Type, nearby times, and overlapping duration can suggest a match, but do not prove identity. Proposed suggestion thresholds are substantial interval overlap and starts within five minutes; tune them against the test set. Never automatically merge two genuine workouts merely because they overlap.

For external duplicates written by multiple vendor apps, preserve distinct source records and form a reconciled session only when evidence is sufficient. Ambiguous copies can be flagged rather than presented as a falsely exact workout count. The daily provider energy remains separate from the session display, so duplicate timeline records do not generate extra calorie additions.

Do not call the normal manual completion service for every import. Imports must not award completion points twice, complete assigned homework automatically, or trigger repeat coaching messages. Keep existing reward rules unchanged for manual Ascend completions in V1.

### One summary for every activity display

Create one deterministic reconciliation service. Its output includes steps, provider active energy, eligible manual active estimates, displayed total, coverage mode, unique workout count or ambiguity state, source, timestamps, excluded adjustments, and rule version.

Use it in the dashboard, activity history, reports, Momentum activity calculations, and permitted trainer and coaching views. Retain the existing Momentum reward policy; normalize its activity inputs without creating automatic imported-workout rewards.

Default AI requests must exclude the new Apple-derived values until the member has explicitly allowed that sharing. Consuming a summary in a non-AI dashboard does not require AI processing.

### Android and older client compatibility

Keep V1 Health Connect endpoint shapes and responses working. Adapt their records into the new internal ledger only for the enabled cohort, while preserving the legacy tables and old client behavior during rollout. Do not store Apple records in a table that legacy unfiltered SQL can accidentally add to Android totals.

Migrate clients to V2 incrementally. Apple and Android adapters share normalization, not permission assumptions. Preserve Android's current scopes in this work; a separate Android permission redesign is not required to ship Apple support.

Older iOS binaries keep the native connection screen hidden even when the hosted frontend changes. Web clients may show already-synced account data subject to consent, but cannot offer a browser-only Connect Apple Health button. Update the blanket iOS route block into a tested capability-based gate.

## Privacy and data access

There are three separate choices: read from Apple Health, store the selected records in Ascend, and share relevant records onward with a trainer or named AI provider. A device permission does not replace the other choices.

For V1, Apple-derived activity is excluded from AI and trainer views until an explicit applicable sharing choice is recorded. Existing trainer relationships remain intact for existing categories. Do not silently reinterpret a broad old consent as authorization for a new provider or newly disclosed category.

Update `IosPolicies.tsx`, `iosPrivacyCopy.ts`, shared AI disclosure categories and versions, connection copy, exports, deletion flows, and App Store privacy answers. Explain that selected imported data is linked to the member's account, stored on Ascend infrastructure, and used for tracking and reporting. Describe actual retention and service providers; do not promise immediate backup deletion where the infrastructure cannot deliver it.

Disconnect stops future reading and uploads from that connection. Historical imported records remain unless the member also chooses deletion. Retain completed historical summaries and freeze the last accepted provider observation for the partial disconnect day. Only clearly post-cutoff manual activity or previously confirmed untracked adjustments can extend that partial-day total; manual entries with ambiguous intervals stay visible but are not added automatically. From the next reporting day, use the manual-only mode. Identify the disconnect boundary and incomplete provider coverage in the breakdown.

Delete imported history removes that imported basis and derived summaries; preserve manual records and recompute views. Account deletion must cover all new tables, native associations, and pending imports. These deletion operations do not delete samples from Apple Health because V1 has no write access.

Protect transport and database access, restrict records to the owning account and permitted relationships, and redact health payloads from logs and crash reporting. Operational metrics may include sync duration, error category, and batch counts, but not calorie values, workout details, raw Health samples, or personal identifiers exported to analytics vendors.

Health data must not reach Ascend's marketing agent, advertising audiences, retargeting, or social content automation. Check App Review's health-data rules and explicit consent requirements for sharing with third-party AI before submission. [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/).

## Implementation work packages

| Package | Deliverables | Completion evidence |
| --- | --- | --- |
| 1 Contracts and ledger | Shared V2 contracts, additive migration, provider selection, reconciliation rules, daily summary service, compatibility adapter | Deterministic calorie and date tests; unchanged V1 Android responses |
| 2 Native HealthKit | Reader, capability bridge, daily statistics, workout anchors and deletes, protected outbox, observers, signing configuration | Successful native builds and signed-device query evidence |
| 3 App experience | Connect flow, capability routing, partial-data states, manual reconciliation, source selection, sync coordinator | Screens verified on supported and old builds; denial and retry flows work |
| 4 Consumer consistency and privacy | Dashboard, reports and Momentum use the ledger; sharing controls and deletion updated | Same totals across screens; account and consent isolation tests |
| 5 Device validation and release | Physical-device matrix, TestFlight pilot, review materials, gradual activation and rollback | All critical cases pass; signed artifact and cohort monitoring verified |

Implement from current `main` in a dedicated feature branch; do not build the feature on the historical hotfix checkout just because this document is saved there. Recheck the code baseline first. The plan does not authorize rewriting unrelated work or changing the current submission.

Recommended integration sequence is three reviewable change sets: backend contracts and ledger; native bridge and capability-aware connection experience; common consumers, privacy enforcement, and release validation. Feature flags remain off until all necessary layers are compatible.

### Repository change map

| Existing location | Planned responsibility |
| --- | --- |
| `ios/App/App/App.entitlements` and `Info.plist` | Health capability and purpose disclosure |
| `ios/App/App/AppDelegate.swift` | Native observer restoration and lifecycle integration |
| `ios/App/App/AscendViewController.swift` | Register the Health bridge alongside existing plugins |
| `ios/App/App.xcodeproj/project.pbxproj` | Include native files and preserve deployment compatibility |
| `capacitor.config.ts` and `scripts/ios-project.test.mjs` | Versioned capabilities and structural packaging checks |
| `frontend/src/lib/healthConnect.ts` and `healthSyncClient.ts` | Preserve Android adapter; add provider-neutral coordination and Apple adapter |
| `frontend/src/components/HealthSyncCoordinator.tsx` | Resume refresh, single-flight sync, status and retries |
| `frontend/src/components/profile/HealthSyncClient.tsx` and `ProfileClient.tsx` | Connection screen, source selection and sharing controls |
| `frontend/src/components/IosFreeEditionBoundary.tsx` | Replace blanket Health-route rejection with capability gating |
| `backend/src/routes/healthSync.ts` and `backend/src/services/healthSyncService.ts` | Preserve V1; add V2 validation, ingestion and source selection |
| `backend/migrations` and `shared/src` | Additive migration and versioned contracts using the next available migration number |
| `backend/src/services/workoutCompletionService.ts` | Energy basis, manual intervals, optional explicit workout links and compatibility mapping |
| `shared/src/todayExperience.ts` and dashboard components | Remove maximum-based combination from the enabled ledger path |
| `backend/src/services/momentumV2Service.ts` and `backend/src/routes/reports.ts` | Common daily summaries and reporting dates |
| `frontend/src/components/legal/IosPolicies.tsx`, `frontend/src/lib/iosPrivacyCopy.ts` and `shared/src/aiConsent.ts` | Accurate disclosures and sharing enforcement |
| `.github/workflows/ios.yml` and release scripts | Compile, sign and verify the correct native artifact |

Add focused tests beside the existing test suites rather than relying only on static checks. The privacy change also requires tracing every context builder and trainer query that can consume derived activity; changing disclosure text alone is not enforcement.

### Estimated schedule and dependencies

For planning, allow approximately three to five engineering weeks for a production-ready first release, followed by Apple's review time. This is an effort estimate, not a promised delivery date or a claim about current staffing. A working prototype could appear sooner, but signing, device testing, reconciliation, and privacy handling are part of completion.

| Stage | Indicative effort | Dependency |
| --- | --- | --- |
| Contracts, ledger and migration | 3 to 5 working days | Current schema and consumer audit |
| Native reader and signing | 4 to 6 working days | macOS build runner, matching provisioning, physical iPhone |
| UX, lifecycle and common consumers | 4 to 6 working days | Stable contracts and native capability |
| End to end testing and pilot corrections | 4 to 7 working days | Signed TestFlight build, iPhone and Watch test data |
| Review and production activation | Not fixed | App Store review and pilot gates |

Some work can overlap, but do not count that overlap twice when estimating effort. Required testing access includes a physical iPhone, an Apple Watch for Watch cases, and a supported iPad if that platform is included. Existing macOS CI can compile; it cannot replace physical-device testing.

## Test plan

Automated tests must exercise reconciliation, import validation, request ordering, connection generations, timezone windows, deletion, consent filtering, and backward compatibility. Native tests should use a fake query adapter for deterministic cases and compile the real bridge on macOS. Fixtures belong only in tests or explicitly isolated test builds, never in production totals.

| Case | Required outcome |
| --- | --- |
| First connection with data | Correct snapshots, source and consent state; no duplicated initial import |
| All reads declined | App works normally; no false granted state and no invented zero |
| Steps only | Steps display; energy and workouts remain unavailable |
| Workouts only | Workouts display; energy used only if explicitly available with correct basis |
| Phone and Watch overlap | Steps match the merged HealthKit result for the same interval |
| Watch workout with daily energy | Workout appears; energy is included once |
| Compatible vendor app import | Source attribution is correct; total is checked for overlap and quality |
| Manual duplicate | Manual log remains; calories and workout count do not duplicate a proven session |
| Two genuine overlapping workouts | No unsafe automatic merge |
| Confirmed untracked activity | Active estimate adds once with explanation |
| Delayed strong duplicate match | Prior manual addition is corrected visibly |
| Deleted or edited Health record | Tombstone or valid recomputation updates history and totals |
| Empty query after prior data | No silent zero or permission assertion |
| Today has observed zero | Distinguishable from missing data |
| Offline import and retry | Queue survives; no duplicate records or misleading uploaded timestamp |
| Locked device | Deferred read, not empty data; recovery after unlock |
| Resume repeatedly | Single-flight and debounce prevent duplicate sync bursts |
| Background without WebView | Native service queues updates; foreground flush works |
| Force quit and Watch delay | Honest timestamps and no continuous-sync promise |
| Account switch | No previous account's pending Health data goes to the new account |
| Disconnect during upload | Stale generation cannot reconnect or mutate totals |
| Delete history then retry | Data does not resurrect |
| Phone and iPad both connected | Only selected installation supplies the daily aggregate |
| Apple and Android same account | Selected provider applies; no provider sum |
| Midnight and DST | Correct day boundaries including 23 and 25 hour days |
| Travel and timezone change | No silent historical rebucketing or stale-window overwrite |
| Workout crosses midnight | Daily allocation is consistent and estimates identified |
| More than 120 historical records | V2 chunks complete; legacy endpoint remains compatible |
| Negative, NaN, bad date or oversized payload | Rejected safely without partial chunk corruption |
| Older iOS and browser | Unsupported native controls hidden; manual features still work |
| iOS 15 workout statistics fallback | No unavailable API call or inaccurate energy assumption |
| Dashboard, reports and Momentum | Identical activity basis and reporting dates |
| AI or trainer sharing declined | New provider-derived values excluded from those requests and views |
| Account deletion | New imported data, derived records and local associations handled correctly |
| Paid and Free plans | Same optional Health connection; billing unaffected |

For controlled test data, compare Ascend's unrounded provider totals to the native query output exactly within numerical precision. Display rounding should differ by less than one kcal; step counts should agree for identical windows. Compare against the Health app using matching dates, sources, and refresh state. Investigate discrepancies rather than dismissing them as rounding.

Proposed performance target: after a native result is ready and network authentication is available, an ordinary upload and dashboard refresh should complete within three seconds in the pilot environment. Track Watch-to-phone delay separately because Ascend cannot control it.

Release acceptance requires at least three complete reporting days of signed-device pilot evidence, including a midnight transition and a deletion or correction. Include automated DST and boundary fixtures even if the live pilot occurs in Singapore. Extend the pilot when real source conflicts remain unresolved.

## Release and rollback

### Feature flags

Use independently controlled backend flags for Apple ingestion and the new activity ledger, plus per-account eligibility. Proposed names are `APPLE_HEALTH_SYNC_V1` and `DAILY_ACTIVITY_LEDGER_V1`. The frontend receives effective capabilities from the server and combines them with native capability detection; a public frontend environment flag is not an authorization boundary.

When ingestion is disabled, reject new Apple imports cleanly without deleting accepted history. Stop scheduling new local work when the app next refreshes configuration. Keep local retention bounded during a kill switch. If an installation is offline, do not promise immediate remote cancellation of its local observer.

### Deployment order

1. Merge backward-compatible contracts, migrations and services with flags off.
2. Deploy backend and hosted frontend safely; verify old iOS, web and Android clients.
3. Build and sign the new native app, verify entitlements, and upload through the existing TestFlight workflow.
4. Enable owner or designated pilot accounts in TestFlight; complete physical-device cases.
5. Submit the compatible native release with accurate privacy details and reviewer instructions.
6. After availability and acceptance gates, enable a small opt-in cohort, then approximately 5 percent, 25 percent and all eligible accounts as monitoring permits.
7. Connection remains optional at every rollout stage. Eligibility is not Health authorization or account upload consent.

Do not advertise Apple Health support publicly before a usable release is available. Do not alter existing approved marketing assets as part of this implementation plan.

### Review materials

Reviewer instructions should cover sign in → Profile → Connected Devices → Apple Health → Connect, how to allow only some data, where the synced values appear, and how to disconnect. Explain that no subscription is required and that activity energy does not modify the food target.

Supply a working review account through the established secure release process, not in this document. Provide a demo video from a real device and clear handling for reviewers with no Health records. Any demonstration fixtures must be disclosed and isolated from production, not passed off as the reviewer's actual activity. Update App Store privacy answers for the data actually collected and linked to the account; verify policies and screenshots describe the submitted build.

### Rollback procedure

If ingestion, privacy, account isolation, or calorie integrity fails, disable Apple ingestion for the affected cohort immediately. Stop using new provider totals if their integrity is compromised and show the last trustworthy observation or a clearly labelled manual-only state. Do not silently display an invalid total.

Keep additive tables and accepted records for investigation; do not roll back by dropping data. The legacy Android path remains isolated and can continue. If the daily ledger must be disabled, stop Apple ingestion first and return affected clients to a tested compatible display mode rather than feeding Apple records into the old maximum calculation.

Track aggregate error rates, stale-sync incidence, duplicate adjustments, summary revision consistency, and authorization-flow failures without logging personal Health values. Resolve source-quality conflicts before expanding the cohort.

## Later releases

After the read-only daily integration is stable, consider optional workout export to Health with explicit write permission, stable Ascend export identities and round-trip deduplication. Imported workouts must never be re-exported as new Ascend workouts.

A dedicated Watch app could then support starting workouts and live session experiences, but is not required for this plan. Additional metrics such as resting energy, heart rate, or recovery would need separate product value, permission, privacy, and testing decisions.

An adjustable nutrition allowance is a separate project with a clear expenditure model; it is not an automatic consequence of connecting Apple Health.

## Implementation checklist

- [x] Start from current main and preserve newer Siri and subscription work. Release numbering remains pending.
- [x] Add shared contracts and automated calorie reconciliation fixtures.
- [x] Add isolated additive storage and the reconciliation service in the feature branch.
- [x] Preserve the legacy Android path and test old iOS capability gates. Migrating Android to the new ledger remains separate unfinished work.
- [x] Implement native reads, anchors, durable queue and lifecycle handling. Compilation does not replace signed-device verification.
- [ ] Configure the app identifier, signed entitlements and matching provisioning.
- [x] Implement connection, partial-data, source-switch, workout history and manual reconciliation controls with component tests. Visual and device validation remain pending.
- [x] Use the same summary for the member dashboard, private weekly history and private Momentum calculation. Legacy shared trainer and AI reports deliberately exclude new Apple data.
- [x] Require explicit account upload consent; exclude imported Apple data and its derived scores from all trainer and AI sharing in this first implementation. Optional onward-sharing controls are not part of this release.
- [x] Update source privacy disclosures, exports, imported-history deletion and account deletion handling. Publishing App Store privacy answers remains pending.
- [ ] Verify the signed TestFlight build on physical devices and collect pilot evidence.
- [ ] Submit accurate review materials and activate gradually after acceptance gates.

Implementation is not release acceptance. Application changes are in draft PR 55, and read-only Apple inspection has established that the current signing profile lacks both HealthKit entitlements. No production flags, subscriptions, marketing queue, or App Store submission have been changed by this implementation work. The remaining signed-device and release gates must be completed without substituting simulated evidence.

# Zoe Smart Nudges — rollout and operations

**Tester deployment and TestFlight upload authorized on 14 October 2026.** The user lifted the earlier hold and requested access for all existing testers. The three existing internal TestFlight groups contain two unique testers; both match Ascend accounts. Enable `internal` rollout for these exact account IDs, with reminders remaining opt-in. Public App Store release is outside this stage. See [APNs setup evidence and remaining device steps](zoe-apns-setup.md). Physical iPhone verification was deferred by the user and remains a tester acceptance step.

## Flags

| Setting | Default | Purpose |
|---|---|---|
| `ZOE_SMART_NUDGES_SCHEMA` | false | Set true only after migration 046; keep true during dispatch rollback so settings/off controls remain available |
| `ZOE_SMART_NUDGES_ENABLED` | false | Global dispatch / enrollment kill switch |
| `ZOE_SMART_NUDGES_WORKER` | false | Wake the durable database queue every minute inside the existing API service; daily retention; graceful drain on shutdown |
| `ZOE_SMART_NUDGES_ROLLOUT` | off | `off`, `development` (nonproduction only), `internal`, `pilot`, `all` |
| `ZOE_SMART_NUDGES_USER_IDS` | empty | Exact approved account UUID allowlist for internal/pilot |
| `ZOE_SMART_NUDGES_CATEGORIES` | all named categories | Remove a category to pause it independently; saved user choices remain |
| `APNS_ENABLED` | false | APNs adapter gate; native iOS also needs the `AscendPush/1` build marker/plugin |
| `APNS_TEAM_ID`, `APNS_KEY_ID`, `APNS_PRIVATE_KEY` | unset | APNs signing credentials; secret storage only, never logs or Git |
| `APNS_BUNDLE_ID` | fit.getascend.app | Exact native app topic |
| `APNS_ENVIRONMENT` | sandbox | Must match the signed app entitlement; use production for TestFlight/distribution builds |

Every send also requires saved master/category consent and a recent enabled device. Enabling flags does not create preferences or enroll existing accounts. Once an account is managed by the preference centre, old discretionary coaching and automated homework-due nudges are excluded, even if rollout flags are paused. Direct human trainer updates are separate and remain unchanged.

## Approved stage: deployment for existing testers

1. Review the diff, run CI against an isolated database, then deploy with the exact existing tester account allowlist. Do not enroll accounts automatically.
2. With dispatch and APNs disabled, apply existing migrations through 046 with the migration role, then apply the existing runtime-role grants. Migration is additive; it creates no consent rows. Start/restart the backend with schema support true. Deploy backend compatibility before the frontend.
3. Configure the existing Firebase Admin service and web VAPID public configuration for that test environment. Test browser registration only in supported secure/installed contexts. Never assume permission granted means a device token exists.
4. Apple's push capability, production topic-specific key and renewed App Store profiles are prepared; see the setup evidence. Install the key in backend secret storage and use `APNS_ENVIRONMENT=production`. Debug builds require a separate sandbox key/profile. Keep the two token environments separate.
5. The iOS simulator compiled successfully on GitHub at commit `9534c51`. Merge the complete tested feature, then sign and upload the new main build to all three existing internal TestFlight groups. Verify Apple processing and group assignments separately from upload success.
6. Use `internal` mode and the approved tester IDs. Keep all other users out. Testers deliberately choose master/categories/times and enable a device. Scheduling never silently opts them in.
7. Enable `ZOE_SMART_NUDGES_WORKER=true` on the existing always-running API. It wakes the durable queue immediately and every minute without overlapping local runs, logs aggregate queue results, and runs retention daily. Database claims prevent duplicate delivery across instances. An external scheduler can instead call `POST /api/v1/jobs/notifications/nudges` every minute and `/jobs/notifications/retention` daily with `x-cron-secret`; disable the built-in worker if choosing that arrangement. Keep the legacy job cadence unchanged. Railway native cron has a five-minute minimum, so the existing API worker avoids a separate service and meets this cadence.
8. If activating a previously paused cohort, reset only approved testers' `next_plan_at` to now under operator review, or have them save preferences. Do not requeue unknown/accepted deliveries or backfill expired occurrences.
9. Testers complete the physical-device matrix in the testing document. Verify actual displayed alerts and correct authenticated taps, not only provider acceptance, before expanding beyond the existing tester cohort.

## Migration / rollback

The normal migration runner records `046_zoe_smart_nudges.sql`; run it once with the migration credential. Runtime permissions need CRUD on the new tables plus the transition sequence, using the repository's existing role-grant script. Schema verification fails startup if support/dispatch is enabled without migration 046.

Rollback first sets `ZOE_SMART_NUDGES_ENABLED=false` and rollout `off`, leaving schema support true and all preference rows intact. Stop the new cron if necessary. Keep the compatible backend so opted-out users remain excluded from legacy optional sends. A full reversion to older code needs an explicit review of the old notification job: simply reverting the sender can revive old discretionary nudges. Do not drop preference rows, clear dedupe keys, mass-reset milestones/absence counters, or retry unknown outcomes. Additive columns can remain inert; destructive down-migration is intentionally not the operational rollback. Already accepted pushes may still be displayed until their provider TTL expires.

## Runbook

- **Queue lag:** job response reports due count, oldest due age and unknowns in 24 hours. Inspect cron completion/HTTP failures first, then DB pool pressure and provider rejection codes. Default 50 occurrences/run, at most 200 via service options, four lanes, 40-second start budget and 10-second provider timeout. Multiple workers use the same user locks and delivery claims. Never respond to lag by replaying all events.
- **Missing reminder:** inspect occurrence state and reason (`consent_off`, `preferences_changed`, `rollout_off`, `no_device`, `quiet_hours`, `action_completed`, `expired`, `no_longer_relevant`, caps, pending message, cooldown, duplicate). Missing logs never prove a missed meal or workout. Device registrations older than 30 days are excluded from nudges.
- **Provider errors:** invalid/uninstalled tokens are disabled. Explicit retryable rejection has bounded backoff and at most three attempts per device. `unknown` means acceptance/display cannot be established; do not manually resend it. Recover interrupted `dispatching` events after two minutes as unknown. Existing accepted devices are not retried.
- **Opt-out:** master/category saves invalidate queued work and preference versions; every remaining device is checked again. A provider call already in progress is a documented race boundary. Keep user settings accessible during pause.
- **Deletion / signout:** account deletion cascades preferences, devices, events, deliveries, transitions, schedules and milestone keys. Online signout revokes before Firebase auth is removed, then unregisters locally and clears delivered native notifications. Offline signout remains best effort; do not promise immediate remote revocation. Test this physically before pilot.
- **Time/travel:** use saved IANA timezone. Updating it invalidates old queued versions. One device does not silently change account timezone for all others. DST gaps skip; repeated times choose the first occurrence. Past reminders do not catch up.
- **Retention:** transitions and terminal nudge events 90 days; past workout appointments 90 days. Small milestone keys and per-absence counters persist until account deletion so cleanup cannot restart old celebrations or comeback chasing. At larger volume, run retention in measured batches/partitions instead of one large daily delete.

## Metrics and pilot

Transitions distinguish scheduled, queued, dispatched, suppressed, provider accepted, retry/rejection, unknown, opened and associated recorded action. Event `sent_at` is acceptance evidence, **not display**. Open recording requires current saved master/category consent; account-owned opens are idempotent. Workout action attribution requires a linked session. Routine meal/water association is a temporal association, not proof the push caused the activity.

For an approved pilot, randomly assign consenting eligible volunteers to a fixed notification cohort or explicit holdout before generating the allowlist. Keep category preferences and analysis windows stable. Compare recorded first meal/workout activation, 1/7/30-day return windows, weekly Journey use, category opt-outs, suppression/failure/unknown rates and recorded consistency. Report denominators and missing data. Do not equate opens, retention or logging with health improvement. V1 provides source events; a new analytics dashboard/experiment analysis is not claimed to exist.

## Cost / scale

No per-reminder AI requests or new queue service. Work consists of PostgreSQL scheduling/eligibility writes/reads and existing provider requests. At most three local dates are considered with a 48-hour horizon, and planners advance `next_plan_at` 12 hours; saves/app activity bring a user forward. Each occurrence can fan out to at most five recently active devices. Estimate load as eligible opted-in users × observed reminders per day × active devices, measured during the pilot, not all registered users × theoretical maximum.

Before 100k active users, measure query plans, due lag, provider latency, event volume and retention lock duration. Increase approved worker capacity/batch cadence with the same locking contract. The due, cap, stale, unknown and retention queries have supporting indexes. Per-send APNs HTTP/2 connections and 90-day event storage are known scaling costs; pool APNs connections and partition events only when measurements justify it. No throughput benchmark or 100k-user claim is made.

## Platform references

- [Capacitor Push Notifications](https://capacitorjs.com/docs/apis/push-notifications): native setup, registration and platform constraints. Installed plugin's iOS action handler retains taps until a listener consumes them; the coordinator now mounts on public/startup paths too.
- [Registering with APNs](https://developer.apple.com/documentation/usernotifications/registering-your-app-with-apns) and [APNs notification requests](https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns): signed remote alert delivery, token/topic/environment and expiry requirements.
- [Apple provider authentication and HTTP/2](https://developer.apple.com/library/archive/documentation/NetworkingInternet/Conceptual/RemoteNotificationsPG/CommunicatingwithAPNs.html): ES256 provider JWT and request headers used by the adapter.

Force-stopped apps, permission denial, Focus/Doze, connectivity and OS policies can delay or prevent display. Remote alerts remove the dependency on a running JavaScript timer; they do not guarantee display.

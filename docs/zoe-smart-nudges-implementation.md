# Zoe Smart Nudges V1 — engineering report

14 October 2026. Branch: `codex/zoe-smart-nudges-v1`. Base: `46582ff8174775282000d48364e66c86b6ad62b9`.

## A. Executive summary

Implemented locally behind default-off flags. This includes an Ascend-native preference centre, an actual workout appointment schedule, deterministic eligibility and templates, a PostgreSQL queue, FCM/APNs delivery adapters, authenticated links, privacy controls and automated tests. **Nothing was deployed, uploaded to a store, or migrated in production.** Only an isolated loopback database was migrated.

## B. Original architecture and reuse

See [audit](zoe-smart-nudges-audit.md) and [architecture](zoe-smart-nudges-architecture.md). Reuses existing Firebase delivery, `notification_devices`, `notification_events`, authenticated API conventions, meal/water/workout records, Journey, existing navigation and CSS tokens. No AI calls per reminder, new paid provider, message broker or dependency installation. A small workout schedule was necessary: generated workouts and date-only trainer homework had no timed appointment model.

## C. Implemented features and files

| Area | Main files | What changed |
|---|---|---|
| Policy | `shared/src/smartNudges.ts` | Opted-out defaults, IANA/DST scheduling, quiet hours, priorities, caps, curated generic templates, safe destinations, absence and milestone rules |
| Persistence / engine | `backend/migrations/046_zoe_smart_nudges.sql`, `backend/src/services/smartNudgeService.ts`, `smartNudgePolicy.ts` | Durable occurrences, preference versions, user locks, per-device outcomes, safe retries, retention and ownership checks |
| Providers | `backend/src/integrations/nudgePush.ts` | Existing FCM adapter; signed APNs HTTP/2 alert requests; expiry, invalid-token handling and terminal unknown outcomes |
| API / legacy isolation | `backend/src/routes/notifications.ts`, `backend/src/services/notificationService.ts`, `backend/src/config/env.ts`, `backend/src/db/bootstrap.ts` | Consent and schedule APIs; authenticated event resolver; rate limits; cron endpoints; migration gate; suppress legacy discretionary nudges and automated homework-due reminders for managed users |
| Actual activity | `backend/src/routes/logs.ts`, `backend/src/services/workoutCompletionService.ts` | Re-plan after actual app actions; associated action telemetry; explicit owned workout completion links |
| Settings | `frontend/src/components/notifications/NudgeSettingsClient.tsx`, `frontend/src/app/profile/reminders/page.tsx` | Master/category controls, Minimal/Balanced/Supportive, times, weekly day, comeback threshold, quiet hours, timezone, previews, permission guidance, loading/error/conflict states |
| Schedule | `WorkoutScheduleClient.tsx`, `frontend/src/app/workout-schedule/page.tsx` | Create, reschedule, cancel, mark done, log completed session; 0/15/30/60-minute leads; specific-session navigation |
| Device / navigation | `frontend/src/lib/coachNotifications.ts`, `notificationNavigation.ts`, `NotificationOpenClient.tsx`, `AuthStateGuard.tsx`, `AuthPanel.tsx`, `authSession.ts`, `CoachNotificationCoordinator.tsx`, `public/sw.js` | Account-scoped state, owner-verified legacy consent migration, contextual permission, no refresh nag, revoke-before-signout, global buffered native tap listener, safe login continuation and allowlisted legacy links |
| Entry points | `EnableCoachNotificationsButton.tsx`, `frontend/src/lib/ascendApi.ts` | Profile access and typed APIs |
| Meal / workout UI | `FoodLogClient.tsx`, `BurnLogClient.tsx`, corresponding page routes | Real meal category selection (previously always lunch), reminder category preselection, optional appointment association |
| Native | `capacitor.config.ts`, iOS AppDelegate, entitlement, Xcode build settings and SPM manifest | iOS push plugin, APNs registration callbacks, build-specific entitlement, capability marker; one foreground in-app banner |
| Evidence | New nudge policy/provider/PostgreSQL/component/device/navigation tests; meal regression; `scripts/ios-project.test.mjs`; `frontend/scripts/preview-smart-nudges.mjs` | Automated checks and a local-only fixture preview using actual production components |

No subscription, pricing, trainer dashboard, Zoe AI generation, widgets or HealthKit data model redesign. Meal selection and linked activity recording are directly required for reliable reminder suppression.

## D. Schema, services, routes and flags

Migration 046 adds preferences, workout appointments, deliveries, transitions and minimal durable milestone keys. It extends existing events and devices. Foreign keys cascade account deletion. Nothing is enrolled by migration. New due/retention/cap indexes support bounded work. See [rollout runbook](zoe-smart-nudges-rollout.md) for flags and schema-preserving rollback.

Authenticated endpoints under `/api/v1`:

- `GET/PUT /notifications/preferences` (optimistic version on save).
- `GET/PUT /notifications/workout-schedule` and `POST /notifications/workout-schedule/complete` (owned log + owned appointment).
- `POST /notifications/open` (opaque UUID, ownership, age, entity/version, privacy-aware open recording).
- Existing device registration/unregistration/activity endpoints extended; `POST /notifications/devices/status` confirms only the current account's legacy device consent.

Cron-secret endpoints: `POST /jobs/notifications/nudges` (planner, dispatcher, aggregate health) and `POST /jobs/notifications/retention`. Existing `/jobs/notifications` keeps its legacy cadence; do not increase its frequency to drive the new worker.

Routine categories: morning, evening, weekly, comeback, milestone. Explicit reminders: meals, hydration and real workout appointments. Routine limits are 0/2/3 for Minimal/Balanced/Supportive. Every category shares 4/day AND 4/rolling-24-hours, 90-minute separation; workouts additionally max 2/day. Priority wins over simultaneous lower-priority due work. Each enabled device can receive one copy of an event (up to five recent devices); caps count the occurrence once.

## E. Automated checks

Exact commands, counts, early failures repaired, and final status are in [testing evidence](zoe-smart-nudges-testing.md). Local migrations, backend/frontend tests, lint/types, web/backend/shared builds, iOS packaging checks and Android debug assembly were run. Unit/provider stubs and browser fixtures are explicitly distinguished from actual device delivery.

## F. Device / provider validation

**No real APNs or FCM notification was sent in this work.** Provider tests stub the transport, verify APNs JWT signatures/payload/expiry, and exercise acceptance, definite rejection, invalid token and timeout handling. Android debug assembly succeeds. The subsequently authorized APNs setup produced valid push profiles and passed the Mac Xcode simulator build at native commit `9534c51`. Provider acceptance, signed physical-device installation, display and tap handling remain unverified; the user deferred phone testing. See [APNs setup evidence](zoe-apns-setup.md).

Local browser checks use the actual settings/schedule components with in-memory fixture data and built app CSS. Measured widths: 390 and 320 pixels, with no horizontal document overflow. A local preference save and existing-session reschedule form were exercised. See `zoe-smart-nudges-evidence/`; these images contain fixtures, not production accounts.

## G. Security and performance

- Consent, category, rollout, version, device ownership/version/lease, expiry, quiet hours, caps, pending messages, completion and relevance are rechecked before provider dispatch.
- Per-user advisory locks reserve capacity before sending. No provider request holds a DB transaction. Four dispatch lanes; bounded batches; a 40-second work budget stops starting more sends, with up to one 10-second in-flight provider request per lane. Remaining devices retain durable work. Database/query latency still needs operational measurement.
- Dispatch intent is committed before external I/O. Ambiguous timeout or interrupted worker becomes `unknown`, not an automatic resend. Definite provider rejection alone gets up to three attempts. Successful devices are excluded from retries.
- Queued opt-outs are suppressed; provider requests already started/accepted cannot be recalled. Offline signout cannot guarantee immediate server revocation; local unregister/delete-token is attempted, and nudge devices have a 30-day freshness lease. This limitation must be tested and explained during the pilot.
- New push payloads contain generic text and an opaque event ID, not measurements, appointment names or HealthKit data. Legacy direct human trainer updates remain a separate, pre-existing channel. Legacy discretionary nudges cannot resume merely because new rollout flags are turned off.
- Opens and associated actions stop being recorded for an opted-out category/master. Association is not a causal claim; a generic workout log is not proof that a specific appointment was completed.

## H. Limits and required external setup

1. APNs key/capability and renewed signing profiles were completed in the separately authorized 14 October setup stage; see [APNs setup evidence](zoe-apns-setup.md). A signed physical-device test build and isolated test backend still need preparation; the user deferred phone testing.
2. Production cron, runtime grants, rollout variables and provider credentials were not changed. Until approved and configured, these features remain off.
3. Only explicitly linked logs or explicit Mark done suppress a specific workout appointment. An unrelated workout is not treated as that appointment. Mark done does not invent burn statistics. No automatic missed-session claim or snooze is shipped.
4. Weekly invitations open recorded progress in Journey; no new AI weekly narrative is generated. Morning/evening copy is generic. Milestones recognise recorded first/tenth/twenty-fifth workouts achieved after consent, at most once each. No inferred mood, eating, sleep, inactivity or health outcome claims.
5. DST gaps are skipped, repeated times use the first instance; timezone changes are explicit. Reminder times already in the past are not backfilled. Quiet hours skip, never create catch-up bursts.
6. Full cold/background/reboot/force-stop behavior, OS permission revocation, Focus/Doze, network transitions and physical-device display are still unverified. APNs environments are separated by backend deployment; do not mix debug sandbox devices into a production APNs environment.
7. No 100k-user load test or causal retention experiment was run. V1 has observable events and a pilot design; it does not claim a completed retention dashboard or improved health outcomes.

## I. Readiness

**CONDITIONAL GO for an explicitly approved internal device-validation stage**, after isolated provider setup and iOS signing are ready. **NO-GO for general/pilot production release** until physical delivery/tap/permission scenarios and deployment approval are complete. These labels are recommendations only; no rollout was activated.

## J. Highest-priority next action

Configure an isolated APNs test environment and validate a signed iPhone build end to end (opt-in → due event → accepted push → displayed reminder → authenticated correct destination → opt-out suppression), then complete the Android/web device matrix before pilot approval.

# Zoe Smart Nudges V1 — audit

Baseline: `46582ff8174775282000d48364e66c86b6ad62b9` (`origin/main`), 14 October 2026. Work branch: `codex/zoe-smart-nudges-v1`. **No deployment or production migration is authorized.**

## Existing systems

| Area | Repository evidence | Reuse / gap |
|---|---|---|
| Application | Next 16 / React 18 frontend, Express 4 / PostgreSQL backend, shared TypeScript; Capacitor 8 native shells | Keep current services, navigation and dark/lime design |
| Push | `notificationService.ts`, `notifications.ts`, Firebase Admin; Capacitor push plugin installed; `coachNotifications.ts`, `public/sw.js` | Android/web registration and remote delivery exist; iOS is explicitly excluded from registration and plugin packaging |
| Native iOS | `AppDelegate.swift`, `App.entitlements`, `CapApp-SPM/Package.swift` | No APNs registration forwarding or push entitlement. Requires a new signed binary and provisioned push capability; cannot be enabled by a web deployment alone |
| Scheduling | Secret-protected `/jobs/notifications`, `/jobs/daily` | Existing job scans first 500 users, no durable per-occurrence scheduling, no timezone-aware preference centre |
| Storage | `notification_devices`, `notification_events`, unique `(user_id,dedupe_key)` | Extend these. Existing send-then-record flow can race; `sent` means provider acceptance, not display |
| Notifications | Trainer messages/praise/missions/nutrition plans; celebrations, weekly reflection, proactive coaching, next best move; homework due reminders | Legacy coach engine uses offset minutes and fixed quiet hours. Isolate managed users from legacy discretionary nudges, preserve direct trainer updates as a separately explained channel |
| Food | `food_logs.meal_type`, `logged_at`, `created_at`; `/food-log` | Query user, category and local day at dispatch, including backdated entries |
| Hydration | `water_logs.logged_at`, `/water-log` | Supported; suppress when recently recorded, never infer dehydration |
| Workouts | Canonical `analytics_events` `burn_log`, `workoutCompletionKey`; generated plans and date-only homework | No appointment timestamp/calendar. Add an explicit small user-managed workout schedule, with reschedule/cancel/done, and optional link from manual workout logging |
| Progress | `/journey`, `/progress`, `/dashboard`, Zoe `/coach`, Momentum, reports | Weekly notification opens Journey's recorded progress; do not call AI or include health metrics on lock screen. `/reports` is restricted in iOS free edition, so avoid it |
| Auth / navigation | Firebase auth, API `requireAuth`, `AuthStateGuard`, native URL router | Native taps currently accept arbitrary href and mount only on app routes. Need allowlisted links and authenticated event ownership resolution, including login continuation |
| Consent | Device-local enabled/prompted flags, generic permission banner | No per-user categories/master/intensity. Existing local keys can cross accounts. Refresh can prompt unexpectedly. Signout unregister currently races Firebase signout |
| Health / deletion | Isolated Apple Health tables; user foreign keys cascade | Do not read HealthKit for nudges. All new user rows cascade; no raw tokens in telemetry |
| Operations / tests | Migration runner, runtime-schema gate, Vitest, isolated PostgreSQL hardening tests, CI builds | Add additive migration, default-off flags, bounded planner/worker and evidence matrix; physical push cannot be proven by unit tests |

## Risks and decisions

1. Provider response timeout is ambiguous. Persist dispatch intent before sending; never blindly retry unknown outcomes. Per-device records prevent retrying successful devices.
2. OS permission and backend consent are distinct. New optional nudges require explicit server consent; a migration enrolls nobody. Master off invalidates pending work. A request already accepted by a provider cannot be recalled.
3. Use a saved IANA timezone, not device offsets. Travel changes are explicit, preventing two devices from silently overwriting a shared preference. Missing DST times are skipped; repeated times use the first occurrence.
4. Explicit workout appointments must exist before workout reminders are offered. Date-only homework is not a reliable timed workout. A scheduled item is completed only by explicit user action or a linked logged workout.
5. All lock-screen content is generic and contains no weight, calories, diagnosis, trainer message text or workout title. Detailed progress remains behind authentication.
6. Local PostgreSQL 17 is installed. Docker daemon is unavailable. Use only a loopback isolated test database; never read a production connection string for tests.

## Migration and verification strategy

Add `046_zoe_smart_nudges.sql`: preferences, workout appointments and delivery/transition records; extend existing event and device tables. Validate user locks, dispatch fencing, stale recovery, caps, opt-outs and ownership against real local PostgreSQL with stubbed providers. Unit-test timezone/DST, deterministic templates, priorities and safe routes. Build shared/backend/frontend, lint and run regression suites. Separately list APNs credentials, signing, Android/web provider and physical-device scenarios as blocked/not tested until actually exercised.

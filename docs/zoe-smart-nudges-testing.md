# Zoe Smart Nudges V1 — test and verification evidence

Date: 14 October 2026. Windows host. Local branch `codex/zoe-smart-nudges-v1`, base `46582ff8174775282000d48364e66c86b6ad62b9`. Production was not used for these tests.

## Executed commands and results

| Check | Result | Evidence / boundary |
|---|---|---|
| Full frontend: `npx vitest run --maxWorkers=1` from `frontend` | PASS — 52 files, 330 tests | Completed in 107.49s. One later legacy-consent test is covered by the final focused run below |
| Full backend: `npm run test --workspace backend` with isolated runtime DB URL | PASS — 98 files, 852 tests; 2 files / 14 tests intentionally skipped | Completed in 34.40s; includes real PostgreSQL concurrency tests, provider transport stubs and existing regressions |
| Final nudge policy/provider/database subset: `npx vitest run src/tests/smartNudges.test.ts src/tests/smartNudges.integration.test.ts src/tests/nudgePush.test.ts` | PASS — 3 files, 55 tests | 30 policy, 21 real-DB integration, 4 provider-contract tests. Re-run after expiry, consent and telemetry hardening |
| Final changed frontend subset: `npx vitest run src/lib/coachNotifications.test.ts src/lib/notificationNavigation.test.ts src/components/notifications/NudgeSettingsClient.test.tsx src/components/food/FoodLogClient.test.tsx src/components/AuthStateGuard.test.ts` | PASS — 5 files, 28 tests | Includes owner-verified legacy consent migration, no refresh nag, listener order, signout ordering, settings conflict and actual meal category saving |
| `npm run lint` | PASS | Shared compile, frontend ESLint and backend TypeScript. New tests' reserved `module` variable was renamed to satisfy Next lint |
| `npm run build` | PASS | Shared/backend compilation and Next production build: 52 pages generated. Backend and frontend builds rechecked after final changes |
| `npm run ios:sync` | PASS | Push plugin included in generated portable Swift package. No signing or upload |
| `npm run ios:check` | PASS — 11 tests | Native setup checks only; includes callbacks, entitlement modes, push plugin and foreground presentation options |
| `npm run android:sync`; `android/gradlew.bat assembleDebug --console=plain` | PASS | `BUILD SUCCESSFUL in 1m 42s`, 340 tasks (202 executed, 138 cached). Used installed Android Studio JBR and SDK 36. APK produced locally, not installed or uploaded |
| Migration from a fresh local database, then runtime-role grants | PASS | PostgreSQL 17 at **127.0.0.1:55461/ascend_hardening_test**. Database was created solely for these tests; final migration file applied afresh. Existing production database untouched |
| Actual component visual checks through local preview | PASS at measured 320 and 390 px | Real components + built CSS, in-memory API fixtures, no authentication or production connection |
| Real APNs/FCM acceptance / physical display | NOT TESTED | No live provider sends performed; mock acceptance is not real provider acceptance |

The initial `npm test` run stopped at an existing frontend `CoachHubClient` test that could not find the planner's Home button within its wait window under concurrent load: 324 passed, 1 failed. That same test passed alone, then the entire frontend suite passed with one worker. No unrelated app behavior or assertion was weakened. Early new-test fixture errors (missing required meal fixture name, quiet hours masking the intended timezone assertion, cross-VM empty-array comparison, mock methods returning non-Promises) were corrected and rerun. Vite CommonJS configuration, pg future concurrency API and Gradle deprecation warnings remain nonfatal existing/toolchain warnings.

## Verification matrix

PASS below means the stated local layer passed; it never means a physical device was tested.

| Requirement / scenario | Status | Verified layer |
|---|---|---|
| Infrastructure audit and architecture before implementation | PASS | Audit/architecture docs and repository inspection |
| Default-off migration and explicit enrollment | PASS | Empty preference baseline, strict schema, rollout gates, optimistic versions |
| Master/category off, including queued work | PASS | Real DB jobs and per-device recheck; delivery history preserves a first-device acceptance if later devices are suppressed |
| Existing consent / account separation | PASS | Token ownership check before migrating legacy local consent; native mocked registration refuses a switched account; server event/log ownership tests |
| IANA timezone, local date boundaries, 30/45-minute offsets | PASS | Pure policy and local PostgreSQL meal tests |
| DST missing/repeated wall times, half-hour transition | PASS | New York + Lord Howe fixtures; missing times skip, repeated times resolve once |
| Midnight quiet hours and all-day quiet | PASS | Boundary unit tests + DB dispatch suppression |
| Preferences changed from another device | PASS | Version conflict, queued invalidation, latest preference recheck |
| Meal logging / backdated meals | PASS | Correct day/category, unrelated meal/day does not suppress; backdated matching meal before and between device sends suppresses |
| Visible meal category / reminder destination | PASS | Component saving `breakfast` instead of hardcoded lunch, strict route allowlist |
| Real workout appointments / 0,15,30,60 lead values | PASS | Schema and schedule service; reschedule/done/cancel controls; expiry capped at start + 15 minutes |
| Workout completion / unrelated or foreign log | PASS | Owned linked log suppresses; foreign user/log cannot mark an appointment done; unrelated activity is not inferred completion |
| Hydration | PASS | Recent actual water log suppresses; generic safe template |
| Weekly review with no fabricated statistics | PASS | Generic payload + authenticated `/journey` destination; uses existing progress surface |
| Morning / evening | PASS | Deterministic schedules/templates, routine caps, quiet hours and safe daily overview destinations |
| Comeback thresholds / firm stop / return | PASS | 3/7/14-day policy, weekly cooldown, three-attempt durable stop survives event cleanup; actual app return changes episode |
| Milestones | PASS | Verified recorded counts and achievement date after consent; persistent dedupe; no imported HealthKit query |
| Concurrent jobs / priorities / caps | PASS | Six worker invocations, overlap prioritisation, reservation counts include unknown outcomes; user advisory locks |
| Provider retry / acceptance / timeout | PASS with stubs | Per-device retry does not resend accepted devices; maximum three definitive retries; network ambiguity stays unknown |
| Worker restart / stale jobs | PASS | Interrupted dispatch recovers as unknown; expired jobs are suppressed; persisted rows survive service invocations |
| Missing / disabled / invalid / reassigned token | PASS at service layer | DB device rows and invalid-token stub response; no cross-account send after reassignment |
| Denied OS permission without nag | PASS with mocked plugin | Refresh never requests permission; disabling/revocation attempted; UI explains Settings path |
| Online signout / account switch | PASS with mocked plugin/auth and real DB isolation | Unregister precedes Firebase signout; local state scoped per account |
| Offline signout / real uninstall | NOT TESTED physically | Best-effort local unregister and 30-day device lease; actual OS behavior needs testing |
| Deleted account | PASS at DB layer | Foreign-key cascades remove events/deliveries and subsequent work cannot recreate them |
| Safe/legacy/malformed/deleted/expired links | PASS at service/unit layer | Safe route validation, server ownership/age checks, schedule version checks, same-origin worker navigation, pending opaque login ID |
| Cold-start/background/foreground native taps | NOT TESTED physically | Code path is present; installed iOS plugin retains unconsumed action events; server/navigation helper tests are not physical proof |
| Notification after reboot, Android Doze/force-stop, iOS Focus, network restoration | NOT TESTED | Requires real devices and providers |
| iOS Xcode simulator compilation | PASS | GitHub macOS run [38531956932](https://github.com/mdfarizanwar369/ascend/actions/runs/38531956932), native commit `9534c51`; simulator artifact packaged; upload/release jobs skipped |
| iOS signed physical-device build | PENDING | Apple push profiles ready; no registered test phone yet. User deferred physical testing. Simulator compilation is not device-signing or delivery proof |
| Actual APNs key and provisioning profiles | LOCAL CHECKS PASS | 14 October: real key P-256 sign/verify, downloaded profiles validated, 23 release-signing guard tests passed; see [setup evidence](zoe-apns-setup.md) |
| Live FCM/APNs authentication and provider acceptance | NOT TESTED | No live provider send; local key validation does not prove Apple acceptance |
| Lock-screen privacy, no per-nudge AI | PASS by code/contract tests | Generic templates, opaque ID, APNs/FCM payload contract; no measurement or workout title in new payloads |
| Open/action measurement permission | PASS by service logic / integration opens | Current consent required; idempotent owner-scoped opens, associated action naming, explicit linked workouts |
| Phone layout and saving/rescheduling UI | PASS with browser fixtures | Details below; production authentication and actual-device input not claimed |
| 100k-user throughput and retention deletion latency | NOT TESTED | Indexed/bounded design and growth plan documented; no invented benchmark |
| No unapproved deployment | PASS | Local branch, local DB, local builds; no deployment/store upload/provider send/production migration |

## Browser evidence

Preview command: `node frontend/scripts/preview-smart-nudges.mjs`, after building frontend. Binds only `127.0.0.1:3012`, renders actual production components with in-memory preferences/schedules and compiled Ascend CSS. `/profile/reminders?theme=light` selects the fixture's light theme. This helper is not a deployed route and does not import real auth/API/provider code.

Measured browser values:

| Surface | `innerWidth` | `clientWidth` | `scrollWidth` | Result |
|---|---:|---:|---:|---|
| Settings dark | 390 | 375 | 375 | No horizontal overflow |
| Expanded lunch controls dark | 320 | 305 | 305 | No overflowing input/select/button/summary detected |
| Specific workout schedule dark | 320 | 305 | 305 | No horizontal overflow; requested session scrolled into view |
| Settings light | 390 | 375 | 375 | No horizontal overflow, readable theme tokens |

The 15-pixel difference is the desktop browser's vertical scrollbar, not an assumed device viewport. Entered lunch time 13:15 and saved; UI returned “Preferences saved. Reminders apply to your enabled devices.” The reschedule control populated the existing appointment name/time. These are fixture operations, not production data changes.

Evidence images:

- [390px settings](zoe-smart-nudges-evidence/settings-390.jpg)
- [320px expanded controls](zoe-smart-nudges-evidence/settings-expanded-320.jpg)
- [320px workout destination](zoe-smart-nudges-evidence/workout-320.jpg)
- [390px light theme](zoe-smart-nudges-evidence/settings-light-390.jpg)

## Required real-device acceptance sequence

For both an approved signed iPhone and Android device (and supported web installation), record build, OS, backend environment, timezone, preference version and opaque event ID. Keep tokens/keys and raw health data out of evidence.

1. Fresh account: all categories off; no unsolicited OS prompt. Explicit permission grant/denial and re-enable path.
2. Schedule a near-future meal and real workout, close the app normally, observe a displayed generic alert, tap into the correct authenticated destination.
3. Repeat foreground, background, reboot, network-off-then-on and battery/Focus constraints; record unavailable cases honestly.
4. Log the meal on a second device before dispatch; complete/cancel/reschedule the workout; verify no stale new dispatch.
5. Change timezone, quiet hours, intensity and master/category switches from another device; check queue state and actual display boundaries.
6. Sign out online and offline, switch accounts, revoke OS permission, rotate token and uninstall; verify privacy and documented limits.
7. Confirm the displayed/tapped outcome independently of the provider's acceptance response. Obtain pilot approval only after reviewing this evidence.

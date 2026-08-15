# Ascend Release Candidate Verification Sprint 3

**Date:** 15 August 2026

**Worktree:** `C:\Users\Admin\Documents\Codex\ascend-production-remediation-sprint-1`

**Branch:** `codex/release-candidate-verification-sprint-3`

**Source/Sprint 1 commit:** `92f6b06d46bfbae6909e34b04c9fdc628b87c3a6`

**Sprint 2 commit:** `ca126090d5ed8be36c0cf564614750c55db5474d`

**Production access/deployment:** No production mutation or deployment

## Executive summary

Sprint 2 was already committed, complete, and clean at handoff. Sprint 3 identified the actual deployment topology and confirmed that Ascend has production only: there is no isolated Ascend staging environment. The release-candidate deployment was therefore deliberately stopped before deployment, as required.

Local production-build verification used disposable PostgreSQL 17, Firebase Auth Emulator, MinIO, and test accounts. Desktop Chrome registration, email login, protected deep links, refresh, logout, safe return handling, and hostile external return rejection passed. The storage integration and provider-interruption suites passed. An unavailable AI provider returned a controlled failure and did not create a false meal.

Three defects were corrected:

1. Firebase Admin fallback initialization omitted the configured project ID, causing valid emulator tokens to be rejected.
2. product analytics idempotency depended only on an application lock/query and request-scoped IDs; stable IDs and a database unique index now prevent duplicate confirmed events.
3. immediate account deletion completed successfully but its analytics event was dropped because it referenced the already-deleted user. The event now uses the deletion workflow's surviving nullable user reference.

This is a **NO-GO for public release**. It is not a code-build failure: all executable build/test gates pass. It is an evidence and environment failure. There is no isolated staging environment, no approved non-production AI credential, no Google Play sandbox evidence, no external monitoring destination, no provider backup evidence, and no physical-device authentication matrix.

## Git handoff

| Item | Result |
| --- | --- |
| Initial branch | `codex/release-candidate-verification-sprint-3` |
| Initial HEAD | `ca126090d5ed8be36c0cf564614750c55db5474d` |
| Sprint 1 source | `92f6b06d46bfbae6909e34b04c9fdc628b87c3a6` |
| Sprint 2 status | Already committed and complete |
| Sprint 2 untracked files | None |
| Sprint 2 diff | Clean |
| Sprint 2 commit | `ca126090d5ed8be36c0cf564614750c55db5474d` |

## Deployment architecture

Repository and Railway metadata were inspected without printing secrets.

| Area | Current production architecture | Staging status |
| --- | --- | --- |
| Frontend | Railway service `ascend`; `getascend.fit`, `www.getascend.fit`, and a Railway domain | None |
| Backend | Railway service `ascend-backend`; Railway public domain | None |
| Database | Railway PostgreSQL 18 with a persistent volume | No separate database |
| Object storage | Cloudflare R2 | No separate bucket/credentials verified |
| Firebase | Project `ascend-b2850` | No separate Firebase project |
| Android | Capacitor wrapper; default remote URL is production `/launch` | No staging Android environment |
| Monitoring | Provider-neutral internal logs/metrics only | No approved external provider |
| CI/CD | GitHub Actions lint/test/build/audit; Railway deploys the production services from `main` | No isolated release-candidate pipeline |

The production frontend and backend were running commit `9ad8bdfc51eaeaff6f708bf7c94128d77d196872` when inspected. Sprint 2/Sprint 3 were not deployed.

### Required isolated staging plan

Create a Railway `staging` environment with distinct services and no production references:

1. `ascend-frontend-staging`: 512 MB baseline, staging domain such as `staging.getascend.fit`.
2. `ascend-backend-staging`: 1 GB baseline, staging API domain, pinned release-candidate commit.
3. Separate Railway PostgreSQL: 1 GB baseline, staging-only credentials and migration history.
4. Separate Cloudflare R2 bucket and scoped staging API token.
5. Separate Firebase project, Android/web apps, OAuth clients, and disposable accounts.
6. Separate Gemini project/key with a hard budget and no production quota sharing.
7. Google Play closed/sandbox test accounts and service account scoped to the app.
8. Approved monitoring provider project with staging and production environments separated.
9. Staging-only CORS, frontend URL, return URLs, Gmail redirect, Stripe test mode, and notification configuration.

Minimum expected recurring resources are two small Railway services plus a small PostgreSQL instance, R2 test storage, and provider test quotas. Exact cost must be confirmed in the selected provider consoles before creation.

## Staging deployment

| Item | Status |
| --- | --- |
| Isolated Ascend staging found | NO |
| Release candidate deployed | NO - prohibited by isolation rule |
| Deployed commit | Not applicable |
| Staging migrations | Not applied |
| Staging rollback | Not tested |
| Production changed | NO |

## Authentication matrix

Desktop Chrome used the production frontend build served locally against the isolated API and Firebase emulator. Physical devices were not available and are not claimed.

| Journey | API/emulator | Desktop Chrome | Mobile responsive Chrome | Android Chrome | Android native | iPhone Safari/PWA |
| --- | --- | --- | --- | --- | --- | --- |
| Registration/provision | PASS | PASS | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Email login | PASS | PASS | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Protected deep link | PASS | PASS | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Refresh/session persistence | PASS | PASS | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Missing/invalid token | PASS (401) | PASS redirect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Disabled account | Sprint 2 PASS (401) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Deletion-pending/deleted | PASS (403/purged; deleted token 401) | NOT VERIFIED after deletion | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Expired/revoked recovery | Rejection/unit paths PASS | NOT VERIFIED end to end | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Logout | PASS | PASS | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Browser back | Protected route remained guarded | PASS basic flow | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Background/resume | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Temporary network loss | API failure handling covered; client recovery NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Safe return destination | PASS | PASS | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Hostile return destination | PASS | PASS: external URL rejected, `/dashboard` used | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Redirect loop/deadlock | None observed | PASS tested paths | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |

### Physical-device tester script

For each iPhone Safari/PWA, Android Chrome, and Android native candidate:

1. Register a disposable account and complete onboarding.
2. Log out, reopen a protected deep link, log in, and confirm return to the intended internal path.
3. Refresh/relaunch while signed in; verify no loading deadlock.
4. Background for five minutes, resume, and complete a write action.
5. Disable network, attempt a read and write, restore network, and retry without duplicate data.
6. Revoke the token from the staging admin account, resume, and verify a clean login prompt.
7. Disable and deletion-pend dedicated accounts; confirm access is blocked without a redirect loop.
8. Log out and use Back; protected content must not reappear.

## Frontend performance and Core Web Vitals

The requested measurements must be taken against a deployed isolated staging release. None are reported from production and local measurements are not misrepresented as production-like evidence.

| Screen | LCP | INP | CLS | FCP | TBT | Speed Index | JS/image/request evidence | Status |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| Landing | - | - | - | - | - | - | - | BLOCKED: no staging |
| Login | - | - | - | - | - | - | - | BLOCKED: no staging |
| Registration/onboarding | - | - | - | - | - | - | - | BLOCKED: no staging |
| Member dashboard | - | - | - | - | - | - | - | BLOCKED: no staging |
| Manual meal | - | - | - | - | - | - | - | BLOCKED: no staging |
| Meal history | - | - | - | - | - | - | - | BLOCKED: no staging |
| Progress | - | - | - | - | - | - | - | BLOCKED: no staging |
| Trainer dashboard | - | - | - | - | - | - | - | BLOCKED: no staging |
| Trainer client detail | - | - | - | - | - | - | - | BLOCKED: no staging |
| Owner dashboard | - | - | - | - | - | - | - | BLOCKED: no staging |

The Sprint 2 trainer-detail change removes one serialized profile round trip before secondary requests start. A before/after browser number cannot be produced without staging and was not invented. Local logs still show substantial dashboard API fan-out; this must be measured under 4G before public release.

## AI meal-photo verification

Approved non-production Gemini credentials and staging storage were not available, so the successful real-provider journey is a release blocker.

| Case | Result |
| --- | --- |
| Valid image request reaches authenticated route | PASS locally |
| Provider unavailable | PASS: controlled 503 `FOOD_AI_UNAVAILABLE` |
| False completed meal on AI failure | PASS: meal count remained 2 before and after |
| Failure analytics | PASS: one `product.meal_ai_failed.v1` |
| Submission analytics | PASS: one `product.meal_photo_submitted.v1` |
| Success analytics | BLOCKED: no approved AI credential |
| Real upload ownership/storage/AI chain | BLOCKED: no staging providers |
| Timeout/invalid model response/retry | Unit coverage exists; real-provider behavior NOT VERIFIED |
| Cost log privacy | Structured metadata contains bounded mode/code only; real provider NOT VERIFIED |
| Remote arbitrary image fetching | Remains disabled |

Local controlled provider-unavailable response completed in approximately 21 ms. This is not an AI latency measurement.

## Google Play subscription sandbox

Production Railway configuration did not contain the Google Play service-account/package variables needed for backend verification. No sandbox or license-test account was available. New purchase, renewal, failed renewal, cancellation, expiry, restore, duplicate notification, delay, outage, restart, and entitlement consistency are all **NOT VERIFIED**.

The current `/subscriptions/me` path synchronously attempts Google Play synchronization for applicable users. Real sandbox latency was unavailable, so no speculative redesign was made. Measure provider p50/p95 before enabling paid launch. Until the full sandbox matrix passes, keep Android paid upgrades disabled and use manually granted Premium only for controlled testers.

## External monitoring and alert delivery

No Sentry, PostHog, Datadog, New Relic, OpenTelemetry collector, or other approved external alert destination was configured. Internal structured logs, request IDs, readiness, metrics, and failure hooks exist; external delivery is a release blocker.

| Signal | Internal signal | External delivery |
| --- | --- | --- |
| Backend exception | PASS | BLOCKED |
| Frontend crash | Hook present | BLOCKED |
| API error-rate/latency | Process metrics present | BLOCKED |
| Database outage/readiness | Sprint 2 PASS | BLOCKED |
| AI/Firebase/storage failure | Bounded logs present | BLOCKED |
| Scheduled-job failure | Hook present | BLOCKED |
| Account-deletion retry exhaustion | Hook present | BLOCKED |

Provider-neutral setup checklist:

1. Approve a provider and create separate staging/production projects.
2. Configure server and browser DSNs/tokens through environment variables.
3. Include environment, release commit, request ID, route, bounded error code, and redacted stack.
4. Exclude authorization, cookies, health values, image content/URLs, prompts, emails, and provider secrets.
5. Define p95 latency, 5xx rate, readiness, job, AI, Firebase, storage, and deletion-exhaustion alerts.
6. Configure grouping/rate limits and verify one injected incident does not create an alert storm.
7. Send test alerts to the named on-call recipient and preserve delivery screenshots.
8. Use an external metrics store so multiple Railway instances aggregate correctly.

## Backup-provider evidence

Sprint 2 proved a disposable database/object restore, but provider configuration cannot be inferred from that test. Railway and Cloudflare provider consoles did not expose sufficient backup evidence through the inspected metadata.

| Requirement | Production evidence |
| --- | --- |
| PostgreSQL automated backup enabled/latest success | NOT VERIFIED |
| PITR window and retention | NOT VERIFIED |
| Encryption and backup access control | NOT VERIFIED |
| R2 versioning/recovery/lifecycle | NOT VERIFIED |
| Firebase Auth recovery/export procedure | NOT VERIFIED |
| Approved RPO/RTO | NOT DOCUMENTED as approved operational targets |
| Named recovery owner | NOT VERIFIED |

Required administrator evidence:

1. Railway PostgreSQL Backups view showing enabled state, schedule, retention, latest restore point, encryption/provider guarantees, and authorized operators.
2. Cloudflare R2 bucket data-protection/versioning or recovery configuration, lifecycle rules, scoped-token access, and encryption status.
3. Firebase Auth export/recovery runbook acknowledging that Auth cannot be transactionally restored with PostgreSQL.
4. A signed runbook naming the recovery owner and approved RPO/RTO, plus a dated restore drill.

## Analytics verification

Migration `026_product_analytics_idempotency.sql` adds a partial unique index on product event IDs. Stable SHA-256-derived IDs protect one-time and persisted-record events. The service still uses an advisory transaction lock and fail-safe recording.

| Active event | Boundary/status |
| --- | --- |
| `registration_started` | PASS: valid provision accepted; once across retries |
| `registration_completed` | PASS: persisted user; once across retries |
| `onboarding_started` | PASS: valid submission accepted; once |
| `onboarding_completed` | PASS: persisted onboarding; once |
| `first_meal_logged` | PASS: first persisted meal only, even after a second meal |
| `meal_logged_manually` | PASS: once per persisted manual meal |
| `meal_photo_submitted` | PASS: valid authenticated request only; malformed input excluded |
| `meal_ai_succeeded` | Code/unit PASS; real provider BLOCKED |
| `meal_ai_failed` | PASS: one provider-unavailable failure |
| `progress_entry_created` | PASS: once per persisted weight/photo row; weight exercised |
| `account_deletion_requested` | PASS after fix: immediate deletion event survives with nullable user ID |

Actual disposable rows carried `environment=staging` and `testAccount=true`. Product event properties exclude health measurements, image data, URLs, prompts, email, and names. The centralized explicit `analyticsAllowed=false` path returns before opening a database connection and is unit-tested, but no persisted user-facing analytics preference was found; end-to-end preference wiring is therefore NOT VERIFIED. Reserved trainer, subscription, and notification events remain deliberately unwired rather than inferred from page views.

## Validation results

| Gate | Result |
| --- | --- |
| Full lint/TypeScript | PASS: 0 errors; 3 pre-existing Next internal-navigation warnings |
| Complete tests | PASS: 45 files passed, 2 skipped; 227 passed, 9 skipped |
| Real storage integration | PASS: 8/8 |
| Storage interruption integration | PASS: 1/1 |
| Production web build | PASS: 42 routes generated |
| Android sync | PASS: 6 plugins synchronized |
| Android debug APK | PASS: Gradle `BUILD SUCCESSFUL`; deprecation/flatDir warnings remain |
| Dependency audit | FAIL policy gate: 6 moderate transitive advisories, 0 high, 0 critical |
| Git diff check | PASS |
| Local API/browser smoke | PASS for exercised desktop paths |
| Staging smoke/performance | BLOCKED: no staging deployment |

The audit advisories are beneath `firebase-admin` through `@google-cloud/storage`, `gaxios`, `retry-request`, `teeny-request`, and `uuid`. npm proposes a breaking downgrade to `firebase-admin@10.3.0`; it was not applied. Track the upstream patched dependency chain or validate a narrow compatible override in staging.

## Files changed in Sprint 3

- `.env.example`, `frontend/.env.example`, `frontend/src/lib/firebase.ts`: optional test-only Firebase Auth Emulator wiring.
- `.gitignore`: exclude Firebase emulator debug logs.
- `backend/src/integrations/firebase.ts`: preserve configured project ID with application-default credentials.
- `backend/migrations/026_product_analytics_idempotency.sql`: database-enforced product-event uniqueness.
- `backend/src/services/productAnalyticsService.ts`: stable opaque event IDs and test-account helper.
- `backend/src/routes/auth.ts`, `backend/src/routes/me.ts`, `backend/src/routes/logs.ts`, `backend/src/routes/progress.ts`: authoritative analytics boundaries, test markers, validation ordering, and deletion-safe event ownership.
- `backend/src/services/readinessService.ts`, `backend/src/tests/readiness.test.ts`: migration 026 readiness contract.
- `backend/src/tests/productAnalyticsService.test.ts`: stable ID, opt-out, test marker, validation, and fail-safe coverage.
- `docs/PRODUCT_ANALYTICS.md`, `docs/operations/STARTUP_MIGRATION_OBSERVABILITY_RUNBOOK.md`: updated operational contracts.
- This report.

## Remaining public-release blockers

1. Build and deploy a fully isolated Ascend staging environment.
2. Complete desktop/mobile 4G Core Web Vitals and journey measurements against staging.
3. Complete iPhone Safari/PWA, Android Chrome, and Android native auth/recovery tests on physical devices.
4. Complete the real non-production AI meal-photo matrix.
5. Complete Google Play subscription sandbox lifecycle verification or keep paid Android upgrades disabled.
6. Approve an external monitoring provider and prove alert delivery.
7. Capture real provider backup/PITR/versioning evidence and approve RPO/RTO ownership.
8. Resolve or formally risk-accept the six moderate transitive dependency advisories.
9. Decide and wire a persisted user analytics preference if product policy requires user-controlled opt-out.

## Updated readiness score

| Area | Score |
| --- | ---: |
| Migration/database safety | 9.5/10 |
| Upload/storage safety | 9.1/10 |
| Account deletion/recovery | 9.3/10 |
| Authentication/API enforcement | 8.6/10 |
| Product analytics | 8.5/10 |
| Observability | 6.5/10 |
| Backup/recovery evidence | 6.8/10 |
| Performance evidence | 6.5/10 |
| Subscription evidence | 5.8/10 |
| Overall public-release readiness | **7.8/10** |

## Recommendation

**NO-GO for public release.**

The release candidate compiles and its isolated local core paths are materially stronger, but public GO requires evidence from isolated staging, real devices, approved AI and billing sandboxes, external alert delivery, and production-provider backup configuration. No protected merge, public release, production deployment, or production mutation was performed.

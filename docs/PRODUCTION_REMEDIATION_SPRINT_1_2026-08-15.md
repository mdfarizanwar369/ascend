# Ascend Production Remediation Sprint 1

**Date:** 15 August 2026

**Source commit:** `9ad8bdfc51eaeaff6f708bf7c94128d77d196872`

**Branch:** `codex/production-remediation-sprint-1`

**Worktree:** `C:\Users\Admin\Documents\Codex\ascend-production-remediation-sprint-1`

**Deployment/production data:** Not accessed or changed

## Executive summary

Sprint 1 removes the known arbitrary Food AI URL fetch, replaces direct browser-to-bucket writes with owned server-validated uploads, adds durable account-deletion stages, makes schema readiness a startup requirement, adds auth recovery, centralizes core member-day calculations, and introduces provider-neutral observability hooks and operational runbooks.

The implementation passes lint, 218 backend tests, production web compilation, Capacitor sync, and Android debug compilation. Runtime audit exposure improved from 13 advisories (5 high, 7 moderate, 1 low) to 6 moderate advisories and no high, critical, or low findings.

This result is a **CONDITIONAL GO** for an isolated staging deployment and closed testing. It is not sufficient evidence for unrestricted public release because real PostgreSQL migration concurrency, real storage/provider behavior, physical-device auth recovery, external monitoring, and backup restoration have not been integration-verified.

## Before and after

| Audit issue | Before | After | Classification |
| --- | --- | --- | --- |
| Food AI SSRF | Authenticated users could make the backend fetch an arbitrary URL. | Controlled data URLs are preferred. Optional remote input requires exact HTTPS hostname allowlisting, validates every DNS answer and redirect, pins the public address, and enforces timeout/type/size limits. | Implemented but not integration-verified |
| Direct uploads | Presigned writes trusted browser MIME and accepted unowned object keys. | Legacy presign endpoints return `410`; backend validates bytes and owns random keys; `media_uploads` binds user, purpose, status, dimensions, and attachment. | Implemented but not integration-verified |
| Image abuse | No consistent magic-byte, strict decode, dimension, frame, or decoded-size boundary. | JPEG/PNG/WebP only, matching signature, strict single-frame decode, 5 MB, 8,000 px edge, 40 MP, decode/storage timeouts, and per-user quotas. | Resolved and verified at validation layer |
| Signed-out protected shell | Missing/expired auth could leave a protected shell waiting indefinitely. | Persistence-aware auth guard clears local state, preserves a safe internal return path, shows a recovery state, and redirects; API retries one forced token refresh before recovery. | Implemented but not browser/device integration-verified |
| Migration race/startup | Startup could continue after schema initialization failure and migrations lacked database coordination. | Checksummed transactional migrations use a PostgreSQL advisory lock; readiness requires DB/schema/migration 025; normal API traffic is gated; server does not listen after failed required initialization. | Implemented but not real-DB integration-verified |
| Account deletion | Irreversible Firebase/storage work was treated like one database transaction. | PostgreSQL is the workflow authority with idempotent Firebase, storage, and database stages, retry/manual-review states, inactive access, safe evidence, and scheduled retries. | Implemented but not provider integration-verified |
| User-local dates | Core member-day behavior used database/server dates. | IANA timezone is stored and used for meals, daily priorities, Momentum/compliance, streaks, progress comparisons, weekly reports, Coach Presence, risk checks, and proactive notifications. | Partially resolved |
| Runtime advisories | 13 runtime findings: 5 high, 7 moderate, 1 low. | 6 moderate transitive Firebase Admin/Google storage findings; zero high/critical/low. | Accepted temporarily |
| Observability | Primarily ad hoc console output with no consistent request correlation/redaction/metrics. | Structured redacted JSON logs, request IDs, latency/error/external/job/readiness metrics, process handlers, protected metrics route, and client crash hooks. | Implemented but not externally integrated |
| Backup/restore | No repository evidence of enabled backups, PITR, retention, or a restore rehearsal. | Required policy, RPO/RTO, access controls, limitations, and isolated rehearsal procedure documented. No provider evidence was invented. | Unresolved operational prerequisite |

## Security design

Detailed controls are in [SSRF_AND_MEDIA_UPLOADS.md](security/SSRF_AND_MEDIA_UPLOADS.md).

- `FOOD_AI_REMOTE_IMAGE_HOSTS` is empty by default and accepts exact hostnames only.
- URL credentials, non-HTTPS URLs, non-443 ports, alternative numeric/private addresses, loopback, link-local, CGNAT, multicast, documentation ranges, IPv4-mapped IPv6, and any hostname with a non-public DNS answer are rejected.
- Every redirect is re-resolved and revalidated. HTTPS connects to the validated address while retaining hostname/SNI certificate checks.
- Responses are bounded to 10 seconds, three redirects, 5 MB, and JPEG/PNG/WebP.
- Upload keys are UUID-based and scoped by purpose/user. Ownership is required before meal, profile, progress, or body-scan attachment.
- Quotas are serialized per user with a transaction advisory lock: 10 accepted uploads/minute and 100/24 hours.
- Pending uploads older than 15 minutes are deleted and marked failed.

## Account deletion

The durable workflow and operational procedure are in [ACCOUNT_DELETION_RUNBOOK.md](operations/ACCOUNT_DELETION_RUNBOOK.md).

`requested -> firebase -> storage -> database -> completed`

Failures move to `retry_required`; billing/business dependencies use `manual_review`. The user is marked inactive before provider work. The API returns `200` only after all stages complete and `202` while work remains. Tests inject failure at each stage and verify resumability and idempotent stage skipping.

## Startup, observability, and recovery

- [STARTUP_MIGRATION_OBSERVABILITY_RUNBOOK.md](operations/STARTUP_MIGRATION_OBSERVABILITY_RUNBOOK.md)
- [BACKUP_AND_RESTORE_RUNBOOK.md](operations/BACKUP_AND_RESTORE_RUNBOOK.md)

Liveness and readiness are separate. `/health/live` proves only that the process is alive. `/health/ready` and the backward-compatible `/health` require database/schema readiness. In-memory metrics are available only through the secret-protected metrics endpoint. No external APM or alerting provider is claimed as active.

## Timezone review

Timestamps remain UTC. User-day boundaries use the stored IANA timezone with `Asia/Kuala_Lumpur` as a compatibility fallback. Tests cover Singapore year rollover and New York 23/25-hour DST days.

Resolved member-facing areas: meals, Today priorities, Momentum/compliance, streaks, progress comparison, weekly report windows, Coach Presence, proactive notifications, and relevant daily jobs.

Intentionally unchanged:

- subscription renewal/expiry uses provider timestamps and must remain absolute;
- date-only mission/homework due dates remain calendar dates;
- owner/trainer cross-client aggregates still use database calendar windows because a gym-level reporting timezone is not modeled. Changing these silently would be unsafe. Add a gym timezone and explicit reporting contract in a separate migration before claiming complete timezone remediation.

## Dependency review

Narrow updates:

- Next.js / `eslint-config-next` to `16.3.1`;
- Firebase client to `12.17.1`;
- Firebase Admin to `14.2.0`;
- Sharp to the current compatible `0.35.x` resolution;
- `body-parser` to `1.20.6`;
- `brace-expansion` to `2.1.4`;
- `protobufjs` to `7.6.5`.

Remaining runtime findings are six moderate advisories in `firebase-admin -> @google-cloud/storage` involving `gaxios`, `retry-request`, `teeny-request`, and `uuid`. npm proposes a breaking downgrade to Firebase Admin 10.3.0 rather than a safe forward fix. Ascend uses AWS S3 integration rather than Firebase Admin's Google Cloud Storage API, does not accept user-provided protobuf definitions, and does not call the vulnerable UUID buffer API directly. These findings are accepted temporarily with provider failure metrics, explicit request limits, and a requirement to upgrade when Firebase Admin publishes a compatible dependency chain.

## Validation results

| Validation | Result | Evidence |
| --- | --- | --- |
| Focused remediation tests | PASS | 6 files, 45 tests |
| Full backend suite | PASS | 42 files, 218 tests |
| `npm run lint` | PASS with 3 warnings | 0 errors; pre-existing internal-navigation warnings |
| Backend TypeScript | PASS | Included in lint/build |
| `npm run build` | PASS | Shared, backend, and Next.js 16.3.1 production build; 42 routes |
| `npm run android:sync` | PASS | Six Capacitor plugins synchronized |
| `npm run android:debug-apk` | PASS | 22,126,983-byte APK, SHA-256 `69F7A116C0FC6063F526D9627A7B1F6FADDA3934C47808B5ECA0CEF1CEFFC600` |
| Runtime dependency audit | CONDITIONAL | 0 critical, 0 high, 6 moderate, 0 low |
| Auth return-path harness | PASS | 6 assertions for safe/internal and hostile destinations |
| Upload rejection tests | PASS | Oversized, disguised, malformed, truncated, unsupported, dimension, and SSRF-address cases |
| Account deletion failure injection | PASS | Firebase, storage, and database stages plus resume behavior |
| Timezone boundaries | PASS | Midnight/year and DST 23/25-hour boundaries |
| Startup/readiness unit tests | PASS | Initialization/schema state and required migration checks |
| Migration concurrency unit tests | PASS | Lock-before-migration and release-on-success/failure |
| Real PostgreSQL migration concurrency | NOT VERIFIED | Local PostgreSQL exists but no disposable credentials; Docker daemon stopped. Production DB was not accessed. |
| Real S3/Firebase deletion | NOT VERIFIED | Would mutate external providers/user data. |
| Browser/device auth expiry/revocation | NOT VERIFIED | Requires disposable accounts and controlled token revocation. |
| Backup restoration rehearsal | NOT VERIFIED | Requires isolated provider environment and backup evidence. |

Two tooling issues encountered and corrected during validation: an unsupported Jest `--runInBand` option was removed from the focused Vitest command, and the local nested Sharp binary used by `@capacitor/assets` was rebuilt. The first production build also caught an implicit Firebase `Auth` type, which was fixed before the final passing build.

## Files changed

### Database and backend platform

- `backend/migrations/025_production_remediation_sprint_1.sql`
- `backend/.env.example`
- `backend/package.json`
- `backend/src/config/env.ts`
- `backend/src/db/migrate.ts`
- `backend/src/db/pool.ts`
- `backend/src/server.ts`
- `backend/src/observability/logger.ts`
- `backend/src/services/readinessService.ts`
- `backend/src/routes/health.ts`
- `backend/src/middleware/errors.ts`

### SSRF, storage, and image handling

- `backend/src/security/safeRemoteImage.ts`
- `backend/src/utils/images.ts`
- `backend/src/services/mediaUploadService.ts`
- `backend/src/integrations/openai.ts`
- `backend/src/integrations/s3.ts`
- `backend/src/routes/logs.ts`
- `backend/src/routes/progress.ts`
- `backend/src/routes/me.ts`
- `backend/src/routes/bodyComposition.ts`

### Authentication and deletion

- `backend/src/middleware/auth.ts`
- `backend/src/routes/auth.ts`
- `backend/src/routes/admin.ts`
- `backend/src/services/accountDeletionService.ts`
- `frontend/src/components/AuthStateGuard.tsx`
- `frontend/src/components/auth/AuthPanel.tsx`
- `frontend/src/lib/ascendApi.ts`
- `frontend/src/lib/authReturn.ts`

### Timezone and jobs

- `backend/src/utils/userTime.ts`
- `backend/src/routes/ai.ts`
- `backend/src/routes/compliance.ts`
- `backend/src/routes/reports.ts`
- `backend/src/jobs/complianceJob.ts`
- `backend/src/jobs/riskAlertJob.ts`
- `backend/src/jobs/runDailyJobs.ts`
- `backend/src/services/coachPresenceService.ts`
- `backend/src/services/momentumV2Service.ts`
- `backend/src/services/notificationService.ts`
- `backend/src/services/progressComparisonService.ts`

### Frontend observability

- `frontend/src/app/error.tsx`
- `frontend/src/app/global-error.tsx`
- `frontend/src/lib/clientObservability.ts`
- `frontend/next-env.d.ts`
- `frontend/package.json`

### Tests, dependencies, and documentation

- `backend/src/tests/accountDeletionService.test.ts`
- `backend/src/tests/authProvision.test.ts`
- `backend/src/tests/migrationSafety.test.ts`
- `backend/src/tests/readiness.test.ts`
- `backend/src/tests/security.test.ts`
- `backend/src/tests/userTime.test.ts`
- `package.json`
- `package-lock.json`
- `docs/security/SSRF_AND_MEDIA_UPLOADS.md`
- `docs/operations/ACCOUNT_DELETION_RUNBOOK.md`
- `docs/operations/STARTUP_MIGRATION_OBSERVABILITY_RUNBOOK.md`
- `docs/operations/BACKUP_AND_RESTORE_RUNBOOK.md`
- `docs/PRODUCTION_REMEDIATION_SPRINT_1_2026-08-15.md`

## Remaining risks and release conditions

1. Run two backend migration processes concurrently against an ephemeral PostgreSQL clone and preserve lock/checksum evidence.
2. Deploy to isolated staging, exercise controlled upload rejection and attachment with test S3 credentials, and confirm abandoned-object cleanup.
3. Exercise refresh, deep-link, expired token, revoked token, logout, and back-button auth recovery on desktop, iPhone Safari/PWA, Android Chrome, and the native wrapper using disposable accounts.
4. Inject Firebase and S3 deletion failures in staging and confirm scheduled retry reaches `completed` without restoring access.
5. Configure an external log/metrics/crash provider and verify every documented alert with a test signal.
6. Capture provider evidence for PostgreSQL backup/PITR, object versioning/recovery, retention, encryption, and access controls; complete the first isolated restoration rehearsal.
7. Model a gym reporting timezone before removing server-calendar semantics from cross-client trainer/owner aggregates.
8. Monitor the six accepted Firebase Admin transitive advisories and remove the acceptance when a compatible forward upgrade is available.

## Updated readiness score

| Category | Before | After |
| --- | ---: | ---: |
| Reliability | 58 | 72 |
| Security | 55 | 78 |
| Data integrity | 67 | 78 |
| Scalability | 48 | 57 |
| Maintainability | 56 | 66 |
| Observability | 35 | 64 |
| Test confidence | 58 | 69 |
| Overall production readiness | 61 | **74** |

## Recommendation

**CONDITIONAL GO** for isolated staging and controlled closed testing.

**NO-GO for unrestricted public launch** until the real-database migration rehearsal, physical-device auth recovery, staging provider deletion/upload tests, external alerting, and backup/restore evidence are complete.

# Ascend Production Verification Sprint 2

**Date:** 15 August 2026

**Worktree:** `C:\Users\Admin\Documents\Codex\ascend-production-remediation-sprint-1`

**Branch:** `codex/production-verification-sprint-2`

**Source/Sprint 1 commit:** `92f6b06d46bfbae6909e34b04c9fdc628b87c3a6`

**Production access/deployment:** None

**Test data:** Disposable PostgreSQL, Firebase Auth Emulator, and isolated S3-compatible storage only

## Executive summary

Sprint 2 materially increases confidence in the Sprint 1 safeguards. Real PostgreSQL migrations, concurrent deploy locking, rollback, startup failure, readiness recovery, storage validation, staged account deletion, and backup restoration were exercised against isolated running providers. The verification found and fixed four concrete defects: an unhandled idle PostgreSQL pool error, an invalid `/me` grouping query, loss of PostgreSQL `Date` values in deletion-stage evidence, and an invalid `progress_photos.image_url` query in Ascend Memory. A trainer-detail request waterfall was also safely parallelized.

The result is a **CONDITIONAL GO for controlled staging/closed testing** and a **NO-GO for unrestricted public release**. Physical-device authentication recovery, approved external alert delivery, production-provider backup configuration, and production-like client performance remain unverified. The analytics foundation is typed and partially active, but provider lifecycle, trainer invitation/connection, and notification-open events are defined rather than wired.

## Environment and commands

The disposable environment used PostgreSQL 17 on `127.0.0.1:55432`, Firebase Auth Emulator on `127.0.0.1:59099`, and two isolated S3-compatible buckets on `127.0.0.1:59000`. No production URL, account, database, or bucket was used.

Representative commands:

```powershell
npm run db:migrate --workspace backend
npm run test --workspace backend -- productionStorage.integration.test.ts
node scripts/verification/benchmark-http.mjs <isolated-url> 100
pg_dump --format=custom --file=<isolated-dump> <isolated-db>
pg_restore --dbname=<separate-restore-db> <isolated-dump>
```

Secrets and disposable credentials are intentionally omitted. Detailed command helpers are under `scripts/verification/`.

## PostgreSQL evidence

| Verification | Result | Evidence |
| --- | --- | --- |
| Clean replay | PASS | 25 checksummed migrations; 55 public tables |
| Upgrade from migrations 001-024 | PASS | Migration 025 applied once; `media_uploads` present |
| Migration 025/full runner repeated | PASS | No duplicate records or schema errors |
| Two concurrent migrators | PASS | Advisory lock serialized both processes; 25 distinct rows; 025 once |
| Checksum mismatch | PASS | Tampered applied migration rejected |
| Failed migration rollback | PASS | Deliberately created relation and migration record both absent after failure |
| Required initialization failure | PASS | Dead database caused exit code 1; API never listened |
| Database outage/recovery | PASS after fix | Liveness remained 200, readiness changed 200 -> 503 -> 200 |
| Full integration suite with providers | PASS | 45 files passed, 1 skipped; 232 tests passed, 1 skipped |

### Defects found

1. An idle node-postgres client emitted `57P01` on the pool and terminated the process. `pool.on("error")` now records a redacted structured error while readiness exposes the outage and the pool reconnects after recovery.
2. Real `/me` authentication returned PostgreSQL `42803` because `g.timezone` was not grouped. The query now groups by `g.timezone` and returned 200 with a real emulator token.

## Upload and storage evidence

| Case | Result |
| --- | --- |
| Valid JPEG, PNG, WebP | PASS |
| Server-owned random key and normalized metadata | PASS |
| Cross-user and cross-purpose attachment | DENIED |
| Malformed/disguised/unsupported content | REJECTED |
| Oversize, 8,001 px edge, 42 MP decoded image | REJECTED |
| Per-minute and daily quotas | PASS |
| Abandoned pending and interrupted-like stale cleanup | PASS |
| Provider unavailable during upload | PASS: failed record, `UPLOAD_FAILED`, no object |
| Rejected object residue | None observed |
| Sensitive URL/credential/image logging | None observed in structured request logs |

The product supports only single-frame JPEG/PNG/WebP. A GIF was rejected as unsupported; a true accepted-format multi-frame fixture was not proven. The optional remote Food AI fetch remained disabled because no staging allowlist was approved. Unit coverage rejects private, loopback, mixed-address, redirect, IPv6, and non-allowlisted targets, but a real remote host was not contacted.

## Account deletion evidence

| Scenario | API/workflow result |
| --- | --- |
| Successful deletion | 200 only after Firebase, storage, and database stages; auth user absent, DB user absent, object absent |
| Firebase failure | 202/retry; resumed at Firebase and completed on attempt 2 |
| Storage failure | 202/retry; Firebase stage not repeated; completed on attempt 2 |
| Database completion failure | 202/retry; Firebase/storage not repeated; completed on attempt 2 |
| Paid/business dependency | 202/manual review; destructive stages not started |
| Deletion-pending access | 403 |
| Logs | Request/stage/bounded code only; no personal data observed |

PostgreSQL returned stage timestamps as `Date` objects in real execution. The workflow now serializes those to ISO timestamps, preserving durable completed-stage evidence.

## Authentication matrix

| Journey | Emulator + real API | Desktop Chrome | iPhone Safari | iPhone PWA | Android Chrome | Android native |
| --- | --- | --- | --- | --- | --- | --- |
| Normal login/new token | PASS | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Missing/invalid token | PASS (401) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Disabled account | PASS (401) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Deleted/deletion-pending | PASS (403/purged) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Protected deep link/safe return | Unit PASS | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Hostile external return URL | Unit PASS | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Refresh, logout, browser back | API only | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Background/resume/network loss | N/A | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Expired/revoked token recovery | Invalid-token rejection PASS; full client flow NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |

Physical-device authentication recovery remains a public-release blocker.

## Observability and alert matrix

Structured logs redact user IDs and sensitive key categories. Request IDs correlate API events; readiness and in-memory metrics expose latency, 4xx/5xx, external failures, and job outcomes. The database outage, invalid SQL, storage failure, Firebase deletion failure, and account-deletion retry produced bounded structured signals.

| Signal | Internal signal | External alert destination |
| --- | --- | --- |
| Backend unhandled/API exception | PASS | NOT VERIFIED |
| Frontend crash hook | Implemented; browser delivery NOT VERIFIED | NOT VERIFIED |
| Elevated API error rate/slow response | Metrics PASS | NOT VERIFIED |
| Database unavailable/readiness failure | PASS | NOT VERIFIED |
| Firebase/S3 failures | PASS | NOT VERIFIED |
| AI failure | Unit/instrumentation present; real provider NOT VERIFIED | NOT VERIFIED |
| Scheduled-job failure | Instrumentation present; injected delivery NOT VERIFIED | NOT VERIFIED |
| Deletion retry exhaustion | Workflow signal present; external alert NOT VERIFIED | NOT VERIFIED |

No monitoring provider was already approved or configured, so none was invented. Metrics remain process-local and do not aggregate across instances. External alert delivery and multi-instance observability are public-release blockers.

## Backup restoration report

A known user, food log, media-upload record, progress-photo relationship, and 68-byte proof object were created in the isolated source environment.

| Measurement | Result |
| --- | --- |
| PostgreSQL custom dump | 207,342 bytes |
| Database restore to separate database | 1.58 seconds |
| Restored migrations | 25 |
| Restored known rows | User 1; food 1; media 1; progress photo 1 |
| Object restore to separate bucket | 436 ms |
| Object integrity | Byte-for-byte PASS |
| Auth mapping | PASS with disposable emulator identity |
| Critical restored journeys | `/me`, food history, and progress photo reference PASS |

Production provider backups, PITR, retention, encryption, object versioning, and backup access controls were not accessible from the repository and are **NOT VERIFIED**. Firebase Auth cannot be assumed to restore transactionally with PostgreSQL.

## Performance evidence

Backend measurements are sequential local requests against isolated providers. They establish query/API baselines, not mobile Core Web Vitals.

| Endpoint | Iterations | p50 ms | p95 ms | p99 ms | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| Readiness | 100 | 1.17 | 4.57 | 6.14 | 200 |
| `/me` baseline | 100 | 7.72 | 11.86 | 13.66 | 200 |
| Subscription/free baseline | 100 | 6.91 | 13.59 | 23.29 | 200 |
| Restored `/me` | 40 | 16.74 | 30.13 | 100.97 | 200 |
| Food history | 40 | 16.25 | 24.89 | 159.07 | 200 |
| Progress photos | 40 | 17.16 | 38.44 | 210.36 | 200 |
| Subscription | 40 | 15.59 | 24.80 | 84.07 | 200 |
| Compliance | 40 | 30.04 | 48.16 | 262.00 | 200 |
| Streak | 40 | 15.34 | 22.86 | 111.12 | 200 |
| Goal | 40 | 14.96 | 20.83 | 87.05 | 200 |
| Health summary | 40 | 14.34 | 18.81 | 76.11 | 200 |
| Coach Presence | 40 | 24.26 | 34.27 | 95.38 | 200 |
| Nutrition | 40 | 16.65 | 23.12 | 96.94 | 200 |
| Ascend Memory before fix | 40 | N/A | N/A | N/A | 500 (40/40) |
| Ascend Memory after fix | 40 | 10.57 | 20.84 | 117.62 | 200 (40/40) |

### Bottleneck review and before/after

| Original concern | Evidence | Action/result |
| --- | --- | --- |
| Auth/role query per protected request | Present; simple local `/me` p95 11.86 ms | No cache introduced because revocation/role freshness is security-sensitive |
| Member dashboard fan-out | Roughly 20 endpoints; core and secondary groups already parallel and share request cache | No speculative change |
| Trainer detail fan-out | Profile request completed before 12 independent requests started | Secondary requests now start with profile, saving one profile round trip; browser timing still NOT VERIFIED |
| Google Play sync during subscription reads | Code awaits provider sync for Google Play users; free baseline cannot measure provider latency | Not changed without a real provider baseline; remains a risk |
| Serial all-user jobs | Compliance/notification loops are serial | Not changed without scale/load evidence; remains a risk |

LCP, INP, CLS, FCP, TBT, transferred JavaScript/image bytes, simulated 4G, cold/warm cache, AI-photo latency, and physical iPhone/Android journeys are **NOT VERIFIED** in this isolated backend rehearsal. They require a deployed non-production frontend and physical/device-lab pass.

## Analytics foundation

The typed catalogue and metric definitions are documented in `docs/PRODUCT_ANALYTICS.md`. Eleven event types are active at server-confirmed business boundaries; six are schema-defined but deliberately not inferred without exact delivery/provider confirmation. Validation, environment separation, test-account tagging, opt-out, idempotency, and safe failure behavior are covered by tests. No external analytics provider is configured, and no historical metrics are invented.

## Files changed

- Database/auth/recovery defects: `backend/src/db/pool.ts`, `backend/src/middleware/auth.ts`, `backend/src/services/accountDeletionService.ts`, `backend/src/services/ascendMemoryService.ts`
- Analytics: `backend/src/services/productAnalyticsService.ts`, `backend/src/routes/auth.ts`, `backend/src/routes/logs.ts`, `backend/src/routes/me.ts`, `backend/src/routes/progress.ts`
- Performance: `frontend/src/components/trainer/TrainerClientDetailClient.tsx`
- Tests: database pool, analytics, real storage, and storage failure integration tests under `backend/src/tests/`
- Verification helpers: `scripts/verification/`
- Documentation: this report, `docs/PRODUCT_ANALYTICS.md`, and the backup runbook

## Remaining risks

### Release blockers for public launch

1. Physical-device authentication and recovery matrix is incomplete.
2. No approved external monitoring destination has received test alerts; metrics are single-instance.
3. Production/staging provider backup, PITR, retention, encryption, and object-versioning configuration is unverified.
4. Production-like frontend/mobile performance and Core Web Vitals are unmeasured.

### High/medium follow-up

1. Activate trainer, subscription, and notification analytics only at exact confirmation boundaries.
2. Measure Google Play subscription sync with sandbox/provider latency and move synchronization out of reads only if evidence supports it.
3. Load-test and then batch/paginate serial all-user scheduled jobs.
4. Exercise the optional remote Food AI allowlist against an approved controlled host.
5. Add accepted-format multi-frame fixtures if the decoder can produce them reliably.

## Updated readiness score

| Area | Score |
| --- | ---: |
| Migration/database safety | 9.4/10 |
| Upload/storage safety | 9.0/10 |
| Account deletion/recovery | 9.1/10 |
| Authentication/API enforcement | 8.2/10 |
| Observability | 6.5/10 |
| Backup/recovery | 7.0/10 |
| Performance evidence | 6.8/10 |
| Product analytics | 7.4/10 |
| Overall public-release readiness | **7.9/10** |

## Final validation

| Gate | Result |
| --- | --- |
| `npm run lint` | PASS: zero errors; three pre-existing Next.js internal-navigation warnings |
| `npm run test` | PASS: 45 files passed, 2 skipped; 225 tests passed, 9 skipped |
| Real storage integration | PASS: 8/8 tests against isolated PostgreSQL and S3-compatible storage |
| `npm run build` | PASS: shared/backend TypeScript and production frontend; 42 routes generated |
| `npm run android:sync` | PASS: six Capacitor plugins synchronized |
| `npm run android:debug-apk` | PASS: Gradle `BUILD SUCCESSFUL`; debug APK generated |
| `git diff --check` | PASS |

Gradle reported existing `flatDir` and Gradle 9 deprecation warnings, but no build error. The test runner's skipped cases are opt-in provider/failure integration paths; the real storage path was run separately and passed.

## Recommendation

**CONDITIONAL GO** for isolated staging and controlled closed testing. **NO-GO** for unrestricted public release until the four public-release blockers above are verified. No merge, deployment, production mutation, or provider configuration change was performed in Sprint 2.

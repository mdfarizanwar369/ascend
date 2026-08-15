# Startup, Migration, And Observability Runbook

## Startup contract

The supported backend start command is:

```text
npm run start --workspace backend
```

It runs migrations before starting Node. Migrations use a PostgreSQL advisory lock, checksums, and one transaction per file. Concurrent deploys wait on the same database lock. A changed checksum for an already applied migration fails deployment.

After service schema initializers run, the server performs a fresh readiness check. It does not listen unless `users`, `schema_migrations`, `media_uploads`, and migration `026_product_analytics_idempotency.sql` are present.

## Health endpoints

- `GET /api/v1/health/live`: process liveness only; no dependency claim.
- `GET /api/v1/health/ready`: database/schema readiness; returns 503 until ready.
- `GET /api/v1/health`: backward-compatible readiness endpoint.
- `GET /api/v1/health/metrics`: protected by `x-observability-secret` matching `CRON_SECRET`.

All non-health API traffic is gated by readiness and returns a generic 503 while unavailable.

## Logging and metrics

Logs are single-line JSON with timestamp, level, event, request ID, method, route, status, and latency. Keys resembling credentials, tokens, contact details, health/medical data, images, photos, or prompts are redacted. Process-level unhandled errors are captured. In-memory metrics track API latency/errors, external failures, and job outcomes. The frontend emits redacted `ascend:client-error` browser events as a provider-neutral crash-reporting integration point.

No external monitoring provider is configured by this code. Configure the deployment platform to alert when:

- readiness is non-200 for 2 consecutive minutes;
- 5xx responses exceed 2% for 5 minutes or 10 events in 5 minutes;
- p95 API latency exceeds 2 seconds for 10 minutes;
- any daily job fails or has no successful run for 26 hours;
- Firebase, AI, object storage, or remote-image failures exceed 5 in 5 minutes;
- the process restarts more than twice in 10 minutes.

## Migration failure

Do not bypass readiness or edit `schema_migrations`. Preserve logs, verify `DATABASE_URL`, inspect the failed filename/checksum, and test the corrective migration against an isolated restored database. Never rewrite an applied migration; add a new forward migration.

## Concurrency validation

Automated tests verify lock acquisition precedes migration work and release occurs on success/failure. A real two-process PostgreSQL rehearsal was not available during Sprint 1 because the local Docker daemon was not running. Repeat this in CI with an ephemeral PostgreSQL instance before public release.

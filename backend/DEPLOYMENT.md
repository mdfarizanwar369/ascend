# Backend deployment

The HTTP process uses a dedicated PostgreSQL login with data access only. It must
not run migrations or own tables. Keep the migration credential in the database
service/operator environment, outside the backend service.

Before deploying a release with schema changes:

1. Take a database backup and record the healthy deployment to roll back to.
2. Run `npm run db:migrate --workspace backend` with the migration credential.
   This applies numbered migrations and the legacy schema bootstrap. For a live
   database, assess locking and use additive changes compatible with the prior
   release. Migration 041 only adds the AI reservation table and its index.
3. Provision `ascend_app_runtime` with a generated password and
   `NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`; apply
   `backend/scripts/runtime-role-grants.sql` as the schema owner. Verify that
   `PUBLIC` does not grant CREATE on the application schema. Set only this role's
   connection string as the HTTP service's `DATABASE_URL`.
4. Use `backend/railway.json` as the backend service's Railway config file.
   Readiness must pass before traffic moves. The deployment overlaps for 120
   seconds and permits 120 seconds of draining; the server stops accepting new
   requests and gives existing requests up to 110 seconds after SIGTERM.
5. Check `/api/v1/health/ready`, authenticated app reads, and error logs after
   release. Confirm no frontend/native build changes are required.

The previous release automatically ran migrations at startup. A rollback to
that release also needs its previous database credential and healthcheck config;
restore those deliberately before redeploying it. Do not drop the additive AI
table during rollback. Newer releases can roll back using the restricted login.

AI generation uses renewable reservations rather than a checked-out connection.
Per-user reservations protect meal and chat allowances and daily workouts.
The active Gemini provider is limited to eight requests across backend instances,
with up to 24 local waiters for at most ten seconds. Overflow returns HTTP 429
with a retry hint. These limits do not change subscription allowances. Set
`AI_PROVIDER_MAX_CONCURRENT`, `DATABASE_POOL_MAX` and
`DATABASE_CONNECT_TIMEOUT_MS` only after measuring capacity.

CI provisions an isolated PostgreSQL database and runs concurrency tests through
the restricted role. Tests exercise parallel work, duplicate requests, failure
recovery, expired reservations and permission boundaries without live AI calls.

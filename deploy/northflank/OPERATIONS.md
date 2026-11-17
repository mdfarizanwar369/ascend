# Ascend hosting

The public iOS application keeps `https://www.getascend.fit/launch` as its start address. Firebase authentication and the existing private R2 photo bucket remain in use.

Cloudflare routes `getascend.fit/*` and `www.getascend.fit/*` through `ascend-northflank-router`. The router sends `/api/v1/` requests directly to the Northflank API and sends other requests to the Northflank frontend. Direct API routing avoids Next.js's default rewrite timeout for longer AI requests. Preserve the request method, query, authorization, edition headers, and exact webhook body bytes.

Keep both public DNS records proxied through Cloudflare and keep the Worker routes enabled. Cloudflare supplies the public domain's TLS certificate; upstream connections use Northflank's certified `code.run` addresses. Removing the router requires first assigning and certifying the custom domains on Northflank.

The Northflank Developer Sandbox runs two single-instance `nf-compute-20` services and one private PostgreSQL 18 addon. Each service has 512 MB memory and 0.2 CPU. The database uses verified TLS and a separate application role without database, role, schema-creation, or RLS-bypass privileges. Apply future schema migrations through a separately protected administrative connection.

## Deployment

Build the repository root using `deploy/northflank/backend.Dockerfile` or `deploy/northflank/frontend.Dockerfile`. The frontend uses the `/api/v1` public API path, standalone webpack output, and the existing public Firebase and feature settings as build arguments. Supply `ASCEND_API_PROXY_ORIGIN` for direct Northflank preview URLs. Production traffic uses the Cloudflare router's direct API path.

Keep application secrets in Northflank runtime settings. Do not put database credentials, Firebase private keys, payment keys, APNs keys, backups, or production exports in Git. Preserve the application's existing feature flags rather than enabling experimental features during a hosting change.

Deploy the Cloudflare router with the account's existing authenticated Wrangler session:

```powershell
npm exec --yes --package wrangler@4.164.0 -- wrangler deploy --config deploy/cloudflare/wrangler.jsonc
```

The router config uses public zone names; select the intended Cloudflare account when prompted. The deployed account-specific config and protected migration records are stored outside this repository. No paid upgrade is required by these deployment files. Free tiers still have resource and request limits and do not guarantee uninterrupted service.

## Legacy API compatibility

The former Railway API address is retained as a small streaming proxy to Northflank. It serves saved Siri/widget API addresses and callbacks that have not yet changed destinations. The bridge never connects to PostgreSQL. `ASCEND_BRIDGE_MAINTENANCE=false` enables forwarding; otherwise it returns a retryable maintenance response. The fixed upstream allowlist prevents forwarding to arbitrary destinations.

The image supports both `node server.cjs` and the former `node backend/dist/src/server.js` entrypoint. Use `/_migration/health` for the bridge's own health and `/api/v1/health/ready` for upstream readiness after maintenance ends. Preserve the existing public port. Disconnect the legacy service's GitHub source: a variable change can otherwise rebuild the original application instead of the uploaded proxy image. Upload the bridge directory explicitly when deploying it.

Native Siri reconciliation runs on sign-in and app focus and passes the current absolute API URL to the native plugin. Opening the updated app therefore replaces a saved Railway API origin. Retain the bridge until the Apple notification URLs and remaining saved connections are verified. A running bridge and old test deployments can still incur Railway charges.

Stripe and both Apple production and sandbox notification URLs were moved directly to the Northflank API during cutover. Keep the bridge for saved legacy connections until their retirement is separately verified.

## Data and rollback

Before moving production writes, stop the old writer, hold its database read-only, take a fresh verified dump, replace only the isolated target copy, and compare all table row fingerprints. Enable a single production notification worker only after the old worker has stopped.

After cutover, Northflank owns new writes. Roll back application code against that current database when possible. Do not point users at the pre-migration Railway snapshot: it becomes stale as soon as Northflank accepts a write. A platform rollback requires draining writes and the worker, backing up the latest Northflank data with a compatible PostgreSQL client, restoring and comparing that current data, and then reopening exactly one primary. The original Railway volume is retained for recovery; stopping compute does not remove its data.

## Validation limits

Production builds, unit and database integration suites, iOS packaging checks, authenticated cloud CRUD, photos, native request headers, Siri/widget contracts, notification-device registration, signed webhook transport, and a live AI estimate were checked during migration. Synthetic accounts and their uploaded images were removed. Physical iPhone behavior, StoreKit purchases, actual push delivery, and Apple Health hardware imports require device acceptance. Do not describe server checks as a completed physical-device test.

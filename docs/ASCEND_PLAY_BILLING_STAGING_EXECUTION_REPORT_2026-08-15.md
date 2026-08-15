# Ascend Play Billing and Isolated Staging Execution Report

## Executive status

The reversible implementation is complete at source-code and local-build level. A clean isolated Railway Postgres service has been provisioned and all 27 migrations have been replayed successfully, including idempotent and concurrent-migrator verification.

The programme is intentionally stopped before deployment, Play product activation, AAB generation, or upload because mandatory external gates are not satisfied:

1. Firebase rejected creation of a separate staging project because the owner account has reached its project quota.
2. The unavailable Firebase project also blocks a separate Gemini staging project/key and staging Android Firebase configuration.
3. Cloudflare requires the owner to reauthenticate before a separate R2 bucket and scoped token can be created.
4. Monthly/yearly Google Play prices have not been approved.
5. License testers, Developer API access, and staging Pub/Sub RTDN have not been configured.
6. Explicit AAB upload approval has not been given.

Production services, databases, storage, Firebase, Stripe, Play releases, tester lists, package name, and signing chain remain unchanged.

## Source and Git safety

- Source release candidate: `d92d02b213fd7e8aa353a563b664b533cbae3da1`
- Isolated worktree: `C:\Users\Admin\Documents\Codex\ascend-staging-play-billing-v1`
- Branch: `codex/ascend-staging-play-billing-v1`
- Previous Sprint 1-3 worktree: unchanged
- Production branch: not merged and not deployed

## Implemented architecture

### Unified entitlements

Migration `027_unified_entitlements_google_play.sql` adds:

- `subscription_entitlements`
- `subscription_provider_tokens`
- `google_play_rtdn_events`
- `google_play_reconciliation_jobs`
- `billing_audit_events`
- Auditable `promotional` provider support
- Idempotent backfill of legitimate non-Play subscription sources

An authoritative entitlement service grants access while any verified source remains active. Active, grace, trial, and canceled-paid-through records stop granting access at their expiry timestamp. Expiry of one provider does not remove access from another.

### Google Play purchase flow

1. Native Android queries Play product and offer details.
2. Ascend supplies an HMAC-obfuscated account identifier.
3. Billing Library 9.1.0 launches the selected exact offer.
4. The native bridge sends the purchase token to the authenticated backend.
5. The backend verifies package, product, base plan, purchase state, expiry, and account binding using Android Publisher `subscriptionsv2`.
6. The backend commits the entitlement before acknowledgement.
7. The backend acknowledges through Google only after access is persisted.
8. Failed acknowledgement is queued for bounded exponential retry.
9. The client refreshes from the backend entitlement response.

Pending purchases never grant access. Tokens are AES-256-GCM encrypted at rest and separately SHA-256 hashed for uniqueness. Raw tokens are not logged, placed in audit evidence, or returned after verification.

### RTDN

The backend contains an authenticated Pub/Sub push endpoint with Google OIDC audience/service-account verification, exact package validation, message-ID deduplication, safe payload storage, fresh Developer API reconciliation, retry, and dead-letter handling. Provisioning and lifecycle verification remain blocked until a staging Google project and Developer API permissions exist.

### Platform billing

- Web/PWA: `web_stripe`; existing Stripe checkout and portal remain intact.
- Android: compiled `google_play` or safe `disabled`; hosted Stripe actions are hidden.
- iOS: no IAP implementation; hosted checkout remains hidden in native context.
- Existing verified Stripe subscribers retain entitlement on Android.
- Google Play subscribers retain entitlement on web but are directed to Google Play for management.

## Isolation controls

Staging backend startup fails closed for:

- Missing production database fingerprint control
- Exact production database fingerprint match
- Production Firebase/domain markers
- Production R2 bucket match
- Production frontend/CORS domains
- Live Stripe secret keys
- Live email or push delivery
- Production/missing analytics or monitoring labels
- Enabled scheduled jobs
- Invalid Play package/product IDs
- Missing Play token encryption or account-obfuscation secrets when billing is enabled

Android staging release tasks fail if isolated Firebase values are absent or production Firebase is detected. Staging frontend renders a persistent `STAGING` banner and sends `noindex,nofollow`/robots exclusion.

## Railway staging evidence

- Project: existing Ascend Railway project (`beautiful-commitment`)
- Environment: `ascend-play-billing-staging`
- Environment ID: `9c920045-41bf-4714-935c-7f44a3fb7fb6`
- PostgreSQL service ID: `c1ff4116-feba-4b7e-85a5-5ac96f164aa4`
- Database image: PostgreSQL 18 SSL template
- Volume: isolated 5 GB volume
- Replicas: 1
- Deployment status: success/running
- Public TCP proxy: removed after migration verification; database is private-only
- Production data copied: none

Migration evidence:

- Clean replay: migrations 001 through 027 passed
- Checksum/idempotent replay: passed
- Two concurrent migrators: both exited 0 and serialized through the advisory lock
- Failure rollback/advisory unlock: covered by existing migration safety tests

The temporary local migration connection used encrypted transport with driver certificate verification disabled only for the self-signed Railway staging database certificate. No repository or production TLS setting was weakened.

## Validation evidence

- Lint: passed with zero errors; three pre-existing frontend warnings outside this branch
- Tests: 237 passed across 48 files; 9 tests in 2 provider-backed storage files remain environment-gated
- Production web/backend/shared build: passed
- Android sync: passed
- Android debug APK: passed
- Billing dependency: `com.android.billingclient:billing:9.1.0`
- Debug APK: `android/app/build/outputs/apk/debug/app-debug.apk`
- Debug APK SHA-256: `507AA7F239BE0E1A4158A83132C0D60D81203BD8968B23F320B87BCE1D6410F3`
- Dependency audit: zero critical/high; six moderate transitive advisories in the existing Firebase/Google dependency chain
- Release AAB: not generated because isolated staging Firebase configuration is mandatory

Skipped tests:

- Production storage verification suite: gated behind explicit provider credentials to avoid touching production
- Production storage interruption suite: gated for the same reason

No skipped physical-device, Play lifecycle, Food AI staging, monitoring, restore, or performance test is represented as passed.

## Product configuration checkpoint

| Product | Base plan | Period | Current web reference | Play price |
| --- | --- | --- | --- | --- |
| `ascend_premium_monthly` | `monthly` | P1M | RM19.99/month | Approval required; parity recommended |
| `ascend_premium_yearly` | `yearly` | P1Y | No approved web yearly plan | Approval required; do not infer |

No product was created or activated. Recommended first closed-test configuration is monthly parity, no trial, license testers only. Yearly should remain inactive until its commercial price is approved.

## Resources not created

- Railway staging frontend: blocked by Firebase staging dependency
- Railway staging backend: blocked by Firebase/R2/Gemini staging dependencies
- Staging URLs: none
- Firebase staging project/apps: project quota blocker
- Gemini staging project/key/budget alerts: Google project quota blocker
- Cloudflare R2 staging bucket/token: owner reauthentication required
- Monitoring project: no approved connected provider; no paid account opened
- Google Pub/Sub RTDN topic/subscription: Google project blocker
- Play products/base plans: price approval blocker
- License-test purchases: product/tester blocker
- Closed Alpha upload: prohibited until all gates and explicit approval

## Current cost impact

The only new running resource is one isolated Railway PostgreSQL service with a 5 GB volume. Railway remains usage-based; an exact monthly projection and account-level USD 30 alert still require console confirmation. No Firebase, Gemini, R2, monitoring, or Play charge was created.

## Remaining verification

After the external blockers are cleared:

1. Create isolated Firebase web/Android apps and add upload/Play signing SHA fingerprints.
2. Create isolated R2 bucket/scoped token and 30-day cleanup policy.
3. Create isolated Gemini key with USD 5/USD 8 alerts and USD 10 ceiling.
4. Create staging backend/frontend services from this branch and configure all isolation variables.
5. Configure Play Developer API least privilege and authenticated staging Pub/Sub RTDN.
6. Approve product prices and configure products/base plans without public rollout.
7. Build and inspect a signed staging AAB with a fresh unused version code.
8. Obtain explicit upload approval, then upload only to existing Closed testing - Alpha.
9. Run the complete license-test lifecycle, Stripe cross-provider regression, Food AI, physical-device, alert, restore, and performance matrices.

## Release decisions

| Area | Decision | Reason |
| --- | --- | --- |
| Source implementation | GO for review | Compiles, tests, and debug-builds on isolated branch |
| Railway staging database | GO | Isolated, migrated, idempotent, concurrency verified |
| Staging deployment | NO-GO | Firebase/R2/Gemini resources incomplete |
| Stripe web billing | GO at source level | Existing web flow preserved; live regression still required |
| Google Play Billing | NO-GO for testers | No Play products, credentials, RTDN, or license-test evidence |
| Closed Alpha upload | NO-GO | Mandatory gates and explicit upload approval absent |
| Android public release | NO-GO | Staging lifecycle/device evidence incomplete |
| Overall public release | NO-GO | Public release prerequisites intentionally unmet |

## Rollback

Delete the isolated Railway environment and its Postgres service, revoke any later staging-only provider credentials, disable later Play products/RTDN, and delete this feature branch. Production requires no rollback because it was never modified.

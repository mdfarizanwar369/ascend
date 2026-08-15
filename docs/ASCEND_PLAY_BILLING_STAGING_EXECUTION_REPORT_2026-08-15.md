# Ascend Play Billing and Isolated Staging Execution Report

Date: 2026-08-15

## Executive summary

Ascend now has a working, isolated staging environment for Google Play Billing preparation. The staging frontend, backend, PostgreSQL database, Firebase project, Gemini key, and Cloudflare R2 bucket are separate from production. Synthetic-user authentication, Food AI, private media storage, signed reads, ownership denial, and malformed upload rejection have all been exercised successfully.

No production service was changed. The approved Google Play monthly subscription was created and activated for Malaysia only. No release AAB was generated or uploaded.

## Source and Git safety

- Original implementation checkpoint: `a32c47491dec3cf21c0b587e4d8a96a908bbe0f2`
- Current branch: `codex/ascend-staging-play-billing-v1`
- Current verified source before this documentation update: `f2bd39ef55daefd3a69c219f60a37a909a05f937`
- Worktree: `C:\Users\Admin\Documents\Codex\ascend-staging-play-billing-v1`
- Remote: `origin/codex/ascend-staging-play-billing-v1`
- Production branch: not merged and not deployed

## Railway staging

- Project: `beautiful-commitment`
- Environment: `ascend-play-billing-staging`
- Environment ID: `9c920045-41bf-4714-935c-7f44a3fb7fb6`
- PostgreSQL service ID: `c1ff4116-feba-4b7e-85a5-5ac96f164aa4`
- Backend service: `ascend-backend-staging`
- Backend URL: `https://ascend-backend-staging-ascend-play-billing-staging.up.railway.app`
- Frontend service: `ascend-frontend-staging`
- Frontend URL: `https://ascend-frontend-staging-ascend-play-billing-staging.up.railway.app`
- Backend deployment: successful
- Frontend deployment: successful
- Source branch binding: staging branch only
- Production data copied: none

Health verification:

- `/api/v1/health/live`: HTTP 200
- `/api/v1/health/ready`: HTTP 200
- `/api/v1/health/storage`: HTTP 200
- Migration `027`: applied to staging only
- Staging database fingerprint differs from production

The frontend displays `ASCEND STAGING - TEST DATA ONLY`, sends `noindex, nofollow`, and serves a `Disallow: /` robots policy.

## Firebase and Google OAuth staging

- Project ID: `gen-lang-client-0096825107`
- Display name: Ascend Staging
- Plan: Spark, with no billing account linked
- Separate Firebase web and Android apps are registered
- Android package: `fit.getascend.app`
- Email/password authentication: enabled
- Google authentication: enabled
- Upload, debug, and Google Play App Signing SHA-1/SHA-256 fingerprints: registered
- Railway staging frontend: added to Firebase authorized domains
- Staging web OAuth origin and Firebase handler redirect: configured
- Staging Android `google-services.json`: local ignored file only
- Backend Firebase Admin credentials: staging-only Railway secret

Browser verification reached Google's account chooser with the staging OAuth client and staging redirect URI. No personal Google account was selected during this check.

Google prevents duplicate Android package/fingerprint OAuth clients across projects. The documented existing Android OAuth client safelist remains in place while Firebase users, web OAuth, backend credentials, and data remain isolated.

## Gemini staging

- Provider: Gemini API
- Model: `gemini-3.6-flash`
- Credential: staging-project key stored only in Railway
- Production Gemini credential reused: no
- Staging application limits: 50 calls/day, 10 calls/user/day, 500 calls/month
- Google project billing: not linked; current direct Google cost is USD 0

An authenticated Food AI smoke initially found a real model-compatibility defect: Gemini 3.6 used most of a 700-token response budget for reasoning and truncated the structured JSON. The backend now applies Gemini 3.x's supported minimum thinking budget of 128 while preserving the Gemini 2.5 zero-thinking behavior. A regression test covers both model families.

After redeployment, authenticated Food AI text analysis returned HTTP 200 with a valid structured estimate. No fallback was used.

USD 5 and USD 8 provider budget alerts cannot be configured without linking a billing account. Application limits remain the active cost guardrail. Linking billing requires owner approval.

## Cloudflare R2 staging

- Bucket: `ascend-staging-media`
- Location: APAC
- Storage class: Standard
- Public access: disabled
- Token: bucket-scoped Object Read & Write
- Production bucket access: denied
- Object expiration: 7 days
- Incomplete multipart cleanup: 7 days
- Credentials: Railway staging secrets only

Verified behavior:

- Direct S3 upload/read/delete: passed
- Authenticated Ascend upload: HTTP 200
- Food log attachment: HTTP 201
- Signed private read: HTTP 200
- Cross-user object reuse: rejected
- Unsupported data URL upload: rejected
- Production bucket access with staging token: `AccessDenied`

The original staging token was revoked after credential handling review and replaced. Only the replacement credential is active.

## Synthetic end-to-end smoke

Two disposable `@example.com` Firebase staging users were created. No production user was copied.

| Check | Result |
| --- | --- |
| User 1 provision | HTTP 201 |
| User 2 provision | HTTP 201 |
| Authenticated `/me` | HTTP 200 |
| Food AI text estimate | HTTP 200, valid structured data |
| Private image upload | HTTP 200 |
| Save food log | HTTP 201 |
| Signed image read | HTTP 200 |
| Cross-user image attachment | Rejected |
| Malformed upload | Rejected |

Post-smoke staging log scan found no bearer tokens, API keys, private keys, image data URLs, email addresses, production domain markers, or production bucket markers. No Food AI failure occurred after the Gemini configuration deployment.

## Production isolation evidence

- Production Railway environment remains separate.
- Production frontend and backend latest deployments remain the pre-staging deployments from 2026-08-14.
- Production services report successful deployment state with running replicas.
- Production storage health remains HTTP 200.
- Production database URL hash does not match staging.
- No production Firebase user, database row, R2 object, Stripe configuration, Play product, or release was changed.

## Implemented billing architecture

Migration `027_unified_entitlements_google_play.sql` adds auditable unified entitlements, encrypted provider tokens, RTDN event deduplication, reconciliation jobs, and billing audit events. Active verified Stripe and Google Play sources can independently grant Premium. Expiring one provider does not remove access granted by another.

Android uses Google Play Billing Library 9.1.0. The backend verifies purchase state through Android Publisher before granting access and acknowledges only after the entitlement is stored. Pending purchases do not grant access. Purchase tokens are AES-256-GCM encrypted at rest and SHA-256 hashed for uniqueness.

RTDN code is implemented but provider resources and lifecycle tests remain gated.

## Validation

- Lint: passed with zero errors and three pre-existing frontend warnings
- Tests: 239 passed, 9 skipped
- Full shared/backend/frontend production build: passed
- Android sync: passed
- Android debug APK before the focused backend-only fix: passed
- Billing dependency: `com.android.billingclient:billing:9.1.0`

## Google Play product checkpoint

The owner approved and the Play Console now contains:

- Product: `ascend_premium_monthly`
- Product name: `Ascend Premium Monthly`
- Base plan: `monthly`
- Type: monthly auto-renewing
- Customer-facing price: MYR 19.99/month, including Malaysia tax handling
- Availability: Malaysia only
- Status: Active
- Trial: none
- Grace period: 7 days
- Account hold: automatic, currently calculated by Play as 53 days
- Resubscribe: enabled
- Yearly: not created
- Benefits: unlimited Coach Zoe conversations; long-term coaching insights; weekly and monthly progress reviews

The product was activated only to support Google Play closed-test purchase validation. No app release was uploaded or promoted.

## Monitoring checkpoint

No approved Better Stack or equivalent monitoring account is connected. Application logging and Railway health checks are available, but external alert delivery has not been configured. Creating an account or accepting provider terms remains an owner action.

## Current cost impact

- Railway: staging PostgreSQL, backend, and frontend are usage-based; exact monthly cost depends on account usage.
- Firebase: Spark plan, USD 0.
- Gemini: no billing account linked; USD 0 direct billed cost, with application call caps active.
- R2: minimal staging usage, subject to Cloudflare's account plan and free allowances.
- Google Play: no products or transactions.
- Monitoring: no account or charge created.

## Remaining gates

1. Configure least-privilege Play Developer API access.
2. Configure staging Pub/Sub RTDN and verify OIDC push authentication.
3. Confirm Closed Alpha testers are also Play licence testers.
4. Decide whether to connect an approved monitoring provider.
5. Build and inspect a staging-connected signed AAB with a new version code.
6. Obtain explicit approval before uploading that AAB.
7. Run the full physical-device purchase lifecycle matrix after installation from Play.

## GO/NO-GO decisions

| Area | Decision | Reason |
| --- | --- | --- |
| Isolated staging services | GO | Deployed and smoke-tested |
| Firebase/Auth staging | GO | Isolated apps and OAuth route verified |
| Gemini Food AI staging | GO | Real authenticated estimate passed |
| R2 staging storage | GO | Private storage and ownership controls passed |
| Source billing implementation | GO for continued testing | Compiles and is covered by tests |
| Play product creation | GO | Approved monthly product is active, Malaysia only, at MYR 19.99 |
| RTDN lifecycle | NO-GO | Provider resources not configured |
| Staging AAB generation | NO-GO | Product/tester/RTDN gates remain |
| Closed Alpha upload | NO-GO | Explicit upload approval absent |
| Production release | NO-GO | Physical purchase lifecycle is unverified |

## Rollback

Delete the Railway staging environment, revoke staging-only Google and R2 credentials, remove staging Firebase apps/project if desired, disable any later Play products/RTDN resources, and delete this branch. Production requires no rollback because it was not modified.

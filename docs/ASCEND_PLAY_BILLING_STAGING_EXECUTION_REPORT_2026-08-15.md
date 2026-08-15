# Ascend Play Billing and Isolated Staging Execution Report

Date: 2026-08-15

## Executive summary

Ascend now has a working, isolated staging environment for Google Play Billing validation. The staging frontend, backend, PostgreSQL database, Firebase project, Gemini key, and Cloudflare R2 bucket are separate from production. Synthetic-user authentication, Food AI, private media storage, signed reads, ownership denial, and malformed upload rejection have all been exercised successfully.

No production service was changed. The approved Google Play monthly subscription is active for Malaysia only. A signed, staging-connected Android App Bundle was generated, inspected, uploaded to the existing Closed testing - Alpha track, and submitted to Google for review. Play Console reports `Changes in review` for version `13 (0.1.4-staging)`.

## Source and Git safety

- Original implementation checkpoint: `a32c47491dec3cf21c0b587e4d8a96a908bbe0f2`
- Current branch: `codex/ascend-staging-play-billing-v1`
- Current verified source before this documentation update: `9641473`
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

RTDN is configured end to end for staging. Google Play publishes to the dedicated
`ascend-play-rtdn-staging` Pub/Sub topic, which pushes authenticated OIDC requests to
the staging backend. A Play Console test notification reached the webhook with HTTP
204 in 116 ms. Real purchase lifecycle tests remain gated on installing a
staging-connected build through Google Play.

## Validation

- Lint: passed with zero errors and three pre-existing frontend warnings
- Tests: 239 passed, 9 skipped
- Full shared/backend/frontend production build: passed
- Android sync: passed
- Android debug APK before the focused backend-only fix: passed
- Billing dependency: `com.android.billingclient:billing:9.1.0`

## Signed staging release

- Package: `fit.getascend.app`
- Version name: `0.1.4-staging`
- Version code: `13`
- Minimum API: 26
- Target SDK: 36
- App environment: `staging`
- Billing channel: `google_play`
- Native logging: `none`
- Remote application URL: staging frontend `/launch`
- AAB: `C:\Users\Admin\Documents\Codex\ascend-staging-play-billing-v1\android\app\build\outputs\bundle\release\app-release.aab`
- Size: 13,424,754 bytes
- SHA-256: `585703D695877594D878ED47AC3FB3D96B8C949B9632944193EB3BCF7179D399`
- Signature verification: passed with `jarsigner`
- Release signer validity: through 2051-06-23
- Code shrinking: R8/minification and resource shrinking passed
- Play artifact attachment: ReTrace mapping file attached automatically

Version code 12 was rejected by Play Console because it had already been used, even though it was not visible in the active release list. The bundle was rebuilt with version code 13 and accepted.

Artifact inspection found one release-blocking staging-isolation defect before upload: `mobile-shell/android-error.html` retried against the production `/launch` URL. Commit `9641473` replaced the fixed URL with an environment-neutral history-back or page-reload action. The rebuilt bundle contains no production Firebase project, private key, Stripe secret, production API redirect, or fixed remote retry URL. The remaining production-domain string is the public privacy-policy URL.

Play Console emitted one non-blocking warning because the bundle contains third-party native libraries without uploaded native debug symbols. The affected libraries are `libdatastore_shared_counter.so`, `libimage_processing_util_jni.so`, and `libsurface_util_jni.so`. This does not block closed testing; Java/Kotlin obfuscation symbols are present through the attached ReTrace mapping file.

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

## Google Play provider validation

- Android Publisher API: enabled in the isolated staging Google Cloud project
- Play service account: active and restricted to the Ascend app with purchase,
  subscription, order-management, and required app-read permissions
- Live API probe: HTTP 200 for `ascend_premium_monthly` / `monthly`, state `ACTIVE`
- RTDN topic: `projects/gen-lang-client-0096825107/topics/ascend-play-rtdn-staging`
- RTDN push subscription: `ascend-play-rtdn-push-staging`
- Push authentication: OIDC using the dedicated keyless
  `ascend-play-rtdn-staging@gen-lang-client-0096825107.iam.gserviceaccount.com`
- Push audience: exact staging webhook URL
- Play test notification: HTTP 204 from the staging webhook in 116 ms
- Licence testing: the existing `Ascend Internal Testers` list is enabled with 10
  users and the licence response is `RESPOND_NORMALLY`
- Staging backend deployment: `0f3ca4ea-7a95-47c9-bba4-4044a1d86df4`, successful
- Staging health: live, ready, and aggregate health endpoints returned HTTP 200
- Latest staging migration: `027_unified_entitlements_google_play.sql`

The downloaded service-account JSON key was placed into Railway's secret variable,
verified by variable name only, and then deleted from the local machine. No secret
value was written to this report or committed to Git.

## Monitoring checkpoint

No approved Better Stack or equivalent monitoring account is connected. Application logging and Railway health checks are available, but external alert delivery has not been configured. Creating an account or accepting provider terms remains an owner action.

## Current cost impact

- Railway: staging PostgreSQL, backend, and frontend are usage-based; exact monthly cost depends on account usage.
- Firebase: Spark plan, USD 0.
- Gemini: no billing account linked; USD 0 direct billed cost, with application call caps active.
- R2: minimal staging usage, subject to Cloudflare's account plan and free allowances.
- Google Play: one active Malaysia-only subscription product; no transactions.
- Monitoring: no account or charge created.

## Google Play closed-test submission

- Track: Closed testing - Alpha
- Release: `13 (0.1.4-staging)`
- Rollout: 100% of the configured closed-test audience
- Submitted: 2026-08-15
- Play status: `Changes in review`
- Console confirmation: `1 change sent for review`
- Production, open testing, and internal testing tracks: unchanged
- Public rollout: not performed

Testers can install this version after Google completes automated checks/review and the release becomes available to the configured Alpha tester audience.

## Remaining gates

1. Wait for Google Play review and processing to complete.
2. Install version 13 from the Alpha tester opt-in flow on a physical Android device.
3. Run the physical-device sandbox lifecycle matrix:
   purchase, acknowledgement, renewal, cancellation, grace period, account hold,
   expiry, refund/revocation, restore, and duplicate-notification handling.
4. Decide whether to connect an approved monitoring provider.
5. Plan a future Railway runtime upgrade from Node 20 before the AWS SDK drops Node
   20 support after January 2027. This is not a current billing blocker.

## GO/NO-GO decisions

| Area | Decision | Reason |
| --- | --- | --- |
| Isolated staging services | GO | Deployed and smoke-tested |
| Firebase/Auth staging | GO | Isolated apps and OAuth route verified |
| Gemini Food AI staging | GO | Real authenticated estimate passed |
| R2 staging storage | GO | Private storage and ownership controls passed |
| Source billing implementation | GO for continued testing | Compiles and is covered by tests |
| Play product creation | GO | Approved monthly product is active, Malaysia only, at MYR 19.99 |
| Play Developer API | GO | Least-privilege service account returned the active product with HTTP 200 |
| RTDN delivery | GO | Authenticated Play test notification reached staging with HTTP 204 |
| Licence tester configuration | GO | Ten-user internal tester list is enabled |
| Staging AAB generation | GO | Signed version 13 built, verified, and environment-scanned |
| Closed Alpha upload | GO / IN REVIEW | Uploaded only to Closed testing - Alpha and submitted to Google review |
| Production release | NO-GO | Physical purchase lifecycle is unverified |

## Rollback

Delete the Railway staging environment, revoke staging-only Google and R2 credentials, remove staging Firebase apps/project if desired, disable any later Play products/RTDN resources, and delete this branch. Production requires no rollback because it was not modified.

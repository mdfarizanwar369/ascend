# Ascend Google Play Billing and Isolated Staging Handoff

Full evidence is in `docs/ASCEND_PLAY_BILLING_STAGING_EXECUTION_REPORT_2026-08-15.md`.

## Current checkpoint

- Branch: `codex/ascend-staging-play-billing-v1`
- Original checkpoint: `a32c47491dec3cf21c0b587e4d8a96a908bbe0f2`
- Current verified source before this documentation update: `9641473`
- Production: unchanged
- Play product: `ascend_premium_monthly` / `monthly`, active for Malaysia only
- AAB: signed version `13 (0.1.4-staging)` uploaded to Closed testing - Alpha and submitted for review

## Working staging services

- Frontend: `https://ascend-frontend-staging-ascend-play-billing-staging.up.railway.app`
- Backend: `https://ascend-backend-staging-ascend-play-billing-staging.up.railway.app`
- Firebase project: `gen-lang-client-0096825107`
- R2 bucket: `ascend-staging-media`
- Gemini model: `gemini-3.6-flash`
- PostgreSQL: isolated Railway service with migrations 001-027

The frontend has a persistent staging banner and search-engine exclusion. Authenticated synthetic-user tests cover Firebase provisioning, `/me`, Food AI, R2 upload, food-log attachment, signed download, cross-user denial, and malformed input rejection.

## Billing flow

```mermaid
flowchart LR
  Web["Web or PWA"] --> Stripe["Stripe Checkout"]
  Stripe --> StripeWebhook["Verified Stripe webhook"]
  Android["Android Play app"] --> Play["Google Play Billing 9.1"]
  Play --> Verify["Backend Android Publisher verification"]
  Verify --> Ack["Server acknowledgement"]
  Play --> RTDN["Authenticated Pub/Sub RTDN"]
  RTDN --> Verify
  StripeWebhook --> Entitlements["Unified entitlement store"]
  Ack --> Entitlements
  Entitlements --> Access["Ascend Premium access"]
```

Web Stripe remains intact. Android hosted Stripe actions are hidden. Google Play purchase state is never trusted from the client. Pending purchases do not grant access.

## Pricing checkpoint

Recommended first closed-test product:

| Product | Base plan | Period | Proposed price | Status |
| --- | --- | --- | --- | --- |
| `ascend_premium_monthly` | `monthly` | P1M | RM19.99 | Active, Malaysia only |
| `ascend_premium_yearly` | `yearly` | P1Y | Not approved | Do not create |

The monthly plan has no trial, a seven-day grace period, automatic account hold, and resubscribe enabled. Google Play displays MYR 19.99 after Malaysia tax handling. The yearly plan remains deferred.

## Provider readiness

- The staging Play service account is active, app-scoped, and least privilege.
- Android Publisher API access is enabled and a live subscription-product read
  returned HTTP 200.
- Pub/Sub RTDN is configured with a dedicated topic, authenticated push
  subscription, keyless OIDC service account, and exact webhook audience.
- A Play Console test notification reached the staging webhook with HTTP 204 in
  116 ms.
- The `Ascend Internal Testers` licence-testing list is enabled with 10 users and
  normal licence responses.
- Required Railway billing and RTDN variables are set. The local downloaded Google
  JSON key was deleted after its secret value was securely stored and verified.
- External monitoring remains optional and is not connected.

## AAB and closed-test checkpoint

- File: `android/app/build/outputs/bundle/release/app-release.aab`
- Package: `fit.getascend.app`
- Version: `13 (0.1.4-staging)`
- Size: 13,424,754 bytes
- SHA-256: `585703D695877594D878ED47AC3FB3D96B8C949B9632944193EB3BCF7179D399`
- Signature: verified
- Track: Closed testing - Alpha only
- Play status: `Changes in review`; `1 change sent for review`
- Production release: not created or changed

Play rejected version code 12 as previously used, so the final accepted bundle uses
version code 13. Before upload, artifact inspection found and fixed a native offline
retry link that pointed to production. Commit `9641473` keeps retry behavior inside
the active environment. The rebuilt artifact contains no production Firebase
project, production API redirect, private key, Stripe secret, or fixed production
retry URL.

Play reports one non-blocking warning for third-party native libraries without native
debug symbols. The ReTrace mapping file is attached. Once Play finishes review and
processing, install through the Alpha tester opt-in flow and complete the full
sandbox purchase, renewal, cancellation, grace, hold, expiry, refund/revocation,
restore, and duplicate-event matrix before any production recommendation.

## Rollback

Delete the isolated Railway environment, revoke staging Google/R2 credentials, remove staging provider resources, and delete the branch. Production needs no rollback because it was not changed.

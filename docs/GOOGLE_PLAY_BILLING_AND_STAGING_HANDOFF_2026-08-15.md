# Ascend Google Play Billing and Isolated Staging Handoff

Full evidence is in `docs/ASCEND_PLAY_BILLING_STAGING_EXECUTION_REPORT_2026-08-15.md`.

## Current checkpoint

- Branch: `codex/ascend-staging-play-billing-v1`
- Original checkpoint: `a32c47491dec3cf21c0b587e4d8a96a908bbe0f2`
- Current verified source: `1ad0eb4c0ef1d7c078cb4e41a3d13f22219a5ff4`
- Production: unchanged
- Play products: not created
- AAB: not generated or uploaded

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
| `ascend_premium_monthly` | `monthly` | P1M | RM19.99 | Awaiting owner approval |
| `ascend_premium_yearly` | `yearly` | P1Y | Not approved | Do not create |

No trial is recommended for the first licence test. Proposed grace period is seven days. See `docs/PLAY_PRICING_APPROVAL_CHECKPOINT_2026-08-15.md`.

## Remaining provider work

1. Approve Play pricing and plan settings.
2. Create the approved subscription and base plan without public rollout.
3. Grant least-privilege Android Publisher access to a staging service account.
4. Configure Pub/Sub RTDN to the staging backend and verify OIDC audience/service account checks.
5. Add Closed Alpha accounts as Google Play licence testers.
6. Optionally connect an approved monitoring provider; no account has been created automatically.

## AAB and upload gate

Do not build or upload the release AAB until the product, tester, Developer API, and RTDN gates above are ready. Before upload, inspect the bundle for production URLs, production Firebase/R2/Gemini identifiers, Stripe live configuration, secrets, debug flags, and unsafe fallback values.

After all checks pass, report the AAB path, checksum, version, package, signing evidence, environment scan, staging health, product readiness, RTDN readiness, and rollback plan. Upload requires one explicit owner approval and must target only the existing Closed Alpha track.

## Rollback

Delete the isolated Railway environment, revoke staging Google/R2 credentials, remove staging provider resources, and delete the branch. Production needs no rollback because it was not changed.

# Ascend iOS 1.1 — Apple subscriptions

This branch prepares the next release. The submitted iOS 1.0 (9.1) remains in review. Do not replace that submission or enable production purchases before sandbox validation.

## Products

App: `6810864942`; bundle: `fit.getascend.app`.
Subscription group: **Ascend Membership**, group ID `22384035` (draft).

| Product | Identifier | Draft Malaysia monthly price |
| --- | --- | --- |
| Ascend Premium | `fit.getascend.app.premium.monthly` | MYR 19.99 |
| Ascend Trainer Pro | `fit.getascend.app.trainerpro.monthly` | MYR 99.90 |

Trainer Pro is the higher subscription level. StoreKit supplies localized names, descriptions and prices; frontend code never presents a hardcoded Apple price. Apple's available Trainer Pro price is MYR 99.90, nine sen below the website's MYR 99.99. The Premium price matches the website. Both products require review screenshots and submission with the first app version offering purchases.

Apple product IDs: Premium `6811887834`; Trainer Pro `6811885225`. Both are drafts, not submitted for review or published.

## Implementation

- Native StoreKit 2 plugin: product retrieval, app-account-linked purchase, unfinished transaction recovery, explicit restore and Apple's subscription management sheet. App Store purchase intents are held until sign-in and explicit confirmation; iOS 15–16.3 uses Apple's legacy purchase-intent delegate and later systems use `PurchaseIntent.intents`.
- The server verifies signed data with Apple's official Node library and the bundled public Apple Root CA G3. It then fetches the current subscription status from Apple's API. Historical receipts cannot extend access after expiry or refund.
- `appAccountToken` is the authenticated Ascend user's UUID. The original transaction cannot move between Ascend accounts. Family Sharing is unsupported and must remain disabled in App Store Connect.
- Purchases finish on the device only after server verification and persistence succeed. API failures leave the purchase recoverable.
- Apple notifications are verified and recorded after successful processing. Database transaction locks serialize purchase, restore and notification updates. Canceled subscriptions retain access to their paid expiry; expired/revoked/billing-retry subscriptions do not grant paid access. Authenticated requests expire stale Apple access even if the feature flag has been turned off.
- Other providers retain their actual billing state. Existing paid subscriptions are checked before new checkout; a database status change does not cancel an external charge.
- The native billing screen requires `AscendIOS/3`, introduced by 1.1. The existing 1.0 binary cannot call the new plugin. Web billing continues through its existing provider.
- Native apps suppress the web installation prompts (included from the earlier main-branch fix).

## Server configuration

Migrations `037` and `038` must run in order. `npm run build --workspace backend` includes the public Apple root certificate in the compiled artifact.

| Variable | Purpose |
| --- | --- |
| `APPLE_IAP_ENABLED` | Defaults false. Enable only in the intended test/release environment after configuration. |
| `APPLE_IAP_BUNDLE_ID` | `fit.getascend.app` |
| `APPLE_IAP_APP_ID` | `6810864942` |
| `APPLE_IAP_KEY_ID` | Apple In-App Purchase API key ID |
| `APPLE_IAP_ISSUER_ID` | App Store Connect issuer UUID |
| `APPLE_IAP_PRIVATE_KEY` | Secret `.p8` key contents; never commit or log |
| `APPLE_IAP_SANDBOX_USER_IDS` | Comma-separated Ascend database UUIDs allowed to receive sandbox entitlements |

Configure App Store Server Notifications **V2** production and sandbox URLs at `<backend>/api/v1/webhooks/apple` after deploying the intended backend. Do not point Apple at a nonexistent endpoint. TestFlight uses sandbox transactions, so test accounts (including the App Review account) must be explicitly allowed. Outside-app streamlined purchasing must be disabled so initial purchases pass through Ascend sign-in and receive the correct account token. Apple requires the latest approved binary to include the purchase-intent APIs before this setting can be turned off. The setting is still On while 1.1 is a draft; no App Store promotion, win-back offer or contingent pricing has been configured.

## Validation and release gates

Automated checks cover invalid signatures, bundle/product/account/environment rejection, renewal, cancellation, expiry, refunds, grace/retry, ownership, notification retry/deduplication, finishing after verification, restore, pending/canceled purchases, duplicate-provider protection and old-binary isolation.

Validation completed for code commit `e08b8ac`: frontend tests (144), backend tests (462 including the added environment-detection case), five isolated PostgreSQL integration tests, TypeScript builds and lint. [macOS simulator build passed](https://github.com/mdfarizanwar369/ascend/actions/runs/34841073894), and [security and quality checks passed](https://github.com/mdfarizanwar369/ascend/actions/runs/34841073904). The simulator artifact proves compilation, not a physical purchase. No 1.1 TestFlight upload has been made. Draft PR: https://github.com/mdfarizanwar369/ascend/pull/8.

For persistence integration tests, use a disposable local Postgres database named `ascend_apple_test`. Migrate it with `DATABASE_URL`, then run from `backend`:

```text
APPLE_TEST_DATABASE_URL=<local-test-url> npx vitest run src/tests/appleSubscriptionPersistence.integration.test.ts
```

Before release:

1. Finish Apple's product metadata and prices; confirm Paid Applications Agreement, banking and tax status.
2. Add the server API key as a secret, configure V2 notifications and allow isolated sandbox users.
3. Complete the macOS build check. Build and install 1.1 through TestFlight with the intended frontend/backend configuration.
4. On a physical iPhone, purchase each plan, cancel a purchase sheet, restore after reinstall, test account mismatch, renew/expire/refund in sandbox and confirm access on the server. Record results; simulator compilation is not a completed purchase test.
5. After 1.0 is released, create App Store version 1.1 with **manual release** and submit the first subscriptions and group with that version. Update review notes to accurately describe IAP and provide the review login. Once 1.1 is approved, turn off Streamlined Purchasing and verify the setting before releasing the app. Test the App Store-to-sign-in purchase-intent handoff as well as normal checkout.

Account check on 14 September 2026: the Free Apps Agreement is active; the Paid Apps Agreement is **New**. Apple requires a legal entity update before it can be signed. The existing legal name and address were inspected but not changed. The account holder must confirm the legal information and complete the paid agreement, banking and tax requirements in App Store Connect Business before paid release. Server API credentials/notification configuration and physical TestFlight testing are still pending. No production billing flag was enabled.

References: [first IAP submission](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-in-app-purchase), [new app version](https://developer.apple.com/help/app-store-connect/update-your-app/create-a-new-version), [Apple server library](https://github.com/apple/app-store-server-library-node).

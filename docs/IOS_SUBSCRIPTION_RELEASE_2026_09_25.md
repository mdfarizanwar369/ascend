# iOS 1.1 subscription release

This supersedes the historic free-first-release and isolated-beta instructions. Version 1.0 (23.1) is already public. The account holder requested submitting the subscription update on 25 September; Paid Apps Agreement, bank and tax status show Active.

## Release behavior

- Version 1.1 uses the public production origin and `AscendIOS/6 AscendSubscriptions/1`. Existing native free binaries retain their free limits and cannot access purchases or paid routes.
- New native users can purchase Premium through StoreKit. Trainer Pro purchase requires an existing trainer account linked to a gym, or an administrative account; subscribing does not grant administrative rights or access to other trainers' clients.
- Verified entitlements unlock paid features. Free native members retain 2 meal estimates, 10 Zoe replies and 1 persistent generated workout per day, plus existing weekly capture/review allowances.
- Apple transaction ownership, expiry, refund/renewal updates, restore and duplicate-provider protections remain enforced. Website/PWA Stripe and Android remain separate.
- Both native editions hide unsupported Health Sync and use the iOS privacy disclosures. Subscription policies describe Apple renewal, cancellation and refund handling.

## Products

Ascend Membership group `22384035`: Premium `fit.getascend.app.premium.monthly` (MYR19.99/month), Trainer Pro `fit.getascend.app.trainerpro.monthly` (MYR99.90/month). Local prices always come from StoreKit. Family Sharing remains off.

## Verification and submission

Local frontend, backend, native packaging, lint, production builds and production-dependency audit have been run. CI and signed main-branch build must pass for the final commit. Configure the existing IAP verification key and production/sandbox notification endpoints on the production backend; allow the fictional review/test accounts for sandbox access. Do not log credentials or receipts.

Version 1.1 draft exists in App Store Connect. Both subscription products and their group must accompany this app version in one submission. Use manual release until final purchase validation and Streamlined Purchasing configuration have been verified.

The user retried isolated TestFlight 1.1 (15.1) on 25 September and still received “Apple subscriptions are not available right now.” This is an empty native product list, despite the stage API returning enabled, unblocked, and both correct product IDs. Do not claim successful physical purchases. Finish metadata, check Apple configuration, and retry on the production-origin release candidate. The old payment-only beta is not a public release binary.

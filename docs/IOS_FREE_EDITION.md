# Free iOS first release

The App Store/TestFlight app uses a free-only edition while Apple subscriptions are prepared separately. Android behavior and website/home-screen Stripe billing are unchanged, including Safari and installed PWAs on iPhone.

## Included limits

- Unlimited manual meal, water, weight and activity logs.
- Two new AI meal estimates per local day.
- Ten Zoe replies per local day, including quick-action chat modes.
- Three detailed workout captures per rolling seven days.
- One AI workout review per rolling seven days.

Existing consent, validation, rate limits and safety checks still apply. Usage is counted on the member account; it is not reset by switching clients. Previously cached food estimates do not incur new AI usage.

## Platform boundary

The frontend identifies native iOS through Capacitor or the AscendIOS user-agent marker and adds `X-Ascend-Edition: ios-free-v1` to API requests. The server also recognizes the native marker independently. Ordinary iPhone user agents and standalone/home-screen mode do not select this edition.

Request-local AsyncLocalStorage carries the edition through authentication, entitlement and AI services. Native iOS is presented as a free member, regardless of stored plan, trainer/admin role or athlete mode. Paid routes are rejected server-side, and paid pages, trainer signup and upgrade messages are removed from the native UI. Website pricing/demo pages redirect to the app launch screen in native iOS.

This is a client restriction, not an authentication grant. No subscription or role records are downgraded. A web subscriber can continue using their existing paid features and Stripe management on the web. Request context cannot affect concurrent web/Android requests.

## Release checks

Regression tests cover native iOS versus iPhone Safari/PWA and Android, concurrent context isolation, paid route rejection, owner/trainer restrictions, actual allowance services and non-mounting of paid screens. Full backend/frontend suites, production builds, lint and iOS project checks must pass before release.

Build the production-origin iOS 1.0 app from main and upload through the existing GitHub iOS workflow. Select that build for the rejected 1.0 submission; do not use the separate 1.1 payment staging build. App Store description and review notes must describe the free-only edition, retain the standard EULA link and disclose the AI consent flow. Complete physical iPhone checks before resubmission. No new database migration is required.

The existing draft iOS subscription work stays separate for a later update after Apple agreement/tax activation and purchase testing.

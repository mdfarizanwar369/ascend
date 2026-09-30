# iOS 1.2 public Trainer Pro plan

Status: implemented on branch `codex/ios-1.2-public-trainer-pro`; production deployment, App Store Connect offer configuration, TestFlight validation, and App Review submission remain release steps. This work does not alter the approved 1.1.1 release record.

## Outcome

Ascend 1.2 lets a person download the free app, create a normal Ascend account, and start Trainer Pro from **Profile > Subscriptions** without first belonging to a gym. An eligible Apple customer receives a 14-day introductory trial and then renews at Apple's localized monthly price. In Malaysia the current Trainer Pro price is RM99.90/month.

The primary journey is:

1. Download Ascend free.
2. Create or sign in to an Ascend account.
3. Open **Profile > Subscriptions**.
4. Select **Trainer Pro**.
5. See the StoreKit-supplied offer: **14 days free, then RM99.90/month** in Malaysia.
6. Choose **Independent Trainer** or **Gym Trainer**.
7. Confirm through Apple's purchase sheet.
8. Ascend verifies the transaction, activates trainer access, creates or joins the appropriate workspace, and issues the trainer's referral code.

Independent trainers require no human approval. A gym trainer may use a gym-issued trainer invitation. A purchase must never leave a customer with an active Apple subscription but no usable Trainer Pro workspace.

## Locked product decisions

- The app remains free to download.
- Trainer Pro is discovered and purchased from **Profile > Subscriptions**. It is not promoted as a separate pre-download flow by Ascend.
- Trainer Pro uses the existing monthly product `fit.getascend.app.trainerpro.monthly` in subscription group `22384035`.
- The introductory offer is two weeks free, followed by the localized monthly price. The screen must not hardcode RM99.90 outside Malaysia.
- Introductory-offer eligibility is determined by Apple. Ascend must not promise a trial when StoreKit says the Apple Account is ineligible.
- Independent trainers receive an isolated workspace automatically and do not wait for approval.
- Gym trainers join with a purpose-specific trainer invitation. The invitation itself is the gym's authorization; a general member referral code is not sufficient.
- Trainer Pro includes Ascend's personal Premium features for the trainer.
- During the trial, a trainer may connect at most two real clients. A demo client is separate and does not count toward the limit.
- After trial expiry without renewal, personal access falls back to Ascend Free and trainer-only client access is locked. Client relationships and records are retained so they can be restored after resubscription, but no client data is exposed while access is inactive.
- Paying Trainer Pro initially supports five active real clients. Higher-capacity tiers are deferred until usage and unit economics are measured.
- Clients never share health or fitness data merely by entering a code. They must see the trainer identity and explicitly confirm the connection.

## Why the workspace remains mandatory

The current authorization model scopes trainers, clients, reporting, alerts, referrals, and owner operations through a gym/workspace identifier. `trainers.gym_id` is non-null and many server queries assume that boundary.

Version 1.2 should therefore extend the current `gyms` concept into a workspace boundary instead of making `gym_id` nullable. The low-risk migration is:

- add `workspace_type` with `gym` and `independent` values, defaulting existing rows to `gym`;
- create one private `independent` workspace for a solo trainer;
- keep all existing trainer/client ownership checks intact;
- hide gym-specific owner language and owner tools for an independent workspace unless explicitly supported later.

A future release may rename the table and identifiers from gym to organization/workspace. That broad refactor is not required for 1.2.

## Data model changes

Create a new migration after `040_ios_daily_workouts.sql`.

### Workspaces

- Add `gyms.workspace_type text not null default 'gym'` with an allow-list check for `gym` and `independent`.
- Add an optional `gyms.created_for_trainer_user_id` unique foreign key to make independent-workspace creation idempotent.
- Independent workspaces use a server-generated unique slug and the trainer-selected display name, country, and timezone.

### Trainer onboarding

Add `trainer_onboarding_intents`:

- `user_id` unique foreign key;
- `mode`: `independent` or `gym`;
- optional workspace display name, country, and timezone;
- optional hashed gym invitation identifier;
- `status`: `pending`, `activated`, `expired`, or `failed`;
- created, updated, and activated timestamps.

The record contains no Apple receipt or raw signed transaction.

### Gym trainer invitations

Add purpose and lifecycle fields to trainer invitations, or introduce a dedicated `trainer_invitations` table:

- server-generated high-entropy token with a short human-readable code;
- gym identifier;
- created-by user;
- optional intended email;
- expiry;
- single-use `consumed_at` and `consumed_by_user_id`;
- active/revoked status.

Existing gym/member referral codes remain valid for their current purpose and must not silently become trainer-role invitations.

### Client connections

The existing `users.assigned_trainer_id` remains the active authorization pointer. Add a connection audit table recording:

- client and trainer identifiers;
- referral code/invitation source;
- previewed trainer identity;
- client consent timestamp and policy version;
- connected, disconnected, and reassigned timestamps;
- actor and reason for administrative changes.

### Apple subscription metadata

Persist the verified Apple `offerType` and optional `offerIdentifier`. A verified introductory period for Trainer Pro should be stored as subscription status `trialing`; the first paid renewal becomes `active`. Do not infer a trial solely from a zero price.

## Backend behavior

### Public setup endpoints

Add authenticated, rate-limited endpoints:

- `POST /trainer-onboarding/intent` creates or replaces the caller's pending choice after validation.
- `GET /trainer-onboarding/status` returns the safe current state.
- `POST /trainer-onboarding/gym-invitation/validate` returns only the gym identity required for confirmation.
- `POST /trainer/referral-code` creates the active trainer's initial code idempotently.
- `PATCH /trainer/referral-code` allows a safe custom code subject to uniqueness, reserved-word, format, and cooldown rules.
- `POST /me/trainer-connection/preview` returns the trainer's public identity without exposing client or trainer records.
- `POST /me/trainer-connection/confirm` records consent and connects the client.
- `DELETE /me/trainer-connection` disconnects the client and immediately removes trainer access.

### Purchase configuration

Replace the current `canPurchaseTrainerPro` gym-linked-role check with structured eligibility:

- Apple billing is configured and available;
- there is no conflicting paid provider;
- the user is not suspended or deleted;
- existing trainers, administrators, and ordinary authenticated members may begin public Trainer Pro onboarding;
- an existing client connection does not prevent the user becoming a trainer, but the UI must explain the role change and preserve their personal records.

The response should distinguish `canStartTrainerOnboarding`, `trainerOnboardingStatus`, and `canPurchaseTrainerPro` rather than collapsing them into one boolean.

### Transaction-to-workspace activation

Trainer activation must be an idempotent part of the verified Trainer Pro entitlement workflow:

1. Verify the Apple-signed transaction, bundle, environment, product, ownership, and `appAccountToken` as today.
2. Lock the original transaction and user activation keys.
3. Upsert the subscription.
4. If the product is Trainer Pro, resolve the onboarding intent.
5. For `independent`, create or reuse the user's private workspace and active trainer row.
6. For `gym`, consume a valid trainer invitation and create or activate the trainer in that gym.
7. If no valid intent is present, create an independent workspace so a successful purchase always produces usable access. The user can join a gym later.
8. Add the trainer role without granting admin, owner, or access to any unrelated client.
9. Create the referral code idempotently.
10. Commit the subscription and trainer activation together.

If Apple has charged or started a trial but the database transaction fails, Restore Purchases and Apple server notifications must retry the same activation safely. Never finish the StoreKit transaction before the server confirms both entitlement and workspace activation.

### Trial and client limits

- Trial state comes from verified Apple offer metadata and current entitlement dates.
- Trialing Trainer Pro: demo client plus two active real clients.
- Paid Trainer Pro: five active real clients for the initial 1.2 product policy.
- Existing connected clients are not deleted when a limit is reduced or access expires. Additional connections are blocked and the trainer sees a clear explanation.
- Limit enforcement occurs on the server at connection time and cannot rely on UI state.

### Expiry, cancellation, refund, and upgrade behavior

- Turning off auto-renew does not remove access until the verified period ends.
- Trial expiry, paid expiry, refund, or revocation removes trainer-only access immediately according to Apple's verified dates.
- The trainer can still use Ascend Free for personal tracking.
- Client data remains owned by the client and inaccessible to the inactive trainer.
- Resubscription restores the same workspace, referral code, and eligible client relationships.
- Active Premium subscribers in the same Apple subscription group may be ineligible for the introductory offer. They can still upgrade to Trainer Pro at the Apple-displayed terms.

## iOS and subscription-screen changes

### StoreKit bridge

Extend `AppleBilling.getProducts()` to return safe, localized subscription metadata:

- standard localized price and period;
- introductory-offer type, localized price, and period;
- StoreKit eligibility for the introductory offer;
- subscription group identifier when available.

Do not manufacture eligibility or price text in JavaScript. StoreKit remains the source of truth.

### Subscription UI

The Trainer Pro card should show one of these states:

- eligible: **14 days free, then [localized price]/month**;
- ineligible: **[localized price]/month**;
- current trial: trial end date and renewal price;
- active: next renewal/current-period date;
- cancelled: access-end date;
- conflicting provider: existing duplicate-payment warning;
- unavailable: retry action without substitute pricing.

Before Apple's purchase sheet, show a short setup step:

- **Independent Trainer**: workspace name, country, and timezone, with no approval language;
- **Gym Trainer**: enter a gym-issued trainer invitation, confirm the gym identity, and continue;
- a fallback lets an invalid or unavailable gym invitation continue as Independent Trainer rather than losing the purchase journey.

The final purchase screen must prominently disclose:

- Trainer Pro name and monthly duration;
- features and the trial client limit;
- exact StoreKit-supplied trial duration and renewal price;
- automatic renewal and cancellation behavior;
- Restore Purchases;
- Manage Apple Subscriptions;
- Privacy Policy and Terms of Use.

### Referral experience

After activation, show:

- referral code;
- shareable universal link;
- copy/share action;
- QR code rendered locally from the same link;
- client count and trial limit;
- an explanation that clients must confirm before data is shared.

The referral URL should open the app when installed and otherwise open a safe web landing page that forwards to the App Store. The code is preserved through signup.

## Privacy and safety requirements

- Show the trainer's public name and workspace before a client confirms connection.
- State the categories of data a trainer can access: activity, meals, weight/progress, messages, plans, and other enabled coaching records.
- Require a separate explicit choice for AI data sharing under the existing AI privacy model.
- Record consent and policy version server-side.
- A client can disconnect at any time from Profile.
- A trainer cannot search arbitrary users, claim existing clients, or access anyone through code enumeration.
- Codes and invitations are rate-limited; invitation tokens are high entropy; human-readable codes are case-normalized and protected from reserved/abusive values.
- All trainer routes continue to enforce both an active Trainer Pro entitlement and the exact assigned-client relationship.
- Account deletion, refunds, revocations, and role removal must revoke access without orphaning client records.

## Pricing alignment

Before 1.2 submission:

- keep Trainer Pro at Apple's current RM99.90/month Malaysia price;
- configure a two-week free introductory offer for Trainer Pro in all intended storefronts;
- do not configure a competing Premium introductory offer in the same subscription group without reviewing Apple's one-offer-per-group eligibility behavior;
- update the shared website/PWA display from RM99.99 to the intended web price or explicitly label platform-specific prices;
- reconcile the Premium website constant with the App Store's scheduled RM29.99 Malaysia price decision;
- verify Small Business Program status and model net proceeds, taxes, and AI usage before raising the five-client limit.

## App Store Connect work

1. Leave the approved 1.1.1 release record unchanged.
2. Configure Trainer Pro's introductory offer as **Free, 2 Weeks** with the intended storefront availability and start date.
3. Confirm Trainer Pro remains available for purchase and Family Sharing remains off.
4. Update the subscription review screenshot after the 1.2 UI is final.
5. Update localized description to explain the trial and independent-trainer availability within the character limit.
6. Submit version 1.2 with a production-origin build and working production/sandbox server configuration.

Proposed review path:

> Download or open Ascend -> create/sign in to an account -> Profile -> Subscriptions -> Trainer Pro -> choose Independent Trainer -> Start 14-Day Free Trial -> confirm with Apple. After verification, Ascend opens the trainer workspace and displays the trainer referral code.

Review notes must disclose:

- product ID and subscription group;
- localized price comes from StoreKit;
- trial eligibility is determined by Apple;
- independent trainer activation requires no manual approval;
- the reviewer can use the provided sandbox Apple account and Ascend account;
- Restore Purchases and Manage Apple Subscriptions locations;
- how to connect the included fictional client without exposing real health data.

## Testing matrix

### Backend and database

- migration upgrades existing gyms to `workspace_type = 'gym'` without changing access;
- independent activation creates exactly one workspace, trainer, role, and referral code;
- duplicate verify, restore, webhook, and concurrent requests remain idempotent;
- gym invitation validation, expiry, revocation, single use, and wrong-email cases;
- Apple introductory transaction becomes `trialing`; paid renewal becomes `active`;
- cancellation preserves access to the verified end date;
- expiry/refund/revocation locks every trainer-only route;
- trial and paid client limits are enforced server-side;
- explicit client consent, disconnect, reconnection, and reassignment;
- cross-provider purchase block remains intact;
- purchase succeeds but provisioning temporarily fails, followed by restore recovery;
- deletion and suspension revoke trainer access.

### Frontend and native

- eligible and ineligible trial copy uses StoreKit values;
- no hardcoded Malaysian price appears in other storefronts;
- Independent and Gym setup paths;
- invalid gym invitation safely returns to setup;
- purchase cancel/pending/success/failure states;
- purchase intent initiated from the App Store returns to authenticated in-app confirmation;
- Restore Purchases activates the workspace when the first server confirmation was interrupted;
- current trial, renewal, cancellation, and expiry dates render correctly;
- referral link survives install/signup and never connects without client confirmation;
- VoiceOver labels, Dynamic Type, contrast, keyboard avoidance, and narrow iPhone layout;
- real-device Sandbox purchase, renewal, cancellation, restore, refund/revocation notification, and TestFlight production-product retrieval.

### Security regression

- an independent trainer cannot access another workspace;
- a trainer cannot exceed the allowed connected-client count through concurrent requests;
- a client code cannot grant trainer role;
- a Trainer Pro purchase cannot grant admin/owner privileges;
- a copied Apple transaction cannot attach to another Ascend account;
- inactive trainers cannot read cached client endpoints after entitlement expiry.

## Delivery sequence

1. Tag and preserve the exact approved 1.1.1 code and release metadata.
2. Create the 1.2 branch from the release baseline, carrying forward only intentional post-release fixes.
3. Add migrations and idempotent workspace/onboarding services.
4. Add trial recognition and transaction-coupled trainer activation.
5. Add trainer invitation and client-consent connection APIs.
6. Extend the StoreKit bridge with introductory-offer metadata and eligibility.
7. Build the subscription setup and referral UI.
8. Add automated tests, then run shared/backend/frontend build, lint, and test suites.
9. Validate migrations against a production-like database copy without exposing production data.
10. Configure the Sandbox introductory offer and complete physical-device purchase/restore/expiry testing.
11. Configure production App Store Connect metadata and the introductory offer only after the tested behavior matches.
12. Produce fresh screenshots, review notes, privacy verification, and the signed 1.2 release candidate.

## Expected change map

- `backend/migrations/041_public_trainer_pro.sql`: workspace type, onboarding intent, trainer invitation, connection audit, and Apple offer metadata.
- `backend/src/services/appleSubscriptionService.ts`: trial recognition and transaction-coupled trainer activation.
- `backend/src/services/trainerOnboardingService.ts`: idempotent independent workspace, gym invitation, role, and referral provisioning.
- `backend/src/services/clientConnectionService.ts`: preview, consent, connection, disconnection, reassignment, and limits.
- `backend/src/routes/appleSubscriptions.ts`: structured public purchase eligibility.
- `backend/src/routes/trainerOnboarding.ts`: trainer setup and invitation endpoints.
- `backend/src/routes/me.ts` or a focused connection router: client-controlled trainer connection endpoints.
- `frontend/src/lib/appleBilling.ts`: introductory-offer product contract.
- `ios/App/App/AppleBillingPlugin.swift`: localized introductory-offer metadata and Apple eligibility.
- `frontend/src/components/subscription/AppleSubscriptionClient.tsx`: public Trainer Pro setup, disclosures, purchase, and recovery states.
- `frontend/src/components/trainer/TrainerDashboardClient.tsx`: referral sharing, trial state, and client-limit state.
- `frontend/src/components/profile/ProfileClient.tsx`: disconnect/change-trainer control for clients.
- `shared/src/index.ts`: aligned plan display price for non-StoreKit surfaces and shared onboarding types.
- matching backend, frontend, StoreKit bridge, and migration tests.

## Release gates

Version 1.2 is not ready to submit until all of the following are true:

- a new independent user can start the Apple trial and reach a usable trainer dashboard in one session;
- no successful Apple transaction can remain permanently unprovisioned;
- an expired trial cannot access any client record;
- client connection requires recorded consent;
- localized StoreKit price and offer terms match the Apple purchase sheet;
- restore works after reinstall and on interrupted first verification;
- existing gym trainers and 1.1.1 subscribers retain access;
- website and in-app pricing do not contradict the intended commercial policy;
- a reviewer can complete the documented path with fictional data;
- production logs and analytics contain no receipts, signed transactions, invitation secrets, or health content.

## Success measures after release

Track only aggregate product events needed for the funnel:

- subscription screen views;
- Trainer Pro setup starts by Independent/Gym choice;
- Apple trial eligibility shown;
- purchase sheet opened, cancelled, pending, verified, or failed;
- workspace activation success/recovery;
- first referral shared;
- first client consented and connected;
- trial-to-paid conversion;
- expiry and resubscription;
- support and provisioning failures.

Do not include referral tokens, Apple transaction payloads, client health records, or message content in analytics.

## Apple references

- Subscription presentation and free-trial disclosures: https://developer.apple.com/app-store/subscriptions/
- Introductory-offer configuration and one-offer-per-group eligibility: https://developer.apple.com/help/app-store-connect/manage-subscriptions/set-up-introductory-offers-for-auto-renewable-subscriptions
- App Review subscription requirements: https://developer.apple.com/app-store/review/guidelines/

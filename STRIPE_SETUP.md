# Stripe Setup For Ascend

Ascend uses Stripe Checkout for card collection and Stripe's customer portal for subscription management. Card numbers never pass through Ascend's backend.

## Products

Create these recurring monthly prices in Stripe:

| Product | Price | Currency | Interval |
| --- | ---: | --- | --- |
| Ascend Premium | 19.99 | MYR | Monthly |
| Ascend Trainer Pro | 99.99 | MYR | Monthly |

Copy the resulting `price_...` IDs into the backend Railway service.

## Backend Variables

```text
PAYMENT_PROVIDER=stripe
FRONTEND_URL=https://www.getascend.fit
STRIPE_SECRET_KEY=sk_test_... or sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PREMIUM_PRICE_ID=price_...
STRIPE_TRAINER_PRO_PRICE_ID=price_...
```

Do not add Stripe secrets to the frontend service or commit them to Git.

## Webhook

Create a Stripe webhook destination at:

```text
https://ascend-backend-production-b515.up.railway.app/api/v1/webhooks/stripe
```

Subscribe to:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

Copy the destination signing secret into `STRIPE_WEBHOOK_SECRET`.

## Customer Portal

Enable the Stripe customer portal with payment-method updates, invoice history, and subscription cancellation. Ascend sends customers back to `https://www.getascend.fit/subscription`.

## Test Before Live Mode

1. Keep Stripe in test mode.
2. Open Ascend's subscription screen and select Premium.
3. Complete checkout with Stripe's test card `4242 4242 4242 4242`, any future expiry, and any CVC.
4. Confirm the account changes to Premium after the signed webhook arrives.
5. Open Manage billing and confirm the portal loads.
6. Cancel the test subscription and confirm access remains through the displayed period end.
7. Repeat once for Trainer Pro with a trainer account.

Only replace test keys and test price IDs with live values after Stripe account activation, identity checks, payout details, tax settings, and the full test flow are complete.

The Stripe CLI login credential expires after 90 days. It is acceptable for temporary test-mode validation only. Before enabling live payments, use a permanent live secret or appropriately scoped restricted key stored only in the Railway backend service.

# Lemon Squeezy Setup For Ascend

Use test mode first. Do not accept live payments until every check below passes.

## 1. Activate The Store

1. Open the Lemon Squeezy dashboard.
2. Create or select the store named `Ascend`.
3. Complete identity, tax, payout, and store activation requirements.
4. Turn on test mode while configuring Ascend.

## 2. Create Monthly Products

Create two subscription products:

1. `Ascend Premium`
   - Billing: monthly
   - Pilot price: RM19 or the chosen launch price
2. `Ascend Trainer Pro`
   - Billing: monthly
   - Pilot price: RM99 or the chosen launch price

Copy the variant ID for each monthly price. Ascend needs the variant IDs, not only the product IDs.

## 3. Create An API Key

1. Open Lemon Squeezy settings.
2. Open API.
3. Create an API key named `Ascend Railway Backend`.
4. Copy it once and store it directly in Railway. Do not commit it to GitHub.

## 4. Add The Webhook

Create a webhook with this URL:

```text
https://YOUR-BACKEND-DOMAIN/api/v1/webhooks/lemonsqueezy
```

Subscribe to these events:

- `subscription_created`
- `subscription_updated`
- `subscription_cancelled`
- `subscription_resumed`
- `subscription_expired`
- `subscription_payment_success`
- `subscription_payment_failed`

Copy the webhook signing secret.

## 5. Add Railway Backend Variables

Open Railway, select `ascend-backend`, then add:

```text
PAYMENT_PROVIDER=lemonsqueezy
FRONTEND_URL=https://www.getascend.fit
LEMONSQUEEZY_API_BASE_URL=https://api.lemonsqueezy.com/v1
LEMONSQUEEZY_API_KEY=YOUR_API_KEY
LEMONSQUEEZY_STORE_ID=YOUR_STORE_ID
LEMONSQUEEZY_PREMIUM_VARIANT_ID=YOUR_PREMIUM_MONTHLY_VARIANT_ID
LEMONSQUEEZY_TRAINER_PRO_VARIANT_ID=YOUR_TRAINER_PRO_MONTHLY_VARIANT_ID
LEMONSQUEEZY_WEBHOOK_SECRET=YOUR_WEBHOOK_SIGNING_SECRET
```

Redeploy the backend after saving the variables. The frontend does not need a Lemon Squeezy secret.

## 6. Test Before Going Live

1. Log in with a disposable client account.
2. Open `/subscription`.
3. Select Premium and press `Subscribe monthly`.
4. Complete a Lemon Squeezy test payment.
5. Return to Ascend.
6. Confirm the account shows Premium.
7. Confirm the owner Subscriptions page shows provider `lemonsqueezy`.
8. Press `Manage billing` and confirm the customer portal opens.
9. Cancel in the test portal and confirm the webhook updates Ascend.
10. Repeat with a trainer account and Trainer Pro.

Only switch the Lemon Squeezy store and credentials to live mode after both tests pass.

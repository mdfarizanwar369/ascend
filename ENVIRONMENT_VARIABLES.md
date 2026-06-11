# Ascend Environment Variables

This is the complete launch inventory for Railway and local setup.

## Frontend Service

Set these on the Railway frontend service.

| Variable | Required | Example | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | Yes | `https://ascend-backend.up.railway.app/api/v1` | Backend API base URL. |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Yes | Firebase web API key | Firebase client auth. |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Yes | `ascend-b2850.firebaseapp.com` | Firebase client auth domain. |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Yes | `ascend-b2850` | Firebase project. |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Yes | Firebase web app ID | Firebase web app identity. |

## Backend Service

Set these on the Railway backend service.

| Variable | Required | Example | Purpose |
| --- | --- | --- | --- |
| `NODE_ENV` | Yes | `production` | Runtime mode. |
| `PORT` | Usually Railway-provided or `4000` | `4000` | Backend listen port. |
| `DATABASE_URL` | Yes | `${{Postgres.DATABASE_URL}}` | PostgreSQL source of truth. |
| `CORS_ORIGIN` | Yes | `https://ascend-production.up.railway.app` | Allows frontend browser calls. |
| `FIREBASE_PROJECT_ID` | Yes | `ascend-b2850` | Firebase Admin verification. |
| `FIREBASE_CLIENT_EMAIL` | Yes | service account email | Firebase Admin verification. |
| `FIREBASE_PRIVATE_KEY` | Yes | service account private key | Firebase Admin verification. |
| `BOOTSTRAP_OWNER_EMAIL` | Yes | owner email | Grants owner/admin access to the launch owner. |
| `CRON_SECRET` | Yes | long random string | Protects daily jobs endpoint. |
| `AWS_REGION` | Yes | `auto` for R2 or `ap-southeast-1` for AWS | S3/R2 client region. |
| `AWS_S3_ENDPOINT` | Required for R2, optional for AWS | `https://<account-id>.r2.cloudflarestorage.com` | S3-compatible endpoint. |
| `AWS_ACCESS_KEY_ID` | Yes for media uploads | access key | S3/R2 upload credentials. |
| `AWS_SECRET_ACCESS_KEY` | Yes for media uploads | secret key | S3/R2 upload credentials. |
| `AWS_S3_BUCKET` | Yes for media uploads | `ascend-photos` | Food/progress photo bucket. |
| `AI_PROVIDER` | Yes | `openai` | AI provider selector. |
| `OPENAI_API_KEY` | Important | OpenAI API key | Live food AI, coach, reports, burn estimates. |
| `OPENAI_MODEL` | Yes | `gpt-4.1-mini` | OpenAI model. |
| `TOYYIBPAY_BASE_URL` | Yes for billing | `https://toyyibpay.com` | ToyyibPay API and checkout base. |
| `TOYYIBPAY_SECRET_KEY` | Yes for billing | ToyyibPay key | Creates bills. |
| `TOYYIBPAY_CATEGORY_CODE` | Yes for billing | ToyyibPay category | Creates bills under merchant category. |
| `TOYYIBPAY_RETURN_URL` | Yes for billing | `https://frontend/subscription` | Browser return after payment. |
| `TOYYIBPAY_CALLBACK_URL` | Yes for billing | `https://backend/api/v1/webhooks/toyyibpay` | Server payment callback. |

## Present But Not Required For MVP

These are placeholders for future Stripe support and should not be needed for the Malaysia pilot.

| Variable | Required | Purpose |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | No | Future Stripe provider. |
| `STRIPE_WEBHOOK_SECRET` | No | Future Stripe webhook verification. |

## Local Development Variables

Local defaults:

```text
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
PORT=4000
DATABASE_URL=postgres://ascend:ascend@localhost:5432/ascend
CORS_ORIGIN=http://localhost:3000
TOYYIBPAY_RETURN_URL=http://localhost:3000/subscription
TOYYIBPAY_CALLBACK_URL=http://localhost:4000/api/v1/webhooks/toyyibpay
```

## Known Env Documentation Gap

Before handing off operations, align `.env.example` and `backend/.env.example`:

- Root `.env.example` should include `AWS_S3_ENDPOINT`.
- Root `.env.example` should include `AI_PROVIDER`.
- Root `.env.example` should use `/subscription`, not `/subscription/success`, for ToyyibPay return URL.

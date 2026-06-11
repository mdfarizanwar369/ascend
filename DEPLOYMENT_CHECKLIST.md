# Ascend Deployment Checklist

Use this for Railway production deployment.

## Required External Accounts

### Railway

- Purpose: frontend service, backend service, PostgreSQL database, deploy logs, variables, domains.
- Required:
  - GitHub repo connected.
  - PostgreSQL service created.
  - Backend service created.
  - Frontend service created.
  - Public domains generated for frontend and backend.
  - Auto-deploy enabled from `main`, or manual deploy process understood.

### Firebase

- Purpose: authentication only.
- Required:
  - Firebase project.
  - Web app config.
  - Email/password provider enabled.
  - Backend service account JSON.
  - Railway frontend domain added under Authentication authorized domains.

### OpenAI

- Purpose: food image analysis, nutrition coach, burn estimate, weekly summaries.
- Required:
  - API key.
  - Billing/usage limits configured.
  - Model available for the configured `OPENAI_MODEL`.

### ToyyibPay

- Purpose: Malaysia subscription payments.
- Required:
  - Merchant account.
  - Category code.
  - Secret key.
  - Return URL set to frontend `/subscription`.
  - Callback URL set to backend `/api/v1/webhooks/toyyibpay`.

### Cloudflare R2 Or AWS S3

- Purpose: food photos and progress photos.
- Required for Cloudflare R2:
  - R2 bucket.
  - Account API token or R2 access key pair.
  - S3-compatible endpoint.
- Required for AWS S3:
  - Private S3 bucket.
  - IAM access key with bucket read/write permissions.
  - Region.

## Railway Services

### PostgreSQL

- [ ] PostgreSQL service is online.
- [ ] Internal `DATABASE_URL` available for backend.
- [ ] Public connection string available temporarily for migration/seed if running locally.
- [ ] Backup/snapshot policy confirmed.

### Backend Service

Settings:

```text
Root directory: /
Build command: npm run build --workspace shared && npm run build --workspace backend
Start command: npm run start --workspace backend
```

Variables:

```text
NODE_ENV=production
PORT=4000
DATABASE_URL=${{Postgres.DATABASE_URL}}
CORS_ORIGIN=https://your-frontend-domain.up.railway.app
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
BOOTSTRAP_OWNER_EMAIL=
CRON_SECRET=
AWS_REGION=auto
AWS_S3_ENDPOINT=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_BUCKET=
AI_PROVIDER=openai
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
TOYYIBPAY_BASE_URL=https://toyyibpay.com
TOYYIBPAY_SECRET_KEY=
TOYYIBPAY_CATEGORY_CODE=
TOYYIBPAY_RETURN_URL=https://your-frontend-domain.up.railway.app/subscription
TOYYIBPAY_CALLBACK_URL=https://your-backend-domain.up.railway.app/api/v1/webhooks/toyyibpay
```

Backend checks:

- [ ] Backend deploy succeeds.
- [ ] Public domain generated.
- [ ] `https://backend-domain/api/v1/health` returns ok.
- [ ] `https://backend-domain/api/v1/health/storage` returns expected storage status.

### Frontend Service

Settings:

```text
Root directory: /
Build command: npm run build --workspace shared && npm run build --workspace frontend
Start command: npm run start --workspace frontend
```

Variables:

```text
NEXT_PUBLIC_API_URL=https://your-backend-domain.up.railway.app/api/v1
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

Frontend checks:

- [ ] Frontend deploy succeeds.
- [ ] Public domain generated.
- [ ] `/login` loads.
- [ ] `/dashboard` loads after login.
- [ ] `/manifest.json` loads.
- [ ] PWA icon appears.

## Database Migration And Seed

Run once against production PostgreSQL:

```powershell
npm run migrate
npm run seed
```

Checks:

- [ ] Migration completes.
- [ ] Seed completes.
- [ ] `/api/v1/gyms` returns both launch gyms.
- [ ] `/api/v1/referrals/validate/AF-AUSTIN` works.
- [ ] `/api/v1/referrals/validate/AF-KULAI` works.
- [ ] `/api/v1/referrals/validate/TRAINER-JASON` works.
- [ ] `/api/v1/referrals/validate/TRAINER-SITI` works.

## Firebase Production Setup

- [ ] Email/password sign-in enabled.
- [ ] Frontend domain added to authorized domains.
- [ ] Firebase web config copied to frontend Railway variables.
- [ ] Firebase Admin service account values copied to backend Railway variables.
- [ ] Private key preserves newline formatting.
- [ ] Owner email matches `BOOTSTRAP_OWNER_EMAIL`.

## Storage Setup

- [ ] Bucket exists.
- [ ] Bucket is not publicly writable.
- [ ] Backend variables set.
- [ ] `/api/v1/health/storage` returns configured.
- [ ] Food photo upload works.
- [ ] Progress photo upload works.
- [ ] Uploaded image can be viewed through trainer/client screens.

## OpenAI Setup

- [ ] `OPENAI_API_KEY` set.
- [ ] `OPENAI_MODEL` set.
- [ ] Food photo estimate tested with local foods.
- [ ] Coach chat tested.
- [ ] Burn estimate tested.
- [ ] Weekly report generation tested.
- [ ] Trainer weekly check-in tested.

## ToyyibPay Setup

- [ ] Secret key set.
- [ ] Category code set.
- [ ] Return URL set to frontend `/subscription`.
- [ ] Callback URL set to backend `/api/v1/webhooks/toyyibpay`.
- [ ] Premium RM19 checkout tested.
- [ ] Trainer Pro RM99 checkout tested.
- [ ] Successful payment activates subscription.
- [ ] Failed/cancelled payment does not activate subscription.
- [ ] Payment event appears in database/admin subscription view.

## Daily Job Setup

- [ ] `CRON_SECRET` set on backend.
- [ ] Railway Cron or external scheduler configured.
- [ ] Scheduler sends `x-cron-secret`.
- [ ] Manual call succeeds:

```text
POST https://backend-domain/api/v1/jobs/daily
```

## Post-Deploy Smoke Test

- [ ] Owner logs in.
- [ ] Owner opens `/admin`.
- [ ] Client signs up with `AF-AUSTIN`.
- [ ] Client completes onboarding.
- [ ] Owner assigns client to trainer.
- [ ] Client activates Premium or payment test completes.
- [ ] Client logs water, weight, burn, food photo, and habit.
- [ ] Dashboard totals update.
- [ ] Trainer opens assigned client.
- [ ] Trainer and client exchange messages.
- [ ] Weekly report generates.
- [ ] Daily job runs once.

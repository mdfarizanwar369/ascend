# Railway Deployment Guide

This is the simplest beginner deployment path for Ascend without installing Docker or PostgreSQL locally.

## What You Do Not Need

You can skip:

- Docker Desktop
- Local PostgreSQL
- `docker compose up`
- `docker compose up postgres`

## What You Still Need

- GitHub account
- Railway account
- Node.js locally, only if you want to run migration and seed from your computer

## Recommended Railway Setup

Use one Railway project with three services:

1. PostgreSQL database
2. Backend API service
3. Frontend web service

## Step 1: Push The Project To GitHub

Create a GitHub repository and push this project.

Railway deploys most easily from GitHub.

## Step 2: Create Railway Project

1. Open Railway.
2. Create a new project.
3. Add a PostgreSQL database.

Railway will create a database connection variable called `DATABASE_URL`.

## Step 3: Add Backend Service

Create a new service from the same GitHub repo.

Use these Railway service settings:

```text
Service name:
ascend-backend

Root directory:
/

Build command:
npm run build --workspace shared && npm run build --workspace backend

Start command:
npm run start --workspace backend
```

Backend variables:

```text
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
CORS_ORIGIN=https://your-frontend-domain.up.railway.app
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
AWS_REGION=ap-southeast-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_BUCKET=
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
TOYYIBPAY_BASE_URL=https://toyyibpay.com
TOYYIBPAY_SECRET_KEY=
TOYYIBPAY_CATEGORY_CODE=
TOYYIBPAY_RETURN_URL=https://your-frontend-domain.up.railway.app/subscription
TOYYIBPAY_CALLBACK_URL=https://your-backend-domain.up.railway.app/api/v1/webhooks/toyyibpay
```

You can leave OpenAI, AWS, Firebase, and ToyyibPay blank while testing demo screens.

## Step 4: Add Frontend Service

Create another service from the same GitHub repo.

Use these Railway service settings:

```text
Service name:
ascend-frontend

Root directory:
/

Build command:
npm run build --workspace shared && npm run build --workspace frontend

Start command:
npm run start --workspace frontend
```

Frontend variables:

```text
NEXT_PUBLIC_API_URL=https://your-backend-domain.up.railway.app/api/v1
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

If Firebase values are blank, the login page shows demo mode.

## Step 5: Generate Railway Domains

Generate a public domain for:

- `ascend-backend`
- `ascend-frontend`

Then update:

- Backend `CORS_ORIGIN` to the frontend domain
- Frontend `NEXT_PUBLIC_API_URL` to the backend domain plus `/api/v1`

## Step 6: Create Database Tables And Seed Data

Beginner option:

1. Copy Railway's public `DATABASE_URL`.
2. Paste it into `backend/.env` locally.
3. Run:

```powershell
npm run migrate
npm run seed
```

This creates tables and seed data for:

- Anytime Fitness Austin Green
- Anytime Fitness Kulai Indahpura
- Sample trainers
- Sample clients
- Gym referral codes
- Trainer referral codes
- Malaysia/Singapore local foods

## Step 7: Test

Open:

```text
https://your-frontend-domain.up.railway.app
```

Test:

- `/login`
- `/dashboard`
- `/food-log`
- `/trainer`
- `/admin`

Backend health:

```text
https://your-backend-domain.up.railway.app/api/v1/health
```

Expected:

```json
{
  "status": "ok",
  "service": "ascend-api"
}
```


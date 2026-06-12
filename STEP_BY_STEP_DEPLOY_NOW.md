# Ascend Step-By-Step Pilot Deployment Guide

This guide is written for a non-technical founder.

Goal: launch a small unpaid pilot test for:

- Anytime Fitness Austin Green
- Anytime Fitness Kulai Indahpura

For this pilot, clients do not need to pay. You will use the test plan activation inside the app so selected testers can unlock Premium and Trainer Pro during the pilot.

## What You Need Before Starting

You need accounts for:

- GitHub
- Railway
- Firebase
- Google Gemini
- Cloudflare R2

You can skip for this unpaid pilot:

- ToyyibPay live setup
- Stripe
- Docker
- Local PostgreSQL

## Simple Picture Of What You Are Building

Ascend has 3 main parts:

1. Frontend
   - The website/app your members open on their phone.
2. Backend
   - The brain of the app.
3. Database
   - The place where users, gyms, trainers, logs, referrals, and subscriptions are stored.

Railway will host all 3.

Firebase handles login only.

Google Gemini powers food photo AI and coach chat.

Cloudflare R2 stores food and progress photos.

## Part 1: Confirm GitHub Is Ready

1. Open GitHub.
2. Go to your Ascend repository:

```text
https://github.com/mdfarizanwar369/ascend
```

3. Confirm you can see the project files.
4. Confirm the latest code is on the `main` branch.

If Railway is already connected to GitHub, you do not need to upload anything else manually.

## Part 2: Set Up Railway Project

1. Open Railway.
2. Open your Ascend project.
3. You should have these services:

- PostgreSQL database
- Backend service
- Frontend service

If you do not have them yet:

1. Click `New`.
2. Add `PostgreSQL`.
3. Click `New` again.
4. Deploy from GitHub repo.
5. Choose the Ascend repo.
6. Name one service:

```text
ascend-backend
```

7. Add another service from the same GitHub repo.
8. Name it:

```text
ascend-frontend
```

## Part 3: Configure Backend Service On Railway

Click the `ascend-backend` service.

Go to:

```text
Settings
```

Set these:

```text
Root Directory:
/

Build Command:
npm run build --workspace shared && npm run build --workspace backend

Start Command:
npm run start --workspace backend
```

Now go to:

```text
Variables
```

Add these backend variables.

### Required Backend Variables

```text
NODE_ENV=production
PORT=4000
DATABASE_URL=${{Postgres.DATABASE_URL}}
CORS_ORIGIN=https://YOUR-FRONTEND-DOMAIN
BOOTSTRAP_OWNER_EMAIL=your-owner-email@gmail.com
CRON_SECRET=make-a-long-random-password-here
AI_PROVIDER=gemini
GEMINI_MODEL=gemini-2.5-flash
```

Replace:

```text
https://YOUR-FRONTEND-DOMAIN
```

with your real Railway frontend URL.

Example:

```text
CORS_ORIGIN=https://ascend-production-b64f.up.railway.app
```

For `BOOTSTRAP_OWNER_EMAIL`, use the email you want as the owner/admin login.

Example:

```text
BOOTSTRAP_OWNER_EMAIL=mdfarizanwar@gmail.com
```

For `CRON_SECRET`, type something long and random.

Example:

```text
CRON_SECRET=AscendDailyJobSecret2026VeryLong
```

## Part 4: Configure Frontend Service On Railway

Click the `ascend-frontend` service.

Go to:

```text
Settings
```

Set these:

```text
Root Directory:
/

Build Command:
npm run build --workspace shared && npm run build --workspace frontend

Start Command:
npm run start --workspace frontend
```

Now go to:

```text
Variables
```

Add:

```text
NEXT_PUBLIC_API_URL=https://YOUR-BACKEND-DOMAIN/api/v1
```

Replace:

```text
https://YOUR-BACKEND-DOMAIN
```

with your real Railway backend URL.

Example:

```text
NEXT_PUBLIC_API_URL=https://ascend-backend-production.up.railway.app/api/v1
```

## Part 5: Generate Railway Domains

You need 2 public URLs:

- One for frontend
- One for backend

### Frontend Domain

1. Click `ascend-frontend`.
2. Go to `Settings`.
3. Find `Networking`.
4. Click `Generate Domain`.
5. Use port:

```text
3000
```

6. Copy the frontend URL.

Example:

```text
https://ascend-production-b64f.up.railway.app
```

### Backend Domain

1. Click `ascend-backend`.
2. Go to `Settings`.
3. Find `Networking`.
4. Click `Generate Domain`.
5. Use port:

```text
4000
```

6. Copy the backend URL.

Example:

```text
https://ascend-backend-production.up.railway.app
```

### After You Have Both URLs

Go back to backend variables and set:

```text
CORS_ORIGIN=https://YOUR-FRONTEND-DOMAIN
```

Go back to frontend variables and set:

```text
NEXT_PUBLIC_API_URL=https://YOUR-BACKEND-DOMAIN/api/v1
```

Then redeploy both services.

## Part 6: Set Up Firebase Login

Firebase lets members log in.

1. Open Firebase Console.
2. Open your Ascend Firebase project.
3. Go to:

```text
Authentication
```

4. Click:

```text
Sign-in method
```

5. Make sure `Email/Password` is enabled.

### Add Your Railway Frontend Domain

1. In Firebase, go to:

```text
Authentication > Settings > Authorized domains
```

2. Add your frontend Railway domain.

Example:

```text
ascend-production-b64f.up.railway.app
```

Do not include `https://` in Firebase authorized domains.

### Add Firebase Web Variables To Railway Frontend

In Firebase:

1. Go to Project Settings.
2. Find your Web App.
3. Copy the config values.

In Railway frontend variables, add:

```text
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

Use the values from Firebase.

### Add Firebase Admin Variables To Railway Backend

In Firebase:

1. Go to Project Settings.
2. Go to Service Accounts.
3. Click `Generate new private key`.
4. Download the JSON file.

In Railway backend variables, add:

```text
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

Use the values from the JSON file:

- `project_id` goes into `FIREBASE_PROJECT_ID`
- `client_email` goes into `FIREBASE_CLIENT_EMAIL`
- `private_key` goes into `FIREBASE_PRIVATE_KEY`

Important:

The private key starts with:

```text
-----BEGIN PRIVATE KEY-----
```

and ends with:

```text
-----END PRIVATE KEY-----
```

Copy the whole thing.

After adding Firebase variables, redeploy both frontend and backend.

## Part 7: Set Up Google Gemini

Google Gemini powers:

- Food photo calories/macros
- AI nutrition coach
- Burn estimate
- Weekly report
- Trainer AI check-in

1. Open Google AI Studio:

```text
https://aistudio.google.com
```

2. Sign in with your Google account.
3. Click `Get API key`.
4. Create an API key.
5. Copy it.
6. In Railway backend variables, add:

```text
AI_PROVIDER=gemini
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-2.5-flash
```

Redeploy backend.

Gemini has a free tier, but you should still watch usage in Google AI Studio during the pilot.

## Part 8: Set Up Cloudflare R2 Storage

Cloudflare R2 stores uploaded photos.

1. Open Cloudflare.
2. Go to R2 Object Storage.
3. Create a bucket.

Suggested bucket name:

```text
ascend-photos
```

4. Create an R2 access key.
5. Copy:

- Access key ID
- Secret access key
- Endpoint URL
- Bucket name

In Railway backend variables, add:

```text
AWS_REGION=auto
AWS_S3_ENDPOINT=https://YOUR-R2-ENDPOINT
AWS_ACCESS_KEY_ID=YOUR-R2-ACCESS-KEY
AWS_SECRET_ACCESS_KEY=YOUR-R2-SECRET-KEY
AWS_S3_BUCKET=ascend-photos
```

Redeploy backend.

Then test this URL:

```text
https://YOUR-BACKEND-DOMAIN/api/v1/health/storage
```

You want to see:

```text
storageConfigured: true
```

## Part 9: Skip ToyyibPay For This Pilot

Because this is a small unpaid pilot, you can skip ToyyibPay for now.

Do not invite public users yet.

For pilot testers:

- Client can create account.
- Client can activate test Premium.
- Trainer can activate test Trainer Pro.

Important:

Before a paid public launch, you must disable or restrict test activation.

## Part 10: Run Database Migration And Seed

This creates the database tables and launch gym data.

You can run this from your computer using PowerShell.

### Step 1: Get Public Railway Database URL

1. Open Railway.
2. Click PostgreSQL service.
3. Go to Variables or Connect.
4. Find the public database connection.

It may look like:

```text
postgresql://postgres:PASSWORD@HOST:PORT/railway
```

or Railway may show:

```text
HOST: acela.proxy.rlwy.net
PORT: 54638
USER: postgres
PASSWORD: ********
DATABASE: railway
```

You need the full connection string.

### Step 2: Put It Into Backend Local Env

On your computer, open:

```text
backend/.env
```

Set:

```text
DATABASE_URL=your-public-railway-postgres-url
```

Important:

Do not use:

```text
postgres.railway.internal
```

from your computer. That only works inside Railway.

### Step 3: Run Migration

Open PowerShell in the project folder.

Run:

```powershell
npm run migrate
```

Expected:

```text
Migration completed
```

### Step 4: Run Seed

Run:

```powershell
npm run seed
```

Expected:

The seed should create:

- Anytime Fitness Austin Green
- Anytime Fitness Kulai Indahpura
- Sample trainers
- Sample clients
- Referral codes
- Local foods

Important referral codes:

```text
AF-AUSTIN
AF-KULAI
TRAINER-JASON
TRAINER-SITI
```

## Part 11: Test The Backend

Open this in your browser:

```text
https://YOUR-BACKEND-DOMAIN/api/v1/health
```

You should see:

```json
{
  "status": "ok",
  "service": "ascend-api"
}
```

Now open:

```text
https://YOUR-BACKEND-DOMAIN/api/v1/gyms
```

You should see both gyms.

Now open:

```text
https://YOUR-BACKEND-DOMAIN/api/v1/referrals/validate/AF-AUSTIN
```

You should see Anytime Fitness Austin Green.

## Part 12: Create Your Owner Account

1. Open the frontend app:

```text
https://YOUR-FRONTEND-DOMAIN/login
```

2. Sign up using the owner email from:

```text
BOOTSTRAP_OWNER_EMAIL
```

3. After signup/login, open:

```text
https://YOUR-FRONTEND-DOMAIN/bootstrap-owner
```

4. Then open:

```text
https://YOUR-FRONTEND-DOMAIN/admin
```

Expected:

- Admin page loads.
- Your account card says owner/admin access.

## Part 13: Create Pilot Trainer Accounts

For Austin Green:

1. Open `/login`.
2. Choose `Trainer`.
3. Sign up trainer account.
4. Use referral code:

```text
AF-AUSTIN
```

For Kulai:

1. Open `/login`.
2. Choose `Trainer`.
3. Sign up trainer account.
4. Use referral code:

```text
AF-KULAI
```

After trainer signs up:

1. Log in as owner.
2. Open:

```text
/admin/users
```

3. Approve the trainer.
4. Ask trainer to open:

```text
/subscription
```

5. Trainer clicks:

```text
Activate test plan
```

for Trainer Pro.

Now trainer should be able to open:

```text
/trainer
```

## Part 14: Create Pilot Client Accounts

For a client who already has a trainer:

1. Open `/login`.
2. Choose `Client`.
3. Sign up.
4. Use trainer referral code.

Examples:

```text
TRAINER-JASON
TRAINER-SITI
```

This should automatically assign the client to that trainer.

For a client who belongs to a gym but is not assigned yet:

1. Open `/login`.
2. Choose `Client`.
3. Sign up.
4. Use gym referral code:

```text
AF-AUSTIN
```

or:

```text
AF-KULAI
```

Then owner must assign them later in:

```text
/admin/users
```

## Part 15: Give Pilot Clients Premium Access

Because this pilot is unpaid:

1. Client logs in.
2. Client opens:

```text
/subscription
```

3. Client chooses Premium.
4. Client clicks:

```text
Activate test plan
```

Expected:

- Account card changes to Premium.
- Food photo, coach, reports, messages, and progress photos unlock.

## Part 16: Test One Full Client Flow

Use one test client.

1. Log in as client.
2. Complete onboarding.
3. Activate Premium test plan.
4. Open dashboard.
5. Log water.
6. Log weight.
7. Log burn.
8. Create a habit.
9. Check off the habit.
10. Upload food photo.
11. Confirm AI estimate appears.
12. Edit calories or macros.
13. Save food log.
14. Return to dashboard.
15. Confirm dashboard totals updated.
16. Open AI coach.
17. Send a question.
18. Confirm AI replies.
19. Open reports.
20. Generate weekly report.
21. Upload progress photo.

If all of this works, the client side is pilot-ready.

## Part 17: Test One Full Trainer Flow

Use one approved trainer.

1. Trainer logs in.
2. Trainer activates Trainer Pro test plan.
3. Trainer opens:

```text
/trainer
```

4. Trainer sees assigned client.
5. Trainer opens client detail.
6. Trainer checks:

- Food logs
- Water logs
- Weight logs
- Progress photos
- Compliance score
- Messages

7. Trainer sends a message to client.
8. Client logs in and confirms message appears.
9. Client replies.
10. Trainer confirms reply appears.

If this works, trainer accountability is pilot-ready.

## Part 18: Test One Full Owner Flow

Log in as owner.

Open:

```text
/admin
```

Check:

- Revenue cards load
- Client count loads
- Trainer count loads
- Pending trainers show
- Unassigned clients show

Open:

```text
/admin/users
```

Check:

- You can approve trainer
- You can assign client to trainer

Open:

```text
/admin/referrals
```

Check:

- Gym referral codes show
- Trainer referral codes show
- Attribution is understandable

Open:

```text
/admin/subscriptions
```

Check:

- Test subscriptions appear
- Gym/trainer attribution appears

## Part 19: Run Daily Job Manually

The daily job updates compliance and risk alerts.

For now, you can run it manually.

Use a tool like Postman or Railway console if available.

Request:

```text
POST https://YOUR-BACKEND-DOMAIN/api/v1/jobs/daily
```

Header:

```text
x-cron-secret: YOUR_CRON_SECRET
```

Expected:

The job should complete successfully.

Later, you can schedule this once per day using Railway Cron or another scheduler.

## Part 20: Invite Small Pilot Group

Suggested first pilot:

Austin Green:

- 1 owner/admin
- 1 trainer
- 3 to 5 clients

Kulai:

- 1 owner/admin
- 1 trainer
- 3 to 5 clients

Give each person:

1. App URL
2. Their role
3. Referral code
4. What to test

## Suggested Message To Clients

```text
Hey, we are testing Ascend, a fitness accountability app for our gym.

Please create an account here:
YOUR-FRONTEND-URL

Use this referral code:
YOUR-CODE

This pilot is free. After signing up, go to Subscription and activate the test Premium plan.

Please test:
- food photo logging
- water tracking
- weight tracking
- habits
- AI coach
- trainer messaging
```

## Suggested Message To Trainers

```text
Hey, we are testing Ascend for trainer-client accountability.

Please create a Trainer account here:
YOUR-FRONTEND-URL

Use this gym referral code:
YOUR-GYM-CODE

After I approve your trainer account, go to Subscription and activate the test Trainer Pro plan.

Please test:
- trainer dashboard
- assigned clients
- client food logs
- progress photos
- messages
- AI weekly check-in
```

## Part 21: What To Watch During The Pilot

Every day, check:

- Can clients log in?
- Are food photos uploading?
- Are AI estimates useful?
- Are trainers seeing client data?
- Are messages working?
- Are clients confused about what to press?
- Are any users stuck on access or plan pages?
- Are dashboard totals updating?

## Do Not Do Yet

Do not publicly launch paid subscriptions yet.

Do not advertise widely yet.

Do not invite too many users before:

- ToyyibPay is tested
- Test-plan activation is restricted
- Daily job is scheduled
- Production backup is confirmed

## Pilot Is Ready When

You can answer yes to all:

- Can a client sign up?
- Can a client activate free test Premium?
- Can a client upload food photo?
- Can AI estimate calories and macros?
- Can client chat with AI?
- Can trainer see client logs?
- Can trainer message client?
- Can owner assign clients?
- Can owner approve trainers?
- Can both gyms use their referral codes?

If yes, you are ready for a small unpaid pilot.

# Ascend

Security issues should be reported privately using the process in [SECURITY.md](SECURITY.md). Never place production credentials in source files; keep them in Railway environment variables.

Ascend is a mobile-first PWA SaaS MVP for fitness accountability across gym members, trainers, and gym owners.

Optional Athlete Mode can be enabled by an owner for selected serious clients. It adds event countdowns, readiness check-ins, weekly training targets, deterministic coach reviews, trainer-only private notes, and the test-phase Ascend DNA Body Composition Engine without changing the standard client experience.

Ascend DNA Body Composition Engine is an Athlete Mode-only module for importing body composition scans from printed reports, phone photos, machine screens, screenshots, or manual entry. It supports manufacturer-independent scan history, review-before-save confirmation, trend summaries, experimental DNA Score, coach alerts, and scan-informed nutrition guidance. It is not a medical device and does not diagnose disease.

Ascend uses one multi-gym application, not separate copies per gym. The bootstrap owner is the platform owner and can access every gym. Other owner/admin accounts are restricted by backend-enforced gym assignments and may be assigned to one or multiple gyms.

Client nutrition guides use age, height, sex, activity level, latest logged weight, and goal. Clients can start a new Fat Loss, Muscle Gain, or Maintenance journey from the guide profile. After at least three weigh-ins across two weeks, Ascend may apply a conservative 100 kcal trend adjustment. These numbers are practical estimates, not medical prescriptions.

The client dashboard also provides a lightweight 30-day self-comparison. It compares only the member with their own earlier records and highlights positive changes in goal-aligned weight, Momentum Score, and weekly check-in consistency. It does not use AI or compare members with one another.

Owner account cleanup uses a two-step process: deactivate first, then permanently delete from the Inactive users tab. Permanent deletion removes the Firebase login, PostgreSQL user data, messages, and stored user photos. Live paid subscriptions must be cancelled before deletion.

Initial launch gyms:

- Anytime Fitness Austin Green
- Anytime Fitness Kulai Indahpura

## Tech Stack

- Frontend: Next.js, React, TypeScript, Tailwind CSS, PWA
- Backend: Node.js, Express, TypeScript
- Shared package: TypeScript types and constants
- Database: PostgreSQL
- Auth: Firebase Auth
- Storage: Cloudflare R2 or AWS S3-compatible object storage
- AI: Google Gemini for the unpaid pilot, OpenAI-compatible fallback available
- Payments: Stripe Checkout and recurring subscriptions, with manual pilot access
- Deployment: Railway for the live pilot; Docker remains available for local/self-hosted deployments
- Installation: Ascend offers `Install Ascend` only after signup or a successful tracking action, uses the native Android/desktop prompt, and gives iPhone users guided Safari instructions. The option is always available under Profile & Settings.

Latest release audit (21 June 2026): all 53 automated tests, lint, production builds, production database integrity, mobile route rendering, owner session restoration, storage health, Stripe webhook rejection, and live Gemini coach response passed. See `ASCEND_IMPLEMENTATION_STATUS.md` for the exact evidence and remaining human checks.

## Required Local Tools For Windows

Install these first:

- Node.js `22.x LTS` or newer
- npm `10.x` or newer, included with Node.js
- Docker Desktop for Windows
- Git for Windows, optional but recommended

Check versions in PowerShell:

```powershell
node --version
npm --version
docker --version
docker compose version
```

## Project Structure

```text
frontend/
backend/
shared/
docs/
outputs/
```

## Environment Files

Create these files from the examples:

```powershell
Copy-Item .env.example .env
Copy-Item frontend\.env.example frontend\.env.local
Copy-Item backend\.env.example backend\.env
```

For local development, the default database value is:

```text
DATABASE_URL=postgres://ascend:ascend@localhost:5432/ascend
```

Minimum local values:

```text
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
PORT=4000
DATABASE_URL=postgres://ascend:ascend@localhost:5432/ascend
CORS_ORIGIN=http://localhost:3000
```

Optional values for live integrations:

- Firebase web app values in `frontend/.env.local`
- Firebase Admin values in `backend/.env`
- AWS S3 credentials in `backend/.env`
- Gemini API key in `backend/.env`
- Stripe values in `backend/.env`
- `CRON_SECRET` in `backend/.env` for the protected daily compliance/risk job

Ascend DNA uses the existing Athlete Mode flag and Gemini configuration:

```text
ATHLETE_MODE_ENABLED=true
AI_PROVIDER=gemini
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
```

Without Gemini/OpenAI configured, the backend returns demo AI responses.

AI usage is tracked in PostgreSQL for food image analysis, nutrition coach messages, and weekly report generation. Owner accounts can see monthly usage, projected spend, cache hits, and warning levels on the admin dashboard. Configure monthly limits and per-call estimates with:

```text
AI_MONTHLY_SPEND_LIMIT_CENTS=5000
AI_MONTHLY_FOOD_ANALYSIS_LIMIT=1000
AI_MONTHLY_CHAT_LIMIT=3000
AI_MONTHLY_WEEKLY_REPORT_LIMIT=500
AI_FOOD_ANALYSIS_ESTIMATED_COST_CENTS=2
AI_CHAT_ESTIMATED_COST_CENTS=1
AI_WEEKLY_REPORT_ESTIMATED_COST_CENTS=2
```

Food photo estimates are cached by image hash, so repeated analysis of the same image does not call Gemini again.

Real paid subscriptions use Stripe Checkout. Manual owner-approved pilot access remains available when payment variables are not configured.

Paid access remains active through the end of a cancelled billing period. The subscription page shows renewal, cancellation, expiry, and payment-attention states and links Stripe customers to the hosted billing portal.

```text
PAYMENT_PROVIDER=stripe
FRONTEND_URL=https://www.getascend.fit
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PREMIUM_PRICE_ID=
STRIPE_TRAINER_PRO_PRICE_ID=
```

Android wrapper builds can point at the live hosted application with:

```text
CAPACITOR_ANDROID_SERVER_URL=https://www.getascend.fit/launch
```

This is used only by the Android shell and does not change the primary web application.

Set the Stripe webhook URL to `https://your-backend-domain/api/v1/webhooks/stripe`. Signed webhook events activate, renew, cancel, or place plans into payment-attention states and are recorded in `payment_events`. See `STRIPE_SETUP.md`.

## Pilot Operations

Use these short guides when onboarding the first gyms:

- `PILOT_CLIENT_GUIDE.md`
- `PILOT_TRAINER_GUIDE.md`
- `PILOT_OWNER_GUIDE.md`
- `PILOT_FEEDBACK_QUESTIONNAIRE.md`
- `PILOT_WEEKLY_REVIEW.md`

Signup links the Terms and Privacy Policy, and authenticated screens provide a direct support route to `support@getascend.fit`.

### Adding A Gym Owner

1. Have the person create a normal account.
2. From **Admin > Users**, change the account role to **Owner**.
3. Under **Owner gym access**, assign one or more gyms.
4. Ask the owner to log out and back in.

Only the platform owner configured by `BOOTSTRAP_OWNER_EMAIL` can appoint owners or change their gym access. Gym owners see only users, trainers, clients, referrals, subscriptions, notifications, analytics, messages, and trainer data belonging to their assigned gyms.

Without Firebase web app values, `/login` shows a demo-mode button so you can review the MVP screens locally. Real account creation requires filling:

```text
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

Google Sign-In is disabled by default and should only be enabled after completing
`GOOGLE_AUTH_DEPLOYMENT_CHECKLIST.md`. On the live custom domain, the frontend Firebase auth domain should be
`www.getascend.fit` and the app proxies `/__/auth/*` to Firebase's auth helper so Safari redirect sign-in can work
reliably outside Firebase Hosting.

## Install Dependencies

From the project root:

```powershell
npm install
```

The root package uses npm workspaces for `frontend`, `backend`, and `shared`.

## Database Setup

Start PostgreSQL:

```powershell
docker compose up postgres
```

In a second PowerShell window, run the database migration:

```powershell
npm run migrate
```

Seed the launch gyms, sample trainers, sample clients, referral codes, and local foods:

```powershell
npm run seed
```

Seeded referral codes include:

- `AF-AUSTIN`
- `AF-KULAI`
- `TRAINER-JASON`
- `TRAINER-SITI`

## Start The App Locally

Start backend and frontend together:

```powershell
npm run dev
```

Or start them separately:

```powershell
npm run dev --workspace backend
npm run dev --workspace frontend
```

Local URLs:

- Frontend: `http://localhost:3000`
- Backend health check: `http://localhost:4000/api/v1/health`

## Build

```powershell
npm run build
```

## Android App Preparation

Ascend can be packaged as an Android app shell without changing the production web application. The Android client uses the same live backend and routes as the web app.

Prepare the Android shell assets and sync the native project:

```powershell
npm run android:prepare
```

Useful Android commands:

```powershell
npm run android:sync
npm run android:open
npm run android:debug-apk
npm run android:release-bundle
npm run android:release-apk
npm run android:keystore:generate
npm run android:internal-testing:prepare
```

### Android Internal Testing Prep

Ascend now supports a proper Google Play internal-testing release flow.

1. Generate an upload keystore one time:

```powershell
npm run android:keystore:generate
```

This creates:

- `android/keystore/ascend-upload.jks`
- `android/signing.properties`

Both are ignored by git. Back them up securely before publishing to Play Console.

2. Set Android version metadata as needed:

```text
ASCEND_ANDROID_VERSION_CODE=1
ASCEND_ANDROID_VERSION_NAME=0.1.0
```

3. Build the signed Android App Bundle:

```powershell
npm run android:release-bundle
```

Output:

- `android/app/build/outputs/bundle/release/app-release.aab`

4. Optional signed release APK for sideload testing:

```powershell
npm run android:release-apk
```

Output:

- `android/app/build/outputs/apk/release/app-release.apk`

Release builds now:

- require explicit release signing
- use R8/ProGuard shrinking and minification
- disable cleartext traffic
- use a dedicated network security config
- preserve Capacitor/Firebase plugin bridge classes required at runtime

Requirements before native Android builds will work:

- Java JDK installed
- Android Studio installed
- Android SDK + Platform Tools installed
- `adb` available on PATH

See `GOOGLE_PLAY_RELEASE_CHECKLIST.md` for the complete Play Store checklist.

## Test

```powershell
npm run test
```

The release verification baseline is:

- production build succeeds
- frontend and backend lint/type checks succeed
- backend automated tests pass
- `npm audit --omit=dev` has no critical or high advisories
- production database integrity checks show no cross-gym assignments or duplicate live plans

## Daily Compliance And Risk Jobs

The backend includes a protected endpoint for production schedulers:

```text
POST /api/v1/jobs/daily
```

Set this backend variable:

```text
CRON_SECRET=replace-with-a-long-random-string
```

Then call the endpoint with:

```text
x-cron-secret: replace-with-a-long-random-string
```

It recalculates compliance scores and creates trainer alerts for inactivity, low compliance, missing food logs, and weight trends moving away from goal.

## Lint / Type Check

```powershell
npm run lint
```

## Docker Compose

To run PostgreSQL, migration, seed, backend, and frontend:

```powershell
docker compose up
```

Docker URLs:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:4000`
- PostgreSQL: `localhost:5432`

To reset the local Docker database:

```powershell
docker compose down -v
docker compose up
```

## Validation

The npm validation path has been run successfully after Node.js and npm became available:

- `npm install`
- `npm run build`
- `npm run test`
- `npm run lint`

The frontend also includes a browser session guard so account switching, logout, and mobile browser back/forward restores re-check access instead of keeping stale role or plan state.

Premium AI coach chat and weekly progress reports are connected to backend APIs. Without `GEMINI_API_KEY` or `OPENAI_API_KEY`, the backend returns safe demo coaching/report text.

## Athlete Mode Pilot

Athlete Mode is isolated and off for every member until an owner enables it from **Admin > Users**. Enabled athletes receive an **Athlete Mode** card on their client dashboard. Their assigned trainer sees a compact coach panel on the existing client-detail page.

Athlete inputs are daily by default and clearly labelled. Coaches explicitly choose daily or weekly targets. Serious readiness signals override the average score and display a reason, seven-day readiness is visible to coaches, competition countdowns use the athlete/gym timezone, and weekly reviews update automatically when opened.

Set `ATHLETE_MODE_ENABLED=false` on the backend to disable the entire module immediately. Existing food, weight, water, habits, messages, subscriptions, and trainer dashboards continue operating independently.

## Public Product Demo

Ascend includes a public, read-only 30-second product story at `http://localhost:3000/demo`. It uses fixed sample data and never connects to Firebase, PostgreSQL, storage, Gemini, or Stripe.

- Standard demo: `/demo`
- Autoplay vertical recording view: `/demo?record=1`
- Production subdomain: `https://demo.getascend.fit`

The demo supports autoplay, looping, pause, replay, scene navigation, reduced-motion preferences, and a direct pilot waitlist link. The frontend proxy rewrites only the root of `demo.getascend.fit` to `/demo`; authenticated routes remain on the main application domain.

Before connecting real services, also run:

```powershell
docker compose up
```

Then follow:

```text
TESTING_CHECKLIST.md
```

## Documentation

- Architecture: `outputs/ASCEND_ARCHITECTURE_AND_ROADMAP.md`
- Implementation status: `outputs/ASCEND_IMPLEMENTATION_STATUS.md`
- API spec: `docs/API_SPEC.md`
- Deployment guide: `docs/DEPLOYMENT.md`
- Railway beginner deployment: `docs/RAILWAY_DEPLOYMENT.md`
- Pilot launch checklist: `LAUNCH_CHECKLIST.md`
- Step-by-step unpaid pilot deployment: `STEP_BY_STEP_DEPLOY_NOW.md`
- Critical bugs and blockers: `CRITICAL_BUGS.md`
- Deployment checklist: `DEPLOYMENT_CHECKLIST.md`
- Pilot testing checklist: `TESTING_CHECKLIST.md`
- Environment variables: `ENVIRONMENT_VARIABLES.md`
- External accounts: `EXTERNAL_ACCOUNTS.md`
- Access testing: `ACCESS_TESTING_CHECKLIST.md`

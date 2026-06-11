# Ascend

Ascend is a mobile-first PWA SaaS MVP for fitness accountability across gym members, trainers, and gym owners.

Initial launch gyms:

- Anytime Fitness Austin Green
- Anytime Fitness Kulai Indahpura

## Tech Stack

- Frontend: Next.js, React, TypeScript, Tailwind CSS, PWA
- Backend: Node.js, Express, TypeScript
- Shared package: TypeScript types and constants
- Database: PostgreSQL
- Auth: Firebase Auth
- Storage: AWS S3
- AI: OpenAI API
- Payments: ToyyibPay first, Stripe-ready payment abstraction
- Deployment: Docker, DigitalOcean

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
- OpenAI API key in `backend/.env`
- ToyyibPay values in `backend/.env`
- `CRON_SECRET` in `backend/.env` for the protected daily compliance/risk job

Without OpenAI configured, the backend returns demo AI responses.

Without ToyyibPay configured, checkout returns a safe demo return URL and you can use the in-app test activation button. Real paid subscriptions require these backend variables:

```text
TOYYIBPAY_BASE_URL=https://toyyibpay.com
TOYYIBPAY_SECRET_KEY=
TOYYIBPAY_CATEGORY_CODE=
TOYYIBPAY_RETURN_URL=https://your-frontend-domain/subscription
TOYYIBPAY_CALLBACK_URL=https://your-backend-domain/api/v1/webhooks/toyyibpay
```

ToyyibPay callbacks are accepted as JSON or form-encoded payloads and recorded in `payment_events`.

Without Firebase web app values, `/login` shows a demo-mode button so you can review the MVP screens locally. Real account creation requires filling:

```text
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

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

## Test

```powershell
npm run test
```

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

Premium AI coach chat and weekly progress reports are connected to backend APIs. Without `OPENAI_API_KEY`, the backend returns safe demo coaching/report text.

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
- Critical bugs and blockers: `CRITICAL_BUGS.md`
- Deployment checklist: `DEPLOYMENT_CHECKLIST.md`
- Pilot testing checklist: `TESTING_CHECKLIST.md`
- Environment variables: `ENVIRONMENT_VARIABLES.md`
- External accounts: `EXTERNAL_ACCOUNTS.md`
- Access testing: `ACCESS_TESTING_CHECKLIST.md`

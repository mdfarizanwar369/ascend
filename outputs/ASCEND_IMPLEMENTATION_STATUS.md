# Ascend Implementation Status

## Current Build

The Ascend MVP has moved from architecture into implementation.

Implemented structure:

- `/frontend`: Next.js, React, TypeScript, Tailwind CSS, PWA shell.
- `/backend`: Node.js, Express, TypeScript API.
- `/shared`: shared TypeScript types, constants, plans, local foods, compliance weights.

## Frontend Implemented

- Mobile-first landing entry.
- Firebase sign-up/login screen.
- Client daily dashboard.
- Client onboarding screen.
- AI food estimate review/edit screen.
- Demo food-photo macro estimation flow with editable calories, protein, carbs, and fat.
- Demo food log persistence to local storage and dashboard summary.
- AI nutrition coach chat screen.
- Subscription plan screen.
- Progress photo screen.
- Habit tracking screen.
- Trainer client detail screen.
- Admin referral analytics screen.
- Admin subscription attribution screen.
- Trainer dashboard.
- Admin revenue dashboard.
- PWA manifest.
- Service worker.
- Firebase client initialization helper.
- Typed Ascend API helper layer.
- Browser-safe lazy Firebase initialization.

## Backend Implemented

- Express API server.
- Firebase Auth token verification middleware.
- Firebase token provisioning endpoint for first-time PostgreSQL user creation.
- PostgreSQL role and permission lookup.
- Role-based authorization.
- Gym APIs.
- Referral validation and creation APIs.
- Client onboarding API.
- Food log APIs.
- Food image upload URL API.
- AI food estimate API.
- Weight log APIs.
- Water log APIs.
- Habit APIs.
- Progress photo APIs.
- Compliance APIs.
- Trainer client, log, and alert APIs.
- Admin user, trainer, subscription, revenue, and referral analytics APIs.
- Admin usage and compliance analytics APIs.
- Messaging APIs.
- Subscription cancellation API.
- Zod request validation for high-use logging and messaging endpoints.
- ToyyibPay-first payment provider abstraction.
- ToyyibPay checkout creation with defensive provider response handling.
- ToyyibPay webhook/callback handling for JSON and form-encoded callbacks.
- Payment event recording for ToyyibPay callbacks.
- OpenAI integration for food analysis, coach chat, and weekly summaries.
- AWS S3 signed upload integration.
- Daily compliance job.
- Risk alert job.
- Protected daily jobs endpoint: `POST /api/v1/jobs/daily`.
- Trainer approval workflow.
- Owner/admin action dashboard for pending trainers and unassigned clients.
- Role-aware navigation across owner, trainer, and client sections.
- Session guard for account switching, logout, and browser back/forward refresh.
- Referral analytics and validation show trainer-code gym attribution.
- Local-day dashboard totals for Malaysia/Singapore tracking consistency.

## Database Implemented

Migration includes:

- Multi-gym architecture.
- Users and roles.
- Trainers.
- Referral codes.
- Subscriptions and payment events.
- Food, weight, water, habit, and progress photo logs.
- Compliance scores.
- Risk alerts including inactivity, low compliance, no food logs, and weight trend off goal.
- Messages.
- AI chat history.
- Weekly reports.
- Analytics events.
- Local food items.

Seed data includes:

- Anytime Fitness Austin Green.
- Anytime Fitness Kulai Indahpura.
- Sample owner/admin.
- Sample trainers.
- Sample clients.
- Gym referral codes.
- Trainer referral codes.
- Malaysia/Singapore food examples.

## Production Scaffolding Implemented

- Root `.env.example`.
- Dockerfile for backend.
- Dockerfile for frontend.
- Docker Compose with PostgreSQL.
- README.
- API spec.
- Deployment guide.
- Architecture and roadmap document.
- Railway daily job instructions.

## Verified Locally

- `npm install`
- `npm run build`
- `npm run lint`
- Protected daily jobs endpoint builds and type-checks.
- `npm run test`
- Backend payment parser tests pass.
- Next.js production build includes `/login`.
- Backend TypeScript build passes.
- Frontend ESLint passes.
- Backend compliance tests pass.
- Auth/session stability pass builds and type-checks.

## Remaining Before Live Pilot

- Verify real Firebase production project authorized domains.
- Verify Railway PostgreSQL backup policy.
- Connect real ToyyibPay category and run one low-value live payment callback test.
- Keep Cloudflare R2/S3 credentials configured for live media uploads.
- Keep OpenAI API key configured for live food analysis and coach responses.
- Add end-to-end payment testing.
- Add production monitoring and backups.
- Configure Railway Cron or external scheduler for `/api/v1/jobs/daily`.
- Verify `docker compose up` on a machine where Docker Desktop is installed and visible.
- Complete full manual test pass in `ACCESS_TESTING_CHECKLIST.md`.

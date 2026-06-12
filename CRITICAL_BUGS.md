# Ascend Critical Bugs And Launch Blockers

This file is the pilot launch blocker register.

Status meanings:

- `Open`: must still be verified or fixed.
- `Accepted`: known risk accepted for pilot.
- `Closed`: verified as complete.

## Critical

Critical items block a live pilot.

### C1. Production Firebase must be fully configured

- Status: Open
- Area: Authentication
- Risk: Users cannot reliably sign up, log in, or keep a session.
- Evidence to collect:
  - Frontend Railway variables are set.
  - Backend Firebase Admin variables are set.
  - Firebase authorized domain includes the Railway frontend domain.
  - Login works in normal browser and phone browser.
- Fastest resolution:
  - Configure Firebase web app variables on frontend.
  - Configure Firebase Admin service account variables on backend.
  - Add Railway frontend domain to Firebase Authentication authorized domains.

### C2. Database migration and seed must be run against production PostgreSQL

- Status: Open
- Area: Database
- Risk: App pages may load but fail when users create accounts, referrals, logs, subscriptions, or messages.
- Evidence to collect:
  - `npm run migrate` completed against Railway PostgreSQL public URL or Railway job.
  - `npm run seed` completed.
  - `/api/v1/gyms` returns Austin Green and Kulai Indahpura.
  - `/api/v1/referrals/validate/AF-AUSTIN` works.
- Fastest resolution:
  - Use Railway PostgreSQL public connection string locally for migration/seed, then restore backend `DATABASE_URL` to Railway internal reference.

### C3. Production backend and frontend environment variables must match

- Status: Open
- Area: Deployment
- Risk: Frontend may call wrong backend, backend may reject frontend through CORS, or callbacks may point to wrong URLs.
- Evidence to collect:
  - Frontend `NEXT_PUBLIC_API_URL=https://<backend-domain>/api/v1`.
  - Backend `CORS_ORIGIN=https://<frontend-domain>`.
  - Backend public health URL returns `{ "status": "ok", "service": "ascend-api" }`.
- Fastest resolution:
  - Verify Railway variables on both services after final generated domains are known.

### C4. Photo storage credentials must be configured and verified

- Status: Open
- Area: Food photos and progress photos
- Risk: Premium value proposition breaks because users cannot keep uploaded food/progress images.
- Evidence to collect:
  - `/api/v1/health/storage` returns `storageConfigured: true`.
  - Food photo upload succeeds.
  - Progress photo upload succeeds.
  - Trainer can view client food/progress images.
- Fastest resolution:
  - Configure Cloudflare R2 or AWS S3 variables on backend and redeploy.

### C5. ToyyibPay live checkout/callback must be tested before charging real users

- Status: Open
- Area: Subscription billing
- Risk: User pays but subscription does not unlock, or unpaid user unlocks incorrectly.
- Evidence to collect:
  - Premium checkout creates RM19 bill.
  - Trainer Pro checkout creates RM99 bill.
  - ToyyibPay callback reaches backend.
  - Subscription changes to `active`.
  - Payment event appears in `payment_events`.
- Fastest resolution:
  - Run one low-value live payment or ToyyibPay-approved test flow before inviting pilot users.

### C6. Test-plan activation must be controlled before public pilot

- Status: Open
- Area: Subscription billing
- Risk: Users may activate Premium or Trainer Pro without payment if the test activation UI/API remains publicly reachable.
- Evidence to collect:
  - Business owner decides whether pilot allows manual/test activation.
  - If not allowed, remove or protect `Activate test plan` before public traffic.
- Fastest resolution:
  - For a paid public pilot, hide/disable the test activation path or restrict it to owner/admin only.

### C7. Owner account must be verified in production

- Status: Open
- Area: Admin operations
- Risk: No one can approve trainers, assign clients, inspect revenue, or fix user data.
- Evidence to collect:
  - `BOOTSTRAP_OWNER_EMAIL` matches owner login email exactly.
  - Owner can access `/admin`.
  - Owner can access `/admin/users`, `/admin/referrals`, and `/admin/subscriptions`.
- Fastest resolution:
  - Configure `BOOTSTRAP_OWNER_EMAIL`, sign in, then use `/bootstrap-owner` if needed.

### C8. Daily compliance/risk job must be scheduled or manually run

- Status: Open
- Area: Accountability and trainer alerts
- Risk: Compliance scores and risk alerts become stale, reducing trainer value.
- Evidence to collect:
  - `CRON_SECRET` is set.
  - Scheduler calls `POST /api/v1/jobs/daily`.
  - Manual call succeeds once after deploy.
- Fastest resolution:
  - Configure Railway Cron or external scheduler with `x-cron-secret`.

## Important

Important items should be completed before pilot if possible. They do not necessarily block a small controlled pilot with manual monitoring.

### I1. Gemini live behavior must be tested with real food photos

- Status: Open
- Area: AI
- Risk: Food estimates may fall back to demo text or give poor local-food estimates.
- Fastest resolution:
  - Add `AI_PROVIDER=gemini` and `GEMINI_API_KEY`, upload Nasi Lemak, Chicken Rice, and Roti Canai test images, and verify editable estimates.

### I2. Railway PostgreSQL backup policy must be confirmed

- Status: Open
- Area: Data protection
- Risk: Production user data could be lost.
- Fastest resolution:
  - Enable or confirm Railway backups/snapshots before pilot users enter real progress data.

### I3. Manual access matrix must be completed

- Status: Open
- Area: Authorization
- Risk: Wrong user sees trainer/admin pages or gets blocked from allowed pages.
- Fastest resolution:
  - Complete `ACCESS_TESTING_CHECKLIST.md` with owner, trainer, premium client, and free client.

### I4. Production seed data should be reviewed

- Status: Open
- Area: Data quality
- Risk: Demo users or sample clients may appear in owner/trainer dashboards.
- Fastest resolution:
  - Keep launch gyms and referral codes, then remove or clearly label sample users before inviting real users.

### I5. Env examples must stay aligned after provider changes

- Status: Closed
- Area: Developer operations
- Risk: Confusion when copying env values between root and backend examples.
- Details:
  - Root and backend env examples now include Gemini variables and storage endpoint.
  - Root ToyyibPay return URL now uses `/subscription`.
- Fastest resolution:
  - Align env examples before handing the repo to another developer/operator.

## Optional

Optional items should not block pilot launch.

### O1. Stripe is not implemented

- Status: Accepted
- Area: Payments
- Reason: MVP launch market is Malaysia and ToyyibPay is prioritized.

### O2. WhatsApp integration is not implemented

- Status: Accepted
- Area: Phase 2
- Reason: Explicitly planned for Phase 2.

### O3. Email/PDF weekly report export is not implemented

- Status: Accepted
- Area: Reports
- Reason: In-app weekly reports are available for MVP; export can come later.

### O4. Advanced monitoring dashboard is not implemented

- Status: Open
- Area: Operations
- Reason: Railway logs and health endpoints are sufficient for a very small pilot, but monitoring should improve before broader launch.

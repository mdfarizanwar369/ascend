# Ascend Roadmap

## Current MVP State

Ascend is deployable as a mobile-first PWA with:

- Firebase Auth login and signup.
- Client onboarding, tracking, AI food logging, habits, progress photos, coach chat, and subscriptions.
- Trainer signup, Trainer Pro gating, trainer approval, client work queue, client detail, messaging, risk alerts, and AI check-ins.
- Owner/admin dashboard, users, trainer approvals, client assignment, referrals, subscriptions, and revenue attribution.
- PostgreSQL as source of truth.
- S3/R2-compatible media storage.
- OpenAI integration with demo fallbacks.
- ToyyibPay-first subscription abstraction with manual/test activation.
- Daily compliance and risk job endpoint.

## Before Pilot Launch

1. Complete a full manual pass using `ACCESS_TESTING_CHECKLIST.md`.
2. Configure Railway backend `CRON_SECRET`.
3. Configure Railway Cron or an external scheduler for `POST /api/v1/jobs/daily`.
4. Verify Firebase authorized domains for the Railway frontend domain.
5. Verify R2/S3 upload and read URLs on production.
6. Verify OpenAI food image analysis on production.
7. Configure real ToyyibPay category, return URL, and callback URL.
8. Run one end-to-end ToyyibPay sandbox or low-value live payment test.
9. Confirm Railway PostgreSQL backups.
10. Replace or remove sample seed users before a real public pilot.

## Phase 1 Polish

- Simplify owner user management copy after first live gym feedback.
- Add clearer empty states for new gyms with no clients.
- Add trainer invite links or owner-created trainer invites.
- Add account settings page for name, gym, and trainer assignment visibility.
- Add basic audit log for admin role and assignment changes.

## Phase 2

- WhatsApp reminders and food photo submission.
- WhatsApp trainer alerts.
- Stripe provider implementation.
- Weekly report email or PDF export.
- Gym-specific branded referral landing pages.
- Production monitoring dashboard.

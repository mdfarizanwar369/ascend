# Ascend Roadmap

## Current MVP State

Ascend is deployable as a mobile-first PWA with:

- Firebase Auth login and signup.
- Client onboarding, tracking, AI food logging, habits, progress photos, AI coach chat, weekly reports, and subscriptions.
- Trainer signup, Trainer Pro gating, trainer approval, client work queue, client detail, messaging, risk alerts, and AI check-ins.
- Owner/admin dashboard, users, trainer approvals, client assignment, referrals, subscriptions, and revenue attribution.
- Owner notifications for approvals, unassigned clients, free pilot-access reviews, risk alerts, and recent AI issues.
- Owner-controlled account deactivation for resigned trainers and inactive pilot users.
- Trainer Homework / Daily Mission for simple between-session actions.
- Trainer "Clients needing attention today" list with a top-3 check-in queue and all-clear state.
- One-tap Trainer Recognition so clients feel noticed without adding trainer admin work.
- PostgreSQL as source of truth.
- S3/R2-compatible media storage.
- Gemini AI integration with starter fallbacks.
- ToyyibPay-first subscription abstraction with manual/test activation, checkout creation, callback handling, and payment event records.
- Daily compliance and risk job endpoint.
- Browser back/forward and logout session refresh handling.

## Before Pilot Launch

1. Complete a full manual pass using `ACCESS_TESTING_CHECKLIST.md`.
2. Configure Railway backend `CRON_SECRET`.
3. Configure Railway Cron or an external scheduler for `POST /api/v1/jobs/daily`.
4. Verify Firebase authorized domains for the Railway frontend domain.
5. Verify R2/S3 upload and read URLs on production.
6. Spot-check Gemini food image analysis on production using a real mobile food photo during pilot onboarding.
7. Configure real ToyyibPay category, return URL, and callback URL.
8. Run one end-to-end ToyyibPay low-value live payment test and confirm the subscription changes to active.
9. Confirm Railway PostgreSQL backups.
10. Keep production data clean by removing future throwaway accounts after each pilot test cycle.

## Phase 1 Polish

- Simplify owner user management copy after first live gym feedback.
- Observe whether trainers use Daily Mission before expanding it into templates or structured workout programming.
- Tune attention rules after pilot feedback so trainers see fewer, better check-in prompts instead of noisy alerts.
- Tune automatic praise wording after trainer/client feedback.
- Add clearer empty states for new gyms with no clients.
- Add trainer invite links or owner-created trainer invites.
- Add account settings page for name, gym, and trainer assignment visibility.
- Add basic audit log for admin role, access, and assignment changes.
- Add dismissible/read state for owner notifications after real pilot usage patterns are clear.
- Reassess dependency audit warnings after the next compatible Next.js and Firebase Admin releases.

## Phase 2

- WhatsApp reminders and food photo submission.
- WhatsApp trainer alerts.
- Stripe provider implementation.
- Weekly report email or PDF export.
- Gym-specific branded referral landing pages.
- Production monitoring dashboard.

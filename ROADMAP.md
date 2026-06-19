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
- Gentle Consistency Streaks for client motivation and trainer praise cues.
- PostgreSQL as source of truth.
- S3/R2-compatible media storage.
- Gemini AI integration with starter fallbacks.
- Lemon Squeezy subscription billing with manual pilot activation, secure checkout, signed webhooks, billing portal, and payment event records.
- Daily compliance and risk job endpoint.
- Browser back/forward and logout session refresh handling.
- Public legal, refund, and support pages for subscription launch readiness.
- Owner-only permanent deletion for inactive accounts, including Firebase login and stored media cleanup.
- Platform owner and gym-owner tenancy: one Ascend deployment supports multiple gym owners, with backend-enforced access to assigned gyms only.

## Before Pilot Launch

1. Complete a full manual pass using `ACCESS_TESTING_CHECKLIST.md` and the role-specific pilot guides.
2. Configure Railway backend `CRON_SECRET`.
3. Configure Railway Cron or an external scheduler for `POST /api/v1/jobs/daily`.
4. Verify Firebase authorized domains for the Railway frontend domain.
5. Verify R2/S3 upload and read URLs on production.
6. Spot-check Gemini food image analysis on production using a real mobile food photo during pilot onboarding.
7. After Lemon Squeezy identity approval, run one low-value live payment and cancellation-through-period-end check.
8. Continue using the verified test-mode payment flow or manual owner-approved pilot access until approval.
9. Confirm Railway PostgreSQL backups.
10. Keep production data clean by removing future throwaway accounts after each pilot test cycle.
11. Run the first weekly review with `PILOT_WEEKLY_REVIEW.md` and capture feedback with `PILOT_FEEDBACK_QUESTIONNAIRE.md`.
12. Before onboarding an external owner, verify Gym A cannot read or modify Gym B using the multi-gym isolation checklist.

## Pilot Materials Ready

- Client quick-start and daily routine
- Trainer five-minute workflow
- Owner setup and operating guide
- Role-based feedback questionnaire
- Weekly adoption, engagement, cost, and decision review

## Phase 1 Polish

- Simplify owner user management copy after first live gym feedback.
- Observe whether trainers use Daily Mission before expanding it into templates or structured workout programming.
- Tune attention rules after pilot feedback so trainers see fewer, better check-in prompts instead of noisy alerts.
- Tune automatic praise wording after trainer/client feedback.
- Tune streak milestones after pilot feedback, keeping the language encouraging rather than punitive.
- Add clearer empty states for new gyms with no clients.
- Add trainer invite links or owner-created trainer invites.
- Add account settings page for name, gym, and trainer assignment visibility.
- Add basic audit log for admin role, access, and assignment changes.
- Add dismissible/read state for owner notifications after real pilot usage patterns are clear.
- Reassess dependency audit warnings after the next compatible Next.js and Firebase Admin releases.

## Phase 2

- WhatsApp reminders and food photo submission.
- WhatsApp trainer alerts.
- Additional local Malaysia/Singapore payment methods if pilot demand justifies them.
- Weekly report email or PDF export.
- Gym-specific branded referral landing pages.
- Production monitoring dashboard.

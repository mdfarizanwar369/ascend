# Ascend Implementation Status

Last updated: 16 June 2026

## Pilot Readiness Snapshot

Ascend is ready for a controlled pilot run with a small client pool at:

- Anytime Fitness Austin Green
- Anytime Fitness Kulai Indahpura

The live app is available at:

- https://www.getascend.fit
- https://getascend.fit

## Verified This Pass

- Public landing page loads on the custom domain.
- Root domain forwards to the live Ascend app.
- Firebase email/password login works from the custom domain.
- Owner login routes to the owner dashboard.
- Owner can access Admin, Trainer, and Home areas without being locked out.
- Client signup, onboarding, dashboard, Free Plan display, and water logging work end-to-end.
- Water logs appear back on the client dashboard.
- Premium pilot access can be activated without payment.
- Premium status appears correctly on the dashboard.
- AI nutrition coach connects to Gemini and returns a response.
- Backend health endpoint is live.
- R2-compatible storage health is configured and live.
- Gym seed API returns the two launch gyms.
- Backend tests pass.
- Frontend/backend lint passes.
- Full production build passes.
- Production `/api/v1/gyms` returns both launch gyms.
- Production `/api/v1/referrals/validate/AF-AUSTIN` returns the Austin Green gym referral.
- Backend is configured to use Gemini Flash-Lite by default for lower pilot AI cost.
- AI usage and pilot metrics dashboards are available for owner review.
- Pilot Premium/Trainer Pro access is owner/admin controlled so clients cannot self-upgrade for free from a shared link.
- Obvious production seed/test users were removed, including `@ascend.test`, `@example.com`, and automated audit/pilot example accounts.
- Owner notifications are available on the owner dashboard for trainer approvals, unassigned clients, free clients awaiting pilot access, open risk alerts, and recent AI errors.
- Owners can deactivate or reactivate non-owner user accounts from the Users page when a trainer resigns or a test account should lose access.
- Trainer Homework / Daily Mission is available: trainers can assign one simple action to a client, clients see it on the dashboard, and clients can mark it done.
- Trainer dashboard includes "Clients needing attention today", a top-3 action list that tells trainers who may need a check-in now, with an all-clear state when everyone is steady.
- Trainer Recognition is available: trainers can tap one button to send automatic praise, and clients see that their trainer noticed their progress.
- Consistency Streaks are available: clients see a gentle streak celebration based on any meaningful check-in, and trainers see streak badges on client cards.
- AI food scan guardrails are in place: Free users get 1 scan per week, Premium users get 5 scans per day, Trainer users get 10 scans per day, and owner/admin accounts are unlimited but still tracked.
- Daily nutrition guides are available: onboarding collects age, height, activity level, and sex/prefer-not-to-say, then Ascend estimates calorie, protein, and water guides based on the client's goal.

## Fixes Completed In This Pass

- Removed confusing landing-page buttons that bypassed the normal login/signup flow.
- Removed fake onboarding defaults such as sample names, referral codes, and weights.
- Added validation for onboarding name and weight.
- Removed fake activity defaults so users cannot accidentally save a pretend workout.
- Added a secondary storage health route for easier checks.
- Polished pilot subscription/access wording.
- Constrained AI coach replies for mobile-friendly answers.
- Reduced duplicate Gemini food analysis calls and added AI usage caching/monitoring.
- Switched default Gemini model to `gemini-2.5-flash-lite`.
- Updated trainer AI check-in failure copy to refer to the configured AI provider instead of OpenAI.
- Updated backend test tooling and excluded compiled files from test discovery.
- Removed public pilot self-upgrade and added owner/admin pilot access grants from the Users page.
- Cleaned seed/test users from the production database while preserving real-looking pilot accounts.
- Added a backend owner notifications API and a mobile-first owner notifications section.
- Added reversible user deactivation, blocked inactive accounts from API access, protected owner accounts from accidental deactivation, and removed resigned trainers from active assignment lists.
- Added the `trainer_missions` database table, client mission dashboard card, trainer mission assignment form, and mission completion API.
- Added trainer attention ranking from existing behaviour signals: missed missions, inactivity, food logging gaps, Momentum drops, weight trends, water gaps, and low Momentum.
- Added the `trainer_recognitions` database table, automatic praise message selection, trainer praise buttons, client dashboard recognition card, and message-thread copy of each praise.
- Added a streak calculation API based on food, weight, water, habits, activity, and completed missions without adding a new manual workflow.
- Fixed trainer praise copy so the mission message renders correctly on all devices.
- Tightened trainer and messaging APIs so inactive/deactivated clients no longer appear in trainer client lists, client detail views, client logs, or trainer-client message threads.
- Made streak calculations use the database date instead of the browser/server JavaScript date, reducing timezone edge cases for mobile users.
- Added server-side AI food scan limits and a food-page allowance display so members see usage like `1 / 5 used today` before they scan.
- Added supportive daily calorie/protein guide displays on the client dashboard and food logging page so food estimates have context without turning Ascend into a strict calorie tracker.

## Remaining Pilot Risks

- ToyyibPay paid checkout is not required for the no-payment pilot, but should be fully live-tested before public paid launch.
- Daily compliance/risk jobs need a scheduler if they are expected to run automatically every day during pilot.
- Food photo AI should be spot-checked on mobile during the first pilot day because Gemini availability and image quality can still affect estimates.

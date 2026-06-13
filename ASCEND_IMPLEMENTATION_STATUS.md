# Ascend Implementation Status

Last updated: 13 June 2026

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

## Fixes Completed In This Pass

- Removed confusing landing-page buttons that bypassed the normal login/signup flow.
- Removed fake onboarding defaults such as sample names, referral codes, and weights.
- Added validation for onboarding name and weight.
- Removed fake activity defaults so users cannot accidentally save a pretend workout.
- Added a secondary storage health route for easier checks.
- Polished pilot subscription/access wording.
- Constrained AI coach replies for mobile-friendly answers.

## Remaining Pilot Risks

- Production database still contains seed/test users and at least one test referral code. This is useful for testing but should be cleaned or separated before real trainers see the system.
- ToyyibPay paid checkout is not required for the no-payment pilot, but should be fully live-tested before public paid launch.
- Daily compliance/risk jobs need a scheduler if they are expected to run automatically every day during pilot.
- Food photo AI upload should be tested with a real meal photo by a real pilot user on mobile before onboarding the full pilot pool.

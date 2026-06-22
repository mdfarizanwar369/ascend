# Ascend Implementation Status

Last updated: 22 June 2026

## Pilot Readiness Snapshot

Ascend is ready for a controlled pilot run with a small client pool at:

- Anytime Fitness Austin Green
- Anytime Fitness Kulai Indahpura

The live app is available at:

- https://www.getascend.fit
- https://getascend.fit

## Verified This Pass

- Smart PWA installation is implemented across iOS, Android, and desktop. Ascend waits until successful signup or a saved food, weight, water, habit, or athlete check-in before offering installation.
- Android and compatible desktop browsers use the native `beforeinstallprompt` flow. iOS receives a full-screen animated Share > Add to Home Screen guide under the clearer product label `Install Ascend`.
- Installation, postponement, and reminder snoozes are remembered locally. The full automatic prompt appears once, postponed users receive a small dismissible reminder, and Profile & Settings always provides a manual `Install Ascend` control.
- Installed and standalone display modes suppress prompts; a fresh native install event clears stale status after an uninstall.
- PWA platform/eligibility tests cover iPhone, iPadOS, Android, desktop, public-page suppression, installed state, and repeat-prompt prevention.
- Release-candidate audit completed across all 33 production frontend routes, 20 authenticated mobile app screens, public APIs, CORS, storage health, Stripe webhook rejection, database integrity, responsive layouts, light mode, session restoration, and a live Gemini coach response.
- All seven production migrations are applied. No orphaned roles, assignments, subscriptions, habit records, athlete records, cross-gym assignments, duplicate active subscriptions, or future-dated logs were found.
- Habit completions now require the habit to belong to the authenticated member, closing a cross-account data-integrity weakness.
- Habit edits and trainer risk-alert updates now validate input and return `404` when the scoped record does not exist.
- Frontend responses now include one-year HSTS protection in addition to frame, MIME, referrer, and permissions headers.
- Production mobile route sweep found no horizontal overflow, stuck access checks, internal-server messages, failed-load states, or browser console errors after session hydration.
- Live owner navigation between Home, Trainer, Admin, and all owner subpages survives reload and direct navigation. A real water save appeared immediately after the normal Back flow; temporary audit data was removed.
- Live Gemini coach check returned a complete response. No food-analysis error has been recorded since 17 June; later scans are successful or cache hits.
- Automated gate: 13 test files and 53 tests pass; frontend/backend lint and the full production build pass.

- “Look How Far You’ve Come” gives clients and trainers a lightweight 30-day self-comparison for goal-aligned weight, Momentum Score, and weekly check-in consistency, with no leaderboard or AI usage.
- Clients can change between Fat Loss, Muscle Gain, and Maintenance without losing old logs; each change starts a versioned goal journey from the latest weigh-in.
- Daily calories and macros now use the latest logged weight and may adjust gently by 100 kcal only after at least three weigh-ins spanning two weeks.
- Fat-loss and muscle-gain targets create a one-time milestone celebration when reached, with a clear next-goal path and trainer visibility.
- Food-log reads now bypass browser and proxy caches, successful saves update immediately from the database response, and stale overlapping dashboard requests cannot hide newer records.
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
- Daily nutrition guides are available: onboarding collects age, height, activity level, and sex/prefer-not-to-say, then Ascend estimates calorie, protein, carbs, fat, and water guides based on the client's goal.
- Existing clients with incomplete nutrition profiles see an "Improve my daily guide" prompt and can update the missing details without repeating onboarding.
- Stripe recurring billing is implemented with hosted checkout, signed webhooks, automatic plan synchronization, and a customer billing portal. Manual pilot approvals remain available.
- Public Privacy, Terms, Refund and Cancellation, and Support pages are available and linked from the homepage and subscription screen.
- Owners can permanently delete inactive client or trainer accounts after confirmation. Owner/admin accounts and users with live paid billing are protected.
- Paid access remains available until the end of a cancelled billing period instead of ending immediately.
- The subscription screen explains renewals, cancellations, expired plans, and payment issues, polls for checkout confirmation, and opens the billing portal for account recovery.
- Signup now records clear Terms/Privacy consent context, and login, onboarding, and authenticated app screens expose support links.
- Mobile layout checks passed at 390x844 and 412x915 with no horizontal overflow or browser console errors on login, onboarding, and subscriptions.
- Client, trainer, and owner pilot guides, a feedback questionnaire, and a weekly pilot review template are available in the repository root.
- Multi-gym owner isolation is implemented. The bootstrap owner retains platform-wide access, while appointed gym owners are restricted to one or more assigned gyms across admin analytics, users, trainers, referrals, subscriptions, notifications, messaging, risk alerts, and trainer client views.
- Platform owner controls can appoint a gym owner and add or remove gym assignments from the Users page.
- Database migrations are now versioned and run safely during backend startup; the ownership migration was applied twice successfully to verify idempotency.
- Athlete Mode core is implemented behind owner activation and a global kill switch. It includes event countdowns, readiness scoring, weekly numeric targets, athlete progress entry, deterministic weekly reviews, coach comments, and trainer-only private notes.
- Athlete Mode uses additive tables and isolated `/athlete` APIs. Standard client, trainer, owner, subscription, media, and tracking tables were not modified.
- Athlete Mode pilot safety pass completed: severe soreness, sleep under five hours, very low energy, high stress, two missed check-in days, repeated low sleep, and rapid weight movement can force `Coach review recommended` with visible reasons.
- Athlete target logging now distinguishes daily and weekly cadence. Entries are explicitly today's contribution, session targets support one-tap `+1`, and daily/weekly compliance are calculated separately.
- Athlete countdowns use the stored browser/gym timezone, coaches receive a seven-day readiness trend, weekly reviews refresh automatically, and private notes remain optional with a clear empty state.
- Stripe live mode is configured and verified for RM19.99 Premium and RM99.99 Trainer Pro monthly Checkout sessions. Charges and payouts are enabled; the live webhook destination is enabled for all six required subscription events.
- Public Marketing Demo Mode is complete. It presents an isolated 30-second member-to-trainer-to-owner story with realistic fixed data, autoplay/looping, manual scene controls, a vertical recording view, and no production API or account dependencies.
- `demo.getascend.fit` routing is implemented in the frontend proxy and rewrites only the demo subdomain root to the public `/demo` experience.

## Fixes Completed In This Pass

- Completed a production release audit across public pages and authenticated client routes at mobile width with no browser console errors or horizontal overflow.
- Removed Trainer/Admin navigation tabs from accounts that do not have those roles; access was already blocked, but the visible tabs were misleading.
- Closed three obsolete manual pilot subscriptions on the platform-owner account and retained the newest Trainer Pro plan, restoring one-live-plan data consistency.
- Updated manual pilot activation so it cancels an existing live plan before creating another one.
- Stopped writing failed AI starter estimates into the food cache and removed the existing failed cache entry, ensuring retries can always reach the live provider.
- Updated vulnerable `form-data` dependencies to patched releases; no critical or high npm advisories remain.
- Replaced `Array.at()` and `crypto.randomUUID()` usage in browser code with older-Safari-compatible equivalents.
- Configured Express to trust Railway's first proxy hop so rate limiting uses each member's real client IP instead of potentially grouping many pilot users together.
- Trainer signup now requires and validates a gym/trainer referral code before creating the Firebase account, preventing silent assignment to the wrong gym.
- Onboarding now validates referral codes and correctly derives the gym from trainer referral codes before assigning the client.

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
- Added supportive daily calorie/protein/carb/fat guide displays on the client dashboard and food logging page so food estimates have context without turning Ascend into a strict calorie tracker.
- Added local meal insights after food estimates, using existing macro numbers to give one simple label and next step without any extra AI call or Gemini cost.
- Added a lightweight guide profile update page for existing clients, plus a backend endpoint and regression test for saving nutrition guide details.
- Added compressed profile photos for Premium clients, Trainer Pro users, owners, and admins. Photos are cropped and compressed in the browser, oversized payloads are rejected server-side, replaced/removed photos are deleted from storage, and trainer attention, risk, client, detail, and messaging views show recognizable thumbnails.

## Remaining Pilot Risks

- Daily compliance/risk jobs need a scheduler if they are expected to run automatically every day during pilot.
- Food photo AI should be spot-checked on mobile during the first pilot day because Gemini availability and image quality can still affect estimates.
- Stripe live Checkout creation is verified without charging a card. One small real payment remains the final confirmation that the signed live webhook activates access and that cancellation preserves access through period end.
- Athlete Mode should remain limited to one athlete/trainer pilot until its readiness and compliance workflow has been observed in real use.
- Before inviting the first external gym owner, run the cross-gym manual checks in `TESTING_CHECKLIST.md` using two temporary owner accounts.

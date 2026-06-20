# Ascend Pilot Testing Checklist

Use this after every production deploy before inviting real pilot users.

## 1. Build And Static Validation

Run locally before pushing or after pulling latest:

```powershell
npm install
npm run build
npm run test
npm run lint
```

Expected:

- [ ] Build passes.
- [ ] Backend tests pass.
- [ ] Frontend lint passes.
- [ ] Backend type-check passes.

## 2. Production Health

Open:

- [ ] `https://backend-domain/api/v1/health`
- [ ] `https://backend-domain/api/v1/health/storage`
- [ ] `https://frontend-domain/login`
- [ ] `https://frontend-domain/manifest.json`

Expected:

- [ ] Backend health returns ok.
- [ ] Storage health shows configured before Premium photo testing.
- [ ] Frontend loads without the Railway app error page.
- [ ] PWA manifest loads.

## 3. Public API Smoke Test

Open or call:

- [ ] `GET /api/v1/gyms`
- [ ] `GET /api/v1/referrals/validate/AF-AUSTIN`
- [ ] `GET /api/v1/referrals/validate/AF-KULAI`
- [ ] `GET /api/v1/referrals/validate/TRAINER-JASON`
- [ ] `GET /api/v1/referrals/validate/TRAINER-SITI`

Expected:

- [ ] Both launch gyms are present.
- [ ] Gym referral codes show the correct gym.
- [ ] Trainer referral codes show the correct trainer and gym.

## 4. Firebase Auth

Client signup:

- [ ] Open `/login`.
- [ ] Choose Client.
- [ ] Create a new account.
- [ ] Use referral code `AF-AUSTIN`.
- [ ] Complete onboarding.
- [ ] Dashboard shows the entered name.
- [ ] Account card shows Free Plan.

Trainer signup:

- [ ] Open `/login`.
- [ ] Choose Trainer.
- [ ] Create a trainer account.
- [ ] Use referral code `AF-KULAI`.
- [ ] Trainer is not sent to client onboarding.
- [ ] Trainer sees pending approval or Trainer Pro gating.

Owner login:

- [ ] Log in with the configured owner email.
- [ ] `/admin` loads.
- [ ] Account card shows owner/admin access.

## 5. Goal Journey And Daily Guide

- [ ] Open `/profile/guide` and confirm the latest logged weight is shown.
- [ ] Change Fat Loss to Muscle Gain with a target above the current weight.
- [ ] Confirm the calorie and protein preview changes before saving.
- [ ] Save and confirm the dashboard immediately shows Muscle Gain and the new target.
- [ ] Confirm previous weight and food records remain visible.
- [ ] Confirm a trainer sees a recent Goal updated badge for the client.
- [ ] Log a weight below a Fat Loss target or above a Muscle Gain target.
- [ ] Confirm the milestone appears once on the weight screen and client dashboard.
- [ ] Confirm the trainer sees Goal achieved for that client.
- [ ] Select Maintain my result after reaching the target and confirm a fresh journey begins.
- [ ] Confirm invalid target directions are rejected with a clear message.

## 6. Look How Far You've Come

- [ ] A client with fewer than 30 days of usable history sees a short comparison-building message.
- [ ] A client with 30 days of history sees 30 days ago versus today for available weight, Momentum, and check-in days.
- [ ] Only positive or steady progress is highlighted; changes moving away from the goal are not described as wins or failures.
- [ ] The card links to progress photos without loading duplicate images.
- [ ] The assigned trainer sees the same comparison on the client profile.
- [ ] Another trainer cannot access the comparison endpoint for an unassigned client.
- [ ] Dashboard and trainer profile still load if the comparison request fails.

## 5. Plan And Access Matrix

Free client:

- [ ] `/dashboard` loads.
- [ ] `/weight-log` works.
- [ ] `/water-log` works.
- [ ] `/burn-log` works manually.
- [ ] `/habits` works.
- [ ] `/food-log` asks for Premium.
- [ ] `/coach` asks for Premium.
- [ ] `/reports` asks for Premium.
- [ ] `/messages` asks for Premium.
- [ ] `/progress` asks for Premium.
- [ ] `/trainer` is blocked.
- [ ] `/admin` is blocked.

Premium client:

- [ ] `/food-log` loads.
- [ ] `/coach` loads and replies.
- [ ] `/reports` loads and generates report.
- [ ] `/messages` loads for assigned trainer.
- [ ] `/progress` loads.
- [ ] `/trainer` is blocked.
- [ ] `/admin` is blocked.

Trainer:

- [ ] `/trainer` loads after approval and Trainer Pro access.
- [ ] Assigned clients appear.
- [ ] Client detail opens.
- [ ] Trainer can message assigned client.
- [ ] `/admin` is blocked unless trainer is also admin.

Owner/admin:

- [ ] `/admin` loads.
- [ ] `/admin/users` loads.
- [ ] `/admin/referrals` loads.
- [ ] `/admin/subscriptions` loads.
- [ ] `/trainer` loads.
- [ ] Client detail opens from trainer dashboard.

## 6. Client Tracking Flow

As Premium client:

- [ ] Log food photo.
- [ ] AI estimate returns food name, calories, protein, carbs, and fat.
- [ ] Edit one estimate value.
- [ ] Save food log.
- [ ] Return to dashboard.
- [ ] Calories and protein update for today.
- [ ] Log water.
- [ ] Dashboard water updates.
- [ ] Log weight.
- [ ] Dashboard weight/trend updates.
- [ ] Log burn.
- [ ] Dashboard burn updates.
- [ ] Create habit.
- [ ] Check habit.
- [ ] Dashboard habit shows checked.
- [ ] Upload progress photo.

## 7. AI Flow

Without Gemini or OpenAI key:

- [ ] Food estimate returns demo Nasi Lemak-style estimate.
- [ ] Coach returns safe demo guidance.
- [ ] Weekly report returns safe demo summary.
- [ ] Trainer weekly check-in returns safe demo summary.

With Gemini key:

- [ ] Nasi Lemak image produces plausible local-food estimate.
- [ ] Chicken Rice image produces plausible local-food estimate.
- [ ] Roti Canai image produces plausible local-food estimate.
- [ ] Coach responds to a practical meal question.
- [ ] Burn estimate handles natural language such as `ran 30km`.
- [ ] Weekly report summarizes current week.

## 8. Trainer Workflow

- [ ] Owner approves trainer.
- [ ] Owner assigns a client to trainer.
- [ ] Trainer dashboard lists that client.
- [ ] Trainer client detail shows:
  - food logs
  - water logs
  - weight logs
  - progress photos
  - compliance score
  - messages
- [ ] Trainer sends message to client.
- [ ] Client sees trainer message.
- [ ] Client sends reply.
- [ ] Trainer sees client reply.
- [ ] Trainer generates AI weekly check-in.

## 9. Admin Workflow

- [ ] Owner sees total revenue.
- [ ] Owner sees revenue by gym.
- [ ] Owner sees revenue by trainer.
- [ ] Owner sees pending trainers.
- [ ] Owner sees unassigned clients.
- [ ] Owner can assign client to trainer.
- [ ] Gym referral analytics separate from trainer referral analytics.
- [ ] Subscriptions page shows plan, provider, status, gym attribution, trainer attribution.

### Multi-Gym Owner Isolation

- [ ] Platform owner sees Austin Green and Kulai Indahpura.
- [ ] Platform owner can appoint a new gym owner.
- [ ] Platform owner can assign one or multiple gyms to that owner.
- [ ] Austin-only owner sees Austin users, trainers, clients, referrals, subscriptions, notifications, and analytics only.
- [ ] Austin-only owner cannot open a Kulai client through a copied URL.
- [ ] Austin-only owner cannot assign, deactivate, delete, message, grant a plan to, or change the role of a Kulai user.
- [ ] Austin-only owner cannot create a Kulai gym or trainer referral.
- [ ] Austin-only owner cannot see Kulai clients from the Trainer tab.
- [ ] Kulai-only owner receives the same isolation in reverse.
- [ ] Multi-gym owner sees the union of only their assigned gyms.
- [ ] Removing a gym assignment removes access after the next authenticated request.

## 10. Subscription Flow

Test activation, if allowed during pilot:

- [ ] Activate Premium test plan.
- [ ] Dashboard updates to Premium.
- [ ] Premium pages unlock.
- [ ] Activate Trainer Pro test plan for trainer.
- [ ] Trainer dashboard unlocks.

Stripe:

- [ ] Premium checkout opens Stripe with RM19.99 monthly pricing.
- [ ] Trainer Pro checkout opens Stripe with RM99.99 monthly pricing.
- [ ] Return from checkout goes to `/subscription?checkout=success`.
- [ ] Signed webhook activates the paid subscription.
- [ ] Cancelled/failed payment does not activate subscription.
- [ ] Admin subscription view shows payment attribution.
- [ ] Cancelling renewal keeps paid access until `current_period_end`.
- [ ] Subscription screen shows the cancellation end date.
- [ ] Billing portal opens for active, past-due, and cancelled-current-period accounts.

## 11. Daily Job

Manual run:

- [ ] Call `POST /api/v1/jobs/daily` with `x-cron-secret`.
- [ ] Response reports completed job.
- [ ] Compliance scores update.
- [ ] Risk alerts appear for relevant trainer clients.

Scheduled run:

- [ ] Railway Cron or external scheduler is enabled.
- [ ] Scheduler runs once successfully.
- [ ] Backend logs show daily job request.

## 12. Mobile / PWA

Phone browser:

- [ ] Login works.
- [ ] Leave browser for 5 minutes.
- [ ] Return and refresh.
- [ ] User remains logged in.
- [ ] Dashboard shows correct name and plan.
- [ ] No page jumps to another account state.

PWA:

- [ ] Add to home screen works.
- [ ] App opens standalone.
- [ ] Logo appears.
- [ ] Bottom navigation is usable.
- [ ] No horizontal scroll on key pages.
- [ ] Signup role buttons work on Safari and Android Chrome.
- [ ] Signup shows Terms and Privacy links.
- [ ] Login, onboarding, and authenticated headers expose Support.

## 13. Final Pilot Acceptance

- [ ] All Critical blockers in `CRITICAL_BUGS.md` are closed or explicitly accepted.
- [ ] Owner can operate admin tools.
- [ ] Trainer can operate client accountability tools.
- [ ] Client can complete daily tracking.
- [ ] Payment/subscription path is verified.
- [ ] Storage path is verified.
- [ ] AI path is verified.
- [ ] Database backup is confirmed.

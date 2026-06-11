# Ascend Pilot Launch Checklist

Use this as the single go/no-go checklist before inviting real Austin Green or Kulai Indahpura users.

## Launch Scope

- Pilot gyms:
  - Anytime Fitness Austin Green
  - Anytime Fitness Kulai Indahpura
- Product surface:
  - Mobile-first PWA web app
  - Firebase Auth for identity
  - PostgreSQL as business data source of truth
  - Railway frontend, backend, and PostgreSQL
  - OpenAI food analysis, coach chat, burn estimates, weekly reports
  - Cloudflare R2 or AWS S3 photo storage
  - ToyyibPay-first subscription path

## Go / No-Go Summary

Do not launch until all Critical blockers in `CRITICAL_BUGS.md` are closed or explicitly accepted.

Important items can launch only if the pilot owner accepts the risk and has a manual fallback.

Optional items should not block the pilot.

## End-To-End Flow Audit

### Public Visitor

- [ ] `/` loads on desktop and phone.
- [ ] `/login` loads without hydration or browser crash.
- [ ] Firebase is configured, so demo-mode warning is not shown in production.
- [ ] New visitor can choose Client or Trainer.
- [ ] Owner/admin cannot be selected from public signup.

### Client Signup

- [ ] Client signs up with email/password.
- [ ] Backend provisions PostgreSQL user through `/auth/provision`.
- [ ] Gym referral code assigns gym but leaves trainer unassigned.
- [ ] Trainer referral code assigns gym and trainer.
- [ ] Client goes to onboarding after signup.
- [ ] Onboarding saves full name, goal, current weight, and target weight.
- [ ] Dashboard shows the user's name, plan, goal, and score.

### Free Client

- [ ] Dashboard loads.
- [ ] Weight log saves and appears on dashboard.
- [ ] Water log saves and appears on dashboard.
- [ ] Burn log saves and appears on dashboard.
- [ ] Habits can be created and checked off.
- [ ] Food photo, coach, reports, messages, and progress photos require Premium.
- [ ] Free client cannot access trainer or admin pages.

### Premium Client

- [ ] Premium plan appears on account card after activation/payment.
- [ ] Food photo upload works.
- [ ] Food AI estimate returns calories, protein, carbs, and fat.
- [ ] User can edit food estimate before saving.
- [ ] Saved meal appears in today's dashboard and food log list.
- [ ] AI coach sends and receives real messages.
- [ ] Weekly report generates and persists.
- [ ] Progress photo upload works.
- [ ] Messaging opens the assigned trainer conversation.
- [ ] Premium client cannot access trainer or admin pages.

### Trainer Signup And Approval

- [ ] Trainer signs up with a gym referral code.
- [ ] Trainer account is created as pending.
- [ ] Pending trainer sees approval-pending state or Trainer Pro gating, not a broken dashboard.
- [ ] Owner/admin can approve trainer in `/admin/users`.
- [ ] Approved trainer can activate Trainer Pro.
- [ ] Trainer Pro trainer can access `/trainer`.
- [ ] Trainer can only see assigned clients.

### Trainer Workflow

- [ ] Trainer dashboard loads assigned clients.
- [ ] Client work queue sorts risky clients first.
- [ ] Trainer can open client detail.
- [ ] Trainer can view food, weight, water, progress photos, compliance, and messages.
- [ ] Trainer can generate AI weekly check-in.
- [ ] Trainer can message assigned clients.
- [ ] Trainer cannot access owner/admin pages unless granted admin role.

### Owner / Admin Workflow

- [ ] Owner login redirects or can navigate to `/admin`.
- [ ] Account card shows owner/admin access.
- [ ] `/admin` loads revenue, clients, trainers, and attention items.
- [ ] `/admin/users` loads users, pending trainers, unassigned clients, and trainer workload.
- [ ] Owner can approve trainers.
- [ ] Owner can assign clients to trainers.
- [ ] `/admin/referrals` separates gym and trainer referral attribution clearly.
- [ ] `/admin/subscriptions` loads subscription attribution.
- [ ] Owner can access trainer views without Trainer Pro gating.
- [ ] Owner can return to admin page from home/trainer pages.

### Subscription And Payment

- [ ] Subscription page shows Free, Premium RM19/month, and Trainer Pro RM99/month.
- [ ] ToyyibPay checkout creates a bill with the correct amount.
- [ ] Return URL points to frontend `/subscription`.
- [ ] Callback URL points to backend `/api/v1/webhooks/toyyibpay`.
- [ ] Successful callback activates the subscription.
- [ ] Failed/cancelled callback does not activate subscription.
- [ ] Payment event is recorded in PostgreSQL.
- [ ] Revenue remains attributed to referred gym and trainer.
- [ ] Test-plan activation is disabled or operationally restricted before a public pilot if real payments are required.

### Daily Jobs And Alerts

- [ ] `CRON_SECRET` is configured.
- [ ] Daily job endpoint is scheduled once per day.
- [ ] Compliance scores update.
- [ ] Trainer risk alerts are created for:
  - inactive client for 7 days
  - compliance below 50%
  - no food logs for 3 days
  - weight trend moving away from goal

### PWA / Mobile

- [ ] App is usable on iPhone-sized viewport.
- [ ] App is usable on Android-sized viewport.
- [ ] No horizontal scrolling on core pages.
- [ ] Install prompt/add-to-home-screen works on supported browsers.
- [ ] App icon and theme color match Ascend branding.

## Required External Accounts

- [ ] Railway account
- [ ] GitHub account connected to Railway
- [ ] Firebase project
- [ ] OpenAI platform account
- [ ] ToyyibPay merchant account
- [ ] Cloudflare account with R2 bucket, or AWS account with S3 bucket

## Required Production Services

- [ ] Railway PostgreSQL
- [ ] Railway backend service
- [ ] Railway frontend service
- [ ] Firebase Authentication
- [ ] OpenAI API key
- [ ] ToyyibPay bill category
- [ ] R2/S3 bucket for food and progress photos
- [ ] Cron scheduler for daily job
- [ ] PostgreSQL backup policy

## Final Go / No-Go

- [ ] All Critical blockers closed.
- [ ] Production build passes.
- [ ] Production backend health passes.
- [ ] Database migration and seed complete.
- [ ] Owner account verified.
- [ ] One client account verified.
- [ ] One trainer account verified.
- [ ] One real or low-value payment test verified.
- [ ] One food photo upload and AI estimate verified.
- [ ] One progress photo upload verified.
- [ ] Daily job tested manually once.

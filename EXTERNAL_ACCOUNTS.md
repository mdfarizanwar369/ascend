# Ascend External Accounts

These accounts are required for the pilot launch.

## Railway

Purpose:

- Host frontend.
- Host backend.
- Host PostgreSQL.
- Generate public domains.
- Store production environment variables.
- Review deploy/runtime logs.
- Run or schedule daily jobs if Railway Cron is used.

Required setup:

- [ ] Railway account created.
- [ ] GitHub connected.
- [ ] Project created.
- [ ] PostgreSQL service created.
- [ ] Frontend service connected to repo.
- [ ] Backend service connected to repo.
- [ ] Public domain generated for frontend.
- [ ] Public domain generated for backend.
- [ ] Production variables configured.
- [ ] Backup/snapshot policy confirmed for PostgreSQL.

## Firebase

Purpose:

- Authentication only.
- Email/password sign up and login.
- ID token verification by backend.

Required setup:

- [ ] Firebase project created.
- [ ] Web app created.
- [ ] Email/password provider enabled.
- [ ] Authorized domains include Railway frontend domain.
- [ ] Service account JSON generated for backend.
- [ ] Web app config copied to frontend variables.
- [ ] Service account values copied to backend variables.

Important:

- Roles, permissions, trainer assignments, gym assignments, referrals, subscriptions, and business data must stay in PostgreSQL, not Firebase.

## OpenAI

Purpose:

- Food photo calorie/macro estimates.
- Nutrition coach chat.
- Burn estimate.
- Weekly client reports.
- Trainer weekly check-ins.

Required setup:

- [ ] OpenAI platform account created.
- [ ] API key created.
- [ ] Billing enabled or sufficient credits available.
- [ ] Usage limits reviewed.
- [ ] `OPENAI_API_KEY` configured on backend.
- [ ] `OPENAI_MODEL` configured.

Pilot check:

- [ ] Test Nasi Lemak image.
- [ ] Test Chicken Rice image.
- [ ] Test Roti Canai image.
- [ ] Test coach question.
- [ ] Test weekly report.

## ToyyibPay

Purpose:

- Malaysia-first subscription checkout.
- Premium RM19/month.
- Trainer Pro RM99/month.

Required setup:

- [ ] ToyyibPay merchant account approved.
- [ ] Secret key available.
- [ ] Category code created.
- [ ] Return URL configured:
  - `https://frontend-domain/subscription`
- [ ] Callback URL configured:
  - `https://backend-domain/api/v1/webhooks/toyyibpay`
- [ ] Live or approved test payment completed.

Pilot check:

- [ ] Premium checkout creates RM19 bill.
- [ ] Trainer Pro checkout creates RM99 bill.
- [ ] Successful payment activates subscription.
- [ ] Failed/cancelled payment does not activate subscription.

## Cloudflare R2 Or AWS S3

Purpose:

- Store food photos.
- Store progress photos.
- Let trainers view client photos through signed/read URLs.

Cloudflare R2 required setup:

- [ ] Cloudflare account created.
- [ ] R2 enabled.
- [ ] Bucket created.
- [ ] Account API token or R2 access key created.
- [ ] S3-compatible endpoint copied.
- [ ] Backend variables configured.

AWS S3 required setup:

- [ ] AWS account created.
- [ ] Private S3 bucket created.
- [ ] IAM user or role created with bucket permissions.
- [ ] Access key and secret created.
- [ ] Backend variables configured.

Pilot check:

- [ ] `/api/v1/health/storage` returns configured.
- [ ] Food image uploads.
- [ ] Progress photo uploads.
- [ ] Trainer can view uploaded image.

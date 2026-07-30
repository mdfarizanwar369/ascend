# Ascend API Specification

Base URL: `/api/v1`

Protected endpoints require `Authorization: Bearer <firebase_id_token>`.

## Public

- `GET /health`
- `GET /health/storage`
- `GET /gyms`
- `GET /referrals/validate/:code`
- `POST /webhooks/toyyibpay`
- `POST /webhooks/stripe`

`POST /webhooks/toyyibpay` accepts JSON or form-encoded ToyyibPay callbacks. It matches subscriptions by Ascend's external reference, records the payload in `payment_events`, and activates the subscription only when the callback status is successful.

## Auth Provisioning

- `POST /auth/provision`

## Client

- `GET /me`
- `POST /me/onboarding`
- `POST /food-logs/photo-upload-url`
- `POST /food-logs/estimate`
- `POST /food-logs/estimate-data-url`
- `POST /food-logs`
- `GET /food-logs`
- `POST /weight-logs`
- `GET /weight-logs`
- `POST /water-logs`
- `GET /water-logs`
- `POST /burn-logs`
- `GET /burn-logs`
- `POST /progress-photos/upload-url`
- `POST /progress-photos`
- `GET /progress-photos`
- `POST /habits`
- `GET /habits`
- `PATCH /habits/:id`
- `POST /habit-logs`
- `GET /habit-logs`
- `GET /compliance/today`
- `GET /compliance/history`
- `POST /ai/chat`
- `POST /ai/burn-estimate`
- `GET /reports/weekly/current`
- `POST /reports/weekly/generate`
- `GET /subscriptions/me`
- `POST /subscriptions/checkout`
- `POST /subscriptions/demo-activate`
- `POST /subscriptions/cancel`

`POST /subscriptions/checkout` creates a hosted Stripe subscription Checkout session for the selected paid plan.
- `GET /messages/contacts`
- `GET /messages/:userId`
- `POST /messages`

## Trainer

- `GET /trainer/clients`
- `GET /trainer/clients/:clientId`
- `GET /trainer/clients/:clientId/food-logs`
- `GET /trainer/clients/:clientId/weight-logs`
- `GET /trainer/clients/:clientId/water-logs`
- `GET /trainer/risk-alerts`
- `PATCH /trainer/risk-alerts/:id`
- `GET /trainer/clients/:clientId/progress-photos`
- `GET /trainer/clients/:clientId/compliance`
- `GET /trainer/clients/:clientId/messages`
- `POST /trainer/clients/:clientId/messages`
- `POST /ai/weekly-checkin/:clientId`

## Athlete Mode

Athlete endpoints return `404` until an owner enables Athlete Mode for the client. `ATHLETE_MODE_ENABLED=false` disables the module globally without affecting standard Ascend features.

- `GET /athlete/me`
- `PATCH /athlete/me/profile`
- `PATCH /athlete/me/timezone`
- `POST /athlete/me/checkins`
- `PUT /athlete/me/targets/:targetId/progress`
- `POST /athlete/me/reviews/generate`
- `GET /trainer/clients/:clientId/athlete`
- `POST /trainer/clients/:clientId/athlete/targets`
- `GET /trainer/clients/:clientId/athlete/notes`
- `POST /trainer/clients/:clientId/athlete/notes`
- `PATCH /trainer/clients/:clientId/athlete/review`
- `POST /athlete/body-composition/extract`
- `POST /athlete/body-composition/scans`
- `GET /athlete/body-composition/scans`
- `GET /athlete/body-composition/summary`
- `GET /trainer/clients/:clientId/body-composition`
- `POST /trainer/clients/:clientId/body-composition/scans`

Coach notes are never returned by client endpoints. They are restricted to the assigned trainer and gym-scoped owner/admin access.

Athlete check-ins and target progress always apply to the athlete's current local date. Targets explicitly use `daily` or `weekly` cadence. Daily compliance uses today's value; weekly compliance sums the athlete's daily contributions for the current Monday-Sunday week. Opening either athlete dashboard automatically refreshes the deterministic weekly review.

### Ascend DNA Body Composition Engine

This module is test-phase and hidden behind Athlete Mode. Standard clients never see it.

`POST /athlete/body-composition/extract` accepts 1-6 image data URLs from printed reports, machine screens, or screenshots. Gemini Flash Vision extracts only clearly visible values and returns an editable draft. The backend stores uploaded report images in S3/R2, but the scan is not saved until the athlete confirms it with `POST /athlete/body-composition/scans`.

Saved scans are manufacturer-independent and permanent. They store normalized metrics such as weight, BMI, body fat, fat mass, lean body mass, skeletal muscle, visceral fat, body water, BMR, metabolic age, segmental values, confidence, missing fields, import source, and confirmation state. New scans never overwrite older scans.

Trainer body-composition endpoints are read-only except for manual coach entry. Access uses the existing trainer/client ownership rules, plus owner/admin gym scope. Coach notes and private athlete records remain server-side permission checked.

## Admin / Owner

- `POST /admin/gyms`
- `POST /admin/referrals`
- `PATCH /admin/users/:userId/role`
- `POST /admin/referral-codes`
- `GET /admin/users`
- `GET /admin/trainers`
- `POST /admin/assign-client`
- `GET /admin/subscriptions`
- `GET /admin/referrals/analytics`
- `GET /admin/analytics/revenue`
- `GET /admin/analytics/usage`
- `GET /admin/analytics/compliance`
- `PATCH /admin/users/:userId/athlete-mode` (owner only)

## Operations

- `POST /jobs/daily`

Requires `x-cron-secret: <CRON_SECRET>` or `?secret=<CRON_SECRET>`. Runs daily compliance scoring and risk-alert generation.

## Workout Capture V1 (private pilot)

These authenticated endpoints return empty disabled responses unless `WORKOUT_CAPTURE_V1=true`. The frontend entry point remains hidden unless `NEXT_PUBLIC_WORKOUT_CAPTURE_V1=true`.

- `POST /ai/workout-capture` converts text or device-dictated text into a review-only draft. It never saves automatically.
- `POST /burn-logs/captured-workout` requires `userConfirmed: true` and a UUID completion key, then reuses the existing completed-workout persistence and calorie estimation.
- `GET /burn-logs/detailed/recent?limit=5` returns at most 10 recent structured workouts for repeat-workout suggestions.

Raw capture text is used for analysis but is not stored in the saved workout metadata. Confirmed structured exercises are stored in the existing `analytics_events` burn-log stream, so current dashboard, Journey, Coach Zoe memory, reports, and assigned-trainer views continue using one workout source of truth.

# Ascend API Specification

Base URL: `/api/v1`

Protected endpoints require `Authorization: Bearer <firebase_id_token>`.

## Public

- `GET /health`
- `GET /gyms`
- `GET /referrals/validate/:code`
- `POST /webhooks/toyyibpay`

## Auth Provisioning

- `POST /auth/provision`

## Client

- `GET /me`
- `POST /me/onboarding`
- `POST /food-logs/photo-upload-url`
- `POST /food-logs/estimate`
- `POST /food-logs`
- `GET /food-logs`
- `POST /weight-logs`
- `GET /weight-logs`
- `POST /water-logs`
- `GET /water-logs`
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
- `GET /subscriptions/me`
- `POST /subscriptions/checkout`
- `POST /subscriptions/cancel`
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
- `POST /ai/weekly-checkin/:clientId`

## Admin / Owner

- `POST /admin/gyms`
- `POST /admin/referrals`
- `GET /admin/users`
- `GET /admin/trainers`
- `POST /admin/assign-client`
- `GET /admin/subscriptions`
- `GET /admin/referrals/analytics`
- `GET /admin/analytics/revenue`
- `GET /admin/analytics/usage`
- `GET /admin/analytics/compliance`

# Ascend Deployment Guide

## Local Development

1. Copy `.env.example` to `.env`.
2. Fill Firebase, AWS S3, OpenAI, and ToyyibPay values.
3. Start PostgreSQL with Docker Compose.
4. Run the migration in `backend/migrations/001_init.sql`.
5. Run the seed script in `backend/seeds/seed.ts`.
6. Start backend and frontend.

## DigitalOcean MVP Deployment

Recommended:

- DigitalOcean App Platform for frontend and backend containers.
- DigitalOcean Managed PostgreSQL.
- AWS S3 private bucket for photos.
- Firebase Auth for identity.
- ToyyibPay callback URL pointed at `/api/v1/webhooks/toyyibpay`.

## Required Production Settings

- `NODE_ENV=production`
- `DATABASE_URL`
- `CORS_ORIGIN`
- Firebase Admin credentials
- `BOOTSTRAP_OWNER_EMAIL`
- `CRON_SECRET`
- AWS S3 credentials and bucket
- OpenAI API key
- ToyyibPay secret key, category code, return URL, and callback URL

## Production Checklist

- Database backups enabled.
- S3 bucket private.
- Payment callback URL verified in ToyyibPay.
- Firebase authorized domains configured.
- API health check passing.
- Daily compliance/risk job configured against `POST /api/v1/jobs/daily` with `x-cron-secret`.
- PWA manifest and service worker accessible.
- Seed data removed or replaced with real launch users.

# Ascend Manual Testing Checklist

Use this checklist after running the app locally on Windows.

## 1. Local Tooling

- Run `node --version` and confirm Node.js is `22.x` or newer.
- Run `npm --version` and confirm npm is available.
- Run `docker compose version` and confirm Docker Compose is available.

## 2. Install And Build

From the project root:

```powershell
npm install
npm run build
npm run test
npm run lint
```

Expected:

- Dependencies install without workspace errors.
- Shared, backend, and frontend builds complete.
- Backend compliance tests pass.
- Lint/type checks complete.

## 3. Environment Files

Confirm these files exist:

- `.env`
- `frontend/.env.local`
- `backend/.env`

Minimum local values:

- `NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1`
- `DATABASE_URL=postgres://ascend:ascend@localhost:5432/ascend`
- `PORT=4000`
- `CORS_ORIGIN=http://localhost:3000`

## 4. Database

Start PostgreSQL:

```powershell
docker compose up postgres
```

Run migration and seed:

```powershell
npm run migrate
npm run seed
```

Expected:

- Migration completes without SQL errors.
- Seed completes without duplicate-key failures.
- Seed can be run more than once.

Seeded gyms:

- Anytime Fitness Austin Green
- Anytime Fitness Kulai Indahpura

Seeded referral codes:

- `AF-AUSTIN`
- `AF-KULAI`
- `TRAINER-JASON`
- `TRAINER-SITI`

## 5. Full Docker Run

Run:

```powershell
docker compose up
```

Expected:

- PostgreSQL becomes healthy.
- Migration service exits successfully.
- Seed service exits successfully.
- Backend starts on port `4000`.
- Frontend starts on port `3000`.

Open:

- `http://localhost:4000/api/v1/health`
- `http://localhost:3000`

Expected health response:

```json
{
  "status": "ok",
  "service": "ascend-api"
}
```

## 6. PWA And Mobile-First UX

Open `http://localhost:3000` in Chrome or Edge.

Test mobile viewport:

- Open DevTools.
- Toggle device toolbar.
- Test iPhone-sized and Android-sized viewports.

Expected:

- No horizontal scrolling.
- Bottom navigation is visible.
- Floating food camera action is visible on dashboard screens.
- Text does not overlap controls.
- UI remains readable in dark mode.

PWA checks:

- Open `http://localhost:3000/manifest.json`.
- Confirm app name is `Ascend`.
- Confirm display mode is `standalone`.
- Confirm theme color is present.
- In browser app install menu, confirm Ascend can be installed when served in production mode.

## 7. Public Pages

Visit:

- `http://localhost:3000`
- `http://localhost:3000/login`
- `http://localhost:3000/onboarding`
- `http://localhost:3000/dashboard`
- `http://localhost:3000/food-log`
- `http://localhost:3000/coach`
- `http://localhost:3000/reports`
- `http://localhost:3000/subscription`
- `http://localhost:3000/progress`
- `http://localhost:3000/habits`
- `http://localhost:3000/trainer`
- `http://localhost:3000/trainer/clients/demo-client`
- `http://localhost:3000/admin`
- `http://localhost:3000/admin/referrals`
- `http://localhost:3000/admin/subscriptions`

Expected:

- Every page loads.
- Layout is mobile-first.
- Austin Green and Kulai launch context appears where relevant.
- Client, trainer, and admin flows are understandable without extra instructions.

## 8. Public API Checks

Backend health:

```powershell
Invoke-RestMethod http://localhost:4000/api/v1/health
```

Gyms:

```powershell
Invoke-RestMethod http://localhost:4000/api/v1/gyms
```

Referral validation:

```powershell
Invoke-RestMethod http://localhost:4000/api/v1/referrals/validate/AF-AUSTIN
Invoke-RestMethod http://localhost:4000/api/v1/referrals/validate/AF-KULAI
Invoke-RestMethod http://localhost:4000/api/v1/referrals/validate/TRAINER-JASON
Invoke-RestMethod http://localhost:4000/api/v1/referrals/validate/TRAINER-SITI
```

Expected:

- Both launch gyms return from `/gyms`.
- Each referral code validates.
- Gym codes include the correct gym.
- Trainer codes include the correct trainer.

## 9. Firebase-Protected API Checks

After Firebase is configured and a test user can sign in, get a Firebase ID token from the frontend session and use:

```powershell
$headers = @{ Authorization = "Bearer <firebase_id_token>" }
Invoke-RestMethod http://localhost:4000/api/v1/me -Headers $headers
```

Expected:

- A seeded Firebase UID must exist in PostgreSQL or the API returns `User profile has not been provisioned`.
- Once a matching user exists, `/me` returns the PostgreSQL user profile and roles.

Provision a new Firebase-authenticated user:

```powershell
$headers = @{ Authorization = "Bearer <firebase_id_token>" }
$body = @{ fullName = "Test Member"; referralCode = "TRAINER-JASON"; primaryRole = "client" } | ConvertTo-Json
Invoke-RestMethod http://localhost:4000/api/v1/auth/provision -Method Post -Headers $headers -Body $body -ContentType "application/json"
```

Expected:

- PostgreSQL user is created or updated.
- Referral code links the user to the correct gym and trainer.

## 10. Client Flow

Manual flow:

- Open `/login`.
- If Firebase is not configured, confirm the demo-mode button appears and opens `/dashboard`.
- If Firebase is configured, create a test account and confirm the user is provisioned by the backend.
- Open `/onboarding`.
- Use referral code `TRAINER-JASON`.
- Select fat loss.
- Confirm the UI clearly asks for current and target weight.
- Open `/dashboard`.
- Confirm compliance score, calories, water, weight, and habits are visible.
- Open `/food-log`.
- Select a food photo.
- Click `Estimate calories and macros`.
- Confirm calories, protein, carbs, fat, food name, confidence, and notes appear.
- Edit at least one macro value.
- Save the log.
- Return to `/dashboard` and confirm the latest demo food log appears.
- Open `/coach`.
- Send a message and confirm the AI coach replies.
- Open `/reports`.
- Generate a weekly report and confirm a summary appears.
- Open `/subscription`.
- Confirm Free, Premium RM19, and Trainer Pro RM99 appear.

## 11. Trainer Flow

Open `/trainer`.

Expected:

- Trainer can see assigned clients.
- Risk alert section is visible.
- Client scores and goals are visible.
- AI check-in and messaging actions are visible.

Protected API checks after auth is configured:

- `GET /api/v1/trainer/clients`
- `GET /api/v1/trainer/risk-alerts`
- `GET /api/v1/trainer/clients/:clientId/food-logs`
- `GET /api/v1/trainer/clients/:clientId/weight-logs`
- `GET /api/v1/trainer/clients/:clientId/water-logs`
- `PATCH /api/v1/trainer/risk-alerts/:id`
- `GET /api/v1/messages/:userId`
- `POST /api/v1/messages`

Expected:

- Trainer only sees assigned clients.
- Admin/owner can see broader data.
- Alert status can be updated.

## 12. Admin / Owner Flow

Open `/admin`.

Expected:

- Revenue by Austin Green and Kulai Indahpura is visible.
- Revenue by trainer is visible.
- Client assignment and referral code actions are visible.

Protected API checks after auth is configured:

- `GET /api/v1/admin/users`
- `GET /api/v1/admin/trainers`
- `GET /api/v1/admin/subscriptions`
- `GET /api/v1/admin/referrals/analytics`
- `GET /api/v1/admin/analytics/revenue`
- `GET /api/v1/admin/analytics/usage`
- `GET /api/v1/admin/analytics/compliance`

Expected:

- Gym referral revenue is attributed correctly.
- Trainer referral revenue is attributed correctly.
- Admin can view subscriptions and referral analytics.
- Admin can compare usage and compliance across Austin Green and Kulai Indahpura.

## 13. OpenAI Checks

Without `OPENAI_API_KEY`:

- Food log screen should support demo AI estimates and local demo saving.
- Food estimate endpoint should return demo Nasi Lemak estimate when called from an authenticated backend flow.
- Coach endpoint should return demo coaching text.
- Weekly report endpoint should return demo report text.
- Trainer weekly check-in endpoint should return demo summary.

With `OPENAI_API_KEY`:

- Food image analysis should return structured calories and macros.
- Malaysia and Singapore foods should be prioritized.
- User should be able to edit AI estimates before saving.
- Coach chat should return a relevant response.
- Weekly report generation should summarize the user's current week.

## 14. ToyyibPay Checks

Without ToyyibPay credentials:

- Checkout endpoint should return a demo checkout URL with a provider reference.

With ToyyibPay credentials:

- Premium checkout creates a ToyyibPay bill.
- Trainer Pro checkout creates a ToyyibPay bill.
- Callback reaches `/api/v1/webhooks/toyyibpay`.
- Subscription status updates from callback.
- Revenue attribution remains tied to referred gym and trainer.

## 15. Known Not-Yet-Verified Items

The npm validation path has been run successfully:

- Dependency installation.
- Next.js production build.
- Backend TypeScript build.
- Backend tests.
- Frontend ESLint.
- Backend type check.

Still verify these locally with your real services:

- Docker image build and `docker compose up`.
- PostgreSQL migration execution against your local Docker database.
- ToyyibPay live callback verification.
- Firebase live sign-in.
- OpenAI live image estimation.

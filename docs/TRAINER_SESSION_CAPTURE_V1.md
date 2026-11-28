# Trainer Session Capture V1

Trainer Session Capture lets the currently assigned trainer see the last coach’s plan, record today’s workout, and leave a plan for the next appointment. Trainers can edit an exercise list directly or use shorthand or phone-keyboard dictation.

## Feature flags

- Backend: `TRAINER_SESSION_CAPTURE_V1=true`
- Frontend: `NEXT_PUBLIC_TRAINER_SESSION_CAPTURE_V1=true`

Both default to `false`. Turning either flag off leaves existing workout logging and dashboards unchanged.

## Flow

1. Open an assigned client’s profile and choose **Record PT Session**. The previous plan and exercise history appear before capture.
2. Repeat the last detailed session and edit the relevant results, or start fresh. Direct entry and repeat use the workout capture contract without an AI request. Shorthand such as `Bench 60kg 10,10,8` still uses workout capture AI for interpretation.
3. Record the session focus, main movement, coaching cues, client response, win, and next-session plan as needed.
4. Save the session. Confirmed exercise results appear in the client’s history. **Share a recap with the client** is an opt-in for the edited recap and between-session focus.
5. An authorized gym admin or owner can open **Admin → Users → Manage → View coaching sessions** for an active client in their gym and read completed records.

The existing completion service calculates estimated calories using workout MET, duration, intensity, and the latest available client weight. Its analytics event immediately feeds workout history, Today, Momentum, reports, Journey, and coaching context.

## Storage

Migration `020_trainer_coaching_sessions.sql` adds the session table. Migration `048_trainer_session_worksheet.sql` adds worksheet fields, recap visibility, and gym-specific draft uniqueness. Existing completed recaps keep their prior visibility. A single transaction commits the completed session and its workout history together, and retries keep the first saved visibility choice.

The member-facing session projection contains the confirmed exercise facts and any opted-in recap, with coaching cues, raw captures, worksheet responses, and next-session plans kept in the coaching record.

## API

- `GET|POST /api/v1/trainer/clients/:clientId/coaching-sessions`
- `PATCH|DELETE /api/v1/trainer/clients/:clientId/coaching-sessions/:sessionId`
- `POST /api/v1/trainer/clients/:clientId/coaching-sessions/:sessionId/interpret`
- `POST /api/v1/trainer/clients/:clientId/coaching-sessions/:sessionId/complete`
- `GET /api/v1/me/coaching-sessions`
- `GET /api/v1/admin/users/:clientId/coaching-sessions`

Every trainer route requires Trainer Pro access and a current client assignment on the server. Gym manager history is read-only and limited to completed sessions recorded at the client’s current gym. A same-gym reassignment carries completed history to the new trainer; independent trainer history follows the original trainer’s assignment.

## Rollback

Set both feature flags to `false`. Existing completed workout events remain valid history. The additive table may remain safely in place; no schema rollback is required.

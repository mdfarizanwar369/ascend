# Trainer Session Capture V1

Trainer Session Capture lets an assigned trainer record a coached workout with shorthand or phone-keyboard dictation, review the interpreted receipt, and share one confirmed record with the client.

## Feature flags

- Backend: `TRAINER_SESSION_CAPTURE_V1=true`
- Frontend: `NEXT_PUBLIC_TRAINER_SESSION_CAPTURE_V1=true`

Both default to `false`. Turning either flag off leaves existing workout logging and dashboards unchanged.

## Flow

1. The trainer opens an assigned client's profile and chooses **Record PT Session**.
2. They repeat the last detailed session or start fresh.
3. They enter compact notes such as `Bench 60kg 10,10,8` or use the phone keyboard microphone.
4. Existing workout-capture AI converts the notes to Ascend's structured workout contract.
5. The trainer reviews exercises, client recap, and between-session focus.
6. **Confirm & Share** persists through the existing workout-completion service.

The existing completion service calculates estimated calories using workout MET, duration, intensity, and the latest available client weight. Its analytics event immediately feeds workout history, Today, Momentum, reports, Journey, and coaching context.

## Storage

Migration `020_trainer_coaching_sessions.sql` adds one table for draft lifecycle, trainer attribution, review copy, and the stable completion key. It does not modify existing workout or analytics tables.

The raw trainer note is cleared after completion. The trainer's private next-session note and raw capture input are never returned by the client endpoint.

## API

- `GET|POST /api/v1/trainer/clients/:clientId/coaching-sessions`
- `PATCH|DELETE /api/v1/trainer/clients/:clientId/coaching-sessions/:sessionId`
- `POST /api/v1/trainer/clients/:clientId/coaching-sessions/:sessionId/interpret`
- `POST /api/v1/trainer/clients/:clientId/coaching-sessions/:sessionId/complete`
- `GET /api/v1/me/coaching-sessions`

Every trainer mutation requires Trainer Pro access and server-side assigned-client authorization. Completion is idempotent through `workout_completion_key`.

## Rollback

Set both feature flags to `false`. Existing completed workout events remain valid history. The additive table may remain safely in place; no schema rollback is required.

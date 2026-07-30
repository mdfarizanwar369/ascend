# Workout Progression Intelligence V3

## Product boundary

V3 is a shared deterministic progression layer for confirmed detailed workouts. It supports self-recorded sessions and trainer-recorded sessions without replacing Quick Log, Coach Zoe Workout Builder, trainer programming, or the existing workout event model.

## Source of truth and projection

The existing `analytics_events` `burn_log` remains the authoritative workout record. Migration `022_workout_progression_v3.sql` adds:

- `workout_exercise_observations`: an idempotent, indexed projection of confirmed exercise performance.
- `workout_exercise_aliases`: user-confirmed exercise identity relationships.

Deleting a source event cascades to its observations. Re-running projection updates the same `(source_event_id, exercise_position)` rows and never creates duplicate workout history.

## Evidence policy

Eligible observed performance:

- `ai_workout_capture`
- `trainer_logged_session`

Consistency-only evidence:

- Coach Zoe generated plans
- Trainer homework without actual results
- Quick activity logs
- Health Connect activity summaries

Only observed performance can produce personal bests, progression, plateau signals, or next-session starting points.

## Deterministic intelligence

V3 evaluates the current performance against up to eight recent observations for each exact canonical exercise key.

- Personal best: verified higher load with comparable reps, higher reps at the same load, or longer timed performance.
- Progressed: improvement against the latest comparable observation.
- Plateau signal: current plus three recent comparable performances at the same level within 42 days.
- Planned deload: a lighter result only when the workout is explicitly recovery/deload focused.
- Changed: neutral wording when performance differs but progression cannot be verified.
- Not comparable: load-unit changes, loaded/unweighted changes, or insufficient comparable data.

V3 never labels a member as failing, declining, or worse. It never silently fuzzy-matches exercise names.

## Shared consumers

- Member Detailed Workout success receipt and recent progression list.
- Coach Zoe workout memory through compact facts; no new AI call is created.
- Trainer Session Copilot after the coached workout is confirmed.
- Existing workout metadata through a versioned `progressionV3` snapshot.

## APIs

- `GET /burn-logs/progression?limit=10`
- `POST /burn-logs/progression/backfill`
- `PUT /burn-logs/progression/aliases`

All endpoints require the existing authenticated user and operate only on that user's data. Trainer-facing intelligence continues through existing assigned-client session permissions.

## Flags

```text
WORKOUT_PROGRESSION_INTELLIGENCE_V3=true
NEXT_PUBLIC_WORKOUT_PROGRESSION_INTELLIGENCE_V3=true
```

The member Detailed Workout UI remains separately controlled by the existing Workout Capture pilot flags and access rules.

## Backfill and retry safety

The first V3 workout lazily projects earlier eligible workouts when no observation history exists. A manual authenticated backfill endpoint is also available. Projection is idempotent.

If the source workout saves but enrichment is interrupted, retrying the same completion key repairs missing V3 intelligence instead of creating a duplicate workout.

## Rollback

Disable both V3 flags and redeploy. Existing workouts and V1 progression remain unchanged. The additive projection tables may stay in place because no existing runtime depends on them when the flag is disabled.

## Operational monitoring

Monitor database timings for:

- `workout_exercise_observations_history_idx`
- initial per-user backfills
- event metadata enrichment updates

No background worker, exercise library, new AI provider, or additional AI frequency is introduced.

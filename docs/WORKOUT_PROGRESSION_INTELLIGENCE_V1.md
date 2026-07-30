# Workout Progression Intelligence V1

## Purpose

Workout Progression Intelligence turns confirmed exercise performance into reusable facts for members, Coach Zoe, and trainers. It does not replace either the fast activity logger or the Workout Builder.

## Evidence rules

- `ai_workout_capture` and `trainer_logged_session` are observed performance and may produce progression comparisons.
- `coach_zoe_workout_planner` and `coach_homework` are completed plans. They count for consistency, but their prescribed sets and loads are not treated as observed performance.
- Simple burn/activity logs do not contain enough exercise detail and never produce progression claims.
- Only exact canonical exercise matches are compared. Safe abbreviations such as `DB` and `BB` are normalized; fuzzy matches are deliberately avoided.
- Higher load is verified as progression only when recorded repetitions remain reasonably comparable.
- Ambiguous rep ranges, mismatched units, and incomplete data are marked not comparable rather than guessed.
- Reduced load or repetitions are described neutrally as changes. Ascend does not label them as failure or decline.

## Architecture

The deterministic engine lives in `backend/src/services/workoutProgressionEngine.ts`. Every detailed workout still uses the existing `persistCompletedWorkout()` path and the existing `analytics_events` burn-log record.

When enabled, a versioned `progression` snapshot and `evidenceType` are stored inside the workout metadata. No database migration, extra workout record, background job, or additional AI request is required.

Consumers use the same snapshot:

- Detailed Workout success state shows a compact verified result.
- Coach Zoe workout memory receives only the latest compact progression fact.
- Trainer Session Copilot maps the shared comparison into its existing trainer-facing output.

## Feature flags

Both flags must be enabled for the member pilot:

```text
WORKOUT_PROGRESSION_INTELLIGENCE_V1=true
NEXT_PUBLIC_WORKOUT_PROGRESSION_INTELLIGENCE_V1=true
```

The existing detailed capture pilot remains controlled separately by:

```text
WORKOUT_CAPTURE_V1=true
NEXT_PUBLIC_WORKOUT_CAPTURE_V1=true
```

## Rollback

Set both progression flags to `false` and redeploy. Existing workout records remain valid; stored progression metadata is inert and can be retained safely.

## Current scope

V1 compares each exercise with its most recent earlier observed occurrence. The trainer Delta V2 branch remains isolated and can consume this engine later without changing the V1 data contract.

# Workout Capture V1 Architecture

## Product boundary

Workout Capture extends the existing Movement/Burn Log. It does not replace Quick Activity, Coach Zoe Workout Builder, Coach Homework, Health Connect, or workout completion.

V1 supports:

- typed or pasted workout shorthand;
- device keyboard dictation, which arrives as ordinary text;
- an AI-assisted Workout Receipt;
- explicit review and confirmation;
- repeat-workout data from recent structured sessions.

V1 does not record, upload, or retain audio. Photo and screenshot source modes exist in the shared contract for later work but have no upload or extraction endpoint in V1.

## Data flow

1. The member chooses Quick Activity or Detailed Workout in a future flagged UI.
2. Quick Activity continues using the existing `/ai/burn-estimate` and `/burn-logs` paths.
3. Detailed Workout sends text to `POST /ai/workout-capture`.
4. The backend asks the configured AI provider for strict JSON and normalizes the response through deterministic rules.
5. Missing or uncertain values remain null and are listed in `uncertainties`.
6. The frontend presents a Workout Receipt. Nothing is persisted yet.
7. The member edits or confirms the draft.
8. `POST /burn-logs/captured-workout` requires `userConfirmed: true` and an idempotency UUID.
9. The endpoint reuses `persistCompletedWorkout`, MET calorie estimation, weight resolution, duplicate prevention, Coach Presence events, and the existing burn-log event stream.
10. Existing dashboard, Journey, Coach Zoe memory, reports, and trainer views receive the saved workout without a second model or table.

## Contracts

The shared `WorkoutCaptureDraft` contract preserves:

- original input for the unsaved review session;
- exercise name and original exercise fragment;
- sets, reps, load and unit;
- duration and rest;
- a small movement taxonomy;
- per-exercise and overall confidence;
- explicit uncertainty messages;
- `requiresReview: true`.

The saved event intentionally excludes the raw full-session input. It stores only member-confirmed structured values and capture metadata.

## Movement taxonomy

Ascend uses a deliberately small set: squat, hinge, push, pull, carry, core, cardio, mobility, recovery, and other. This supports useful coaching and training-balance analysis without maintaining a large exercise library.

Exercise names remain member-friendly. Recent confirmed names are supplied to the parser only to normalize obvious aliases.

## Feature flags

- Backend: `WORKOUT_CAPTURE_V1=false`
- Frontend: `NEXT_PUBLIC_WORKOUT_CAPTURE_V1=false`

Both remain off by default. The backend degrades to valid empty responses while disabled, so accidental frontend calls cannot affect unrelated screens.

## Reliability and safety

- AI drafts are never auto-saved.
- Missing values remain null; the prompt explicitly forbids guessing.
- The deterministic parser supplies a reviewable fallback when AI is unavailable.
- Completion UUIDs prevent duplicate saves.
- Existing authenticated user scoping protects analysis history and saved workouts.
- Raw text is not written to AI usage metadata or workout history.
- Calories remain labelled as estimated unless a health provider supplies an actual value.

## Rollout sequence

1. Keep both flags off in production.
2. Enable locally for parser regression tests.
3. Add the private UI entry point for owner/test accounts.
4. Test at least 50 shorthand examples across strength, cardio, circuits, mobility, kg, lb, missing values, and ambiguous speech-to-text.
5. Require at least 95% correct extraction for supplied sets, reps, loads, and units; measure correction rate separately.
6. Test web, iPhone Safari/PWA, Android Chrome/PWA, and the native wrapper.
7. Run a small trusted-user pilot before wider rollout.

## Rollback

Set both feature flags to `false`. The current Burn Log and all existing workout sources continue unchanged. Captured workouts already confirmed remain valid historical burn-log events and require no migration or deletion.

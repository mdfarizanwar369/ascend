# Trainer Session Delta Logging V2

## Purpose

Delta Logging makes repeated coached sessions faster to record. The trainer starts from the client's most recent confirmed workout and enters only what changed, for example:

- `Bench Press +5kg`
- `Walking Lunges skipped`
- `Add bike 10 min`

Everything not explicitly changed remains intact.

## Scope

V2 layers onto Trainer Session Capture V1 and Session Copilot V1.5. It does not create a workout library, change workout completion, or alter client, trainer, owner, subscription, nutrition, or Health Connect logic.

## Feature flags

All four flags must be enabled to expose and execute V2:

```env
TRAINER_SESSION_CAPTURE_V1=true
NEXT_PUBLIC_TRAINER_SESSION_CAPTURE_V1=true
TRAINER_SESSION_DELTA_V2=true
NEXT_PUBLIC_TRAINER_SESSION_DELTA_V2=true
```

The frontend and backend also exchange an explicit `interpretationMode`. The backend will only execute delta interpretation when its V2 flag is enabled, the request explicitly asks for `delta`, and the session is based on a repeated workout. This prevents an environment mismatch from changing V1 behavior.

## Processing model

1. The latest confirmed structured workout becomes the base draft.
2. The trainer enters only changes or selects no changes.
3. One existing-provider AI request extracts a strict change set. It replaces the full-session interpretation call; it is not an additional call.
4. If the provider is unavailable or returns malformed output, a deterministic shorthand parser handles common update, add, and remove instructions.
5. A deterministic merge applies only safely matched changes.
6. The trainer reviews explicit before/after values and all uncertainties.
7. Confirmation uses the existing idempotent workout completion path.

## Safety rules

- Unmentioned exercises and fields are preserved.
- Exact exercise names are preferred.
- A partial name is accepted only when it matches one exercise uniquely.
- Unknown or ambiguous targets are not applied.
- Relative loads require a previous load and compatible units.
- The final remaining exercise cannot be removed.
- Missing values remain unchanged; null never clears prior data.
- No session is saved automatically.
- Client receipts continue to exclude raw trainer notes, private next-session notes, and watchouts.

## Data and cost

No V2 database migration is required. The merged workout uses the existing `structured_workout` field and existing completion records. Delta interpretation is tracked as `trainer_session_delta_analysis` in the existing AI usage system. No raw model response is stored or logged.

## Rollback

Set either V2 flag to `false` and redeploy the affected service:

```env
TRAINER_SESSION_DELTA_V2=false
NEXT_PUBLIC_TRAINER_SESSION_DELTA_V2=false
```

Trainer Session Capture V1 and Session Copilot V1.5 continue to work. Existing sessions and completed workouts require no data migration or cleanup.

## Validation focus

- Relative and absolute updates
- Added and removed exercises
- No-change sessions
- Unknown and ambiguous targets
- Incompatible load units
- Malformed AI output
- Preservation of unchanged values
- Base workout immutability
- Existing completion idempotency

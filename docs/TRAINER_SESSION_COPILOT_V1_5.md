# Trainer Session Copilot V1.5

V1.5 adds a deterministic intelligence layer to the Trainer Session Capture V1 workflow. It does not add trainer input steps or another AI request.

## What it notices

- Confirmed load increases or decreases for the same exercise and unit
- Higher or lower total repetitions at the same load
- Exercises maintained from the previous comparable session
- New or non-comparable exercises
- Capture uncertainties that need trainer confirmation
- Several verified progressions inside a challenging session

The comparison language deliberately avoids medical claims, unverified personal-best claims, and automatic load prescriptions.

## Trainer experience

The review receipt adds one Session Copilot card with:

- a factual session headline
- up to three verified highlights
- up to two watchouts
- a conservative next-session starting point

The trainer still reviews and confirms the workout. Session Copilot never saves or shares automatically.

## Client experience

The client receipt shows a positive, factual celebration and verified highlights. Raw trainer capture notes, uncertainty watchouts, and the private next-session planning note are excluded from the client API contract.

## Cost and performance

V1.5 uses the already parsed workout receipt and the latest prior detailed workout. Comparison is deterministic and in-process, so it adds no AI API call and no background job.

## Storage and rollback

Migration `021_trainer_session_intelligence.sql` adds a nullable JSONB snapshot to the existing coaching-session table. Set the V1 feature flags to `false` to hide both V1 and V1.5. Existing workout history remains unchanged.

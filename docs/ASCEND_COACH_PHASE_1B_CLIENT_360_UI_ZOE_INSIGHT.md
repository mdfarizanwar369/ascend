# Ascend Coach Phase 1B — Client 360 UI and Cached Zoe Coach Insight

## Scope

Phase 1B presents the Phase 1A `Client360Snapshot` to an authorized trainer and optionally interprets that same snapshot through one bounded, cached Zoe Coach Insight. It does not add Ask Zoe, programs, planned workouts, assignments, program adherence, an exercise catalog, trainer notes, CRM, messaging, scheduling, or payments.

The feature remains controlled by the existing default-off `ASCEND_COACH_V1` flag.

## Runtime flow

```text
authenticated trainer
  -> Phase 0 policy
  -> Phase 1A Client360Snapshot
  -> Client 360 UI + authorization-bound cache lookup (zero AI calls)
  -> explicit refresh only
  -> bounded CoachIntelligenceContext
  -> one structured provider call
  -> validation
  -> authorization-bound persistent cache
```

No AI service or repository queries raw client tables. `backend/src/domain/coachIntelligence.ts` accepts a `Client360Snapshot` value and emits a minimized context.

## Routes

- `GET /api/v1/ascend-coach/clients` — unchanged bounded client selector source.
- `GET /api/v1/ascend-coach/clients/:clientId/360` — returns `{ snapshot, coachInsight }`. It computes the deterministic snapshot, then performs a cache lookup only. It never generates AI output.
- `POST /api/v1/ascend-coach/clients/:clientId/coach-insight/refresh` — explicitly authorized refresh. It performs at most one provider call and returns `{ coachInsight }`.
- `/trainer/clients` — mobile-first authorized client list.
- `/trainer/clients/:clientId/360` — mobile-first Client 360.

The existing trainer dashboard and legacy client detail route remain intact.

## Client 360 hierarchy

The page presents:

1. client identity, goal, active/elevated access state;
2. a compact current-state grid from authorized training, nutrition, body, and activity summaries;
3. the top four existing deterministic coaching signals, ordered attention, positive, information;
4. cached Zoe Coach Insight;
5. expandable Training, Nutrition, Body Progress, and Activity details;
6. section-specific freshness.

Signal thresholds are not recalculated in the UI. UI copy is a neutral rendering of the Phase 1A signal code and supplied evidence. The UI uses “training logging consistency,” never “program adherence.”

No charts are included in Phase 1B because the snapshot contains aggregate trends rather than bounded plot series. This avoids inventing chart points or duplicating aggregation in the frontend.

## Partial scopes and insufficient data

The UI reads `snapshot.access.sections` and never calls section-specific data APIs. An unauthorized section contains one concise “not shared with this trainer” explanation and no hidden metrics. The backend snapshot already omits the data object.

Metrics with `sufficientData: false` display “Not enough data yet.” A missing value is not rendered as zero adherence, zero consistency, or a trend.

Section-to-scope mapping remains the Phase 1A contract:

| Section | Scope |
| --- | --- |
| Identity/profile | `profile` |
| Training | `training` |
| Nutrition | `nutrition` |
| Body progress | `body` |
| Activity | `recovery` |
| Zoe Coach Insight | active relationship plus `profile` and `training` |

## CoachIntelligenceContext

Only these authorized snapshot-derived values can reach the provider:

- snapshot and prompt schema versions;
- goal, without client name or client ID;
- names of currently granted sections;
- training counts, average frequency, active weeks, logging consistency sufficiency, last workout, average duration sufficiency, frequency trend;
- at most four compact persisted Progression V3 observations;
- nutrition targets plus compact 7-day and 30-day aggregates and sufficiency;
- weight changes/trend plus trusted body-composition evidence status and established changes;
- bounded activity aggregates and sufficiency;
- deterministic coaching signals and evidence;
- authorized section freshness excluding snapshot generation time.

It excludes raw workout events, recent workout history, raw sets, raw food logs, scan history, raw health records, account/security metadata, relationship records, client identity, and previous AI prose. Automated tests enforce a serialized context smaller than 16 KiB; the representative fixture is materially smaller.

## Structured insight contract

```ts
type CoachInsight = {
  summary: string; // target 80–150 words, hard maximum 180 words / 1,400 characters
  priorities: Array<{
    title: string; // max 80 characters
    reason: string; // max 320 characters
    signalCodes: Client360SignalCode[]; // only signals present in current context
  }>; // 1–3
  dataCaveats: string[]; // 0–3, max 240 characters each
};
```

OpenAI uses Responses structured output with a strict JSON schema and `store: false`. Gemini uses the existing JSON MIME type and response schema. Both use the existing provider integration, one model, one attempt, a 12-second timeout, and no fallback prose. Zod validation, word/length bounds, and current-context signal checking occur before persistence and again when a cached payload is read.

The prompt is versioned as `coach-insight-v1`. It explicitly keeps the trainer as decision-maker and prohibits diagnosis, treatment, medication advice, unsafe rapid-weight-loss recommendations, unsupported certainty, and program creation.

## Cache architecture

Existing caches were not reusable:

- `food_estimate_cache` is keyed to image hashes and stores a different contract.
- `daily_coaching_decisions` is member/day workflow state with constrained, incompatible content.
- `ai_usage_events` is telemetry, not an authorization-safe content cache.

Migration `037_ascend_coach_insight_cache.sql` therefore adds only `ascend_coach_client_insights`. Cache identity includes:

- actor/trainer user ID;
- client user ID;
- relationship ID;
- authorization version;
- granted-section fingerprint;
- compact source fingerprint;
- snapshot schema version;
- prompt version;
- provider and model.

Records expire after seven days. A material authorized context change produces a different source fingerprint. Scope changes and relationship lifecycle changes increment or invalidate the authorization identity. Retrieval always follows a fresh Phase 0/1A authorization check, so ended, revoked, unrelated, or expired access cannot reach old prose. Rows may remain for operational retention until later cleanup, but are inaccessible through the product path.

Break-glass deliberately cannot generate or read persistent Zoe insight. It displays deterministic data with a discreet audited elevated-access indicator. This avoids turning temporary sensitive access into durable AI prose.

## AI calls and quota

| Action | Provider calls |
| --- | ---: |
| Normal page load | 0 |
| Cache hit | 0 |
| Explicit refresh | 1 maximum |
| Provider failure | 1 failed call, no retry loop |
| Local edit/view | 0 |

Refresh uses the existing `ai_usage_events` infrastructure as `coach_insight_generation`, existing estimated chat cost, configured monthly chat ceiling per actor, and configured global monthly spend ceiling. It does not grant trainers unlimited generation or introduce a commercial entitlement decision.

Concurrent identical refreshes are coalesced in-process and the database unique identity makes persistence idempotent.

## Failure behavior

Provider unconfigured, quota reached, timeout, malformed output, oversized output, unknown signal references, and persistence/generation failures return a safe `not_available` insight state. The deterministic snapshot and UI remain available. No malformed provider response is stored or displayed.

## Performance and telemetry

The client list remains three bounded queries and never loads a snapshot per client. A full Client 360 continues to use the Phase 1A bounded parallel reads (approximately 15 at full scope), plus a current `view_ai_insight` policy decision and at most one indexed cache update/lookup. There are no per-section frontend requests and no snapshot caching.

Structured telemetry records latency, authorized section count, cache hit, one provider-call event, and generation latency. It logs no snapshot values, names, raw records, or full client identifiers. AI usage metadata stores prompt version, compact context byte count, and a truncated non-reversible source key.

Snapshot caching remains deferred until measured pilot latency demonstrates a need. Zoe cache lifetime is independent from snapshot computation.

## Database and rollback

Migration 037 is additive. It preserves every existing user, relationship, workout, nutrition, body, and health record. Its rollback drops only `ascend_coach_client_insights`; generated prose and cache counters are disposable, while all deterministic source data remains untouched.

No program, block, week, planned session, assignment, exercise-catalog, note, or snapshot table is added.

## Future boundaries

Ask Zoe must later retrieve only through an explicitly scoped intelligence context, not raw database tools. Program Builder remains blocked on a canonical exercise catalog and a versioned multi-week program domain. This Phase 1B context is reusable input, but it does not imply or store program adherence.

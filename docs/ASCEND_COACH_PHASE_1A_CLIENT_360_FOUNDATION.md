# Ascend Coach Phase 1A — Client 360 Data & Intelligence Foundation

## Scope boundary

Phase 1A answers one question: what does Ascend deterministically know about an authorized client that is useful for coaching?

It adds an on-demand, permission-aware snapshot service and two authenticated trainer APIs. It does not add a Client 360 UI, AI request, cached AI prose, Ask Zoe, trainer notes, exercise catalog, program entity, program assignment, or database migration. `ASCEND_COACH_V1` remains the single rollout gate and remains off by default.

## Canonical snapshot contract

The shared `client_360_snapshot_v1` contract is defined in `shared/src/client360.ts`:

```text
Client360Snapshot
  version, clientId, generatedAt
  access
    mode: relationship | break_glass
    relationshipId, relationshipStatus, authorizationVersion
    sections[profile|training|nutrition|bodyProgress|activity]
      state: granted | not_granted | break_glass
      requiredScope
  profile?               // omitted unless profile access is authorized
  training?              // omitted unless training access is authorized
  nutrition?             // omitted unless nutrition access is authorized
  bodyProgress?          // omitted unless body access is authorized
  activity?              // omitted unless recovery access is authorized
  coachingSignals[]      // only derived from included sections
  freshness              // only contains timestamps for authorized sections
```

Unauthorized sections are omitted, while non-sensitive section access metadata explains that they are `not_granted`. Sensitive loaders are never invoked for an unauthorized section. Null values inside an authorized section mean Ascend has no trustworthy value, not that authorization failed.

## Permission contract

| Snapshot section | Phase 0 action | Required consent scope | Principal data returned |
|---|---|---|---|
| Profile | `view_profile` | `profile` | display name, goal, activity level |
| Training | `view_training` | `training` | completed-workout counts, history, exact-key progression |
| Nutrition | `view_nutrition` | `nutrition` | targets, food-log coverage and logged-day target rates |
| Body progress | `view_body` | `body` | weight history and trusted athlete body scans |
| Activity | `view_recovery` | `recovery` | Health Connect steps and exercise sessions |

The service calls `authorizeAscendCoachActions` before starting domain queries. That batch loads the Phase 0 policy context once, evaluates every read action, and writes one `break_glass_used` audit event containing all authorized actions when a live grant is used. An ended, revoked, invited, unrelated, inactive, feature-disabled, or otherwise unauthorized relationship returns a generic 404-shaped Client 360 error and starts no client-domain read.

Nutrition target calculation may internally read general profile inputs required by Ascend’s existing target calculator, but it returns only nutrition fields. It receives `includeBodyComposition: false` and `includeWeightHistory: false` when body consent is absent, preventing nutrition-only access from querying weight history or body scans. Existing non-Coach callers retain the resolver's default behavior.

## Data sources and reuse

| Section | Existing source | Reused implementation |
|---|---|---|
| Profile | `users` | bounded projection; excludes email, phone, Firebase identity, roles, subscriptions, security status and account internals |
| Completed training | `analytics_events`, `event_name='burn_log'` | current workout completion storage and `analytics_events_user_created_idx` |
| Workout debrief reference | `workout_debriefs` | only a deterministic `debriefAvailable` boolean; no AI prose is copied |
| Exercise progression | persisted `metadata.progressionV3` and `workout_exercise_observations` lineage | `getWorkoutProgressionHistory`; exact persisted `exerciseKey` only |
| Nutrition logs | `food_logs` | daily calorie/protein aggregation |
| Nutrition targets | profile, active coach nutrition plan, member preference, weights, optional trusted athlete scan | `resolveNutritionTargets` and its existing precedence rules |
| Weight | `weight_logs` | bounded 120-day/200-row history |
| Body composition | confirmed athlete `body_composition_scans` | `bodyCompositionScanFromDb`, `getTrustedBodyCompositionHistory`, `buildBodyCompositionComparison` |
| Activity | `health_sync_connections`, `health_sync_records` | bounded aggregate over existing `steps_daily` and `exercise_session` records |

Not present in the repository and therefore omitted: training experience, equipment availability, training limitations/preferences, sleep, soreness, stress, recovery check-ins, planned workout adherence, assigned-program progress, RPE/RIR adherence, and a canonical exercise identifier.

## Metric definitions

### Training

- `completedWorkouts.last7Days/last30Days/last90Days`: count of `burn_log` events in rolling elapsed-time windows.
- `averageSessionsPerWeek30d`: `30-day workout count × 7 / 30`.
- `activeWeeks8`: distinct PostgreSQL calendar weeks containing at least one `burn_log` in the last 56 days.
- `loggingConsistency8w`: `activeWeeks8 / 8`. It is explicitly logging consistency, not program adherence. It is sufficient only after the account is at least 28 days old.
- `averageDurationMinutes30d`: mean of finite positive persisted `durationMinutes` across workouts in the last 30 days; insufficient when none contain a valid duration.
- `lastWorkoutAt`: most recent `burn_log` timestamp.
- recent history: latest ten events with date, title, type, duration, exercise count, derived recorded-set count, source and debrief availability. No raw set history is returned.
- exercise progression: latest unique six exact persisted V3 exercise keys drawn from ten progression histories. The item returns current/previous persisted performance, status, last performed date, comparable-observation count and confidence.

There is no “workout adherence” or “program adherence” metric because Ascend does not yet store assigned multi-week programs or planned session obligations.

### Nutrition

- A logged day is a UTC date whose aggregate calories or protein is greater than zero.
- `loggingCoverage`: logged days divided by calendar days in the 7- or 30-day window.
- average calories/protein: arithmetic mean across logged days only.
- calorie target rate: share of logged days whose calories fall within the existing Momentum V2 goal range:
  - fat loss: 65%–110% of target
  - muscle gain: 80%–120% of target
  - maintenance or unknown goal: 75%–115% of target
- protein target rate: share of logged days at or above 100% of the resolved protein target.

These are named target rates and marked `targetEvaluationBasis: logged_days_only`; they are not presented as whole-period adherence. Thresholds reuse existing Ascend behavior rather than adding a competing convention.

### Body progress

- current weight: most recent `weight_logs` record.
- 7/30/90-day change: latest minus earliest record inside the window, only when at least two records span respectively 3/14/45 days.
- 28-day weight trend: ordinary least-squares slope over all eligible weigh-ins, expressed in kg/week. It requires at least four samples spanning 14 days.
- direction: stable when absolute slope is less than `0.10 kg/week`, otherwise increasing or decreasing.
- body composition: confirmed athlete scans pass through the existing trust filter and comparison engine. Only changes already classified `ESTABLISHED` are included. Missing or provisional scan values are never synthesized.

### Activity

- today’s steps: sum of existing `steps_daily` records for the current database date.
- seven-day average steps: average of per-date summed steps across dates that contain step records. Missing dates are not treated as zero; sample size is returned.
- seven-day exercise sessions: count of `exercise_session` records starting in the rolling seven-day window.
- connection and sync fields come from `health_sync_connections`.

## Trend definitions

Training frequency compares the current rolling 28 days with the preceding 28 days. At least four total workouts are required. A difference of two or more is `increasing`; minus two or less is `decreasing`; otherwise it is `stable`. `ratePerWeek` is the count difference divided by four.

Weight uses the explainable least-squares rule above. Every trend returns sample size, window, observed span, sufficiency, direction, and rate when sufficient. No AI or probabilistic classifier participates.

## Coaching signals

Every signal is computed only from authorized included sections and carries machine-readable evidence.

| Code | Severity | Trigger | Evidence |
|---|---|---|---|
| `TRAINING_INACTIVITY` | attention | at least 8 full days since the latest workout | days since workout, threshold |
| `TRAINING_FREQUENCY_DECLINING` | attention | sufficient 28-vs-28 frequency trend is decreasing | rate/week, sample size |
| `TRAINING_LOGGING_CONSISTENT` | positive | sufficient account age and at least 6 active weeks of 8 | active weeks, window, threshold |
| `STRENGTH_PROGRESSING` | positive | at least 2 distinct exact-key V3 exercises are `progressed` or `personal_best` in 30 days | exercise count, window, identity basis |
| `NUTRITION_LOGGING_LOW` | information | account is at least 14 days old and at most 2 of the last 7 days are logged | days logged, window, threshold |
| `PROTEIN_TARGET_FREQUENTLY_MISSED` | attention | at least 4 logged days and fewer than 50% meet the full protein target | target-met rate, logged days, threshold |
| `POTENTIAL_WEIGHT_PLATEAU` | attention | fat-loss or muscle-gain goal, at least 6 samples spanning 21 days, sufficient 28-day slope, absolute slope below 0.10 kg/week | goal, rate, samples, span, threshold |

`POTENTIAL_WEIGHT_PLATEAU` is deliberately conservative and does not claim diagnosis or causality. “Weight on target” is omitted because Ascend has no reliable target pace/date contract. Declining strength is not signaled because planned deloads and program intent do not yet exist.

## Sufficiency and freshness

Metrics whose absence could mislead carry `sampleSize`, `windowDays`, and `sufficientData`; trends additionally carry `observedSpanDays`. Freshness includes `generatedAt` plus the latest authorized workout, food-log date, weight, trusted scan and health-sync timestamps. Freshness keys for unauthorized sections are omitted.

## APIs

- `GET /api/v1/ascend-coach/clients/:clientId/360` returns `{ snapshot }` after UUID validation, Firebase/database authentication, feature gating and the Phase 0 policy batch.
- `GET /api/v1/ascend-coach/clients` returns active relationships only. It loads display name/goal only for relationships with `profile`; it loads last workout only for those with `training`. Platform Owner break-glass grants are not a client-list mechanism.

Both endpoints set the application’s existing `Cache-Control: no-store` response headers. They expose no unrestricted user-id query and no final UI.

## Query and performance profile

Snapshot computation is on demand and uncached in Phase 1A. Authorization is two parallel statements (policy context and entitlement) plus one audit insert only for break-glass. Once authorized, section groups run in parallel:

- profile: 1 statement;
- training: 2 parallel summary/history statements plus 1 V3 history statement;
- nutrition: 1 daily aggregate plus the existing target resolver’s 4 parallel statements and an optional body-scan statement only with body access;
- body: 2 parallel bounded statements;
- activity: 1 aggregate statement.

The full-scope upper bound is 15 reads in approximately three dependency waves, not dozens of sequential per-metric queries. The count includes the existing nutrition resolver's profile, target-precedence, weight and body-composition inputs; partial-scope privacy options skip its weight and scan reads when body access is absent. Training uses the existing indexed event path; food, weight, body-scan and health paths use existing user/date indexes. A typical partial-scope request executes materially fewer queries because omitted sections never load. Caching is intentionally deferred until measured latency or concurrency warrants it; future Zoe prose should be cached separately from this live deterministic state.

The list path uses workspace authorization, one bounded active-relationship query (maximum 250), then profile and workout aggregates in parallel only for scoped client IDs.

## AI boundary and future Zoe context

Snapshot, trends and signals make zero AI calls. The snapshot service, repository and deterministic domain module contain no AI-provider import or generation invocation, enforced by a focused architecture test.

Phase 1B should derive a smaller `CoachIntelligenceContext` from this contract rather than scrape databases. A typical context should include profile (if consented), core metrics, freshness, signal evidence, up to ten compact workouts and up to six exact-key progression items. Based on the bounded schema, expected JSON is roughly 4–12 KB (about 1,000–3,000 model tokens before instructions), versus unbounded raw logs/sets. AI context must retain scope omissions and freshness, and cached insight identity should include client ID, relationship authorization version, snapshot schema version and a deterministic source-data fingerprint.

## Exercise identity audit and Phase 2 recommendation

Ascend currently has no canonical exercise table or system-wide `exercise_id`. Workout exercises are stored as JSON names. Progression V3 creates a normalized `exercise_key` by conservative text normalization and supports explicit per-user aliases in `workout_exercise_aliases`; observations exist only for supported observed-performance sources. This is sufficient for carefully labelled historical progression, but not for Program Builder grounding.

No production dataset was available in this worktree, so a runtime count of distinct names, normalized collisions and near-duplicates is intentionally not claimed. Before Phase 2, run a read-only production-safe diagnostic over `analytics_events.metadata.exercises`, `workout_exercise_observations` and aliases to count raw names, exact normalized keys, key/name collisions and coverage by source.

Phase 2 should add an additive canonical exercise definition catalog with immutable IDs, supported aliases/mappings and explicit migration/projection of high-confidence known exercises. Program generation must select from candidate `exercise_id` values supplied by Ascend. It must not return invented names for frontend fuzzy matching. Historical unmatched JSON should remain preserved and labelled legacy/unmapped.

## Program foundation readiness

The snapshot is extensible but deliberately has no fake `currentProgram`, week, planned session or adherence field. A later program domain must provide stable assigned-program IDs, immutable completed workout linkage, planned-session status and revision semantics. Those deterministic aggregates can then become an additional scoped section or training subsection without changing the existing workout completion system. Completed program sessions must continue to create the same `burn_log`/observed performance records so the feedback loop reuses this snapshot.

## Rollout and persistence

No migration or persistent snapshot table is added. Phase 1A reuses `ASCEND_COACH_V1`; it remains disabled by default. Pilot rollout should first enable the existing Phase 0 owner/trainer pilot entitlement and relationship consent model. Snapshot persistence would create invalidation/privacy complexity without current evidence and is not recommended.

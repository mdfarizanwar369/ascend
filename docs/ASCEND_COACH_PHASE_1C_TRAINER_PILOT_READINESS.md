# Ascend Coach Phase 1C — Trainer Pilot Readiness

## Scope and baseline

Phase 1C starts from Phase 1B commit `f9d15fff096aa83e83541f9599936fdfbd2699d3`. It hardens and validates the existing Client 360 plus cached Zoe Coach Insight path. It adds no Ask Zoe, Program Builder, program domain, canonical exercise catalog, trainer notes, CRM, messaging, scheduling, snapshot cache, or migration 038.

The branch is `codex/ascend-coach-trainer-pilot-readiness-v1`. `ASCEND_COACH_V1` and `NEXT_PUBLIC_ASCEND_COACH_V1` remain false by default.

## Provider configuration

- Production provider: Gemini.
- Configured model: `gemini-2.5-flash`.
- Provider configuration: `backend/src/config/env.ts` and `backend/src/integrations/openai.ts`.
- Credential source: the existing Railway `ascend-backend` production secret environment.
- Existing Ascend credential reused: yes. The secret was injected into the local child process by Railway, never printed, copied, or saved.
- Structured output: Gemini JSON MIME type plus response schema, followed by strict Zod and evidence validation before persistence and again on cache read.
- Provider attempts per explicit refresh: one model, one attempt, 12-second timeout, no OpenAI fallback.

## Coach Intelligence boundary

The provider receives only `CoachIntelligenceContext`, derived from an already authorized `Client360Snapshot`. Representative serialized contexts were 744–3,929 bytes, below the 16 KiB guardrail. The context excludes client name, client ID, relationship/security records, raw workouts, raw sets, raw food logs, raw scans, raw health data, and previous AI prose.

Prompt identity is `coach-insight-v2`. The v2 identity ensures Phase 1B cache rows generated under the previous wording are not reused. V2 reinforces precise evidence terms, prohibits program/adherence claims, motivation or psychological inference, unsupported goal causality, medical/unsafe guidance, and unsupported trend claims. Semantic rejection runs before persistence.

## Live Gemini acceptance

Eight synthetic contexts were exercised through the existing provider and the real service/cache flow:

| Case | Quality | Calls | Cache write | Reopen calls | Context bytes |
| --- | --- | ---: | --- | ---: | ---: |
| Active, consistent, strength progression | Acceptable | 1 | yes | 0 | 3,622 |
| Training frequency declining | Useful | 1 | yes | 0 | 3,538 |
| Nutrition coverage low, protein target missed | Useful | 1 | yes | 0 | 3,630 |
| Potential weight plateau | Useful | 1 | yes | 0 | 3,515 |
| Sparse/new client | Acceptable | 1 | yes | 0 | 744 |
| Multiple simultaneous signals | Useful | 1 | yes | 0 | 3,929 |
| Partial training-only scope | Acceptable | 1 | yes | 0 | 1,280 |
| Stale training data | Useful | 1 | yes | 0 | 879 |

Final quality: 5 useful, 3 acceptable, 0 weak, 0 unsupported, 0 unsafe. All eight final outputs validated structurally, referenced only available signal codes, wrote to cache, and returned from cache without another provider call. No medical, injury, eating-disorder, medication, treatment, unsafe weight-loss, autonomous program, motivation, or hidden-data claim was accepted.

One rapid intermediate burst produced two provider failures before text was returned. Each stopped after one request, wrote no cache, and returned the safe unavailable state. Targeted reruns succeeded. This demonstrates graceful degradation but is a pilot telemetry item; the product deliberately does not retry or fall back to OpenAI.

Successful generation latency for the final accepted case set was approximately 2.19 seconds median and 2.78 seconds maximum/p95-by-nearest-rank. Cache persistence used the in-memory acceptance repository, so production database persistence latency was not isolated by this harness.

## Cache and call-count evidence

- Initial Client 360 view with no cache: zero provider calls.
- Explicit refresh: one provider call maximum.
- Reload after successful refresh: zero provider calls and a validated cache hit.
- Unchanged reopen: zero provider calls.
- Material source change: source fingerprint changed; prior row was not treated as current; no automatic generation.
- Authorization version change: prior row was inaccessible.
- Cross-client lookup: no cache hit or content leakage.
- Provider/model/prompt version: all participate in cache identity.
- Break-glass: no persistent Coach Insight read or generation.

## Authenticated browser QA

Authenticated browser QA is blocked in this isolated Phase 1C environment. The existing in-app browser had no Ascend session and reached the production registration/login screen. Chrome session reuse was unavailable. No E2E trainer credentials exist in the current secret configuration, Phase 1C is not deployed, and production remains default-off. Authentication was not disabled, Firebase guards were not bypassed, and no token or identity was fabricated.

Automated authorized fixtures still cover full scope, training-only, nutrition re-consent, scope revocation, ended/revoked/invited relationships, sparse data, valid and absent break-glass, unrelated clients, normal-user denial, cache identity, feature flags, and unauthorized-loader suppression. A real signed-in trainer walkthrough remains a pre-pilot operational gate after deploying this commit to the isolated pilot environment.

Because authenticated endpoints could not be exercised through a real browser, client-list and snapshot response-time medians/p95s are not claimed. Code inspection and tests confirm the client list remains three bounded reads with no per-client snapshot calls, and full Client 360 remains bounded parallel retrieval with no frontend per-section requests. Snapshot caching remains unwarranted without measured pilot evidence: keep on-demand.

## Pilot-hardening changes

- Added non-sensitive `client360_opened` and `coach_insight_refresh_requested` telemetry.
- Added provider/model to success/failure generation latency telemetry.
- Preserved no identifiers, snapshots, logs, health data, or AI prose in telemetry.
- Changed the visible nutrition label to “Protein target rate” and “Nutrition logging coverage.”
- Added visible signal severity labels so severity is not communicated by color alone.
- Expanded responsive checks to 320, 375, 390, 430, 768, 1024, and 1280 pixels.
- Added long-name and partial-profile/training list states.
- Added Gemini-specific schema/no-retry tests, quota-before-provider coverage, semantic safety tests, and a reusable synthetic live harness.
- Added the trainer pilot checklist and feedback template.

## Safe pilot configuration

Use a separate pilot environment. Enable both backend and frontend Ascend Coach flags only there, then grant time-bounded `ascend_coach_pilot_access` to 1–3 trusted trainers through the existing owner-authorized endpoint. Create normal accepted relationships and consented scopes for the small client cohort. Do not enable the production environment globally: the entitlement path also recognizes active Trainer Pro subscriptions, so environment isolation is the cleanest cohort boundary.

## Pilot decision

The deterministic service, Gemini contract, cache isolation, authorization invalidation, and failure behavior are ready. Start the trainer pilot only after a legitimate signed-in trainer completes the checklist against the deployed pilot environment. Until that browser gate is completed, the engineering verdict is **ready with an operational authentication note**, not evidence of a completed end-to-end trainer session.

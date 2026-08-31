# Ascend Coach Trainer Pilot Checklist

## Pilot boundary

- 1–3 trusted internal trainers.
- A small client cohort with accepted, active Phase 0 relationships and explicit scopes.
- Approximately 1–2 weeks.
- `ASCEND_COACH_V1` and `NEXT_PUBLIC_ASCEND_COACH_V1` remain false by default. Enable them only in the intended pilot environment, then grant time-bounded `ascend_coach_pilot_access` through the existing owner-authorized endpoint.
- Do not bypass consent, use break-glass for routine coaching, globally enable production, or add Trainer Pro users merely to simplify the pilot.
- Client 360 and Zoe Coach Insight only: no Ask Zoe, Program Builder, program adherence, trainer notes, messaging, CRM, or scheduling.

## Pre-pilot release gate

- [ ] Pilot environment runs migrations 001–037 on PostgreSQL 16; migration 037 remains latest.
- [ ] Phase 1C commit is deployed only to the pilot environment.
- [ ] Existing Gemini credential is supplied by the normal secret store; no credential is copied into a file or log.
- [ ] Provider identity reports `gemini` and the configured Ascend model.
- [ ] The pilot flags are enabled only in the pilot environment.
- [ ] Each trainer has an active trainer profile and time-bounded pilot entitlement.
- [ ] Each client relationship is accepted, active, and limited to consented scopes.
- [ ] No real client is used for provider smoke tests outside the approved privacy boundary.
- [ ] Alerting/log review can identify Coach Insight success/failure and latency without client content.
- [ ] Rollback is understood: disable both pilot flags first; deterministic source records remain unchanged.

## Trainer walkthrough

For each participating trainer, record yes/no plus a short note:

- [ ] Can the trainer find an authorized client quickly?
- [ ] Does the client list contain only active authorized clients?
- [ ] Do long names and missing profile/training permissions remain understandable?
- [ ] Can the trainer understand the client's current state in roughly ten seconds?
- [ ] Can the trainer tell whether training is being recorded and whether frequency is changing?
- [ ] Can the trainer tell whether nutrition is being logged and body weight is moving, when those scopes are granted?
- [ ] Is data freshness obvious enough to judge the evidence?
- [ ] Are unavailable sections clear without exposing hidden values?
- [ ] Are deterministic signals useful and visibly labeled as positive, information, or needing attention?
- [ ] Does sparse data say “Not enough data yet” instead of implying zero consistency or no progress?
- [ ] Does Zoe add interpretation beyond repeating numbers?
- [ ] Does Zoe ever overstate, infer motives, use unsupported program/adherence language, or make medical claims?
- [ ] Are Zoe refreshes intentional rather than habitual?
- [ ] Is cached Zoe content clearly identified and still grounded in current evidence?
- [ ] Is Client 360 fast enough on the trainer's normal phone and connection?
- [ ] Do back navigation, disclosures, focus order, and refresh controls work comfortably?
- [ ] Did any scope, consent, privacy, or break-glass behavior surprise the trainer?
- [ ] Is any terminology confusing or more certain than the underlying data?
- [ ] What information does the trainer repeatedly wish existed?

## Security and cache spot checks

- [ ] Remove one scope; the section and any broader cached insight become inaccessible after refresh.
- [ ] Re-consent to one scope; only that newly authorized section returns.
- [ ] End or revoke a relationship; client list, direct Client 360, cached insight, and refresh all deny access.
- [ ] Confirm an unrelated trainer cannot open the direct client URL.
- [ ] Confirm Platform Owner sensitive reads fail without a live break-glass grant.
- [ ] Confirm valid break-glass is visibly elevated and audited, and cannot read or generate persistent Zoe insight.
- [ ] Confirm an expired break-glass grant is denied.
- [ ] Refresh Zoe once; observe one Gemini provider invocation at most.
- [ ] Reload and reopen unchanged Client 360; observe zero Gemini invocations and a cache hit.
- [ ] Change a material authorized source; confirm the old cache is not current and no automatic generation occurs.
- [ ] Open a second client; confirm no first-client content appears.
- [ ] Simulate Gemini failure; deterministic Client 360 remains usable and no OpenAI fallback occurs.

## Daily pilot review

- Client 360 opens, authorized-section counts, and snapshot latency.
- Coach Insight cache-hit rate and deliberate refresh count.
- Gemini success/failure and generation latency.
- Validation rejections and unavailable-state frequency.
- Privacy/scope incidents or unexpected access denials.
- Repeated terminology confusion or missing evidence requests.

Do not log raw client snapshots, raw Coach Intelligence contexts, food logs, workout histories, health records, client names, or AI prose in telemetry.

## Pilot feedback template

Trainer: __________  Date: __________  Client reference (non-identifying): __________

1. Was Client 360 useful before a client interaction?
2. What did you look at first?
3. What information felt most useful?
4. What felt missing?
5. Was anything confusing?
6. Could you understand the client's current state in roughly ten seconds? Why or why not?
7. Did Zoe tell you something useful rather than repeat the numbers?
8. Did Zoe say anything you disagreed with or that felt too certain?
9. Did you trust the evidence behind Zoe's priorities?
10. Did you intentionally refresh Zoe? What triggered the refresh?
11. Were any unavailable sections or freshness labels unclear?
12. Did you notice any scope/privacy surprises?
13. Would you use Client 360 regularly?
14. What would you want next?

## Stop conditions

Pause the pilot and disable the flags for any permissions leakage, cross-client cache leakage, persistent break-glass AI access, repeated unsafe or unsupported Zoe output, uncontrolled provider calls, or deterministic Client 360 failure when Gemini is unavailable.

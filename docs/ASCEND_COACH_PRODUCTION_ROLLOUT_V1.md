# Ascend Coach controlled production rollout V1

## Production boundary

Ascend Coach is available only when both production flags are enabled and the authenticated backend identity is either a trainer or the configured Platform Owner. A normal member, ordinary admin, or non-platform `owner` role receives no Coach navigation and is denied by the Coach API middleware. Trainer data access still requires the active trainer profile, entitlement, active relationship, consented scopes, and Phase 0 policy decision.

The true configured Platform Owner has audited read-only access to every active Ascend account with client capability. This is represented explicitly as `platform_owner` access rather than a trainer relationship or break-glass grant. Ordinary owners and administrators do not receive this access. Trainer access still requires an active relationship, entitlement, and consented scopes.

Platform Owner access includes the deterministic Client 360 profile, training, nutrition, body-progress, and activity sections. It does not grant trainer mutations, notes, program actions, or persistent Zoe Coach Insight generation/cache access. Client-list opens and individual Client 360 reads are recorded in the Ascend Coach audit trail.

## Operational configuration

- Backend kill switch: `ASCEND_COACH_V1`.
- Frontend visibility switch: `NEXT_PUBLIC_ASCEND_COACH_V1`.
- Provider: Gemini.
- Production model: `gemini-3.6-flash`.
- Frontend variables are embedded during the Docker build; only `NEXT_PUBLIC_*` values may be supplied there.
- The backend starts only after the additive migration runner completes migrations 001–037.

Both Coach flags must represent the same rollout state. Backend authorization remains authoritative if frontend configuration is stale.

## Immediate kill switch

1. Set `ASCEND_COACH_V1=false` in the production backend.
2. Set `NEXT_PUBLIC_ASCEND_COACH_V1=false` in the production frontend and redeploy the frontend so the public build-time value changes.
3. Confirm Coach navigation is absent and all `/api/v1/ascend-coach/*` endpoints return the feature-disabled response.
4. Confirm ordinary Ascend member features remain available.

The backend flag is the immediate security boundary; disabling it does not require a frontend build to stop Coach API access.

## Code rollback

If code rollback is required, redeploy the production commit immediately before the Coach integration. Do not drop migrations 036–037 and do not delete insight cache rows as part of routine rollback. These additive tables can remain dormant. Existing workout, nutrition, body, relationship, consent, and audit history must remain intact.

## Production pilot

The intended cohort is the configured Platform Owner plus the small set of existing authorized trainer accounts. Do not create public trainer signup or broaden account roles for rollout convenience. Observe Client 360 opens, deterministic latency, authorized-section counts, cache hits, deliberate refreshes, Gemini outcome/latency, validation rejections, and privacy incidents for one to two weeks before selecting another Coach feature.

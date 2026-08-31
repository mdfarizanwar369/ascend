# Ascend Coach Phase 0 Foundation

## Scope lock

This phase implements authorization and consent infrastructure only. It intentionally does **not** implement Client 360, deterministic client intelligence, Zoe Coach Insight, Ask Zoe, an exercise catalog, programs, Program Builder, assignment, trainer notes, or any new client-data aggregation.

The implementation baseline is `origin/main` commit `65a748d`. A fresh fetch immediately before the worktree was created showed no material drift from `ASCEND_COACH_ARCHITECTURE_STUDY.md`.

## Foundation added

- `trainer_client_relationships`: invitation, explicit consent, bounded data scopes, lifecycle timestamps, primary-programming authority, provenance, and monotonically increasing authorization version.
- `ascend_coach_access_audit_events`: consent/access administration audit without meal, body, workout, note, or other client content.
- `ascend_coach_pilot_access`: explicit Coach-entitlement override. Platform Owner identity is not itself a pilot override.
- `ascend_coach_break_glass_grants`: reasoned, expiring, revocable Platform Owner access with a maximum duration of 60 minutes. Each use is audited.
- Backend `ASCEND_COACH_V1` and frontend `NEXT_PUBLIC_ASCEND_COACH_V1`, both default off.
- A centralized action policy and stable authorization cache-key hook.
- Minimal relationship lifecycle APIs. No Coach product UI was added.

## Authorization matrix

All backend checks are authoritative. The frontend flag is presentation-only.

| Action | Required relationship scope | Additional requirement | Break glass |
|---|---|---|---|
| `view_profile` | `profile` | Active relationship | Read-only allowed |
| `view_training` | `training` | Active relationship | Read-only allowed |
| `view_nutrition` | `nutrition` | Active relationship | Read-only allowed |
| `view_body` | `body` | Active relationship | Read-only allowed |
| `view_recovery` | `recovery` | Active relationship | Read-only allowed |
| `view_progress_photos` | `progress_photos` | Active relationship | Read-only allowed |
| `manage_notes` | `profile` | Active relationship | Never |
| `create_program` | `profile` + `training` | Primary programming authority | Never |
| `edit_program` | `profile` + `training` | Primary programming authority | Never |
| `assign_program` | `profile` + `training` | Primary programming authority | Never |
| `view_ai_insight` | `profile` + `training` | Active relationship | Never |

Normal trainer authorization additionally requires all of the following:

1. `ASCEND_COACH_V1=true` on the backend.
2. Authenticated, active Ascend account.
3. Trainer role capability, including multi-role accounts whose primary role is `client`.
4. An active `trainers` profile belonging to the actor.
5. Active `trainer_pro` entitlement or an unexpired explicit pilot override.
6. An active relationship for the target client.
7. Target account is active and has client capability, even if its primary role is not `client`.
8. The action's data scope and, for program actions, primary authority.

Admin, owner, gym scope, or configured Platform Owner identity does not grant ordinary client-content access while the flag is on. A Platform Owner may administer pilots and may create a short-lived break-glass grant, but that grant permits only the six read actions. It never permits notes, AI insights, or program mutations.

## Consent lifecycle

`invited -> active -> revoked_by_client | ended_by_trainer`

An invitation can also become `declined`. `suspended` is reserved for operational enforcement and always denies access. A trainer scope change turns an active relationship back into `invited`, clears granted scopes immediately, and requires fresh client acceptance. Clients may accept a subset of the requested scopes. Every authorization-relevant change increments `authorization_version`.

Relationship APIs:

- `POST /api/v1/coach/relationships/invitations`
- `GET /api/v1/coach/relationships`
- `PATCH /api/v1/coach/relationships/:relationshipId/scopes`
- `POST /api/v1/coach/relationships/:relationshipId/end`
- `GET /api/v1/me/coach-access`
- `POST /api/v1/me/coach-access/:relationshipId/accept`
- `POST /api/v1/me/coach-access/:relationshipId/decline`
- `POST /api/v1/me/coach-access/:relationshipId/revoke`

Owner-only foundation controls:

- `PUT|DELETE /api/v1/coach/pilots/:userId`
- `POST /api/v1/coach/break-glass`
- `DELETE /api/v1/coach/break-glass/:grantId`

## Legacy transition

Migration `036_ascend_coach_foundation.sql` backfills every current non-null `users.assigned_trainer_id` into an active relationship with:

- provenance `legacy_assigned_trainer`;
- consent marker `legacy-assignment-v1`;
- the complete legacy data-scope set;
- primary programming authority;
- a corresponding audit event.

While `ASCEND_COACH_V1=false`, `canManageClient` retains the existing pointer/admin/owner behavior. While the flag is on, relationship policy is the authorization truth. A database trigger projects the active primary relationship back to `users.assigned_trainer_id` only for temporary compatibility; application authorization does not consult both models.

Admin assignment while the flag is off is transactionally mirrored into a `legacy_admin_assignment` relationship, so assignments created after the one-time migration cannot become pointer-only drift. That compatibility path refuses to overwrite a consent-based `coach_invite` relationship.

The old admin direct-assignment endpoint returns `coach_relationship_required` while the flag is on, preventing new unsanctioned pointer-only assignments. The existing trainer list is limited to active full-scope relationships while the flag is on. Partial-scope relationships do not unlock old broad endpoints; later phases must explicitly map each endpoint to its narrow action before exposing those resources.

## Migration and rollback guidance

Apply migration 036 only after a backup and a backfill preview comparing:

- active assigned pointers;
- expected relationship count;
- duplicate trainer/client pairs;
- clients that would have more than one primary authority.

The migration is additive. It does not alter or rewrite workout events, food logs, body data, photos, messages, or completed-workout history. The projection trigger avoids touching a user row when its current pointer and coaching mode already match.

Preferred rollback after any real invitation or consent is **roll forward**:

1. Set backend and frontend flags off.
2. Keep the new tables and audit history intact.
3. Correct the policy or API defect.
4. Re-enable only after authorization tests pass.

Dropping the new tables is acceptable only in a disposable environment before any real consent record exists. If that exceptional rollback is required, remove the relationship projection/version triggers and functions first, then break-glass, pilot, audit, and relationship tables in dependency order. Never clear or recompute `analytics_events`, workout observations, or other client history. Keep the projected `assigned_trainer_id` values so the disabled-flag legacy path remains operational.

## Authorization invalidation

No positive authorization decision is persistently cached in Phase 0. Policy reads current database state. The exported cache-key contract includes actor, client, action, relationship ID, and `authorization_version`, allowing a later cache to invalidate immediately after accept, scope change, revoke, end, suspension, or primary-authority change.

## Remaining blockers before Client 360 Phase 1

- Map every existing trainer-facing route to one narrow policy action instead of the temporary full-legacy-scope gate.
- Define and test field-level redaction for any mixed-data response.
- Decide the pilot consent copy and client-facing UI; Phase 0 provides APIs only.
- Add notification delivery for invitations without changing authorization semantics.
- Decide whether gym affiliation remains an invitation prerequisite beyond the first pilot.
- Run migration 036 against a production-like database snapshot and validate its cardinality/invariants before any deployment.
- Define the deterministic Client 360 read model separately. It must not be smuggled into this foundation phase.

## Validation evidence

- Full frontend/backend test suite passes.
- Full repository lint passes.
- Full production build passes.
- Migrations 001–036 were applied in order to a disposable PostgreSQL 16 database.
- A synthetic legacy `assigned_trainer_id` produced one active six-scope relationship, one legacy backfill audit event, and retained the compatibility pointer.
- Synthetic client revocation cleared all scopes, incremented `authorization_version` from 1 to 2, and projected `assigned_trainer_id` to null.
- The disposable database container was removed after validation.

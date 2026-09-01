import { PoolClient } from "pg";
import { pool, query } from "../db/pool";
import { AuthUser } from "../middleware/auth";
import {
  ASCEND_COACH_DATA_SCOPES,
  AscendCoachDataScope,
  ascendCoachV1Enabled,
  hasAscendCoachEntitlement
} from "./ascendCoachPolicyService";

export const ASCEND_COACH_CONSENT_VERSION = "ascend-coach-consent-v1";

export class CoachFoundationError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

type RelationshipRow = {
  id: string;
  trainer_id: string;
  client_user_id: string;
  status: string;
  provenance: string;
  requested_scopes: AscendCoachDataScope[];
  data_scopes: AscendCoachDataScope[];
  is_primary_programming_authority: boolean;
  consent_version: string | null;
  invited_at: string;
  accepted_at: string | null;
  declined_at: string | null;
  revoked_at: string | null;
  ended_at: string | null;
  authorization_version: string | number;
  created_at: string;
  updated_at: string;
};

function requireEnabled() {
  if (!ascendCoachV1Enabled()) {
    throw new CoachFoundationError(404, "ascend_coach_disabled", "Not found");
  }
}

function normalizeScopes(scopes: readonly AscendCoachDataScope[]) {
  const requested = new Set(scopes);
  return ASCEND_COACH_DATA_SCOPES.filter((scope) => requested.has(scope));
}

export function isEligibleCoachInviteTarget(input: {
  actorUserId: string;
  trainerGymId: string;
  clientUserId: string;
  clientGymId: string | null;
}) {
  return input.actorUserId !== input.clientUserId && input.clientGymId === input.trainerGymId;
}

async function requireTrainerCapability(actor: AuthUser) {
  const hasTrainerRole = actor.primaryRole === "trainer" || actor.roles.includes("trainer");
  if (!hasTrainerRole || !actor.trainerId) {
    throw new CoachFoundationError(403, "trainer_profile_required", "Active trainer access is required");
  }
  const result = await query<{ status: string; gym_id: string }>(
    "select status, gym_id from trainers where id = $1 and user_id = $2",
    [actor.trainerId, actor.id]
  );
  if (!result.rows[0] || result.rows[0].status !== "active") {
    throw new CoachFoundationError(403, "trainer_inactive", "Active trainer access is required");
  }
  if (!actor.isPlatformOwner && !await hasAscendCoachEntitlement(actor.id)) {
    throw new CoachFoundationError(402, "coach_entitlement_required", "Trainer Pro or pilot access is required");
  }
  return { trainerId: actor.trainerId, gymId: result.rows[0].gym_id };
}

async function audit(
  client: Pick<PoolClient, "query">,
  input: {
    relationshipId?: string | null;
    actorUserId: string;
    trainerId?: string | null;
    clientUserId?: string | null;
    subjectUserId?: string | null;
    eventType: string;
    authorizationVersion?: number | string | null;
    metadata?: Record<string, string | number | boolean | string[] | null>;
  }
) {
  await client.query(
    `
    insert into ascend_coach_access_audit_events
      (relationship_id, actor_user_id, trainer_id, client_user_id, subject_user_id, event_type, authorization_version, metadata)
    values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
    `,
    [
      input.relationshipId ?? null,
      input.actorUserId,
      input.trainerId ?? null,
      input.clientUserId ?? null,
      input.subjectUserId ?? null,
      input.eventType,
      input.authorizationVersion ?? null,
      JSON.stringify(input.metadata ?? {})
    ]
  );
}

async function transaction<T>(work: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function inviteCoachClient(input: {
  actor: AuthUser;
  clientEmail: string;
  requestedScopes: AscendCoachDataScope[];
  primaryProgrammingAuthority: boolean;
}) {
  requireEnabled();
  const capability = await requireTrainerCapability(input.actor);
  const requestedScopes = normalizeScopes(input.requestedScopes);
  if (!requestedScopes.length) {
    throw new CoachFoundationError(400, "scope_required", "At least one data scope is required");
  }

  const clientResult = await query<{ id: string; gym_id: string | null }>(
    `
    select client.id, client.gym_id
    from users client
    where lower(client.email) = lower($1)
      and client.status = 'active'
      and (
        client.primary_role = 'client'
        or exists (select 1 from user_roles role where role.user_id = client.id and role.role = 'client')
      )
    limit 1
    `,
    [input.clientEmail]
  );
  const target = clientResult.rows[0];
  if (!target || !isEligibleCoachInviteTarget({
    actorUserId: input.actor.id,
    trainerGymId: capability.gymId,
    clientUserId: target.id,
    clientGymId: target.gym_id
  })) {
    throw new CoachFoundationError(404, "client_not_available", "Eligible client not found");
  }

  return transaction(async (client) => {
    const existing = await client.query<{ id: string }>(
      `
      select id from trainer_client_relationships
      where trainer_id = $1 and client_user_id = $2 and status in ('invited', 'active', 'suspended')
      for update
      `,
      [capability.trainerId, target.id]
    );
    if (existing.rows[0]) {
      throw new CoachFoundationError(409, "relationship_already_open", "A relationship or invitation already exists");
    }

    const result = await client.query<RelationshipRow>(
      `
      insert into trainer_client_relationships (
        trainer_id, client_user_id, status, provenance, requested_scopes, data_scopes,
        is_primary_programming_authority, invited_by_user_id
      )
      values ($1, $2, 'invited', 'coach_invite', $3::text[], '{}'::text[], $4, $5)
      returning *
      `,
      [capability.trainerId, target.id, requestedScopes, input.primaryProgrammingAuthority, input.actor.id]
    );
    const relationship = result.rows[0];
    await audit(client, {
      relationshipId: relationship.id,
      actorUserId: input.actor.id,
      trainerId: capability.trainerId,
      clientUserId: target.id,
      eventType: "relationship_invited",
      authorizationVersion: relationship.authorization_version,
      metadata: { requestedScopes, primaryProgrammingAuthority: input.primaryProgrammingAuthority }
    });
    return relationship;
  });
}

export async function listTrainerCoachRelationships(actor: AuthUser) {
  requireEnabled();
  const capability = await requireTrainerCapability(actor);
  const result = await query(
    `
    select relationship.*, client.full_name as client_name, client.email as client_email
    from trainer_client_relationships relationship
    join users client on client.id = relationship.client_user_id
    where relationship.trainer_id = $1
    order by
      case relationship.status when 'active' then 0 when 'invited' then 1 else 2 end,
      relationship.updated_at desc
    `,
    [capability.trainerId]
  );
  return result.rows;
}

export async function getMyCoachAccess(userId: string) {
  requireEnabled();
  const [relationships, breakGlass] = await Promise.all([
    query(
      `
      select relationship.*, trainer_user.full_name as trainer_name, trainer_user.email as trainer_email
      from trainer_client_relationships relationship
      join trainers trainer on trainer.id = relationship.trainer_id
      join users trainer_user on trainer_user.id = trainer.user_id
      where relationship.client_user_id = $1
      order by relationship.updated_at desc
      `,
      [userId]
    ),
    query(
      `
      select grant_row.id, owner_user.full_name as accessor_name, grant_row.expires_at, grant_row.created_at
      from ascend_coach_break_glass_grants grant_row
      join users owner_user on owner_user.id = grant_row.platform_owner_user_id
      where grant_row.client_user_id = $1
        and grant_row.revoked_at is null
        and grant_row.expires_at > now()
      order by grant_row.expires_at desc
      `,
      [userId]
    )
  ]);
  return { relationships: relationships.rows, temporaryAccess: breakGlass.rows };
}

export async function acceptCoachInvitation(input: {
  actorUserId: string;
  relationshipId: string;
  acceptedScopes: AscendCoachDataScope[];
}) {
  requireEnabled();
  const acceptedScopes = normalizeScopes(input.acceptedScopes);
  if (!acceptedScopes.length) {
    throw new CoachFoundationError(400, "scope_required", "Accept at least one requested data scope");
  }
  return transitionClientRelationship(input.actorUserId, input.relationshipId, async (client, relationship) => {
    if (relationship.status !== "invited") {
      throw new CoachFoundationError(409, "invitation_not_open", "This invitation is no longer open");
    }
    const requested = new Set(relationship.requested_scopes);
    if (!acceptedScopes.every((scope) => requested.has(scope))) {
      throw new CoachFoundationError(400, "scope_not_requested", "Accepted scopes must be a subset of the invitation");
    }
    try {
      const result = await client.query<RelationshipRow>(
        `
        update trainer_client_relationships
        set status = 'active', data_scopes = $2::text[], consent_version = $3,
            accepted_at = now(), declined_at = null, revoked_at = null, ended_at = null,
            ended_by_user_id = null
        where id = $1
        returning *
        `,
        [relationship.id, acceptedScopes, ASCEND_COACH_CONSENT_VERSION]
      );
      const updated = result.rows[0];
      await audit(client, {
        relationshipId: updated.id,
        actorUserId: input.actorUserId,
        trainerId: updated.trainer_id,
        clientUserId: updated.client_user_id,
        eventType: "relationship_accepted",
        authorizationVersion: updated.authorization_version,
        metadata: { acceptedScopes, consentVersion: ASCEND_COACH_CONSENT_VERSION }
      });
      return updated;
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        throw new CoachFoundationError(409, "primary_programming_authority_conflict", "Another trainer already has primary programming authority");
      }
      throw error;
    }
  });
}

async function transitionClientRelationship<T>(
  actorUserId: string,
  relationshipId: string,
  transition: (client: PoolClient, relationship: RelationshipRow) => Promise<T>
) {
  return transaction(async (client) => {
    const result = await client.query<RelationshipRow>(
      "select * from trainer_client_relationships where id = $1 and client_user_id = $2 for update",
      [relationshipId, actorUserId]
    );
    if (!result.rows[0]) throw new CoachFoundationError(404, "relationship_not_found", "Relationship not found");
    return transition(client, result.rows[0]);
  });
}

export async function declineCoachInvitation(actorUserId: string, relationshipId: string) {
  requireEnabled();
  return transitionClientRelationship(actorUserId, relationshipId, async (client, relationship) => {
    if (relationship.status !== "invited") {
      throw new CoachFoundationError(409, "invitation_not_open", "This invitation is no longer open");
    }
    const result = await client.query<RelationshipRow>(
      `
      update trainer_client_relationships
      set status = 'declined', data_scopes = '{}'::text[], declined_at = now(), ended_by_user_id = $2
      where id = $1 returning *
      `,
      [relationship.id, actorUserId]
    );
    const updated = result.rows[0];
    await audit(client, {
      relationshipId: updated.id,
      actorUserId,
      trainerId: updated.trainer_id,
      clientUserId: updated.client_user_id,
      eventType: "relationship_declined",
      authorizationVersion: updated.authorization_version
    });
    return updated;
  });
}

export async function revokeCoachRelationship(actorUserId: string, relationshipId: string) {
  requireEnabled();
  return transitionClientRelationship(actorUserId, relationshipId, async (client, relationship) => {
    if (!['active', 'suspended'].includes(relationship.status)) {
      throw new CoachFoundationError(409, "relationship_not_active", "This relationship is not active");
    }
    const result = await client.query<RelationshipRow>(
      `
      update trainer_client_relationships
      set status = 'revoked_by_client', data_scopes = '{}'::text[], revoked_at = now(), ended_by_user_id = $2
      where id = $1 returning *
      `,
      [relationship.id, actorUserId]
    );
    const updated = result.rows[0];
    await audit(client, {
      relationshipId: updated.id,
      actorUserId,
      trainerId: updated.trainer_id,
      clientUserId: updated.client_user_id,
      eventType: "relationship_revoked",
      authorizationVersion: updated.authorization_version
    });
    return updated;
  });
}

async function lockTrainerRelationship(client: PoolClient, trainerId: string, relationshipId: string) {
  const result = await client.query<RelationshipRow>(
    "select * from trainer_client_relationships where id = $1 and trainer_id = $2 for update",
    [relationshipId, trainerId]
  );
  if (!result.rows[0]) throw new CoachFoundationError(404, "relationship_not_found", "Relationship not found");
  return result.rows[0];
}

export async function endCoachRelationship(actor: AuthUser, relationshipId: string) {
  requireEnabled();
  const capability = await requireTrainerCapability(actor);
  return transaction(async (client) => {
    const relationship = await lockTrainerRelationship(client, capability.trainerId, relationshipId);
    if (!['invited', 'active', 'suspended'].includes(relationship.status)) {
      throw new CoachFoundationError(409, "relationship_not_open", "This relationship is no longer open");
    }
    const result = await client.query<RelationshipRow>(
      `
      update trainer_client_relationships
      set status = 'ended_by_trainer', data_scopes = '{}'::text[], ended_at = now(), ended_by_user_id = $2
      where id = $1 returning *
      `,
      [relationship.id, actor.id]
    );
    const updated = result.rows[0];
    await audit(client, {
      relationshipId: updated.id,
      actorUserId: actor.id,
      trainerId: updated.trainer_id,
      clientUserId: updated.client_user_id,
      eventType: "relationship_ended",
      authorizationVersion: updated.authorization_version
    });
    return updated;
  });
}

export async function requestCoachScopeChange(input: {
  actor: AuthUser;
  relationshipId: string;
  requestedScopes: AscendCoachDataScope[];
  primaryProgrammingAuthority: boolean;
}) {
  requireEnabled();
  const capability = await requireTrainerCapability(input.actor);
  const requestedScopes = normalizeScopes(input.requestedScopes);
  if (!requestedScopes.length) throw new CoachFoundationError(400, "scope_required", "At least one scope is required");
  return transaction(async (client) => {
    const relationship = await lockTrainerRelationship(client, capability.trainerId, input.relationshipId);
    if (!['invited', 'active'].includes(relationship.status)) {
      throw new CoachFoundationError(409, "relationship_not_open", "This relationship cannot be changed");
    }
    const result = await client.query<RelationshipRow>(
      `
      update trainer_client_relationships
      set status = 'invited', requested_scopes = $2::text[], data_scopes = '{}'::text[],
          is_primary_programming_authority = $3, consent_version = null, invited_at = now(),
          accepted_at = null, declined_at = null, revoked_at = null, ended_at = null,
          ended_by_user_id = null
      where id = $1 returning *
      `,
      [relationship.id, requestedScopes, input.primaryProgrammingAuthority]
    );
    const updated = result.rows[0];
    await audit(client, {
      relationshipId: updated.id,
      actorUserId: input.actor.id,
      trainerId: updated.trainer_id,
      clientUserId: updated.client_user_id,
      eventType: "relationship_scopes_requested",
      authorizationVersion: updated.authorization_version,
      metadata: { requestedScopes, primaryProgrammingAuthority: input.primaryProgrammingAuthority }
    });
    return updated;
  });
}

export async function grantCoachPilotAccess(input: {
  actor: AuthUser;
  userId: string;
  reason: string;
  expiresAt?: string | null;
}) {
  requireEnabled();
  if (!input.actor.isPlatformOwner) throw new CoachFoundationError(403, "platform_owner_required", "Founder access only");
  return transaction(async (client) => {
    const eligible = await client.query<{ id: string }>(
      `
      select user_row.id
      from users user_row
      join trainers trainer on trainer.user_id = user_row.id and trainer.status = 'active'
      where user_row.id = $1
        and user_row.status = 'active'
        and (user_row.primary_role = 'trainer' or exists (
          select 1 from user_roles role where role.user_id = user_row.id and role.role = 'trainer'
        ))
      `,
      [input.userId]
    );
    if (!eligible.rows[0]) {
      throw new CoachFoundationError(404, "trainer_not_found", "Active trainer not found");
    }
    const result = await client.query(
      `
      insert into ascend_coach_pilot_access (user_id, granted_by_user_id, reason, expires_at)
      values ($1, $2, $3, $4)
      on conflict (user_id) do update set
        granted_by_user_id = excluded.granted_by_user_id,
        reason = excluded.reason,
        expires_at = excluded.expires_at,
        revoked_at = null,
        updated_at = now()
      returning *
      `,
      [input.userId, input.actor.id, input.reason, input.expiresAt ?? null]
    );
    await audit(client, {
      actorUserId: input.actor.id,
      subjectUserId: input.userId,
      eventType: "pilot_access_granted",
      metadata: { expiresAt: input.expiresAt ?? null }
    });
    return result.rows[0];
  });
}

export async function revokeCoachPilotAccess(actor: AuthUser, userId: string) {
  requireEnabled();
  if (!actor.isPlatformOwner) throw new CoachFoundationError(403, "platform_owner_required", "Founder access only");
  return transaction(async (client) => {
    const result = await client.query(
      "update ascend_coach_pilot_access set revoked_at = now(), updated_at = now() where user_id = $1 and revoked_at is null returning *",
      [userId]
    );
    if (!result.rows[0]) throw new CoachFoundationError(404, "pilot_access_not_found", "Pilot access not found");
    await audit(client, {
      actorUserId: actor.id,
      subjectUserId: userId,
      eventType: "pilot_access_revoked",
      metadata: {}
    });
    return result.rows[0];
  });
}

export async function grantBreakGlassAccess(input: {
  actor: AuthUser;
  clientUserId: string;
  reason: string;
  expiresMinutes: number;
}) {
  requireEnabled();
  if (!input.actor.isPlatformOwner) throw new CoachFoundationError(403, "platform_owner_required", "Founder access only");
  return transaction(async (client) => {
    const target = await client.query<{ id: string }>(
      `
      select user_row.id from users user_row
      where user_row.id = $1 and user_row.status = 'active'
        and (user_row.primary_role = 'client' or exists (
          select 1 from user_roles role where role.user_id = user_row.id and role.role = 'client'
        ))
      `,
      [input.clientUserId]
    );
    if (!target.rows[0]) throw new CoachFoundationError(404, "client_not_found", "Client not found");
    const result = await client.query(
      `
      insert into ascend_coach_break_glass_grants
        (platform_owner_user_id, client_user_id, reason, expires_at)
      values ($1, $2, $3, now() + ($4::text || ' minutes')::interval)
      returning *
      `,
      [input.actor.id, input.clientUserId, input.reason, input.expiresMinutes]
    );
    const grant = result.rows[0];
    await audit(client, {
      actorUserId: input.actor.id,
      clientUserId: input.clientUserId,
      eventType: "break_glass_granted",
      metadata: { grantId: grant.id, expiresMinutes: input.expiresMinutes }
    });
    return grant;
  });
}

export async function revokeBreakGlassAccess(actor: AuthUser, grantId: string) {
  requireEnabled();
  if (!actor.isPlatformOwner) throw new CoachFoundationError(403, "platform_owner_required", "Founder access only");
  return transaction(async (client) => {
    const result = await client.query(
      `
      update ascend_coach_break_glass_grants
      set revoked_at = now()
      where id = $1 and platform_owner_user_id = $2 and revoked_at is null
      returning *
      `,
      [grantId, actor.id]
    );
    const grant = result.rows[0];
    if (!grant) throw new CoachFoundationError(404, "break_glass_not_found", "Temporary access not found");
    await audit(client, {
      actorUserId: actor.id,
      clientUserId: grant.client_user_id,
      eventType: "break_glass_revoked",
      metadata: { grantId }
    });
    return grant;
  });
}

export async function setLegacyAdminCoachAssignment(input: {
  actor: AuthUser;
  clientUserId: string;
  trainerId: string | null;
}) {
  return transaction(async (client) => {
    const target = await client.query<{ id: string; assigned_trainer_id: string | null }>(
      "select id, assigned_trainer_id from users where id = $1 and primary_role = 'client' for update",
      [input.clientUserId]
    );
    if (!target.rows[0]) throw new CoachFoundationError(404, "client_not_found", "Client not found");

    const openRelationships = await client.query<RelationshipRow>(
      `
      select * from trainer_client_relationships
      where client_user_id = $1 and status in ('invited', 'active', 'suspended')
      for update
      `,
      [input.clientUserId]
    );

    if (openRelationships.rows.some((relationship) => relationship.provenance === "coach_invite")) {
      throw new CoachFoundationError(
        409,
        "consent_relationship_exists",
        "Manage the consent-based Coach relationship instead of using legacy assignment"
      );
    }

    if (input.trainerId) {
      for (const relationship of openRelationships.rows) {
        if (relationship.trainer_id === input.trainerId && relationship.status === "active") continue;
        const ended = await client.query<RelationshipRow>(
          `
          update trainer_client_relationships
          set status = 'ended_by_trainer', data_scopes = '{}'::text[], ended_at = now(), ended_by_user_id = $2
          where id = $1 returning *
          `,
          [relationship.id, input.actor.id]
        );
        await audit(client, {
          relationshipId: relationship.id,
          actorUserId: input.actor.id,
          trainerId: relationship.trainer_id,
          clientUserId: input.clientUserId,
          eventType: "legacy_admin_assignment_ended",
          authorizationVersion: ended.rows[0].authorization_version,
          metadata: { provenance: relationship.provenance }
        });
      }

      let relationship = openRelationships.rows.find((row) => row.trainer_id === input.trainerId && row.status === "active");
      if (!relationship) {
        try {
          const created = await client.query<RelationshipRow>(
            `
            insert into trainer_client_relationships (
              trainer_id, client_user_id, status, provenance, requested_scopes, data_scopes,
              is_primary_programming_authority, consent_version, invited_by_user_id, accepted_at
            )
            values (
              $1, $2, 'active', 'legacy_admin_assignment',
              $3::text[], $3::text[], true, 'legacy-admin-assignment-v1', $4, now()
            )
            returning *
            `,
            [input.trainerId, input.clientUserId, [...ASCEND_COACH_DATA_SCOPES], input.actor.id]
          );
          relationship = created.rows[0];
          await audit(client, {
            relationshipId: relationship.id,
            actorUserId: input.actor.id,
            trainerId: relationship.trainer_id,
            clientUserId: input.clientUserId,
            eventType: "legacy_admin_assignment_created",
            authorizationVersion: relationship.authorization_version,
            metadata: { provenance: relationship.provenance }
          });
        } catch (error) {
          if ((error as { code?: string }).code === "23505") {
            throw new CoachFoundationError(409, "primary_programming_authority_conflict", "Another trainer has primary programming authority");
          }
          throw error;
        }
      }

      await client.query(
        `
        update users
        set gym_id = coalesce(gym_id, (select gym_id from trainers where id = $2)), updated_at = now()
        where id = $1 and gym_id is null
        `,
        [input.clientUserId, input.trainerId]
      );
    } else {
      for (const relationship of openRelationships.rows.filter((row) => row.provenance !== "coach_invite")) {
        const ended = await client.query<RelationshipRow>(
          `
          update trainer_client_relationships
          set status = 'ended_by_trainer', data_scopes = '{}'::text[], ended_at = now(), ended_by_user_id = $2
          where id = $1 returning *
          `,
          [relationship.id, input.actor.id]
        );
        await audit(client, {
          relationshipId: relationship.id,
          actorUserId: input.actor.id,
          trainerId: relationship.trainer_id,
          clientUserId: input.clientUserId,
          eventType: "legacy_admin_assignment_ended",
          authorizationVersion: ended.rows[0].authorization_version,
          metadata: { provenance: relationship.provenance }
        });
      }
      if (!openRelationships.rows.some((row) => row.provenance !== "coach_invite")) {
        await client.query("update users set assigned_trainer_id = null, updated_at = now() where id = $1", [input.clientUserId]);
      }
    }

    const user = await client.query("select * from users where id = $1", [input.clientUserId]);
    return user.rows[0];
  });
}

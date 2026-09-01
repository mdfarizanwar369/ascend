import { env } from "../config/env";
import { query } from "../db/pool";
import { AuthUser } from "../middleware/auth";

export const ASCEND_COACH_DATA_SCOPES = [
  "profile",
  "training",
  "nutrition",
  "body",
  "recovery",
  "progress_photos"
] as const;

export type AscendCoachDataScope = typeof ASCEND_COACH_DATA_SCOPES[number];

export const ASCEND_COACH_ACTIONS = [
  "view_profile",
  "view_training",
  "view_nutrition",
  "view_body",
  "view_recovery",
  "view_progress_photos",
  "manage_notes",
  "create_program",
  "edit_program",
  "assign_program",
  "view_ai_insight"
] as const;

export type AscendCoachAction = typeof ASCEND_COACH_ACTIONS[number];

export type AscendCoachDenialReason =
  | "feature_disabled"
  | "client_not_found"
  | "client_inactive"
  | "client_capability_missing"
  | "trainer_role_required"
  | "trainer_profile_required"
  | "trainer_inactive"
  | "coach_entitlement_required"
  | "relationship_required"
  | "relationship_inactive"
  | "scope_missing"
  | "primary_programming_authority_required";

export interface AscendCoachPolicyContext {
  featureEnabled: boolean;
  actor: Pick<AuthUser, "id" | "roles" | "primaryRole" | "trainerId" | "isPlatformOwner">;
  client: { id: string; status: string; hasClientCapability: boolean } | null;
  trainerProfile: { id: string; status: string } | null;
  entitled: boolean;
  relationship: {
    id: string;
    status: string;
    dataScopes: AscendCoachDataScope[];
    isPrimaryProgrammingAuthority: boolean;
    authorizationVersion: number;
  } | null;
  breakGlassGrant?: { id: string } | null;
}

export interface AscendCoachPolicyDecision {
  allowed: boolean;
  reason?: AscendCoachDenialReason;
  relationshipId?: string;
  authorizationVersion?: number;
  breakGlassGrantId?: string;
  dataScopes?: AscendCoachDataScope[];
}

const requiredScopes: Record<AscendCoachAction, AscendCoachDataScope[]> = {
  view_profile: ["profile"],
  view_training: ["training"],
  view_nutrition: ["nutrition"],
  view_body: ["body"],
  view_recovery: ["recovery"],
  view_progress_photos: ["progress_photos"],
  manage_notes: ["profile"],
  create_program: ["profile", "training"],
  edit_program: ["profile", "training"],
  assign_program: ["profile", "training"],
  view_ai_insight: ["profile", "training"]
};

const programmingActions = new Set<AscendCoachAction>(["create_program", "edit_program", "assign_program"]);
const breakGlassActions = new Set<AscendCoachAction>([
  "view_profile",
  "view_training",
  "view_nutrition",
  "view_body",
  "view_recovery",
  "view_progress_photos"
]);

export function ascendCoachV1Enabled() {
  return env.ASCEND_COACH_V1 === true;
}

export function isAscendCoachShellEligible(
  actor: Pick<AuthUser, "roles" | "primaryRole" | "isPlatformOwner">
) {
  return actor.isPlatformOwner
    || actor.primaryRole === "trainer"
    || actor.roles.includes("trainer");
}

export function evaluateAscendCoachPolicy(
  context: AscendCoachPolicyContext,
  action: AscendCoachAction
): AscendCoachPolicyDecision {
  if (!context.featureEnabled) return { allowed: false, reason: "feature_disabled" };
  if (!context.client) return { allowed: false, reason: "client_not_found" };
  if (context.client.status !== "active") return { allowed: false, reason: "client_inactive" };
  if (!context.client.hasClientCapability) return { allowed: false, reason: "client_capability_missing" };

  if (context.actor.isPlatformOwner && context.breakGlassGrant && breakGlassActions.has(action)) {
    return { allowed: true, breakGlassGrantId: context.breakGlassGrant.id };
  }

  const hasTrainerRole = context.actor.primaryRole === "trainer" || context.actor.roles.includes("trainer");
  if (!hasTrainerRole) return { allowed: false, reason: "trainer_role_required" };
  if (!context.trainerProfile || !context.actor.trainerId) return { allowed: false, reason: "trainer_profile_required" };
  if (context.trainerProfile.status !== "active") return { allowed: false, reason: "trainer_inactive" };
  if (!context.entitled) return { allowed: false, reason: "coach_entitlement_required" };
  if (!context.relationship) return { allowed: false, reason: "relationship_required" };
  if (context.relationship.status !== "active") return { allowed: false, reason: "relationship_inactive" };

  const scopes = new Set(context.relationship.dataScopes);
  if (!requiredScopes[action].every((scope) => scopes.has(scope))) {
    return { allowed: false, reason: "scope_missing" };
  }
  if (programmingActions.has(action) && !context.relationship.isPrimaryProgrammingAuthority) {
    return { allowed: false, reason: "primary_programming_authority_required" };
  }

  return {
    allowed: true,
    relationshipId: context.relationship.id,
    authorizationVersion: context.relationship.authorizationVersion,
    dataScopes: context.relationship.dataScopes
  };
}

export function authorizationCacheKey(input: {
  actorUserId: string;
  clientUserId: string;
  action: AscendCoachAction;
  relationshipId: string;
  authorizationVersion: number;
}) {
  return [
    "ascend-coach-auth",
    input.actorUserId,
    input.clientUserId,
    input.action,
    input.relationshipId,
    String(input.authorizationVersion)
  ].join(":");
}

export async function hasAscendCoachEntitlement(userId: string) {
  const result = await query<{ entitled: boolean }>(
    `
    select (
      exists (
        select 1 from subscriptions subscription
        where subscription.user_id = $1
          and subscription.plan = 'trainer_pro'
          and (
            subscription.status in ('active', 'trialing')
            or (subscription.status = 'canceled' and subscription.current_period_end > now())
          )
      )
      or exists (
        select 1 from ascend_coach_pilot_access pilot
        where pilot.user_id = $1
          and pilot.revoked_at is null
          and (pilot.expires_at is null or pilot.expires_at > now())
      )
    ) as entitled
    `,
    [userId]
  );
  return Boolean(result.rows[0]?.entitled);
}

export async function canUseAscendCoachWorkspace(actor: AuthUser) {
  const hasTrainerRole = actor.primaryRole === "trainer" || actor.roles.includes("trainer");
  if (!hasTrainerRole || !actor.trainerId) return false;
  const [trainer, entitled] = await Promise.all([
    query<{ active: boolean }>(
      "select exists (select 1 from trainers where id = $1 and user_id = $2 and status = 'active') as active",
      [actor.trainerId, actor.id]
    ),
    hasAscendCoachEntitlement(actor.id)
  ]);
  return trainer.rows[0]?.active === true && entitled;
}

type PolicyRow = {
  client_id: string | null;
  client_status: string | null;
  has_client_capability: boolean | null;
  trainer_profile_id: string | null;
  trainer_status: string | null;
  relationship_id: string | null;
  relationship_status: string | null;
  data_scopes: AscendCoachDataScope[] | null;
  is_primary_programming_authority: boolean | null;
  authorization_version: string | number | null;
  break_glass_grant_id: string | null;
};

export type AscendCoachAuthorizationBatch = {
  decisions: Record<AscendCoachAction, AscendCoachPolicyDecision | undefined>;
  relationshipId: string | null;
  relationshipStatus: string | null;
  authorizationVersion: number | null;
  breakGlassGrantId: string | null;
};

async function loadAscendCoachPolicyContext(actor: AuthUser, clientUserId: string): Promise<AscendCoachPolicyContext> {
  const [result, entitled] = await Promise.all([
    query<PolicyRow>(
      `
      select
        client.id as client_id,
        client.status as client_status,
        (
          client.primary_role = 'client'
          or exists (select 1 from user_roles role where role.user_id = client.id and role.role = 'client')
        ) as has_client_capability,
        trainer.id as trainer_profile_id,
        trainer.status as trainer_status,
        relationship.id as relationship_id,
        relationship.status as relationship_status,
        relationship.data_scopes,
        relationship.is_primary_programming_authority,
        relationship.authorization_version,
        break_glass.id as break_glass_grant_id
      from users client
      left join trainers trainer on trainer.id = $2::uuid
      left join lateral (
        select relationship.*
        from trainer_client_relationships relationship
        where relationship.trainer_id = trainer.id
          and relationship.client_user_id = client.id
        order by
          case relationship.status when 'active' then 0 when 'invited' then 1 else 2 end,
          relationship.updated_at desc
        limit 1
      ) relationship on true
      left join lateral (
        select grant_row.id
        from ascend_coach_break_glass_grants grant_row
        where grant_row.platform_owner_user_id = $3
          and grant_row.client_user_id = client.id
          and grant_row.revoked_at is null
          and grant_row.expires_at > now()
        order by grant_row.created_at desc
        limit 1
      ) break_glass on $4::boolean
      where client.id = $1
      `,
      [clientUserId, actor.trainerId ?? null, actor.id, actor.isPlatformOwner]
    ),
    hasAscendCoachEntitlement(actor.id)
  ]);

  const row = result.rows[0];
  return {
    featureEnabled: true,
    actor,
    client: row?.client_id ? {
      id: row.client_id,
      status: row.client_status ?? "inactive",
      hasClientCapability: row.has_client_capability === true
    } : null,
    trainerProfile: row?.trainer_profile_id ? {
      id: row.trainer_profile_id,
      status: row.trainer_status ?? "inactive"
    } : null,
    entitled,
    relationship: row?.relationship_id ? {
      id: row.relationship_id,
      status: row.relationship_status ?? "ended_by_trainer",
      dataScopes: row.data_scopes ?? [],
      isPrimaryProgrammingAuthority: row.is_primary_programming_authority === true,
      authorizationVersion: Number(row.authorization_version ?? 0)
    } : null,
    breakGlassGrant: row?.break_glass_grant_id ? { id: row.break_glass_grant_id } : null
  };
}

export async function authorizeAscendCoachActions(
  actor: AuthUser,
  clientUserId: string,
  actions: readonly AscendCoachAction[]
): Promise<AscendCoachAuthorizationBatch> {
  const uniqueActions = [...new Set(actions)];
  if (!ascendCoachV1Enabled()) {
    return {
      decisions: Object.fromEntries(uniqueActions.map((action) => [action, { allowed: false, reason: "feature_disabled" }])) as AscendCoachAuthorizationBatch["decisions"],
      relationshipId: null,
      relationshipStatus: null,
      authorizationVersion: null,
      breakGlassGrantId: null
    };
  }

  const context = await loadAscendCoachPolicyContext(actor, clientUserId);
  const decisions = Object.fromEntries(
    uniqueActions.map((action) => [action, evaluateAscendCoachPolicy(context, action)])
  ) as AscendCoachAuthorizationBatch["decisions"];
  const allowedBreakGlassActions = uniqueActions.filter((action) => decisions[action]?.allowed && decisions[action]?.breakGlassGrantId);

  if (allowedBreakGlassActions.length && context.breakGlassGrant) {
    await query(
      `
      insert into ascend_coach_access_audit_events
        (actor_user_id, client_user_id, event_type, metadata)
      values ($1, $2, 'break_glass_used', jsonb_build_object(
        'action', $3::text,
        'actions', $4::jsonb,
        'grantId', $5::text
      ))
      `,
      [
        actor.id,
        clientUserId,
        allowedBreakGlassActions.length === 1 ? allowedBreakGlassActions[0] : null,
        JSON.stringify(allowedBreakGlassActions),
        context.breakGlassGrant.id
      ]
    );
  }

  return {
    decisions,
    relationshipId: context.relationship?.id ?? null,
    relationshipStatus: context.relationship?.status ?? null,
    authorizationVersion: context.relationship?.authorizationVersion ?? null,
    breakGlassGrantId: context.breakGlassGrant?.id ?? null
  };
}

export async function authorizeAscendCoachAction(
  actor: AuthUser,
  clientUserId: string,
  action: AscendCoachAction
): Promise<AscendCoachPolicyDecision> {
  const batch = await authorizeAscendCoachActions(actor, clientUserId, [action]);
  return batch.decisions[action] ?? { allowed: false, reason: "client_not_found" };
}

export async function canAccessAscendCoachClient(actor: AuthUser, clientUserId: string, action: AscendCoachAction) {
  return (await authorizeAscendCoachAction(actor, clientUserId, action)).allowed;
}

export async function hasFullLegacyCoachAccess(actor: AuthUser, clientUserId: string) {
  const decision = await authorizeAscendCoachAction(actor, clientUserId, "view_profile");
  if (!decision.allowed) return false;
  if (decision.breakGlassGrantId) return true;
  const scopes = new Set(decision.dataScopes ?? []);
  return ASCEND_COACH_DATA_SCOPES.every((scope) => scopes.has(scope));
}

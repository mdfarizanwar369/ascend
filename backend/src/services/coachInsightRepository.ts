import type { CoachInsight } from "@ascend/shared";
import { query } from "../db/pool";

export type CoachInsightCacheIdentity = {
  actorUserId: string;
  clientUserId: string;
  relationshipId: string;
  authorizationVersion: number;
  scopeFingerprint: string;
  sourceFingerprint: string;
  snapshotSchemaVersion: string;
  promptVersion: string;
  provider: string;
  model: string;
};

export type CoachInsightCacheRow = {
  insight: CoachInsight;
  created_at: string;
  expires_at: string;
  provider: string;
  model: string;
  prompt_version: string;
};

const identityValues = (identity: CoachInsightCacheIdentity) => [
  identity.actorUserId,
  identity.clientUserId,
  identity.relationshipId,
  identity.authorizationVersion,
  identity.scopeFingerprint,
  identity.sourceFingerprint,
  identity.snapshotSchemaVersion,
  identity.promptVersion,
  identity.provider,
  identity.model
];

export async function findCoachInsight(identity: CoachInsightCacheIdentity): Promise<CoachInsightCacheRow | null> {
  const result = await query<CoachInsightCacheRow>(
    `
    update ascend_coach_client_insights
    set cache_hit_count = cache_hit_count + 1, last_accessed_at = now()
    where actor_user_id = $1 and client_user_id = $2 and relationship_id = $3
      and authorization_version = $4 and scope_fingerprint = $5 and source_fingerprint = $6
      and snapshot_schema_version = $7 and prompt_version = $8 and provider = $9 and model = $10
      and expires_at > now()
    returning insight, created_at, expires_at, provider, model, prompt_version
    `,
    identityValues(identity)
  );
  return result.rows[0] ?? null;
}

export async function saveCoachInsight(
  identity: CoachInsightCacheIdentity,
  insight: CoachInsight,
  expiresAt: Date
): Promise<CoachInsightCacheRow> {
  const result = await query<CoachInsightCacheRow>(
    `
    insert into ascend_coach_client_insights (
      actor_user_id, client_user_id, relationship_id, authorization_version,
      scope_fingerprint, source_fingerprint, snapshot_schema_version, prompt_version,
      provider, model, insight, expires_at
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    on conflict (
      actor_user_id, client_user_id, relationship_id, authorization_version,
      scope_fingerprint, source_fingerprint, snapshot_schema_version, prompt_version, provider, model
    ) do update set
      insight = excluded.insight,
      created_at = now(),
      expires_at = excluded.expires_at,
      last_accessed_at = now(),
      cache_hit_count = 0
    returning insight, created_at, expires_at, provider, model, prompt_version
    `,
    [...identityValues(identity), insight, expiresAt.toISOString()]
  );
  return result.rows[0];
}

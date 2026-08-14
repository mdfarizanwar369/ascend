import { pool, query } from "../db/pool";
import { deleteStoredObjects } from "../integrations/s3";
import { getFirebaseAuth } from "../integrations/firebase";
import { structuredLog } from "../observability/logger";

export type AccountDeletionReasonCode = "managed_role" | "live_paid_subscription" | "platform_owner";
export type AccountDeletionMode = "immediate" | "manual_review";
export type DeletionWorkflowStage = "requested" | "firebase" | "storage" | "database" | "completed" | "retry_required" | "manual_review";

export interface SelfDeletionTarget {
  id: string;
  firebaseUid: string;
  email: string;
  fullName: string;
  primaryRole: string;
  roles: string[];
  status: string;
  trainerId: string | null;
  hasLivePaidSubscription: boolean;
  isPlatformOwner: boolean;
}

export interface AccountDeletionRequestRecord {
  id: string;
  userId: string | null;
  email: string;
  fullName: string;
  primaryRole: string;
  mode: AccountDeletionMode;
  status: "requested" | "completed" | "rejected";
  reasonCodes: AccountDeletionReasonCode[];
  requestedAt: string;
  processedAt: string | null;
  notes: string | null;
  workflowStage: DeletionWorkflowStage;
  attemptCount: number;
  lastErrorCode: string | null;
}

export interface DeletionStageState {
  firebaseDeleted: boolean;
  storageDeleted: boolean;
  databaseDeleted: boolean;
}

export interface DeletionStageDependencies {
  deleteFirebase: () => Promise<void>;
  deleteStorage: () => Promise<void>;
  deleteDatabase: () => Promise<void>;
  markStageComplete: (stage: "firebase" | "storage" | "database") => Promise<void>;
}

function asText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function mapDeletionRequest(row: Record<string, unknown>): AccountDeletionRequestRecord {
  return {
    id: String(row.id),
    userId: asText(row.user_id),
    email: String(row.email),
    fullName: String(row.full_name),
    primaryRole: String(row.primary_role),
    mode: String(row.mode) === "manual_review" ? "manual_review" : "immediate",
    status: String(row.status) === "completed" ? "completed" : String(row.status) === "rejected" ? "rejected" : "requested",
    reasonCodes: Array.isArray(row.reason_codes)
      ? row.reason_codes
          .map((item) => String(item))
          .filter((item): item is AccountDeletionReasonCode => item === "managed_role" || item === "live_paid_subscription" || item === "platform_owner")
      : [],
    requestedAt: String(row.requested_at),
    processedAt: asText(row.processed_at),
    notes: asText(row.notes),
    workflowStage: (asText(row.workflow_stage) ?? "requested") as DeletionWorkflowStage,
    attemptCount: Number(row.attempt_count ?? 0),
    lastErrorCode: asText(row.last_error_code)
  };
}

export function buildSelfDeletionPlan(target: SelfDeletionTarget) {
  const reasonCodes: AccountDeletionReasonCode[] = [];
  if (target.isPlatformOwner) reasonCodes.push("platform_owner");
  if (target.hasLivePaidSubscription) reasonCodes.push("live_paid_subscription");
  if (target.primaryRole !== "client" || target.roles.some((role) => role === "trainer" || role === "admin" || role === "owner")) {
    reasonCodes.push("managed_role");
  }
  return { mode: reasonCodes.length ? "manual_review" : "immediate" as AccountDeletionMode, reasonCodes };
}

function reviewNotes(reasonCodes: AccountDeletionReasonCode[]) {
  const reasons = [];
  if (reasonCodes.includes("live_paid_subscription")) reasons.push("active paid billing");
  if (reasonCodes.includes("managed_role")) reasons.push("coach or business account relationships");
  if (reasonCodes.includes("platform_owner")) reasons.push("platform-owner safeguards");
  return reasons.length ? `Deletion review required because of ${reasons.join(", ")}.` : "Deletion review required.";
}

function deletionErrorCode(stage: string, error: unknown) {
  const providerCode = typeof error === "object" && error !== null && "code" in error ? String(error.code).replace(/[^a-zA-Z0-9_/-]/g, "_").slice(0, 80) : "FAILED";
  return `${stage.toUpperCase()}_${providerCode}`;
}

async function revokeAndDeleteFirebaseUser(firebaseUid: string) {
  const auth = getFirebaseAuth();
  try {
    await auth.revokeRefreshTokens(firebaseUid);
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code !== "auth/user-not-found") throw error;
  }
  try {
    await auth.deleteUser(firebaseUid);
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code !== "auth/user-not-found") throw error;
  }
}

async function revokeFirebaseSessions(firebaseUid: string) {
  try {
    await getFirebaseAuth().revokeRefreshTokens(firebaseUid);
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code !== "auth/user-not-found") throw error;
  }
}

async function loadSelfDeletionTarget(userId: string): Promise<SelfDeletionTarget | null> {
  const result = await pool.query(
    `
    select u.id, u.firebase_uid, u.email, u.full_name, u.primary_role::text, u.status, t.id as trainer_id,
      coalesce(array_agg(ur.role::text) filter (where ur.role is not null), '{}') as roles,
      exists (
        select 1 from subscriptions s where s.user_id = u.id and s.plan in ('premium', 'trainer_pro')
          and (s.status in ('active', 'trialing') or (s.status = 'canceled' and s.current_period_end > now()))
      ) as has_live_paid_subscription
    from users u
    left join user_roles ur on ur.user_id = u.id
    left join trainers t on t.user_id = u.id
    where u.id = $1
    group by u.id, t.id
    `,
    [userId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: String(row.id), firebaseUid: String(row.firebase_uid), email: String(row.email), fullName: String(row.full_name),
    primaryRole: String(row.primary_role), roles: Array.isArray(row.roles) ? row.roles.map(String) : [], status: String(row.status),
    trainerId: asText(row.trainer_id), hasLivePaidSubscription: row.has_live_paid_subscription === true, isPlatformOwner: false
  };
}

async function mediaKeysForUser(userId: string) {
  const result = await query<{ image_s3_key: string | null }>(
    `
    select image_s3_key from food_logs where user_id = $1 and image_s3_key is not null
    union select image_s3_key from progress_photos where user_id = $1 and image_s3_key is not null
    union select profile_photo_s3_key from users where id = $1 and profile_photo_s3_key is not null
    union select object_key from media_uploads where user_id = $1 and status in ('pending', 'completed', 'attached')
    union select nullif(image->>'key', '') from body_composition_scans bcs
      cross join lateral jsonb_array_elements(coalesce(bcs.source_images, '[]'::jsonb)) image
      where bcs.user_id = $1 and nullif(image->>'key', '') is not null
    `,
    [userId]
  );
  return Array.from(new Set(result.rows.map((row) => row.image_s3_key).filter((key): key is string => Boolean(key))));
}

export async function runDeletionStages(state: DeletionStageState, dependencies: DeletionStageDependencies) {
  if (!state.firebaseDeleted) {
    await dependencies.deleteFirebase();
    await dependencies.markStageComplete("firebase");
  }
  if (!state.storageDeleted) {
    await dependencies.deleteStorage();
    await dependencies.markStageComplete("storage");
  }
  if (!state.databaseDeleted) {
    await dependencies.deleteDatabase();
    await dependencies.markStageComplete("database");
  }
}

export async function processImmediateDeletionRequest(requestId: string) {
  const loaded = await query<Record<string, unknown>>(
    `select adr.*, u.firebase_uid from account_deletion_requests adr left join users u on u.id = adr.user_id where adr.id = $1`,
    [requestId]
  );
  const row = loaded.rows[0];
  if (!row) throw new Error("Deletion request not found.");
  if (row.status === "completed") return mapDeletionRequest(row);
  const userId = asText(row.user_id);
  const firebaseUid = asText(row.firebase_uid);
  const mediaKeys = Array.isArray(row.media_keys) ? row.media_keys.map(String) : [];

  let activeStage: "firebase" | "storage" | "database" = "firebase";
  try {
    await query("update account_deletion_requests set attempt_count = attempt_count + 1, last_attempt_at = now(), last_error_code = null, updated_at = now() where id = $1", [requestId]);
    await runDeletionStages({
      firebaseDeleted: Boolean(row.firebase_deleted_at),
      storageDeleted: Boolean(row.storage_deleted_at),
      databaseDeleted: Boolean(row.database_deleted_at)
    }, {
      deleteFirebase: async () => {
        activeStage = "firebase";
        if (!firebaseUid) throw Object.assign(new Error("Firebase identity is unavailable."), { code: "IDENTITY_MISSING" });
        await revokeAndDeleteFirebaseUser(firebaseUid);
      },
      deleteStorage: async () => {
        activeStage = "storage";
        await deleteStoredObjects(mediaKeys);
      },
      deleteDatabase: async () => {
        activeStage = "database";
        if (!userId) return;
        const db = await pool.connect();
        try {
          await db.query("begin");
          await db.query("update referral_codes set created_by_user_id = null where created_by_user_id = $1", [userId]);
          await db.query("delete from users where id = $1", [userId]);
          await db.query("commit");
        } catch (error) {
          await db.query("rollback");
          throw error;
        } finally {
          db.release();
        }
      },
      markStageComplete: async (stage) => {
        if (stage === "firebase") {
          await query("update account_deletion_requests set firebase_deleted_at = coalesce(firebase_deleted_at, now()), workflow_stage = 'storage', updated_at = now() where id = $1", [requestId]);
        } else if (stage === "storage") {
          await query("update account_deletion_requests set storage_deleted_at = coalesce(storage_deleted_at, now()), workflow_stage = 'database', updated_at = now() where id = $1", [requestId]);
        } else {
          await query("update account_deletion_requests set database_deleted_at = coalesce(database_deleted_at, now()), workflow_stage = 'completed', status = 'completed', processed_at = coalesce(processed_at, now()), updated_at = now(), notes = 'Account and associated app data deleted.' where id = $1", [requestId]);
        }
      }
    });
  } catch (error) {
    const code = deletionErrorCode(activeStage, error);
    await query("update account_deletion_requests set workflow_stage = 'retry_required', last_error_code = $2, updated_at = now() where id = $1", [requestId, code]).catch(() => undefined);
    structuredLog("error", "account_deletion_stage_failed", { requestId, stage: activeStage, code });
  }

  const refreshed = await query<Record<string, unknown>>("select * from account_deletion_requests where id = $1", [requestId]);
  return mapDeletionRequest(refreshed.rows[0]);
}

export async function retryPendingAccountDeletions() {
  const pending = await query<{ id: string }>(
    `
    select id
    from account_deletion_requests
    where mode = 'immediate'
      and status = 'requested'
      and workflow_stage in ('requested', 'firebase', 'storage', 'database', 'retry_required')
      and (last_attempt_at is null or last_attempt_at < now() - interval '15 minutes')
      and attempt_count < 20
    order by requested_at
    limit 50
    `
  );
  let completed = 0;
  for (const row of pending.rows) {
    const result = await processImmediateDeletionRequest(row.id);
    if (result.status === "completed") completed += 1;
  }
  return { attempted: pending.rows.length, completed };
}

export async function submitSelfAccountDeletion(userId: string, options: { isPlatformOwner: boolean }) {
  const target = await loadSelfDeletionTarget(userId);
  if (!target) throw Object.assign(new Error("Account not found."), { status: 404 });
  target.isPlatformOwner = options.isPlatformOwner;
  const plan = buildSelfDeletionPlan(target);
  const mediaKeys = plan.mode === "immediate" ? await mediaKeysForUser(target.id) : [];
  const db = await pool.connect();
  let requestRow: Record<string, unknown>;

  try {
    await db.query("begin");
    const existing = await db.query<Record<string, unknown>>(
      "select * from account_deletion_requests where user_id = $1 and status = 'requested' order by requested_at desc limit 1 for update",
      [target.id]
    );
    if (existing.rows[0]) {
      requestRow = existing.rows[0];
    } else {
      const inserted = await db.query<Record<string, unknown>>(
        `
        insert into account_deletion_requests (
          user_id, email, full_name, primary_role, mode, status, reason_codes, notes, workflow_stage, media_keys
        ) values ($1,$2,$3,$4,$5,'requested',$6,$7,$8,$9)
        returning *
        `,
        [target.id, target.email, target.fullName, target.primaryRole, plan.mode, plan.reasonCodes,
          plan.mode === "manual_review" ? reviewNotes(plan.reasonCodes) : "Deletion workflow started.",
          plan.mode === "manual_review" ? "manual_review" : "requested", mediaKeys]
      );
      requestRow = inserted.rows[0];
    }
    await db.query("update users set status = 'inactive', updated_at = now() where id = $1", [target.id]);
    await db.query("commit");
  } catch (error) {
    await db.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    db.release();
  }

  if (String(requestRow.mode) === "manual_review") {
    await revokeFirebaseSessions(target.firebaseUid).catch((error) => {
      structuredLog("error", "account_deletion_session_revoke_failed", { requestId: requestRow.id, code: deletionErrorCode("firebase", error) });
    });
    return {
      outcome: "requested" as const,
      request: mapDeletionRequest(requestRow),
      message: "Your deletion request has been received. Account access is disabled while Ascend completes the review."
    };
  }

  const processed = await processImmediateDeletionRequest(String(requestRow.id));
  if (processed.status === "completed") {
    return { outcome: "deleted" as const, request: processed, message: "Your account and associated app data have been deleted." };
  }
  return {
    outcome: "requested" as const,
    request: processed,
    message: "Your account access is disabled and deletion is still being completed. Ascend will safely retry the remaining step."
  };
}

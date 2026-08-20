import { pool } from "../db/pool";
import { deleteStoredObjects } from "../integrations/s3";
import { getFirebaseAuth } from "../integrations/firebase";

export type AccountDeletionReasonCode = "managed_role" | "live_paid_subscription" | "platform_owner";
export type AccountDeletionMode = "immediate" | "manual_review";

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
    notes: asText(row.notes)
  };
}

export function buildSelfDeletionPlan(target: SelfDeletionTarget) {
  const reasonCodes: AccountDeletionReasonCode[] = [];
  if (target.isPlatformOwner) reasonCodes.push("platform_owner");
  if (target.hasLivePaidSubscription) reasonCodes.push("live_paid_subscription");
  if (target.primaryRole !== "client" || target.roles.some((role) => role === "trainer" || role === "admin" || role === "owner")) {
    reasonCodes.push("managed_role");
  }

  return {
    mode: reasonCodes.length ? "manual_review" : "immediate" as AccountDeletionMode,
    reasonCodes
  };
}

function reviewNotes(reasonCodes: AccountDeletionReasonCode[]) {
  const reasons = [];
  if (reasonCodes.includes("live_paid_subscription")) reasons.push("active paid billing");
  if (reasonCodes.includes("managed_role")) reasons.push("coach or business account relationships");
  if (reasonCodes.includes("platform_owner")) reasons.push("platform-owner safeguards");
  return reasons.length
    ? `Deletion review required because of ${reasons.join(", ")}.`
    : "Deletion review required.";
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
    select
      u.id,
      u.firebase_uid,
      u.email,
      u.full_name,
      u.primary_role::text,
      u.status,
      t.id as trainer_id,
      coalesce(array_agg(ur.role::text) filter (where ur.role is not null), '{}') as roles,
      exists (
        select 1
        from subscriptions s
        where s.user_id = u.id
          and s.plan in ('premium', 'trainer_pro')
          and (
            s.status in ('active', 'trialing')
            or (s.status = 'canceled' and s.current_period_end > now())
          )
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
    id: String(row.id),
    firebaseUid: String(row.firebase_uid),
    email: String(row.email),
    fullName: String(row.full_name),
    primaryRole: String(row.primary_role),
    roles: Array.isArray(row.roles) ? row.roles.map((role: unknown) => String(role)) : [],
    status: String(row.status),
    trainerId: asText(row.trainer_id),
    hasLivePaidSubscription: row.has_live_paid_subscription === true,
    isPlatformOwner: false
  };
}

async function loadStoredMediaKeys(userId: string) {
  const result = await pool.query<{ image_s3_key: string | null }>(
    `
    select image_s3_key
    from food_logs
    where user_id = $1
      and image_s3_key is not null
    union
    select image_s3_key
    from progress_photos
    where user_id = $1
      and image_s3_key is not null
    union
    select profile_photo_s3_key as image_s3_key
    from users
    where id = $1
      and profile_photo_s3_key is not null
    union
    select nullif(image->>'key', '') as image_s3_key
    from body_composition_scans bcs
    cross join lateral jsonb_array_elements(coalesce(bcs.source_images, '[]'::jsonb)) image
    where bcs.user_id = $1
      and nullif(image->>'key', '') is not null
    `,
    [userId]
  );
  return result.rows.map((row) => row.image_s3_key);
}

async function completePendingImmediateDeletion(requestId: string, userId: string, firebaseUid: string) {
  try {
    await revokeAndDeleteFirebaseUser(firebaseUid);
    await deleteStoredObjects(await loadStoredMediaKeys(userId));
  } catch {
    await pool.query(
      "update account_deletion_requests set notes = $2 where id = $1",
      [requestId, "Account access disabled. External data cleanup is pending automatic retry."]
    ).catch(() => undefined);
    return null;
  }

  const db = await pool.connect();
  try {
    await db.query("begin");
    await db.query("update referral_codes set created_by_user_id = null where created_by_user_id = $1", [userId]);
    const completed = await db.query(
      `
      update account_deletion_requests
      set status = 'completed', notes = $2, processed_at = now()
      where id = $1 and status = 'requested'
      returning *
      `,
      [requestId, "Account and associated app data deleted."]
    );
    await db.query("delete from users where id = $1", [userId]);
    await db.query("commit");
    return completed.rows[0] ? mapDeletionRequest(completed.rows[0]) : null;
  } catch {
    await db.query("rollback").catch(() => undefined);
    await pool.query(
      "update account_deletion_requests set notes = $2 where id = $1",
      [requestId, "External account data was removed. Final database cleanup is pending automatic retry."]
    ).catch(() => undefined);
    return null;
  } finally {
    db.release();
  }
}

export async function retryPendingImmediateAccountDeletions(limit = 25) {
  const pending = await pool.query<{ request_id: string; user_id: string; firebase_uid: string }>(
    `
    select adr.id as request_id, adr.user_id, u.firebase_uid
    from account_deletion_requests adr
    join users u on u.id = adr.user_id
    where adr.mode = 'immediate'
      and adr.status = 'requested'
      and u.status = 'inactive'
    order by adr.requested_at asc
    limit $1
    `,
    [Math.max(1, Math.min(limit, 100))]
  );

  let completed = 0;
  for (const request of pending.rows) {
    if (await completePendingImmediateDeletion(request.request_id, request.user_id, request.firebase_uid)) completed += 1;
  }
  return { attempted: pending.rows.length, completed };
}

export async function submitSelfAccountDeletion(userId: string, options: { isPlatformOwner: boolean }) {
  const target = await loadSelfDeletionTarget(userId);
  if (!target) {
    const error = new Error("Account not found.");
    (error as Error & { status?: number }).status = 404;
    throw error;
  }

  target.isPlatformOwner = options.isPlatformOwner;
  const plan = buildSelfDeletionPlan(target);
  const db = await pool.connect();
  let dbReleased = false;
  const releaseDb = () => {
    if (dbReleased) return;
    db.release();
    dbReleased = true;
  };

  try {
    await db.query("begin");

    const existingRequested = await db.query(
      `
      select *
      from account_deletion_requests
      where user_id = $1
        and status = 'requested'
      order by requested_at desc
      limit 1
      `,
      [target.id]
    );

    if (existingRequested.rows[0]) {
      if (target.status === "active") {
        await db.query("update users set status = 'inactive', updated_at = now() where id = $1", [target.id]);
      }
      await db.query("commit");
      await revokeFirebaseSessions(target.firebaseUid).catch(() => undefined);
      return {
        outcome: "requested" as const,
        request: mapDeletionRequest(existingRequested.rows[0]),
        message: "Your deletion request is already in progress."
      };
    }

    if (plan.mode === "manual_review") {
      const inserted = await db.query(
        `
        insert into account_deletion_requests (
          user_id, email, full_name, primary_role, mode, status, reason_codes, notes
        ) values ($1,$2,$3,$4,'manual_review','requested',$5,$6)
        returning *
        `,
        [target.id, target.email, target.fullName, target.primaryRole, plan.reasonCodes, reviewNotes(plan.reasonCodes)]
      );

      await db.query("update users set status = 'inactive', updated_at = now() where id = $1", [target.id]);
      await db.query("commit");
      await revokeFirebaseSessions(target.firebaseUid).catch(() => undefined);

      return {
        outcome: "requested" as const,
        request: mapDeletionRequest(inserted.rows[0]),
        message: "Your account deletion request has been received and your account access has been disabled while we complete the review."
      };
    }

    const inserted = await db.query(
      `
      insert into account_deletion_requests (
        user_id, email, full_name, primary_role, mode, status, reason_codes, notes
      ) values ($1,$2,$3,$4,'immediate','requested',$5,$6)
      returning *
      `,
      [target.id, target.email, target.fullName, target.primaryRole, plan.reasonCodes, "Account access disabled. Secure deletion cleanup is in progress."]
    );
    await db.query("update users set status = 'inactive', updated_at = now() where id = $1", [target.id]);
    await db.query("commit");

    const pendingRequest = mapDeletionRequest(inserted.rows[0]);
    releaseDb();
    const completed = await completePendingImmediateDeletion(pendingRequest.id, target.id, target.firebaseUid);
    if (completed) {
      return {
        outcome: "deleted" as const,
        request: completed,
        message: "Your account and associated app data have been deleted."
      };
    }
    return {
      outcome: "requested" as const,
      request: pendingRequest,
      message: "Your account access has been disabled and deletion is in progress. Ascend will finish the remaining secure cleanup."
    };
  } catch (error) {
    if (!dbReleased) await db.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    releaseDb();
  }
}

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
      await revokeFirebaseSessions(target.firebaseUid);
      await db.query("commit");
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
      await revokeFirebaseSessions(target.firebaseUid);
      await db.query("commit");

      return {
        outcome: "requested" as const,
        request: mapDeletionRequest(inserted.rows[0]),
        message: "Your account deletion request has been received and your account access has been disabled while we complete the review."
      };
    }

    const mediaResult = await db.query<{ image_s3_key: string | null }>(
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
      [target.id]
    );

    await db.query("update referral_codes set created_by_user_id = null where created_by_user_id = $1", [target.id]);
    await revokeAndDeleteFirebaseUser(target.firebaseUid);
    await deleteStoredObjects(mediaResult.rows.map((row) => row.image_s3_key));

    const inserted = await db.query(
      `
      insert into account_deletion_requests (
        user_id, email, full_name, primary_role, mode, status, reason_codes, notes, processed_at
      ) values ($1,$2,$3,$4,'immediate','completed',$5,$6,now())
      returning *
      `,
      [target.id, target.email, target.fullName, target.primaryRole, plan.reasonCodes, "Account and associated app data deleted."]
    );

    await db.query("delete from users where id = $1", [target.id]);
    await db.query("commit");

    return {
      outcome: "deleted" as const,
      request: mapDeletionRequest(inserted.rows[0]),
      message: "Your account and associated app data have been deleted."
    };
  } catch (error) {
    await db.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    db.release();
  }
}

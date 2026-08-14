import { randomUUID } from "crypto";
import { pool, query } from "../db/pool";
import { deleteStoredObjects, uploadImageBuffer } from "../integrations/s3";
import { MAX_IMAGE_BYTES, validateImageDataUrl } from "../utils/images";

export type MediaPurpose = "food" | "progress" | "profile" | "body_composition";

const PURPOSE_PREFIX: Record<MediaPurpose, string> = {
  food: "food",
  progress: "progress",
  profile: "profiles",
  body_composition: "body-composition"
};

function extensionFor(contentType: string) {
  return contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
}

export async function secureUploadDataUrl(input: {
  userId: string;
  purpose: MediaPurpose;
  imageDataUrl: string;
  maxBytes?: number;
}) {
  const image = await validateImageDataUrl(input.imageDataUrl, input.maxBytes ?? MAX_IMAGE_BYTES);
  const objectKey = `${PURPOSE_PREFIX[input.purpose]}/${input.userId}/${randomUUID()}.${extensionFor(image.contentType)}`;
  const db = await pool.connect();
  let uploadId: string | null = null;

  try {
    await db.query("begin");
    await db.query("select pg_advisory_xact_lock(hashtext($1))", [`media-upload:${input.userId}`]);
    const allowance = await db.query<{ recent_count: string; daily_count: string }>(
      `
      select
        count(*) filter (where created_at >= now() - interval '1 minute') as recent_count,
        count(*) filter (where created_at >= now() - interval '24 hours') as daily_count
      from media_uploads
      where user_id = $1
        and status <> 'failed'
      `,
      [input.userId]
    );
    if (Number(allowance.rows[0]?.recent_count ?? 0) >= 10 || Number(allowance.rows[0]?.daily_count ?? 0) >= 100) {
      const error = new Error("Too many uploads. Please wait before trying again.");
      (error as Error & { status?: number }).status = 429;
      throw error;
    }

    const inserted = await db.query<{ id: string }>(
      `
      insert into media_uploads (
        user_id, purpose, object_key, status, declared_content_type, detected_content_type,
        byte_size, width, height
      ) values ($1,$2,$3,'pending',$4,$4,$5,$6,$7)
      returning id
      `,
      [input.userId, input.purpose, objectKey, image.contentType, image.buffer.byteLength, image.width, image.height]
    );
    uploadId = inserted.rows[0].id;
    await db.query("commit");

    const uploaded = await uploadImageBuffer(objectKey, image.buffer, image.contentType);
    if (!uploaded.storageConfigured) {
      await query("update media_uploads set status = 'failed', failed_at = now(), failure_code = 'STORAGE_UNAVAILABLE' where id = $1", [uploadId]);
      const error = new Error("Photo storage is temporarily unavailable.");
      (error as Error & { status?: number; code?: string }).status = 503;
      (error as Error & { status?: number; code?: string }).code = "STORAGE_UNAVAILABLE";
      throw error;
    }

    await query("update media_uploads set status = 'completed', completed_at = now() where id = $1", [uploadId]);
    return uploaded;
  } catch (error) {
    await db.query("rollback").catch(() => undefined);
    if (uploadId) {
      const failureCode = (error as Error & { code?: string }).code === "STORAGE_UNAVAILABLE"
        ? "STORAGE_UNAVAILABLE"
        : "UPLOAD_FAILED";
      await query("update media_uploads set status = 'failed', failed_at = now(), failure_code = $2 where id = $1", [uploadId, failureCode]).catch(() => undefined);
      await deleteStoredObjects([objectKey]).catch(() => undefined);
    }
    throw error;
  } finally {
    db.release();
  }
}

export async function assertOwnedMediaObject(userId: string, objectKey: string, purpose: MediaPurpose) {
  const result = await query<{ id: string }>(
    `
    select id
    from media_uploads
    where user_id = $1 and object_key = $2 and purpose = $3 and status in ('completed', 'attached')
    limit 1
    `,
    [userId, objectKey, purpose]
  );
  if (!result.rows[0]) {
    const error = new Error("Uploaded image was not created by this account.");
    (error as Error & { status?: number }).status = 400;
    throw error;
  }
  return result.rows[0].id;
}

export async function markMediaAttached(userId: string, objectKeys: Array<string | null | undefined>, purpose: MediaPurpose) {
  const keys = objectKeys.filter((key): key is string => Boolean(key));
  if (!keys.length) return;
  await query(
    `update media_uploads set status = 'attached', attached_at = coalesce(attached_at, now()) where user_id = $1 and purpose = $2 and object_key = any($3::text[])`,
    [userId, purpose, keys]
  );
}

export async function cleanupAbandonedMediaUploads() {
  const stale = await query<{ id: string; object_key: string }>(
    `
    select id, object_key
    from media_uploads
    where status = 'pending' and created_at < now() - interval '15 minutes'
    order by created_at
    limit 500
    `
  );
  if (!stale.rows.length) return 0;

  await deleteStoredObjects(stale.rows.map((row) => row.object_key));
  await query(
    `
    update media_uploads
    set status = 'failed', failed_at = coalesce(failed_at, now()), failure_code = 'ABANDONED_UPLOAD'
    where id = any($1::uuid[]) and status = 'pending'
    `,
    [stale.rows.map((row) => row.id)]
  );
  return stale.rows.length;
}

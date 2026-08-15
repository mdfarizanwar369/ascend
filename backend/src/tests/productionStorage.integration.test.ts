import { DeleteObjectsCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool, query } from "../db/pool";
import { assertOwnedMediaObject, cleanupAbandonedMediaUploads, secureUploadDataUrl } from "../services/mediaUploadService";
import { validateImageBuffer } from "../utils/images";

const enabled = process.env.RUN_STAGING_INTEGRATION === "1";
const bucket = process.env.AWS_S3_BUCKET ?? "";
const endpoint = process.env.AWS_S3_ENDPOINT;
const userA = randomUUID();
const userB = randomUUID();
const quotaUser = randomUUID();

function dataUrl(contentType: string, buffer: Buffer) {
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

const storage = new S3Client({
  region: process.env.AWS_REGION ?? "us-east-1",
  endpoint,
  forcePathStyle: Boolean(endpoint),
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  } : undefined
});

describe.skipIf(!enabled)("production storage verification", () => {
  beforeAll(async () => {
    if (!bucket || !endpoint) throw new Error("Isolated S3 settings are required for this integration suite.");
    await query(
      `insert into users (id, firebase_uid, email, full_name) values
       ($1,$2,$3,'Storage User A'), ($4,$5,$6,'Storage User B'), ($7,$8,$9,'Quota User')`,
      [
        userA, `sprint2-${userA}`, `sprint2-${userA}@example.invalid`,
        userB, `sprint2-${userB}`, `sprint2-${userB}@example.invalid`,
        quotaUser, `sprint2-${quotaUser}`, `sprint2-${quotaUser}@example.invalid`
      ]
    );
  });

  afterAll(async () => {
    const listed = (await Promise.all([userA, userB, quotaUser].map((userId) =>
      storage.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: `food/${userId}/` }))
    ))).flatMap((response) => response.Contents ?? []);
    if (listed.length) {
      await storage.send(new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: listed.flatMap((item) => item.Key ? [{ Key: item.Key }] : []) }
      }));
    }
    await query("delete from users where id = any($1::uuid[])", [[userA, userB, quotaUser]]);
    await pool.end();
  });

  it.each([
    ["jpeg", "image/jpeg"],
    ["png", "image/png"],
    ["webp", "image/webp"]
  ] as const)("stores a valid %s using a server-owned key and detected metadata", async (format, contentType) => {
    const buffer = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#34e8cd" } })
      .toFormat(format)
      .toBuffer();
    const uploaded = await secureUploadDataUrl({ userId: userA, purpose: "food", imageDataUrl: dataUrl(contentType, buffer) });

    expect(uploaded.key).toMatch(new RegExp(`^food/${userA}/[0-9a-f-]+\\.${format === "jpeg" ? "jpg" : format}$`));
    const record = await query<{
      declared_content_type: string; detected_content_type: string; byte_size: number; width: number; height: number; status: string;
    }>("select declared_content_type, detected_content_type, byte_size, width, height, status from media_uploads where object_key = $1", [uploaded.key]);
    expect(record.rows[0]).toMatchObject({
      declared_content_type: contentType,
      detected_content_type: contentType,
      byte_size: buffer.byteLength,
      width: 64,
      height: 48,
      status: "completed"
    });
    const object = await storage.send(new HeadObjectCommand({ Bucket: bucket, Key: uploaded.key }));
    expect(object.ContentType).toBe(contentType);
    expect(object.ContentLength).toBe(buffer.byteLength);
  });

  it("rejects cross-user and cross-purpose attachment", async () => {
    const buffer = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#ffffff" } }).jpeg().toBuffer();
    const uploaded = await secureUploadDataUrl({ userId: userA, purpose: "food", imageDataUrl: dataUrl("image/jpeg", buffer) });
    await expect(assertOwnedMediaObject(userB, uploaded.key, "food")).rejects.toThrow("not created by this account");
    await expect(assertOwnedMediaObject(userA, uploaded.key, "progress")).rejects.toThrow("not created by this account");
    await expect(assertOwnedMediaObject(userA, uploaded.key, "food")).resolves.toBeTruthy();
  });

  it("rejects malformed, disguised, unsupported, and oversized inputs without creating storage records", async () => {
    const before = await query<{ count: string }>("select count(*) from media_uploads where user_id = $1", [userB]);
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#000000" } }).png().toBuffer();
    await expect(secureUploadDataUrl({ userId: userB, purpose: "food", imageDataUrl: dataUrl("image/jpeg", png) })).rejects.toThrow("do not match");
    await expect(secureUploadDataUrl({ userId: userB, purpose: "food", imageDataUrl: dataUrl("image/png", Buffer.from("not-an-image")) })).rejects.toThrow("do not match");
    await expect(secureUploadDataUrl({ userId: userB, purpose: "food", imageDataUrl: dataUrl("image/gif", Buffer.from("GIF89a")) })).rejects.toThrow("JPEG, PNG, or WebP");
    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1, 0xff);
    await expect(secureUploadDataUrl({ userId: userB, purpose: "food", imageDataUrl: dataUrl("image/jpeg", oversized) })).rejects.toThrow("5 MB or smaller");
    const after = await query<{ count: string }>("select count(*) from media_uploads where user_id = $1", [userB]);
    expect(after.rows[0].count).toBe(before.rows[0].count);
  });

  it("rejects extreme dimensions, excessive decoded pixels, and animated images", async () => {
    const extremeDimension = await sharp({ create: { width: 8001, height: 1, channels: 3, background: "#ffffff" } }).png().toBuffer();
    await expect(validateImageBuffer(extremeDimension, "image/png")).rejects.toThrow("dimensions are too large");

    const pixelBomb = await sharp({ create: { width: 7000, height: 6000, channels: 3, background: "#ffffff" } }).png().toBuffer();
    await expect(validateImageBuffer(pixelBomb, "image/png")).rejects.toThrow("too complex to process safely");

    const animatedGif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAEALAAAAAABAAEAAAICTAEAOw==", "base64");
    await expect(validateImageBuffer(animatedGif, "image/png")).rejects.toThrow("do not match");
  }, 30_000);

  it("enforces the daily quota atomically", async () => {
    const values: unknown[] = [];
    const rows = Array.from({ length: 100 }, (_, index) => {
      const offset = index * 3;
      values.push(quotaUser, `food/${quotaUser}/${randomUUID()}.jpg`, randomUUID());
      return `($${offset + 1}, 'food', $${offset + 2}, 'completed', 'image/jpeg', 'image/jpeg', 100, 10, 10, $${offset + 3})`;
    });
    await query(
      `insert into media_uploads (user_id, purpose, object_key, status, declared_content_type, detected_content_type, byte_size, width, height, id) values ${rows.join(",")}`,
      values
    );
    const buffer = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#ffffff" } }).jpeg().toBuffer();
    await expect(secureUploadDataUrl({ userId: quotaUser, purpose: "food", imageDataUrl: dataUrl("image/jpeg", buffer) }))
      .rejects.toMatchObject({ status: 429 });
  });

  it("removes abandoned pending objects and marks their records failed", async () => {
    const objectKey = `food/${userB}/${randomUUID()}.jpg`;
    await storage.send(new PutObjectCommand({ Bucket: bucket, Key: objectKey, Body: Buffer.from("stale"), ContentType: "image/jpeg" }));
    const inserted = await query<{ id: string }>(
      `insert into media_uploads (user_id, purpose, object_key, status, declared_content_type, detected_content_type, byte_size, width, height, created_at)
       values ($1,'food',$2,'pending','image/jpeg','image/jpeg',5,1,1,now() - interval '16 minutes') returning id`,
      [userB, objectKey]
    );

    await expect(cleanupAbandonedMediaUploads()).resolves.toBeGreaterThanOrEqual(1);
    const row = await query<{ status: string; failure_code: string }>("select status, failure_code from media_uploads where id = $1", [inserted.rows[0].id]);
    expect(row.rows[0]).toEqual({ status: "failed", failure_code: "ABANDONED_UPLOAD" });
    await expect(storage.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }))).rejects.toBeTruthy();
  });
});

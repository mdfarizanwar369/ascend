import { randomUUID } from "crypto";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool, query } from "../db/pool";
import { secureUploadDataUrl } from "../services/mediaUploadService";

const enabled = process.env.RUN_STAGING_STORAGE_FAILURE === "1";
const userId = randomUUID();

describe.skipIf(!enabled)("production storage interruption verification", () => {
  beforeAll(async () => {
    await query(
      "insert into users (id, firebase_uid, email, full_name) values ($1,$2,$3,'Interrupted Upload')",
      [userId, `sprint2-interrupt-${userId}`, `sprint2-interrupt-${userId}@example.invalid`]
    );
  });

  afterAll(async () => {
    await query("delete from users where id = $1", [userId]);
    await pool.end();
  });

  it("marks a server-owned pending upload failed when storage is interrupted", async () => {
    const image = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#ffffff" } }).jpeg().toBuffer();
    const upload = secureUploadDataUrl({
      userId,
      purpose: "food",
      imageDataUrl: `data:image/jpeg;base64,${image.toString("base64")}`
    });
    await expect(upload).rejects.toBeTruthy();

    const result = await query<{ status: string; failure_code: string; object_key: string }>(
      "select status, failure_code, object_key from media_uploads where user_id = $1",
      [userId]
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ status: "failed", failure_code: "UPLOAD_FAILED" });
    expect(result.rows[0].object_key).toMatch(new RegExp(`^food/${userId}/[0-9a-f-]+\\.jpg$`));
  });
});

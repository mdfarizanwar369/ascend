import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";
import { requireActivePlan } from "../middleware/subscription";
import { createReadUrl, deleteStoredObjects, readStoredImage } from "../integrations/s3";
import { canManageClient } from "../services/clientAccessService";
import { createCoachPresenceForEvent } from "../services/coachPresenceService";

export const progressRouter = Router();

const progressPhotoSchema = z.object({
  imageS3Key: z.string().min(1),
  photoType: z.enum(["front", "side", "back", "other"]).default("front"),
  loggedAt: z.string().datetime().optional()
});

const progressPhotoQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(100),
  offset: z.coerce.number().int().min(0).default(0)
});

async function withProgressImageUrls<T extends { image_s3_key?: string | null }>(rows: T[]) {
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      image_url: await createReadUrl(row.image_s3_key)
    }))
  );
}

progressRouter.post("/progress-photos", requireAuth, requireActivePlan("premium"), async (req, res, next) => {
  try {
    const input = progressPhotoSchema.parse(req.body);
    const result = await query(
      "insert into progress_photos (user_id, image_s3_key, photo_type, logged_at) values ($1, $2, coalesce($3, 'front'), coalesce($4, now())) returning *",
      [req.user!.id, input.imageS3Key, input.photoType, input.loggedAt ?? null]
    );
    void createCoachPresenceForEvent(req.user!.id, "progress_photo").catch(() => undefined);
    res.status(201).json({ progressPhoto: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

progressRouter.get("/progress-photos", requireAuth, async (req, res, next) => {
  try {
    const filters = progressPhotoQuerySchema.parse(req.query);
    const result = await query("select * from progress_photos where user_id = $1 order by logged_at desc limit $2 offset $3", [req.user!.id, filters.limit, filters.offset]);
    res.json({
      progressPhotos: await withProgressImageUrls(result.rows),
      nextOffset: result.rows.length === filters.limit ? filters.offset + filters.limit : null
    });
  } catch (error) {
    next(error);
  }
});

progressRouter.delete("/progress-photos/:photoId", requireAuth, async (req, res, next) => {
  try {
    const photoId = z.string().uuid().parse(req.params.photoId);
    const result = await query<{ id: string; image_s3_key: string | null }>(
      "delete from progress_photos where id = $1 and user_id = $2 returning id, image_s3_key",
      [photoId, req.user!.id]
    );
    const deleted = result.rows[0];
    if (!deleted) return res.status(404).json({ error: "Progress photo not found." });
    await deleteStoredObjects([deleted.image_s3_key]).catch(() => undefined);
    res.json({ deleted: true, photoId: deleted.id });
  } catch (error) {
    next(error);
  }
});

progressRouter.get("/progress-photos/:photoId/image", requireAuth, async (req, res, next) => {
  try {
    const photoId = z.string().uuid().parse(req.params.photoId);
    const result = await query<{ image_s3_key: string | null }>(
      "select image_s3_key from progress_photos where id = $1 and user_id = $2 limit 1",
      [photoId, req.user!.id]
    );
    const key = result.rows[0]?.image_s3_key;
    if (!key) return res.status(404).json({ error: "Progress photo not found." });

    const image = await readStoredImage(key);
    res.set({
      "Cache-Control": "private, no-store",
      "Content-Type": image.contentType,
      "Content-Length": String(image.buffer.length)
    });
    return res.send(image.buffer);
  } catch (error) {
    return next(error);
  }
});

progressRouter.get(
  "/trainer/clients/:clientId/progress-photos",
  requireAuth,
  requireActivePlan("trainer_pro"),
  requireRole(["trainer", "admin", "owner"]),
  async (req, res, next) => {
    try {
      if (!await canManageClient(req.user!, req.params.clientId)) return res.status(404).json({ error: "Client not found" });
      const result = await query(
        `
        select pp.*
        from progress_photos pp
        join users u on u.id = pp.user_id
        where pp.user_id = $1 and (u.assigned_trainer_id = $2 or $3 = any($4::text[]) or $5 = any($4::text[]))
        order by pp.logged_at desc
        `,
        [req.params.clientId, req.user!.trainerId ?? null, "admin", req.user!.roles, "owner"]
      );
      res.json({ progressPhotos: await withProgressImageUrls(result.rows) });
    } catch (error) {
      next(error);
    }
  }
);

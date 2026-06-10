import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";

export const progressRouter = Router();

const progressPhotoSchema = z.object({
  imageS3Key: z.string().min(1),
  photoType: z.enum(["front", "side", "back", "other"]).default("front"),
  loggedAt: z.string().datetime().optional()
});

progressRouter.post("/progress-photos", requireAuth, async (req, res, next) => {
  try {
    const input = progressPhotoSchema.parse(req.body);
  const result = await query(
    "insert into progress_photos (user_id, image_s3_key, photo_type, logged_at) values ($1, $2, coalesce($3, 'front'), coalesce($4, now())) returning *",
    [req.user!.id, input.imageS3Key, input.photoType, input.loggedAt ?? null]
  );
  res.status(201).json({ progressPhoto: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

progressRouter.get("/progress-photos", requireAuth, async (req, res) => {
  const result = await query("select * from progress_photos where user_id = $1 order by logged_at desc limit 100", [req.user!.id]);
  res.json({ progressPhotos: result.rows });
});

progressRouter.get(
  "/trainer/clients/:clientId/progress-photos",
  requireAuth,
  requireRole(["trainer", "admin", "owner"]),
  async (req, res) => {
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
    res.json({ progressPhotos: result.rows });
  }
);

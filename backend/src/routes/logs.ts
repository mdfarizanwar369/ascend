import { Router } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { query } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { requireActivePlan } from "../middleware/subscription";
import { createReadUrl, createUploadUrl, uploadDataUrl } from "../integrations/s3";
import { estimateFoodFromImage } from "../integrations/openai";

export const logsRouter = Router();

const foodLogSchema = z.object({
  imageS3Key: z.string().optional(),
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]).default("lunch"),
  description: z.string().optional(),
  estimatedFoodName: z.string().min(1),
  calories: z.number().int().nonnegative(),
  proteinG: z.number().nonnegative(),
  carbsG: z.number().nonnegative(),
  fatG: z.number().nonnegative(),
  aiEstimateRaw: z.unknown().optional(),
  wasEditedByUser: z.boolean().default(false),
  loggedAt: z.string().datetime().optional()
});

const foodImageDataSchema = z.object({
  imageDataUrl: z.string().startsWith("data:image/").max(7_000_000)
});

const photoUploadDataSchema = z.object({
  imageDataUrl: z.string().startsWith("data:image/").max(7_000_000)
});

const weightLogSchema = z.object({
  weightKg: z.number().positive(),
  loggedAt: z.string().datetime().optional()
});

const waterLogSchema = z.object({
  amountMl: z.number().int().positive(),
  loggedAt: z.string().datetime().optional()
});

const burnLogSchema = z.object({
  activityType: z.string().min(2),
  durationMinutes: z.number().int().positive(),
  caloriesBurned: z.number().int().nonnegative(),
  loggedAt: z.string().datetime().optional()
});

logsRouter.post("/food-logs/photo-upload-url", requireAuth, requireActivePlan("premium"), async (req, res) => {
  const contentType = String(req.body.contentType ?? "image/jpeg");
  const key = `food/${req.user!.id}/${randomUUID()}.jpg`;
  res.json(await createUploadUrl(key, contentType));
});

logsRouter.post("/food-logs/photo-upload-data-url", requireAuth, requireActivePlan("premium"), async (req, res, next) => {
  try {
    const input = photoUploadDataSchema.parse(req.body);
    const key = `food/${req.user!.id}/${randomUUID()}.jpg`;
    res.json(await uploadDataUrl(key, input.imageDataUrl));
  } catch (error) {
    next(error);
  }
});

async function withFoodImageUrls<T extends { image_s3_key?: string | null }>(rows: T[]) {
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      image_url: await createReadUrl(row.image_s3_key)
    }))
  );
}

logsRouter.post("/food-logs/estimate", requireAuth, requireActivePlan("premium"), async (req, res, next) => {
  try {
    const imageUrl = z.string().url().parse(req.body.imageUrl);
    res.json({ estimate: await estimateFoodFromImage(imageUrl) });
  } catch (error) {
    next(error);
  }
});

logsRouter.post("/food-logs/estimate-data-url", requireAuth, requireActivePlan("premium"), async (req, res, next) => {
  try {
    const input = foodImageDataSchema.parse(req.body);
    res.json({ estimate: await estimateFoodFromImage(input.imageDataUrl) });
  } catch (error) {
    next(error);
  }
});

logsRouter.post("/food-logs", requireAuth, async (req, res, next) => {
  try {
    const input = foodLogSchema.parse(req.body);
    const result = await query(
      `
      insert into food_logs (
        user_id, image_s3_key, meal_type, description, estimated_food_name, calories,
        protein_g, carbs_g, fat_g, ai_estimate_raw, was_edited_by_user, logged_at
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,coalesce($12, now()))
      returning *
      `,
      [
        req.user!.id,
        input.imageS3Key ?? null,
        input.mealType,
        input.description ?? null,
        input.estimatedFoodName,
        input.calories,
        input.proteinG,
        input.carbsG,
        input.fatG,
        input.aiEstimateRaw ?? null,
        input.wasEditedByUser,
        input.loggedAt ?? null
      ]
    );
    res.status(201).json({ foodLog: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

logsRouter.get("/food-logs", requireAuth, async (req, res) => {
  const result = await query("select * from food_logs where user_id = $1 order by logged_at desc limit 100", [req.user!.id]);
  res.json({ foodLogs: await withFoodImageUrls(result.rows) });
});

logsRouter.post("/weight-logs", requireAuth, async (req, res, next) => {
  try {
    const input = weightLogSchema.parse(req.body);
  const result = await query("insert into weight_logs (user_id, weight_kg, logged_at) values ($1, $2, coalesce($3, now())) returning *", [
    req.user!.id,
    input.weightKg,
    input.loggedAt ?? null
  ]);
  res.status(201).json({ weightLog: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

logsRouter.get("/weight-logs", requireAuth, async (req, res) => {
  const result = await query("select * from weight_logs where user_id = $1 order by logged_at desc limit 100", [req.user!.id]);
  res.json({ weightLogs: result.rows });
});

logsRouter.post("/water-logs", requireAuth, async (req, res, next) => {
  try {
    const input = waterLogSchema.parse(req.body);
  const result = await query("insert into water_logs (user_id, amount_ml, logged_at) values ($1, $2, coalesce($3, now())) returning *", [
    req.user!.id,
    input.amountMl,
    input.loggedAt ?? null
  ]);
  res.status(201).json({ waterLog: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

logsRouter.get("/water-logs", requireAuth, async (req, res) => {
  const result = await query("select * from water_logs where user_id = $1 order by logged_at desc limit 100", [req.user!.id]);
  res.json({ waterLogs: result.rows });
});

logsRouter.post("/burn-logs", requireAuth, async (req, res, next) => {
  try {
    const input = burnLogSchema.parse(req.body);
    const result = await query(
      `
      insert into analytics_events (user_id, gym_id, event_name, metadata, created_at)
      values ($1, $2, 'burn_log', $3, coalesce($4, now()))
      returning *
      `,
      [
        req.user!.id,
        req.user!.gymId ?? null,
        {
          activityType: input.activityType,
          durationMinutes: input.durationMinutes,
          caloriesBurned: input.caloriesBurned
        },
        input.loggedAt ?? null
      ]
    );
    res.status(201).json({ burnLog: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

logsRouter.get("/burn-logs", requireAuth, async (req, res) => {
  const result = await query(
    "select * from analytics_events where user_id = $1 and event_name = 'burn_log' order by created_at desc limit 100",
    [req.user!.id]
  );
  res.json({ burnLogs: result.rows });
});

logsRouter.post("/progress-photos/upload-url", requireAuth, requireActivePlan("premium"), async (req, res) => {
  const contentType = String(req.body.contentType ?? "image/jpeg");
  const key = `progress/${req.user!.id}/${randomUUID()}.jpg`;
  res.json(await createUploadUrl(key, contentType));
});

logsRouter.post("/progress-photos/upload-data-url", requireAuth, requireActivePlan("premium"), async (req, res, next) => {
  try {
    const input = photoUploadDataSchema.parse(req.body);
    const key = `progress/${req.user!.id}/${randomUUID()}.jpg`;
    res.json(await uploadDataUrl(key, input.imageDataUrl));
  } catch (error) {
    next(error);
  }
});

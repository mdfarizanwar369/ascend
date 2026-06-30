import { Router } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { query } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { requireActivePlan } from "../middleware/subscription";
import { createReadUrl, createUploadUrl, uploadDataUrl } from "../integrations/s3";
import { estimateFoodFromImage } from "../integrations/openai";
import { FoodAiLimitError, getFoodAiAllowance } from "../services/aiUsageService";
import { aiRateLimit, uploadRateLimit } from "../middleware/rateLimits";
import { imageContentTypeSchema, imageDataUrlSchema } from "../utils/images";
import { finishFoodAiReport, logFoodAiReport, timeFoodAiStage, timeFoodAiSyncStage } from "../services/foodAiPerformance";
import { createCoachPresenceForEvent } from "../services/coachPresenceService";
import { createWorkoutCompletionSummary } from "../services/workoutCompletionService";

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

const foodLogQuerySchema = z.object({
  range: z.enum(["today", "7d", "30d", "all"]).default("all"),
  order: z.enum(["newest", "oldest"]).default("newest"),
  limit: z.coerce.number().int().min(1).max(100).default(100),
  offset: z.coerce.number().int().min(0).default(0)
});

const foodImageDataSchema = z.object({
  imageDataUrl: imageDataUrlSchema
});

const photoUploadDataSchema = z.object({
  imageDataUrl: imageDataUrlSchema
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

const completedWorkoutSchema = z.object({
  workoutCompletionKey: z.string().uuid(),
  workoutTitle: z.string().trim().min(2).max(120),
  workoutType: z.string().trim().min(2).max(80),
  workoutDifficulty: z.enum(["easy", "moderate", "challenging"]),
  durationMinutes: z.number().int().min(5).max(180),
  completedAt: z.string().datetime().optional(),
  exercises: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    sets: z.number().int().min(1).max(10).nullable().optional(),
    reps: z.string().trim().max(40).nullable().optional(),
    duration: z.string().trim().max(40).nullable().optional(),
    rest: z.string().trim().max(40).nullable().optional(),
    note: z.string().trim().max(160).nullable().optional()
  })).min(1).max(20),
  healthProviderCaloriesBurned: z.number().int().positive().optional().nullable()
});

async function resolveWorkoutWeightKg(userId: string) {
  const result = await query<{ weight_kg: string | number | null }>(
    `
    select coalesce(
      (select weight_kg from weight_logs where user_id = $1 order by logged_at desc limit 1),
      (select weight_kg from body_composition_scans where user_id = $1 and user_confirmed = true order by scan_date desc, created_at desc limit 1),
      u.starting_weight_kg
    ) as weight_kg
    from users u
    where u.id = $1
    limit 1
    `,
    [userId]
  );
  const weight = Number(result.rows[0]?.weight_kg ?? 0);
  return Number.isFinite(weight) && weight > 0 ? weight : null;
}

logsRouter.get("/food-logs/ai-allowance", requireAuth, async (req, res, next) => {
  try {
    res.json({ allowance: await getFoodAiAllowance(req.user!.id) });
  } catch (error) {
    next(error);
  }
});

logsRouter.post("/food-logs/photo-upload-url", requireAuth, uploadRateLimit, async (req, res) => {
  const contentType = imageContentTypeSchema.parse(req.body.contentType ?? "image/jpeg");
  const key = `food/${req.user!.id}/${randomUUID()}.jpg`;
  res.json(await createUploadUrl(key, contentType));
});

logsRouter.post("/food-logs/photo-upload-data-url", requireAuth, uploadRateLimit, async (req, res, next) => {
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

logsRouter.post("/food-logs/estimate", requireAuth, aiRateLimit, async (req, res, next) => {
  try {
    timeFoodAiSyncStage(req.foodAiPerf, "Request received", () => undefined, { route: req.path });
    const imageUrl = timeFoodAiSyncStage(req.foodAiPerf, "Request validation", () => z.string().url().parse(req.body.imageUrl));
    const estimate = await timeFoodAiStage(req.foodAiPerf, "Food analysis orchestration", () =>
      estimateFoodFromImage(imageUrl, { userId: req.user!.id, gymId: req.user!.gymId, performanceTrace: req.foodAiPerf })
    );
    const allowance = await timeFoodAiStage(req.foodAiPerf, "Allowance update", () => getFoodAiAllowance(req.user!.id));
    const payloadBase = timeFoodAiSyncStage(req.foodAiPerf, "Response generation", () => ({
      estimate,
      allowance
    }));
    const performance = finishFoodAiReport(req.foodAiPerf);
    logFoodAiReport(performance);
    const payload = { ...payloadBase, ...(performance ? { performance } : {}) };
    res.json(payload);
  } catch (error) {
    const performance = finishFoodAiReport(req.foodAiPerf);
    logFoodAiReport(performance);
    if (error instanceof FoodAiLimitError) {
      res.status(429).json({ error: error.message, allowance: error.allowance, ...(performance ? { performance } : {}) });
      return;
    }
    if (error instanceof Error) {
      res.status(503).json({ error: "Food AI estimate is temporarily unavailable.", detail: error.message, ...(performance ? { performance } : {}) });
      return;
    }
    next(error);
  }
});

logsRouter.post("/food-logs/estimate-data-url", requireAuth, aiRateLimit, async (req, res, next) => {
  try {
    timeFoodAiSyncStage(req.foodAiPerf, "Request received", () => undefined, { route: req.path });
    const input = timeFoodAiSyncStage(req.foodAiPerf, "Request validation", () => foodImageDataSchema.parse(req.body));
    const estimate = await timeFoodAiStage(req.foodAiPerf, "Food analysis orchestration", () =>
      estimateFoodFromImage(input.imageDataUrl, { userId: req.user!.id, gymId: req.user!.gymId, performanceTrace: req.foodAiPerf })
    );
    const allowance = await timeFoodAiStage(req.foodAiPerf, "Allowance update", () => getFoodAiAllowance(req.user!.id));
    const payloadBase = timeFoodAiSyncStage(req.foodAiPerf, "Response generation", () => ({
      estimate,
      allowance
    }));
    const performance = finishFoodAiReport(req.foodAiPerf);
    logFoodAiReport(performance);
    const payload = { ...payloadBase, ...(performance ? { performance } : {}) };
    res.json(payload);
  } catch (error) {
    const performance = finishFoodAiReport(req.foodAiPerf);
    logFoodAiReport(performance);
    if (error instanceof FoodAiLimitError) {
      res.status(429).json({ error: error.message, allowance: error.allowance, ...(performance ? { performance } : {}) });
      return;
    }
    if (error instanceof Error) {
      res.status(503).json({ error: "Food AI estimate is temporarily unavailable.", detail: error.message, ...(performance ? { performance } : {}) });
      return;
    }
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
    void createCoachPresenceForEvent(req.user!.id, "food_logged").catch(() => undefined);
    res.status(201).json({ foodLog: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

logsRouter.get("/food-logs", requireAuth, async (req, res, next) => {
  try {
    const filters = foodLogQuerySchema.parse(req.query);
    const rangeCondition =
      filters.range === "today"
        ? "and logged_at >= current_date"
        : filters.range === "7d"
          ? "and logged_at >= current_date - interval '6 days'"
          : filters.range === "30d"
            ? "and logged_at >= current_date - interval '29 days'"
            : "";
    const result = await query(
      `
      select *
      from food_logs
      where user_id = $1
        ${rangeCondition}
      order by logged_at ${filters.order === "oldest" ? "asc" : "desc"}
      limit $2 offset $3
      `,
      [req.user!.id, filters.limit, filters.offset]
    );
    res.json({ foodLogs: await withFoodImageUrls(result.rows), nextOffset: result.rows.length === filters.limit ? filters.offset + filters.limit : null });
  } catch (error) {
    next(error);
  }
});

logsRouter.post("/weight-logs", requireAuth, async (req, res, next) => {
  try {
    const input = weightLogSchema.parse(req.body);
    const result = await query(
      `
      with saved as (
        insert into weight_logs (user_id, weight_kg, logged_at)
        values ($1, $2, coalesce($3, now()))
        returning *
      ),
      milestone as (
        insert into goal_milestones (
          user_id, goal_version, milestone_type, goal_type, target_weight_kg, achieved_weight_kg, achieved_at
        )
        select u.id, u.goal_version, 'target_reached', u.goal_type, u.target_weight_kg, s.weight_kg, s.logged_at
        from users u
        cross join saved s
        where u.id = $1
          and u.target_weight_kg is not null
          and ((u.goal_type = 'fat_loss' and s.weight_kg <= u.target_weight_kg)
            or (u.goal_type = 'muscle_gain' and s.weight_kg >= u.target_weight_kg))
        on conflict (user_id, goal_version, milestone_type) do nothing
        returning *
      )
      select row_to_json(saved) as weight_log,
        (select row_to_json(milestone) from milestone) as milestone
      from saved
      `,
      [req.user!.id, input.weightKg, input.loggedAt ?? null]
    );
    res.status(201).json({ weightLog: result.rows[0].weight_log, milestone: result.rows[0].milestone ?? null });
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
  void createCoachPresenceForEvent(req.user!.id, "water_logged").catch(() => undefined);
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
    void createCoachPresenceForEvent(req.user!.id, "workout_logged").catch(() => undefined);
    res.status(201).json({ burnLog: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

logsRouter.post("/burn-logs/completed-workout", requireAuth, requireActivePlan("premium"), async (req, res, next) => {
  try {
    const input = completedWorkoutSchema.parse(req.body);
    const existing = await query(
      `
      select *
      from analytics_events
      where user_id = $1
        and event_name = 'burn_log'
        and metadata->>'workoutCompletionKey' = $2
      order by created_at desc
      limit 1
      `,
      [req.user!.id, input.workoutCompletionKey]
    );

    if (existing.rows[0]) {
      const existingMetadata = (existing.rows[0].metadata ?? {}) as Record<string, unknown>;
      return res.json({
        burnLog: existing.rows[0],
        summary: {
          workoutTitle: String(existingMetadata.workoutTitle ?? input.workoutTitle),
          durationMinutes: Number(existingMetadata.durationMinutes ?? input.durationMinutes),
          workoutType: String(existingMetadata.workoutType ?? input.workoutType),
          difficulty: String(existingMetadata.workoutDifficultyLabel ?? input.workoutDifficulty),
          estimatedCaloriesBurned: Number(existingMetadata.estimatedCaloriesBurned ?? existingMetadata.caloriesBurned ?? 0),
          caloriesLabel: existingMetadata.caloriesSource === "health_provider_actual" ? "Calories Burned" : "Estimated Calories Burned",
          coachMessage: String(existingMetadata.coachMessage ?? "Great work staying active today."),
          momentumEarned: 8
        }
      });
    }

    const weightKg = await resolveWorkoutWeightKg(req.user!.id);
    const summary = createWorkoutCompletionSummary({
      workoutTitle: input.workoutTitle,
      workoutType: input.workoutType,
      difficulty: input.workoutDifficulty,
      durationMinutes: input.durationMinutes,
      exercises: input.exercises,
      weightKg,
      actualCaloriesBurned: input.healthProviderCaloriesBurned ?? null
    });

    const metadata = {
      activityType: summary.workoutType,
      durationMinutes: input.durationMinutes,
      caloriesBurned: summary.caloriesBurned,
      estimatedCaloriesBurned: summary.estimatedCaloriesBurned,
      caloriesSource: summary.caloriesSource,
      workoutTitle: input.workoutTitle,
      workoutType: summary.workoutType,
      workoutDifficulty: input.workoutDifficulty,
      workoutDifficultyLabel: summary.difficultyLabel,
      exercises: summary.exerciseList,
      coachMessage: summary.coachMessage,
      workoutCompletionKey: input.workoutCompletionKey,
      source: "coach_zoe_workout_planner",
      weightKgUsed: summary.weightKgUsed,
      metValue: summary.metValue
    };

    const result = await query(
      `
      insert into analytics_events (user_id, gym_id, event_name, metadata, created_at)
      values ($1, $2, 'burn_log', $3, coalesce($4, now()))
      returning *
      `,
      [req.user!.id, req.user!.gymId ?? null, metadata, input.completedAt ?? null]
    );

    void createCoachPresenceForEvent(req.user!.id, "workout_logged").catch(() => undefined);

    res.status(201).json({
      burnLog: result.rows[0],
      summary: {
        workoutTitle: input.workoutTitle,
        durationMinutes: input.durationMinutes,
        workoutType: summary.workoutType,
        difficulty: summary.difficultyLabel,
        estimatedCaloriesBurned: summary.estimatedCaloriesBurned,
        caloriesLabel: summary.caloriesSource === "health_provider_actual" ? "Calories Burned" : "Estimated Calories Burned",
        coachMessage: summary.coachMessage,
        momentumEarned: 8
      }
    });
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

logsRouter.post("/progress-photos/upload-url", requireAuth, requireActivePlan("premium"), uploadRateLimit, async (req, res) => {
  const contentType = imageContentTypeSchema.parse(req.body.contentType ?? "image/jpeg");
  const key = `progress/${req.user!.id}/${randomUUID()}.jpg`;
  res.json(await createUploadUrl(key, contentType));
});

logsRouter.post("/progress-photos/upload-data-url", requireAuth, requireActivePlan("premium"), uploadRateLimit, async (req, res, next) => {
  try {
    const input = photoUploadDataSchema.parse(req.body);
    const key = `progress/${req.user!.id}/${randomUUID()}.jpg`;
    res.json(await uploadDataUrl(key, input.imageDataUrl));
  } catch (error) {
    next(error);
  }
});

import { Router } from "express";
import { createCoachWorkoutPlan, createCoachZoeReply, estimateBurnFromText } from "../integrations/openai";
import { requireAuth } from "../middleware/auth";
import { requireActivePlan } from "../middleware/subscription";
import { query } from "../db/pool";
import { logAiUsage } from "../services/aiUsageService";
import { env } from "../config/env";
import { aiRateLimit } from "../middleware/rateLimits";
import { z } from "zod";
import { getHealthSyncSummary } from "../services/healthSyncService";
import { buildWorkoutMemorySummary } from "../services/workoutMemoryService";

export const aiRouter = Router();

const workoutPlannerSchema = z.object({
  location: z.enum(["gym", "home", "hotel", "outdoors"]),
  timeAvailable: z.enum(["20", "30", "45", "60"]),
  goal: z.enum(["fat_loss", "muscle_gain", "strength", "general_fitness", "recovery", "mobility"]),
  equipment: z.string().trim().min(2).max(80)
});

aiRouter.post("/ai/chat", requireAuth, requireActivePlan("premium"), aiRateLimit, async (req, res, next) => {
  try {
    const message = z.string().trim().min(1).max(2_000).parse(req.body.message);
    const [contextResult, recentFoodResult, recentBurnResult, athleteResult, bodyScanResult, recentMessagesResult, healthSyncSummary, momentumResult] = await Promise.all([
      query<{ metadata: Record<string, unknown> | null; created_at: string }>(
        `
        select goal_type, starting_weight_kg, target_weight_kg, activity_level, age_years, gender, height_cm
        from users
        where id = $1
        `,
        [req.user!.id]
      ),
      query(
        `
        select estimated_food_name, calories, protein_g, carbs_g, fat_g, meal_type, logged_at
        from food_logs
        where user_id = $1
        order by logged_at desc
        limit 5
        `,
        [req.user!.id]
      ),
      query(
        `
        select metadata, created_at
        from analytics_events
        where user_id = $1
          and event_name = 'burn_log'
        order by created_at desc
        limit 5
        `,
        [req.user!.id]
      ),
      query(
        `
        select enabled, sport, division, competition_name, competition_date, goal_weight_kg
        from athlete_profiles
        where user_id = $1
        `,
        [req.user!.id]
      ),
      query(
        `
        select scan_date, weight_kg, body_fat_percent, skeletal_muscle_mass_kg, visceral_fat, bmr_kcal
        from body_composition_scans
        where user_id = $1
          and user_confirmed = true
        order by scan_date desc, created_at desc
        limit 1
        `,
        [req.user!.id]
      ),
      query(
        `
        select role, message
        from ai_chat_messages
        where user_id = $1
        order by created_at desc
        limit 8
        `,
        [req.user!.id]
      ),
      getHealthSyncSummary(req.user!.id),
      query(
        `
        select score
        from compliance_scores
        where user_id = $1
        order by calculated_for_date desc
        limit 1
        `,
        [req.user!.id]
      )
    ]);
    const workoutMemory = buildWorkoutMemorySummary(recentBurnResult.rows, {
      currentMomentum: Number(momentumResult.rows[0]?.score ?? 0) || null
    });
    const promptContext = JSON.stringify({
      profile: contextResult.rows[0] ?? {},
      recentFoodLogs: recentFoodResult.rows,
      recentWorkouts: recentBurnResult.rows,
      workoutMemory,
      athleteMode: athleteResult.rows[0] ?? null,
      latestBodyScan: bodyScanResult.rows[0] ?? null,
      recentConversation: recentMessagesResult.rows.reverse(),
      healthSync: healthSyncSummary
        ? {
            todaySteps: healthSyncSummary.todaySteps,
            averageSteps7d: healthSyncSummary.averageSteps7d,
            todayActiveCalories: healthSyncSummary.todayActiveCalories,
            workoutsThisWeek: healthSyncSummary.workoutsThisWeek,
            workoutCompletedToday: healthSyncSummary.workoutCompletedToday,
            lastSyncedAt: healthSyncSummary.lastSyncedAt
          }
        : null
    });
    const reply = await createCoachZoeReply(message, promptContext);
    await logAiUsage({
      userId: req.user!.id,
      gymId: req.user!.gymId,
      eventType: "ai_chat_message",
      provider: env.AI_PROVIDER,
      model: env.AI_PROVIDER === "gemini" ? env.GEMINI_MODEL : env.OPENAI_MODEL,
      status: "success",
      inputUnits: message.length + promptContext.length,
      outputUnits: reply.length
    });

    await query("insert into ai_chat_messages (user_id, role, message) values ($1, 'user', $2), ($1, 'assistant', $3)", [
      req.user!.id,
      message,
      reply
    ]);

    res.json({ reply });
  } catch (error) {
    next(error);
  }
});

aiRouter.post("/ai/burn-estimate", requireAuth, requireActivePlan("premium"), aiRateLimit, async (req, res, next) => {
  try {
    const text = z.string().trim().min(2).max(500).parse(req.body.text);
    const estimate = await estimateBurnFromText(text);
    res.json({ estimate });
  } catch (error) {
    next(error);
  }
});

aiRouter.post("/ai/workout", requireAuth, requireActivePlan("premium"), aiRateLimit, async (req, res, next) => {
  try {
    const input = workoutPlannerSchema.parse(req.body);
    const [profileResult, recentFoodResult, recentBurnResult, athleteResult, bodyScanResult, recentMessagesResult, healthSyncSummary, momentumResult] =
      await Promise.all([
        query<{ metadata: Record<string, unknown> | null; created_at: string }>(
          `
          select goal_type, starting_weight_kg, target_weight_kg, activity_level, age_years, gender, height_cm
          from users
          where id = $1
          `,
          [req.user!.id]
        ),
        query(
          `
          select count(*)::int as logs_7d,
            count(distinct logged_at::date)::int as food_days_7d,
            coalesce(round(avg(protein_g)::numeric, 1), 0) as avg_protein_g,
            max(logged_at) as latest_food_at
          from food_logs
          where user_id = $1
            and logged_at >= now() - interval '7 days'
          `,
          [req.user!.id]
        ),
        query(
          `
          select metadata, created_at
          from analytics_events
          where user_id = $1
            and event_name = 'burn_log'
          order by created_at desc
          limit 5
          `,
          [req.user!.id]
        ),
        query(
          `
          select enabled, sport, division, competition_name, competition_date, goal_weight_kg
          from athlete_profiles
          where user_id = $1
          `,
          [req.user!.id]
        ),
        query(
          `
          select scan_date, weight_kg, body_fat_percent, skeletal_muscle_mass_kg, visceral_fat, bmr_kcal
          from body_composition_scans
          where user_id = $1
            and user_confirmed = true
          order by scan_date desc, created_at desc
          limit 1
          `,
          [req.user!.id]
        ),
        query(
          `
          select role, message
          from ai_chat_messages
          where user_id = $1
          order by created_at desc
          limit 4
          `,
          [req.user!.id]
        ),
        getHealthSyncSummary(req.user!.id),
        query(
          `
          select score
          from compliance_scores
          where user_id = $1
          order by calculated_for_date desc
          limit 1
          `,
          [req.user!.id]
        )
      ]);
    const workoutMemory = buildWorkoutMemorySummary(recentBurnResult.rows, {
      currentMomentum: Number(momentumResult.rows[0]?.score ?? 0) || null
    });

    const promptContext = JSON.stringify({
      profile: profileResult.rows[0] ?? {},
      recentFoodConsistency: recentFoodResult.rows[0] ?? {},
      recentWorkouts: recentBurnResult.rows,
      workoutMemory,
      athleteMode: athleteResult.rows[0] ?? null,
      latestBodyScan: bodyScanResult.rows[0] ?? null,
      recentCoachZoeContext: recentMessagesResult.rows.reverse(),
      healthSync: healthSyncSummary
        ? {
            todaySteps: healthSyncSummary.todaySteps,
            averageSteps7d: healthSyncSummary.averageSteps7d,
            todayActiveCalories: healthSyncSummary.todayActiveCalories,
            workoutsThisWeek: healthSyncSummary.workoutsThisWeek,
            workoutCompletedToday: healthSyncSummary.workoutCompletedToday,
            lastSyncedAt: healthSyncSummary.lastSyncedAt
          }
        : null
    });

    const workout = await createCoachWorkoutPlan({
      location: input.location,
      timeAvailable: input.timeAvailable,
      goal: input.goal,
      equipment: input.equipment,
      context: promptContext
    });

    await logAiUsage({
      userId: req.user!.id,
      gymId: req.user!.gymId,
      eventType: "ai_chat_message",
      provider: env.AI_PROVIDER,
      model: env.AI_PROVIDER === "gemini" ? env.GEMINI_MODEL : env.OPENAI_MODEL,
      status: "success",
      inputUnits: JSON.stringify(input).length + promptContext.length,
      outputUnits: JSON.stringify(workout).length,
      metadata: { feature: "coach_zoe_workout_planner" }
    });

    res.json({ workout });
  } catch (error) {
    next(error);
  }
});

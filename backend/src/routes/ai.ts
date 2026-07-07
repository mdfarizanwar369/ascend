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

const coachChatSchema = z.object({
  message: z.string().trim().min(1).max(2_000),
  mode: z.enum(["general", "progress", "consistency", "meal_advice", "workout"]).optional().default("general")
});

const workoutPlannerSchema = z.object({
  location: z.enum(["gym", "home", "hotel", "outdoors"]),
  timeAvailable: z.enum(["20", "30", "45", "60"]),
  goal: z.enum(["fat_loss", "muscle_gain", "strength", "general_fitness", "recovery", "mobility"]),
  equipment: z.string().trim().min(2).max(80)
});

function asNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function localDateKey(value: string | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function summarizeFoodRows(rows: Array<Record<string, unknown>>) {
  const days = new Set<string>();
  let proteinLowEvenings = 0;
  let totalProtein = 0;
  let totalCalories = 0;

  for (const row of rows) {
    const loggedAt = String(row.logged_at ?? "");
    if (loggedAt) days.add(localDateKey(loggedAt));
    totalProtein += asNumber(row.protein_g) ?? 0;
    totalCalories += asNumber(row.calories) ?? 0;

    const mealType = String(row.meal_type ?? "").toLowerCase();
    const protein = asNumber(row.protein_g) ?? 0;
    if ((mealType === "dinner" || mealType === "snack") && protein < 25) proteinLowEvenings += 1;
  }

  return {
    mealsLogged: rows.length,
    foodDays: days.size,
    averageProteinPerMeal: rows.length ? Math.round((totalProtein / rows.length) * 10) / 10 : 0,
    averageCaloriesPerMeal: rows.length ? Math.round(totalCalories / rows.length) : 0,
    proteinLowEvenings
  };
}

function summarizeWaterRows(rows: Array<Record<string, unknown>>) {
  const totalsByDay = new Map<string, number>();
  for (const row of rows) {
    const loggedAt = String(row.logged_at ?? "");
    if (!loggedAt) continue;
    const key = localDateKey(loggedAt);
    totalsByDay.set(key, (totalsByDay.get(key) ?? 0) + (asNumber(row.amount_ml) ?? 0));
  }
  const days = [...totalsByDay.entries()];
  const goalDays = days.filter(([, amount]) => amount >= 2_000).length;
  return {
    daysTracked: days.length,
    goalDays,
    averageMl: days.length ? Math.round(days.reduce((sum, [, amount]) => sum + amount, 0) / days.length) : 0,
    latestMl: days[days.length - 1]?.[1] ?? 0
  };
}

function summarizeWeightRows(rows: Array<Record<string, unknown>>) {
  const ordered = [...rows].sort((left, right) => new Date(String(left.logged_at ?? "")).getTime() - new Date(String(right.logged_at ?? "")).getTime());
  const first = asNumber(ordered[0]?.weight_kg);
  const latest = asNumber(ordered[ordered.length - 1]?.weight_kg);
  const delta = first !== null && latest !== null ? Math.round((latest - first) * 10) / 10 : null;
  return {
    logs: ordered.length,
    firstWeightKg: first,
    latestWeightKg: latest,
    changeKg14d: delta
  };
}

function summarizeHabitRows(rows: Array<Record<string, unknown>>) {
  const completed = rows.filter((row) => row.completed === true).length;
  const days = new Set(rows.filter((row) => row.logged_at).map((row) => localDateKey(String(row.logged_at))));
  return {
    completed,
    activeDays: days.size
  };
}

aiRouter.post("/ai/chat", requireAuth, requireActivePlan("premium"), aiRateLimit, async (req, res, next) => {
  try {
    const { message, mode } = coachChatSchema.parse(req.body);
    const [contextResult, recentFoodResult, food14dResult, recentBurnResult, burn14dResult, athleteResult, bodyScanResult, bodyScanHistoryResult, recentMessagesResult, healthSyncSummary, momentumResult, water14dResult, weight14dResult, habit14dResult, weeklyReportResult, recognitionResult] = await Promise.all([
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
        select estimated_food_name, calories, protein_g, carbs_g, fat_g, meal_type, logged_at
        from food_logs
        where user_id = $1
          and logged_at >= now() - interval '14 days'
        order by logged_at desc
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
        select metadata, created_at
        from analytics_events
        where user_id = $1
          and event_name = 'burn_log'
          and created_at >= now() - interval '14 days'
        order by created_at desc
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
        select scan_date, weight_kg, body_fat_percent, skeletal_muscle_mass_kg, visceral_fat, bmr_kcal
        from body_composition_scans
        where user_id = $1
          and user_confirmed = true
        order by scan_date desc, created_at desc
        limit 3
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
      ),
      query(
        `
        select amount_ml, logged_at
        from water_logs
        where user_id = $1
          and logged_at >= now() - interval '14 days'
        order by logged_at desc
        `,
        [req.user!.id]
      ),
      query(
        `
        select weight_kg, logged_at
        from weight_logs
        where user_id = $1
          and logged_at >= now() - interval '14 days'
        order by logged_at desc
        `,
        [req.user!.id]
      ),
      query(
        `
        select completed, logged_at
        from habit_logs
        where user_id = $1
          and logged_at >= now() - interval '14 days'
        order by logged_at desc
        `,
        [req.user!.id]
      ),
      query(
        `
        select summary, compliance_score, created_at, week_start, week_end
        from weekly_reports
        where user_id = $1
        order by week_start desc, created_at desc
        limit 1
        `,
        [req.user!.id]
      ),
      query(
        `
        select message, signal, created_at
        from trainer_recognitions
        where client_user_id = $1
        order by created_at desc
        limit 3
        `,
        [req.user!.id]
      )
    ]);
    const workoutMemory = buildWorkoutMemorySummary(recentBurnResult.rows, {
      currentMomentum: Number(momentumResult.rows[0]?.score ?? 0) || null
    });
    const food14d = summarizeFoodRows(food14dResult.rows);
    const water14d = summarizeWaterRows(water14dResult.rows);
    const weight14d = summarizeWeightRows(weight14dResult.rows);
    const habits14d = summarizeHabitRows(habit14dResult.rows);
    const burn14d = {
      workouts: burn14dResult.rows.length,
      latestWorkoutAt: burn14dResult.rows[0]?.created_at ?? null,
      completedToday: burn14dResult.rows.some((row) => localDateKey(String(row.created_at ?? "")) === localDateKey(new Date())),
      completedYesterday: burn14dResult.rows.some((row) => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        return localDateKey(String(row.created_at ?? "")) === localDateKey(yesterday);
      })
    };
    const latestWeeklyReport = weeklyReportResult.rows[0]
      ? {
          summary: String(weeklyReportResult.rows[0].summary ?? ""),
          complianceScore: asNumber(weeklyReportResult.rows[0].compliance_score),
          weekStart: weeklyReportResult.rows[0].week_start,
          weekEnd: weeklyReportResult.rows[0].week_end
        }
      : null;
    const bodyScanHistory = bodyScanHistoryResult.rows.map((row) => ({
      scanDate: row.scan_date,
      weightKg: asNumber(row.weight_kg),
      bodyFatPercent: asNumber(row.body_fat_percent),
      skeletalMuscleMassKg: asNumber(row.skeletal_muscle_mass_kg),
      visceralFat: asNumber(row.visceral_fat),
      bmrKcal: asNumber(row.bmr_kcal)
    }));
    const promptContext = JSON.stringify({
      profile: contextResult.rows[0] ?? {},
      recentFoodLogs: recentFoodResult.rows,
      recentWorkouts: recentBurnResult.rows,
      workoutMemory,
      athleteMode: athleteResult.rows[0] ?? null,
      latestBodyScan: bodyScanResult.rows[0] ?? null,
      bodyScanHistory,
      analysisWindow14d: {
        weightTrend: weight14d,
        food: food14d,
        water: water14d,
        habits: habits14d,
        workouts: burn14d,
        momentumScore: Number(momentumResult.rows[0]?.score ?? 0) || null,
        latestWeeklyReport,
        latestRecognition: recognitionResult.rows[0]
          ? {
              message: String(recognitionResult.rows[0].message ?? ""),
              signal: String(recognitionResult.rows[0].signal ?? ""),
              createdAt: recognitionResult.rows[0].created_at
            }
          : null
      },
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
    const reply = await createCoachZoeReply(message, promptContext, mode);
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

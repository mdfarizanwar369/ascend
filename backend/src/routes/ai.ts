import { Router } from "express";
import { createCoachWorkoutPlan, createCoachZoeReply, createWorkoutCaptureDraft, estimateBurnFromText, refineTodayPriority } from "../integrations/openai";
import { requireAuth } from "../middleware/auth";
import { requireActivePlan } from "../middleware/subscription";
import { query } from "../db/pool";
import { getCoachZoeAccess, logAiUsage } from "../services/aiUsageService";
import { env } from "../config/env";
import { aiRateLimit } from "../middleware/rateLimits";
import { z } from "zod";
import { getHealthSyncSummary } from "../services/healthSyncService";
import { buildWorkoutMemorySummary } from "../services/workoutMemoryService";
import { buildWorkoutPlannerContext } from "../services/workoutPlannerPersonalizationService";
import { getWorkoutCaptureAccess } from "../services/workoutCaptureAccess";
import { resolveNutritionTargets } from "../services/nutritionTargetService";
import { buildTodayPriorityCandidates, deterministicTodayPriority, shouldUseAiPriorityRefinement, TodayPriorityFacts } from "../services/todayPriorityService";
import { dailyCoachingRolloutMode, resolveDailyCoachingDecision } from "../services/dailyCoachingDecisionService";

export const aiRouter = Router();
const momentumScoreTable = env.MOMENTUM_V2 ? "momentum_scores_v2" : "compliance_scores";
const momentumContextSelect = env.MOMENTUM_V2
  ? "score, fuel_score, move_score, recover_score, focus_score, fuel_status, move_status, recover_status, focus_status, focus_active, period_start, period_end"
  : "score, null::integer as fuel_score, null::integer as move_score, null::integer as recover_score, null::integer as focus_score, null::text as fuel_status, null::text as move_status, null::text as recover_status, null::text as focus_status, false as focus_active, calculated_for_date as period_start, calculated_for_date as period_end";

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
    changeKgWindow: delta
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

function coverageStats(rows: Array<Record<string, unknown>>, key: "logged_at" | "created_at", daysWindow = 90) {
  const weekdayActive = new Set<string>();
  const weekendActive = new Set<string>();
  let weekdaySlots = 0;
  let weekendSlots = 0;

  for (const row of rows) {
    const value = String(row[key] ?? "");
    if (!value) continue;
    const normalized = localDateKey(value);
    const day = new Date(`${normalized}T00:00:00Z`).getUTCDay();
    if (day === 0 || day === 6) weekendActive.add(normalized);
    else weekdayActive.add(normalized);
  }

  for (let index = 0; index < daysWindow; index += 1) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - index);
    const day = date.getUTCDay();
    if (day === 0 || day === 6) weekendSlots += 1;
    else weekdaySlots += 1;
  }

  const weekdayCoverage = weekdaySlots ? Math.round((weekdayActive.size / weekdaySlots) * 100) : 0;
  const weekendCoverage = weekendSlots ? Math.round((weekendActive.size / weekendSlots) * 100) : 0;

  return { weekdayCoverage, weekendCoverage };
}

function summarizeLongTermSignals(input: {
  foodRows: Array<Record<string, unknown>>;
  waterRows: Array<Record<string, unknown>>;
  weightRows: Array<Record<string, unknown>>;
  burnRows: Array<Record<string, unknown>>;
  habitRows: Array<Record<string, unknown>>;
}) {
  const foodCoverage = coverageStats(input.foodRows, "logged_at");
  const waterCoverage = coverageStats(input.waterRows, "logged_at");
  const habitCoverage = coverageStats(input.habitRows, "logged_at");
  const workoutCoverage = coverageStats(input.burnRows, "created_at");

  const workoutWeeks = new Set(
    input.burnRows
      .map((row) => String(row.created_at ?? ""))
      .filter(Boolean)
      .map((value) => {
        const date = new Date(value);
        const weekStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
        weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7));
        return weekStart.toISOString().slice(0, 10);
      })
  );

  const orderedWeights = [...input.weightRows]
    .map((row) => ({
      loggedAt: String(row.logged_at ?? ""),
      weightKg: asNumber(row.weight_kg)
    }))
    .filter((row) => row.loggedAt && row.weightKg !== null)
    .sort((left, right) => new Date(left.loggedAt).getTime() - new Date(right.loggedAt).getTime());
  const latestWeight = orderedWeights.at(-1) ?? null;
  const weight30Baseline = [...orderedWeights]
    .reverse()
    .find((row) => new Date(row.loggedAt).getTime() <= Date.now() - 30 * 86_400_000) ?? orderedWeights[0] ?? null;
  const weight90Baseline = orderedWeights[0] ?? null;
  const weightChange30d =
    latestWeight && weight30Baseline ? Math.round((latestWeight.weightKg! - weight30Baseline.weightKg!) * 10) / 10 : null;
  const weightChange90d =
    latestWeight && weight90Baseline ? Math.round((latestWeight.weightKg! - weight90Baseline.weightKg!) * 10) / 10 : null;

  const recurringPatterns: string[] = [];
  if (foodCoverage.weekdayCoverage - foodCoverage.weekendCoverage >= 20) {
    recurringPatterns.push("Food logging usually drops on weekends.");
  }
  if (waterCoverage.weekdayCoverage - waterCoverage.weekendCoverage >= 20) {
    recurringPatterns.push("Hydration tracking becomes less consistent on weekends.");
  }
  if (habitCoverage.weekdayCoverage - habitCoverage.weekendCoverage >= 20) {
    recurringPatterns.push("Habit check-ins are stronger on weekdays than weekends.");
  }
  if (workoutCoverage.weekendCoverage - workoutCoverage.weekdayCoverage >= 20) {
    recurringPatterns.push("Training is more consistent on weekends than weekdays.");
  }
  if (orderedWeights.length >= 4 && weightChange30d !== null && Math.abs(weightChange30d) <= 0.3 && weightChange90d !== null && Math.abs(weightChange90d) >= 0.8) {
    recurringPatterns.push("Progress appears to be plateauing over the last month.");
  }

  return {
    windowDays: 90,
    foodCoverage,
    waterCoverage,
    habitCoverage,
    workoutCoverage,
    workouts90d: input.burnRows.length,
    averageWorkoutsPerWeek90d: Math.round((input.burnRows.length / (90 / 7)) * 10) / 10,
    activeWorkoutWeeks90d: workoutWeeks.size,
    weightChange30d,
    weightChange90d,
    recurringPatterns
  };
}

function summarizeDataConfidence(input: {
  foodRows: Array<Record<string, unknown>>;
  waterRows: Array<Record<string, unknown>>;
  weightRows: Array<Record<string, unknown>>;
  burnRows: Array<Record<string, unknown>>;
  habitRows: Array<Record<string, unknown>>;
  bodyScanHistory: Array<{ scanDate: string | null; weightKg: number | null; bodyFatPercent: number | null; skeletalMuscleMassKg: number | null; visceralFat: number | null; bmrKcal: number | null }>;
}) {
  const historyDays = new Set<string>();
  for (const row of input.foodRows) {
    const value = String(row.logged_at ?? "");
    if (value) historyDays.add(localDateKey(value));
  }
  for (const row of input.waterRows) {
    const value = String(row.logged_at ?? "");
    if (value) historyDays.add(localDateKey(value));
  }
  for (const row of input.weightRows) {
    const value = String(row.logged_at ?? "");
    if (value) historyDays.add(localDateKey(value));
  }
  for (const row of input.burnRows) {
    const value = String(row.created_at ?? "");
    if (value) historyDays.add(localDateKey(value));
  }
  for (const row of input.habitRows) {
    const value = String(row.logged_at ?? "");
    if (value) historyDays.add(localDateKey(value));
  }
  for (const row of input.bodyScanHistory) {
    if (row.scanDate) historyDays.add(localDateKey(row.scanDate));
  }

  const totalActivities =
    input.foodRows.length +
    input.waterRows.length +
    input.weightRows.length +
    input.burnRows.length +
    input.habitRows.length +
    input.bodyScanHistory.length;

  const historyDayCount = historyDays.size;
  const state =
    totalActivities === 0
      ? "FIRST_TIME_USER"
      : historyDayCount <= 1
        ? "FIRST_DAY_COMPLETE"
        : historyDayCount <= 6
          ? "EARLY_HISTORY"
          : historyDayCount <= 29
            ? "TREND_READY"
            : "LONG_TERM_HISTORY";

  return {
    state,
    historyDayCount,
    totalActivities
  };
}

aiRouter.post("/ai/chat", requireAuth, aiRateLimit, async (req, res, next) => {
  try {
    const { message, mode } = coachChatSchema.parse(req.body);
    const coachAccess = await getCoachZoeAccess(req.user!.id);
    if (mode === "general" && coachAccess.dailyAskZoeLimit !== null && (coachAccess.dailyAskZoeRemaining ?? 0) <= 0) {
      return res.status(402).json({
        error: "You've used today's free coaching sessions. Upgrade to Ascend Plus for unlimited conversations, deeper insights and a coach that learns from your journey."
      });
    }

    const analysisWindowDays = coachAccess.premiumDepth ? 30 : 7;
    const [contextResult, recentFoodResult, foodWindowResult, recentBurnResult, burnWindowResult, athleteResult, bodyScanResult, bodyScanHistoryResult, recentMessagesResult, healthSyncSummary, momentumResult, waterWindowResult, weightWindowResult, habitWindowResult, weeklyReportResult, recognitionResult, longTermFoodResult, longTermWaterResult, longTermWeightResult, longTermHabitResult, longTermBurnResult, resolvedNutritionTargets] = await Promise.all([
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
          and logged_at >= now() - ($2::int * interval '1 day')
        order by logged_at desc
        `,
        [req.user!.id, analysisWindowDays]
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
          and created_at >= now() - ($2::int * interval '1 day')
        order by created_at desc
        `,
        [req.user!.id, analysisWindowDays]
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
        select ${momentumContextSelect}
        from ${momentumScoreTable}
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
          and logged_at >= now() - ($2::int * interval '1 day')
        order by logged_at desc
        `,
        [req.user!.id, analysisWindowDays]
      ),
      query(
        `
        select weight_kg, logged_at
        from weight_logs
        where user_id = $1
          and logged_at >= now() - ($2::int * interval '1 day')
        order by logged_at desc
        `,
        [req.user!.id, analysisWindowDays]
      ),
      query(
        `
        select completed, logged_at
        from habit_logs
        where user_id = $1
          and logged_at >= now() - ($2::int * interval '1 day')
        order by logged_at desc
        `,
        [req.user!.id, analysisWindowDays]
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
      ),
      coachAccess.premiumDepth
        ? query(
            `
            select estimated_food_name, calories, protein_g, carbs_g, fat_g, meal_type, logged_at
            from food_logs
            where user_id = $1
              and logged_at >= now() - interval '90 days'
            order by logged_at desc
            `,
            [req.user!.id]
          )
        : Promise.resolve({ rows: [] }),
      coachAccess.premiumDepth
        ? query(
            `
            select amount_ml, logged_at
            from water_logs
            where user_id = $1
              and logged_at >= now() - interval '90 days'
            order by logged_at desc
            `,
            [req.user!.id]
          )
        : Promise.resolve({ rows: [] }),
      coachAccess.premiumDepth
        ? query(
            `
            select weight_kg, logged_at
            from weight_logs
            where user_id = $1
              and logged_at >= now() - interval '90 days'
            order by logged_at desc
            `,
            [req.user!.id]
          )
        : Promise.resolve({ rows: [] }),
      coachAccess.premiumDepth
        ? query(
            `
            select completed, logged_at
            from habit_logs
            where user_id = $1
              and logged_at >= now() - interval '90 days'
            order by logged_at desc
            `,
            [req.user!.id]
          )
        : Promise.resolve({ rows: [] }),
      coachAccess.premiumDepth
        ? query(
            `
            select metadata, created_at
            from analytics_events
            where user_id = $1
              and event_name = 'burn_log'
              and created_at >= now() - interval '90 days'
            order by created_at desc
            `,
            [req.user!.id]
          )
        : Promise.resolve({ rows: [] }),
      resolveNutritionTargets(req.user!.id)
    ]);
    const foodWindow = summarizeFoodRows(foodWindowResult.rows);
    const waterWindow = summarizeWaterRows(waterWindowResult.rows);
    const weightWindow = summarizeWeightRows(weightWindowResult.rows);
    const habitsWindow = summarizeHabitRows(habitWindowResult.rows);
    const longTermJourney = coachAccess.premiumDepth
      ? summarizeLongTermSignals({
          foodRows: longTermFoodResult.rows,
          waterRows: longTermWaterResult.rows,
          weightRows: longTermWeightResult.rows,
          burnRows: longTermBurnResult.rows,
          habitRows: longTermHabitResult.rows
        })
      : null;

    const workoutMemory = buildWorkoutMemorySummary(recentBurnResult.rows, {
      currentMomentum: Number(momentumResult.rows[0]?.score ?? 0) || null
    });
    const burnWindow = {
      workouts: burnWindowResult.rows.length,
      latestWorkoutAt: burnWindowResult.rows[0]?.created_at ?? null,
      completedToday: burnWindowResult.rows.some((row) => localDateKey(String(row.created_at ?? "")) === localDateKey(new Date())),
      completedYesterday: burnWindowResult.rows.some((row) => {
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
    const dataConfidence = summarizeDataConfidence({
      foodRows: foodWindowResult.rows,
      waterRows: waterWindowResult.rows,
      weightRows: weightWindowResult.rows,
      burnRows: burnWindowResult.rows,
      habitRows: habitWindowResult.rows,
      bodyScanHistory
    });
    const promptContext = JSON.stringify({
      coachAccess: {
        tier: coachAccess.tier,
        analysisDepth: coachAccess.premiumDepth ? "complete_journey" : "recent_history_only",
        askZoeDailyLimit: coachAccess.dailyAskZoeLimit,
        askZoeDailyRemaining: coachAccess.dailyAskZoeRemaining
      },
      profile: contextResult.rows[0] ?? {},
      nutritionTargets: resolvedNutritionTargets,
      recentFoodLogs: recentFoodResult.rows,
      recentWorkouts: recentBurnResult.rows,
      workoutMemory,
      athleteMode: athleteResult.rows[0] ?? null,
      latestBodyScan: bodyScanResult.rows[0] ?? null,
      bodyScanHistory,
      recentAnalysisWindow: {
        windowDays: analysisWindowDays,
        dataConfidence,
        weightTrend: weightWindow,
        food: foodWindow,
        water: waterWindow,
        habits: habitsWindow,
        workouts: burnWindow,
        momentum: momentumResult.rows[0] ?? null,
        latestWeeklyReport,
        latestRecognition: recognitionResult.rows[0]
          ? {
              message: String(recognitionResult.rows[0].message ?? ""),
              signal: String(recognitionResult.rows[0].signal ?? ""),
              createdAt: recognitionResult.rows[0].created_at
            }
          : null
      },
      longTermJourney,
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
      outputUnits: reply.length,
      metadata: {
        mode,
        coachTier: coachAccess.tier,
        analysisWindowDays,
        premiumDepth: coachAccess.premiumDepth
      }
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

const todayPrioritySchema = z.object({
  timezoneOffsetMinutes: z.number().int().min(-840).max(840).default(0)
});

aiRouter.post("/ai/today-priority", requireAuth, async (req, res, next) => {
  try {
    const { timezoneOffsetMinutes } = todayPrioritySchema.parse(req.body ?? {});
    const localNow = new Date(Date.now() - timezoneOffsetMinutes * 60_000);
    const localDayStartUtc = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate()) + timezoneOffsetMinutes * 60_000);
    const localDayEndUtc = new Date(localDayStartUtc.getTime() + 86_400_000);
    const localDay = localNow.toISOString().slice(0, 10);
    const [foodResult, waterResult, workoutResult, recoveryResult, nutritionTargets, healthSyncSummary] = await Promise.all([
      query<{ meals: number; protein_g: number | string }>(`
        select count(*)::int as meals, coalesce(sum(protein_g), 0) as protein_g
        from food_logs where user_id = $1 and logged_at >= $2 and logged_at < $3
      `, [req.user!.id, localDayStartUtc.toISOString(), localDayEndUtc.toISOString()]),
      query<{ water_ml: number | string }>(`
        select coalesce(sum(amount_ml), 0) as water_ml
        from water_logs where user_id = $1 and logged_at >= $2 and logged_at < $3
      `, [req.user!.id, localDayStartUtc.toISOString(), localDayEndUtc.toISOString()]),
      query<{ latest_at: string | null; completed_today: boolean }>(`
        select max(created_at) as latest_at,
          coalesce(bool_or(created_at >= $2 and created_at < $3), false) as completed_today
        from analytics_events where user_id = $1 and event_name = 'burn_log'
      `, [req.user!.id, localDayStartUtc.toISOString(), localDayEndUtc.toISOString()]),
      query<{ sleep_quality: "poor" | "okay" | "good" | null }>(`
        select sleep_quality from recovery_checkins
        where user_id = $1 and checkin_date = $2::date
        limit 1
      `, [req.user!.id, localDay]),
      resolveNutritionTargets(req.user!.id),
      getHealthSyncSummary(req.user!.id).catch(() => null)
    ]);
    const latestWorkoutAt = workoutResult.rows[0]?.latest_at ? new Date(workoutResult.rows[0].latest_at).getTime() : null;
    const latestSyncedWorkoutAt = healthSyncSummary?.latestWorkoutAt ? new Date(healthSyncSummary.latestWorkoutAt).getTime() : null;
    const latestMovementAt = Math.max(latestWorkoutAt ?? 0, latestSyncedWorkoutAt ?? 0) || null;
    const facts: TodayPriorityFacts = {
      localHour: localNow.getUTCHours(),
      mealsToday: Number(foodResult.rows[0]?.meals ?? 0),
      proteinTodayG: Number(foodResult.rows[0]?.protein_g ?? 0),
      proteinTargetG: nutritionTargets.proteinG,
      waterTodayMl: Number(waterResult.rows[0]?.water_ml ?? 0),
      waterTargetMl: nutritionTargets.waterMl,
      workoutCompletedToday: Boolean(workoutResult.rows[0]?.completed_today) || healthSyncSummary?.workoutCompletedToday === true,
      daysSinceWorkout: latestMovementAt === null ? null : Math.max(0, Math.floor((Date.now() - latestMovementAt) / 86_400_000)),
      stepsToday: healthSyncSummary?.todaySteps ?? 0,
      activeCaloriesToday: healthSyncSummary?.todayActiveCalories ?? 0,
      sleepQuality: recoveryResult.rows[0]?.sleep_quality ?? null
    };
    const candidates = buildTodayPriorityCandidates(facts);
    const deterministicPriority = deterministicTodayPriority(facts);
    const isFirstCheckIn = facts.mealsToday === 0
      && facts.waterTodayMl === 0
      && facts.daysSinceWorkout === null
      && facts.stepsToday === 0
      && facts.activeCaloriesToday === 0
      && facts.sleepQuality === null;
    const resolveLegacyPriority = async () => {
      const leadingRank = candidates[0]?.rank ?? 0;
      const contenders = candidates.filter((candidate) => leadingRank - candidate.rank <= 10);
      if (isFirstCheckIn || !shouldUseAiPriorityRefinement(candidates)) {
        return { priority: deterministicPriority, source: "rules" as const };
      }

      const refinedPriority = await refineTodayPriority({ candidates: contenders, facts }).catch(() => null);
      if (!refinedPriority) {
        return { priority: deterministicPriority, source: "rules" as const };
      }

      void logAiUsage({
        userId: req.user!.id,
        gymId: req.user!.gymId,
        eventType: "today_priority_analysis",
        provider: env.AI_PROVIDER,
        model: env.AI_PROVIDER === "gemini" ? env.GEMINI_MODEL : env.OPENAI_MODEL,
        status: "success",
        inputUnits: JSON.stringify(facts).length,
        outputUnits: refinedPriority.title.length + refinedPriority.reason.length,
        metadata: { eligibleKeys: contenders.map((candidate) => candidate.key), selectedKey: refinedPriority.key, engine: "legacy" }
      }).catch(() => undefined);
      return { priority: refinedPriority, source: "ai" as const };
    };

    const rolloutMode = dailyCoachingRolloutMode({
      enabledForAll: env.DAILY_COACHING_DECISION_V1,
      shadowEnabled: env.DAILY_COACHING_DECISION_SHADOW,
      ownerPilotEnabled: env.DAILY_COACHING_DECISION_OWNER_PILOT,
      isPlatformOwner: req.user!.isPlatformOwner
    });
    const unifiedDecisionActive = rolloutMode === "active";
    const shadowActive = rolloutMode === "shadow";

    if (unifiedDecisionActive) {
      try {
        const decision = await resolveDailyCoachingDecision({
          userId: req.user!.id,
          localDate: localDay,
          timezoneOffsetMinutes,
          expiresAt: localDayEndUtc.toISOString(),
          facts,
          allowAiRefinement: true,
          legacyPriorityKey: deterministicPriority.key
        }, { refine: refineTodayPriority });

        if (decision.decisionSource === "ai" && !decision.cacheHit) {
          void logAiUsage({
            userId: req.user!.id,
            gymId: req.user!.gymId,
            eventType: "today_priority_analysis",
            provider: env.AI_PROVIDER,
            model: env.AI_PROVIDER === "gemini" ? env.GEMINI_MODEL : env.OPENAI_MODEL,
            status: "success",
            inputUnits: JSON.stringify(facts).length,
            outputUnits: decision.priority.title.length + decision.priority.reason.length,
            metadata: { selectedKey: decision.priority.key, engine: decision.engineVersion, cacheHit: false }
          }).catch(() => undefined);
        }

        return res.json({
          priority: decision.priority,
          source: decision.responseSource,
          decision: {
            id: decision.id,
            insight: decision.insight,
            engineVersion: decision.engineVersion,
            cacheHit: decision.cacheHit,
            active: true
          }
        });
      } catch {
        return res.json(await resolveLegacyPriority());
      }
    }

    const legacy = await resolveLegacyPriority();
    if (shadowActive) {
      void resolveDailyCoachingDecision({
        userId: req.user!.id,
        localDate: localDay,
        timezoneOffsetMinutes,
        expiresAt: localDayEndUtc.toISOString(),
        facts,
        allowAiRefinement: false,
        legacyPriorityKey: legacy.priority.key
      }).catch(() => undefined);
    }

    return res.json(legacy);
  } catch (error) {
    next(error);
  }
});

const workoutCaptureSchema = z.object({
  text: z.string().trim().min(2).max(2_000),
  sourceMode: z.enum(["text", "dictation"]).default("text")
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

aiRouter.post("/ai/workout-capture", requireAuth, aiRateLimit, async (req, res, next) => {
  try {
    const access = await getWorkoutCaptureAccess({
      featureEnabled: env.WORKOUT_CAPTURE_V1,
      userId: req.user!.id,
      primaryRole: req.user!.primaryRole,
      roles: req.user!.roles,
      isPlatformOwner: req.user!.isPlatformOwner
    });
    if (!access.enabled) {
      return res.json({ enabled: false, draft: null, allowance: null });
    }
    if (!access.canCapture) {
      return res.status(429).json({
        error: "You've used your three free Detailed Workouts in the last seven days. Quick Activity is still unlimited, or upgrade for unlimited Detailed Workouts.",
        code: "WORKOUT_CAPTURE_LIMIT_REACHED",
        allowance: access.allowance
      });
    }

    const input = workoutCaptureSchema.parse(req.body);
    const recent = await query<{ metadata: Record<string, unknown> | null }>(
      `
      select metadata
      from analytics_events
      where user_id = $1
        and event_name = 'burn_log'
        and jsonb_typeof(metadata->'exercises') = 'array'
      order by created_at desc
      limit 10
      `,
      [req.user!.id]
    );
    const recentExerciseNames = recent.rows.flatMap((row) => {
      const exercises = Array.isArray(row.metadata?.exercises) ? row.metadata.exercises : [];
      return exercises
        .map((exercise) => exercise && typeof exercise === "object" ? String((exercise as Record<string, unknown>).name ?? "").trim() : "")
        .filter(Boolean);
    });
    const draft = await createWorkoutCaptureDraft({
      text: input.text,
      sourceMode: input.sourceMode,
      recentExerciseNames: [...new Set(recentExerciseNames)].slice(0, 30),
      userId: req.user!.id,
      gymId: req.user!.gymId
    });

    res.json({ enabled: true, draft, allowance: access.allowance });
  } catch (error) {
    next(error);
  }
});

aiRouter.post("/ai/workout", requireAuth, aiRateLimit, async (req, res, next) => {
  try {
    const input = workoutPlannerSchema.parse(req.body);
    const [coachAccess, profileResult, latestWeightResult, recentFoodResult, recentBurnResult, athleteResult, bodyScanResult, recentMessagesResult, healthSyncSummary, momentumResult] =
      await Promise.all([
        getCoachZoeAccess(req.user!.id),
        query(
          `
          select goal_type, starting_weight_kg, target_weight_kg, activity_level, age_years, gender, height_cm
          from users
          where id = $1
          `,
          [req.user!.id]
        ),
        query(
          `
          select weight_kg, logged_at
          from weight_logs
          where user_id = $1
          order by logged_at desc
          limit 1
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

    const promptContext = JSON.stringify(
      buildWorkoutPlannerContext({
        coachAccess,
        profile: profileResult.rows[0] ?? null,
        latestWeightKg: latestWeightResult.rows[0]?.weight_kg ? Number(latestWeightResult.rows[0].weight_kg) : null,
        recentFoodConsistency: recentFoodResult.rows[0] ?? null,
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
          : null,
        request: {
          location: input.location,
          timeAvailable: input.timeAvailable,
          goal: input.goal,
          equipment: input.equipment
        }
      })
    );

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
      metadata: { feature: "coach_zoe_workout_planner", mode: "workout", coachTier: coachAccess.tier }
    });

    res.json({ workout });
  } catch (error) {
    next(error);
  }
});

import { Router } from "express";
import { query } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { requireActivePlan } from "../middleware/subscription";
import { bodyCompositionScanFromDb, buildBodyCompositionSummary } from "../services/bodyCompositionService";
import { createCoachPresenceForEvent } from "../services/coachPresenceService";
import { env } from "../config/env";

export const reportsRouter = Router();
const momentumScoreTable = env.MOMENTUM_V2 ? "momentum_scores_v2" : "compliance_scores";
const momentumPillarSelect = env.MOMENTUM_V2
  ? "cs.fuel_score, cs.move_score, cs.recover_score, cs.focus_score, cs.focus_active"
  : "null::integer as fuel_score, null::integer as move_score, null::integer as recover_score, null::integer as focus_score, false as focus_active";

function numberValue(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function formatChange(value: number | null, unit = "") {
  if (value === null || Number.isNaN(value)) return "No previous value";
  const sign = value > 0 ? "+" : "";
  return `${sign}${Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 })}${unit}`;
}

function goalLabel(goal?: string | null) {
  if (goal === "fat_loss") return "fat loss";
  if (goal === "muscle_gain") return "muscle gain";
  if (goal === "maintenance") return "maintenance";
  return "your goal";
}

function weeklyFocus(stats: Record<string, unknown>, athleteLine?: string | null) {
  const foodDays = Number(stats.food_days ?? 0);
  const waterDays = Number(stats.water_days ?? 0);
  const workouts = Number(stats.workout_sessions ?? 0);
  const weightLogs = Number(stats.weight_logs ?? 0);

  if (athleteLine) return athleteLine;
  if (foodDays < 4) return "Log food on at least four days next week so your coach has better context.";
  if (waterDays < 4) return "Keep water tracking simple: aim to log water most days next week.";
  if (workouts < 2) return "Complete and log two training sessions to rebuild weekly momentum.";
  if (weightLogs < 1) return "Add one weight check-in next week so the trend stays visible.";
  return "Keep the same routine steady for another week and protect the consistency you built.";
}

function deterministicWeeklySummary(input: {
  weekStart: string;
  weekEnd: string;
  stats: Record<string, unknown>;
  athleteEnabled: boolean;
  bodySummary: ReturnType<typeof buildBodyCompositionSummary> | null;
}) {
  const { stats, bodySummary, athleteEnabled } = input;
  const name = String(stats.full_name ?? "there").split(" ")[0];
  const weightStart = numberValue(stats.first_weight_kg);
  const weightEnd = numberValue(stats.latest_weight_kg);
  const weightChange = weightStart !== null && weightEnd !== null ? weightEnd - weightStart : null;
  const foodDays = Number(stats.food_days ?? 0);
  const foodLogs = Number(stats.food_logs ?? 0);
  const waterDays = Number(stats.water_days ?? 0);
  const workouts = Number(stats.workout_sessions ?? 0);
  const habits = Number(stats.completed_habits ?? 0);
  const compliance = numberValue(stats.compliance_score);
  const calories = Number(stats.calories ?? 0);
  const protein = Number(stats.protein_g ?? 0);

  const lines = [
    `Weekly Coach Report for ${name}`,
    "",
    "This week at a glance",
    `- Goal focus: ${goalLabel(String(stats.goal_type ?? ""))}.`,
    `- Weight change: ${formatChange(weightChange, "kg")}.`,
    `- Food logging: ${foodLogs} meal log${foodLogs === 1 ? "" : "s"} across ${foodDays}/7 day${foodDays === 1 ? "" : "s"}.`,
    `- Water consistency: ${waterDays}/7 day${waterDays === 1 ? "" : "s"} tracked.`,
    `- Workout adherence: ${workouts} workout${workouts === 1 ? "" : "s"} logged.`,
    `- Habit completion: ${habits} completed habit check-in${habits === 1 ? "" : "s"}.`,
    compliance !== null ? `- Momentum score: ${Math.round(compliance)}/100.` : "- Momentum score: not enough data yet.",
    stats.fuel_score !== null && stats.fuel_score !== undefined
      ? `- Momentum pillars: Fuel ${stats.fuel_score}, Move ${stats.move_score}, Recover ${stats.recover_score}${stats.focus_active ? `, Focus ${stats.focus_score}` : ""}.`
      : "- Momentum pillars: still building enough context.",
    "",
    "Coach summary",
    foodDays >= 5 || waterDays >= 5 || workouts >= 3
      ? "You built useful consistency this week. The strongest signal is that you kept giving your coach data to work with."
      : "This week needs a simpler focus. The priority is not perfection; it is getting enough check-ins to see the pattern.",
    calories || protein ? `Nutrition context: ${Math.round(calories).toLocaleString()} kcal and ${Math.round(protein)}g protein logged this week.` : "Nutrition context: not enough food data yet.",
    ""
  ];

  let athleteFocus: string | null = null;
  if (athleteEnabled) {
    const latest = bodySummary?.latestScan ?? null;
    const bodyFatTrend = bodySummary?.trends.find((trend) => trend.metric === "Body Fat") ?? null;
    const muscleTrend = bodySummary?.trends.find((trend) => trend.metric === "Skeletal Muscle") ?? bodySummary?.trends.find((trend) => trend.metric === "Muscle") ?? null;
    const dna = bodySummary?.dnaScore;
    lines.push("Athlete Mode");
    if (latest) {
      lines.push(`- Latest Body Scan: ${latest.scanDate}.`);
      lines.push(`- Body fat trend: ${formatChange(bodyFatTrend?.change ?? null, "%")}.`);
      lines.push(`- Skeletal muscle trend: ${formatChange(muscleTrend?.change ?? null, "kg")}.`);
      lines.push(`- Ascend DNA: ${dna?.current ?? "--"}${dna?.change !== null && dna?.change !== undefined ? ` (${formatChange(dna.change)})` : ""}.`);
      if ((muscleTrend?.change ?? 0) < -0.2) athleteFocus = "Protect muscle next week with consistent protein, resistance training, and recovery.";
      else if ((bodyFatTrend?.change ?? 0) > 0.3) athleteFocus = "Review calories and activity because body fat is moving up.";
      else if ((bodyFatTrend?.change ?? 0) < -0.3 && (muscleTrend?.change ?? 0) >= -0.1) athleteFocus = "Continue the current plan because body composition is moving in the right direction.";
      else athleteFocus = "Keep scan conditions consistent and compare again after the next check-in.";
    } else {
      lines.push("- No confirmed Body Scan yet.");
      athleteFocus = "Complete the first Body Scan to unlock Ascend DNA trends.";
    }
    lines.push("");
  }

  lines.push("Suggested focus for next week");
  lines.push(weeklyFocus(stats, athleteFocus));

  return lines.join("\n");
}

reportsRouter.get("/reports/weekly/current", requireAuth, requireActivePlan("premium"), async (req, res, next) => {
  try {
    const result = await query(
      `
      select *
      from weekly_reports
      where user_id = $1 and week_start = date_trunc('week', now())::date
      order by created_at desc
      limit 1
      `,
      [req.user!.id]
    );

    res.json({ report: result.rows[0] ?? null });
  } catch (error) {
    next(error);
  }
});

reportsRouter.post("/reports/weekly/generate", requireAuth, requireActivePlan("premium"), async (req, res, next) => {
  try {
    const week = await query<{ week_start: string; week_end: string }>(
      "select date_trunc('week', now())::date as week_start, (date_trunc('week', now()) + interval '6 days')::date as week_end"
    );
    const weekStart = week.rows[0].week_start;
    const weekEnd = week.rows[0].week_end;

    const context = await query(
      `
      select
        u.full_name,
        u.goal_type,
        u.assigned_trainer_id,
        coalesce(athlete_profile.enabled, false) as athlete_mode_enabled,
        cs.score as compliance_score,
        ${momentumPillarSelect},
        coalesce(food.food_logs, 0) as food_logs,
        coalesce(food.food_days, 0) as food_days,
        coalesce(food.calories, 0) as calories,
        coalesce(food.protein_g, 0) as protein_g,
        coalesce(weight.weight_logs, 0) as weight_logs,
        weight.first_weight_kg,
        weight.latest_weight_kg,
        weight.lowest_weight_kg,
        weight.highest_weight_kg,
        coalesce(water.water_ml, 0) as water_ml,
        coalesce(water.water_days, 0) as water_days,
        coalesce(habits.completed_habits, 0) as completed_habits,
        coalesce(burn.burn_calories, 0) as burn_calories,
        coalesce(burn.workout_sessions, 0) as workout_sessions
      from users u
      left join athlete_profiles athlete_profile on athlete_profile.user_id = u.id
      left join ${momentumScoreTable} cs on cs.user_id = u.id and cs.calculated_for_date = current_date
      left join lateral (
        select count(*) as food_logs, count(distinct logged_at::date) as food_days, coalesce(sum(calories), 0) as calories, coalesce(sum(protein_g), 0) as protein_g
        from food_logs
        where user_id = u.id and logged_at::date between $2::date and $3::date
      ) food on true
      left join lateral (
        select count(*) as weight_logs,
          (array_agg(weight_kg order by logged_at asc))[1] as first_weight_kg,
          (array_agg(weight_kg order by logged_at desc))[1] as latest_weight_kg,
          min(weight_kg) as lowest_weight_kg,
          max(weight_kg) as highest_weight_kg
        from weight_logs
        where user_id = u.id and logged_at::date between $2::date and $3::date
      ) weight on true
      left join lateral (
        select coalesce(sum(amount_ml), 0) as water_ml, count(distinct logged_at::date) as water_days
        from water_logs
        where user_id = u.id and logged_at::date between $2::date and $3::date
      ) water on true
      left join lateral (
        select count(*) filter (where completed = true) as completed_habits
        from habit_logs
        where user_id = u.id and logged_at::date between $2::date and $3::date
      ) habits on true
      left join lateral (
        select coalesce(sum((metadata->>'caloriesBurned')::int), 0) as burn_calories, count(*) as workout_sessions
        from analytics_events
        where user_id = u.id and event_name = 'burn_log' and created_at::date between $2::date and $3::date
      ) burn on true
      where u.id = $1
      `,
      [req.user!.id, weekStart, weekEnd]
    );

    const stats = context.rows[0] ?? {};
    const scanResult = stats.athlete_mode_enabled === true
      ? await query(
          "select * from body_composition_scans where user_id = $1 and user_confirmed = true order by scan_date desc, created_at desc limit 20",
          [req.user!.id]
        )
      : { rows: [] };
    const bodySummary = stats.athlete_mode_enabled === true ? buildBodyCompositionSummary(scanResult.rows.map(bodyCompositionScanFromDb)) : null;
    const summary = deterministicWeeklySummary({ weekStart, weekEnd, stats, athleteEnabled: stats.athlete_mode_enabled === true, bodySummary });
    const trainerId = typeof stats.assigned_trainer_id === "string" ? stats.assigned_trainer_id : null;
    const complianceScore = stats.compliance_score === null || stats.compliance_score === undefined ? null : Number(stats.compliance_score);

    const existing = await query<{ id: string }>(
      "select id from weekly_reports where user_id = $1 and week_start = $2::date order by created_at desc limit 1",
      [req.user!.id, weekStart]
    );

    const report = existing.rows[0]
      ? await query(
          `
          update weekly_reports
          set summary = $2, ai_generated_checkin = $2, compliance_score = $3, trainer_id = $4
          where id = $1
          returning *
          `,
          [existing.rows[0].id, summary, complianceScore, trainerId]
        )
      : await query(
          `
          insert into weekly_reports (user_id, trainer_id, week_start, week_end, summary, ai_generated_checkin, compliance_score)
          values ($1, $2, $3::date, $4::date, $5, $5, $6)
          returning *
          `,
          [req.user!.id, trainerId, weekStart, weekEnd, summary, complianceScore]
        );

    void createCoachPresenceForEvent(req.user!.id, "weekly_report").catch(() => undefined);
    res.status(201).json({ report: report.rows[0] });
  } catch (error) {
    next(error);
  }
});

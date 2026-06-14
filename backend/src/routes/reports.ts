import { Router } from "express";
import { query } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { requireActivePlan } from "../middleware/subscription";
import { createClientWeeklyReport } from "../integrations/openai";
import { logAiUsage } from "../services/aiUsageService";
import { env } from "../config/env";

export const reportsRouter = Router();

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
        cs.score as compliance_score,
        coalesce(food.food_logs, 0) as food_logs,
        coalesce(food.calories, 0) as calories,
        coalesce(food.protein_g, 0) as protein_g,
        coalesce(weight.weight_logs, 0) as weight_logs,
        weight.lowest_weight_kg,
        weight.highest_weight_kg,
        coalesce(water.water_ml, 0) as water_ml,
        coalesce(habits.completed_habits, 0) as completed_habits,
        coalesce(burn.burn_calories, 0) as burn_calories
      from users u
      left join compliance_scores cs on cs.user_id = u.id and cs.calculated_for_date = current_date
      left join lateral (
        select count(*) as food_logs, coalesce(sum(calories), 0) as calories, coalesce(sum(protein_g), 0) as protein_g
        from food_logs
        where user_id = u.id and logged_at::date between $2::date and $3::date
      ) food on true
      left join lateral (
        select count(*) as weight_logs, min(weight_kg) as lowest_weight_kg, max(weight_kg) as highest_weight_kg
        from weight_logs
        where user_id = u.id and logged_at::date between $2::date and $3::date
      ) weight on true
      left join lateral (
        select coalesce(sum(amount_ml), 0) as water_ml
        from water_logs
        where user_id = u.id and logged_at::date between $2::date and $3::date
      ) water on true
      left join lateral (
        select count(*) filter (where completed = true) as completed_habits
        from habit_logs
        where user_id = u.id and logged_at::date between $2::date and $3::date
      ) habits on true
      left join lateral (
        select coalesce(sum((metadata->>'caloriesBurned')::int), 0) as burn_calories
        from analytics_events
        where user_id = u.id and event_name = 'burn_log' and created_at::date between $2::date and $3::date
      ) burn on true
      where u.id = $1
      `,
      [req.user!.id, weekStart, weekEnd]
    );

    const stats = context.rows[0] ?? {};
    const summary = await createClientWeeklyReport(JSON.stringify({ weekStart, weekEnd, stats }));
    await logAiUsage({
      userId: req.user!.id,
      gymId: req.user!.gymId,
      eventType: "weekly_report_generation",
      provider: env.AI_PROVIDER,
      model: env.AI_PROVIDER === "gemini" ? env.GEMINI_MODEL : env.OPENAI_MODEL,
      status: "success",
      inputUnits: JSON.stringify({ weekStart, weekEnd, stats }).length,
      outputUnits: summary.length
    });
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

    res.status(201).json({ report: report.rows[0] });
  } catch (error) {
    next(error);
  }
});

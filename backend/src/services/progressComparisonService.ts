import { GoalType } from "@ascend/shared";
import { query } from "../db/pool";

export interface ProgressComparisonRow {
  goal_type?: GoalType | null;
  days_tracked: string | number;
  current_weight_kg?: string | number | null;
  baseline_weight_kg?: string | number | null;
  current_momentum?: string | number | null;
  baseline_momentum?: string | number | null;
  current_checkin_days?: string | number | null;
  baseline_checkin_days?: string | number | null;
}

function numberOrNull(value: string | number | null | undefined) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function buildProgressComparison(row: ProgressComparisonRow) {
  const daysTracked = Number(row.days_tracked ?? 0);
  const currentWeight = numberOrNull(row.current_weight_kg);
  const baselineWeight = numberOrNull(row.baseline_weight_kg);
  const currentMomentum = numberOrNull(row.current_momentum);
  const baselineMomentum = numberOrNull(row.baseline_momentum);
  const currentCheckinDays = Number(row.current_checkin_days ?? 0);
  const baselineCheckinDays = Number(row.baseline_checkin_days ?? 0);
  const hasComparison = daysTracked >= 30 && (baselineWeight !== null || baselineMomentum !== null || baselineCheckinDays > 0);
  const highlights: Array<{ key: string; label: string; message: string }> = [];

  if (currentWeight !== null && baselineWeight !== null) {
    const difference = currentWeight - baselineWeight;
    const helpfulChange = row.goal_type === "fat_loss" ? -difference : row.goal_type === "muscle_gain" ? difference : -Math.abs(difference);
    if (helpfulChange > 0.05) {
      highlights.push({
        key: "weight",
        label: "Weight progress",
        message: `${Math.abs(difference).toFixed(1)}kg closer to your goal than 30 days ago.`
      });
    } else if (row.goal_type === "maintenance" && Math.abs(difference) <= 1) {
      highlights.push({ key: "weight", label: "Weight consistency", message: "Your weight has stayed within a steady range." });
    }
  }

  if (currentMomentum !== null && baselineMomentum !== null && currentMomentum > baselineMomentum) {
    highlights.push({
      key: "momentum",
      label: "Momentum improved",
      message: `Your Momentum Score improved by ${Math.round(currentMomentum - baselineMomentum)} points.`
    });
  }

  if (hasComparison && currentCheckinDays > baselineCheckinDays) {
    highlights.push({
      key: "checkins",
      label: "More consistent",
      message: `You checked in on ${currentCheckinDays} days this week, up from ${baselineCheckinDays}.`
    });
  }

  if (hasComparison && !highlights.length) {
    highlights.push({
      key: "consistency",
      label: "Keep building",
      message: `You checked in on ${currentCheckinDays} days this week. Every check-in strengthens your baseline.`
    });
  }

  return {
    periodDays: 30,
    daysTracked,
    hasComparison,
    current: { weightKg: currentWeight, momentum: currentMomentum, checkinDays: currentCheckinDays },
    baseline: { weightKg: baselineWeight, momentum: baselineMomentum, checkinDays: baselineCheckinDays },
    highlights: highlights.slice(0, 3)
  };
}

export async function getProgressComparison(userId: string) {
  const result = await query<ProgressComparisonRow>(
    `
    with activity_dates as (
      select logged_at::date as activity_date from food_logs where user_id = $1 and logged_at >= current_date - interval '37 days'
      union select logged_at::date from weight_logs where user_id = $1 and logged_at >= current_date - interval '37 days'
      union select logged_at::date from water_logs where user_id = $1 and logged_at >= current_date - interval '37 days'
      union select logged_at::date from habit_logs where user_id = $1 and completed = true and logged_at >= current_date - interval '37 days'
      union select created_at::date from analytics_events where user_id = $1 and event_name = 'burn_log' and created_at >= current_date - interval '37 days'
      union select completed_at::date from trainer_missions where client_user_id = $1 and status = 'completed' and completed_at >= current_date - interval '37 days'
    )
    select u.goal_type,
      greatest(0, current_date - u.created_at::date) as days_tracked,
      (select weight_kg from weight_logs where user_id = u.id order by logged_at desc limit 1) as current_weight_kg,
      (select weight_kg from weight_logs
        where user_id = u.id and logged_at::date between current_date - 45 and current_date - 15
        order by abs(extract(epoch from (logged_at - (current_date - interval '30 days')))) limit 1) as baseline_weight_kg,
      (select score from compliance_scores where user_id = u.id order by calculated_for_date desc limit 1) as current_momentum,
      (select score from compliance_scores
        where user_id = u.id and calculated_for_date between current_date - 37 and current_date - 23
        order by abs(calculated_for_date - (current_date - 30)) limit 1) as baseline_momentum,
      (select count(*) from activity_dates where activity_date between current_date - 6 and current_date) as current_checkin_days,
      (select count(*) from activity_dates where activity_date between current_date - 36 and current_date - 30) as baseline_checkin_days
    from users u
    where u.id = $1
    `,
    [userId]
  );

  return buildProgressComparison(result.rows[0] ?? { days_tracked: 0 });
}

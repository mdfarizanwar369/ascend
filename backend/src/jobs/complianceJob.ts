import { calculateComplianceScore } from "../domain/compliance";
import { query } from "../db/pool";

export async function calculateDailyComplianceScores() {
  const users = await query<{ id: string }>("select id from users where primary_role = 'client' and status = 'active'");

  for (const user of users.rows) {
    const [food, weight, water, habits] = await Promise.all([
      query<{ count: string }>(
        "select count(*) from food_logs where user_id = $1 and logged_at::date = current_date",
        [user.id]
      ),
      query<{ count: string }>(
        "select count(*) from weight_logs where user_id = $1 and logged_at > now() - interval '7 days'",
        [user.id]
      ),
      query<{ total: string }>(
        "select coalesce(sum(amount_ml), 0) as total from water_logs where user_id = $1 and logged_at::date = current_date",
        [user.id]
      ),
      query<{ assigned: string; completed: string }>(
        `
        select count(h.id) as assigned,
          count(hl.id) filter (where hl.completed = true) as completed
        from habits h
        left join habit_logs hl on hl.habit_id = h.id and hl.logged_at::date = current_date
        where h.user_id = $1 and h.active = true
        `,
        [user.id]
      )
    ]);

    const score = calculateComplianceScore({
      foodLogsToday: Number(food.rows[0].count),
      weightLogsThisWeek: Number(weight.rows[0].count),
      waterMlToday: Number(water.rows[0].total),
      waterTargetMl: 2500,
      habitsAssignedToday: Number(habits.rows[0].assigned),
      habitsCompletedToday: Number(habits.rows[0].completed)
    });

    await query(
      `
      insert into compliance_scores (user_id, score, food_score, weight_score, water_score, habit_score, calculated_for_date)
      values ($1, $2, $3, $4, $5, $6, current_date)
      on conflict (user_id, calculated_for_date)
      do update set score = excluded.score, food_score = excluded.food_score,
        weight_score = excluded.weight_score, water_score = excluded.water_score,
        habit_score = excluded.habit_score
      `,
      [user.id, score.totalScore, score.foodScore, score.weightScore, score.waterScore, score.habitScore]
    );
  }
}


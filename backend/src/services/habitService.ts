import { query } from "../db/pool";

type HabitLogInput = {
  habitId: string;
  completed: boolean;
  loggedAt?: string;
};

export async function createOwnedHabitLog(userId: string, input: HabitLogInput) {
  const result = await query(
    `
    insert into habit_logs (habit_id, user_id, completed, logged_at)
    select h.id, $1, $3, coalesce($4, now())
    from habits h
    where h.id = $2 and h.user_id = $1 and h.active = true
    returning *
    `,
    [userId, input.habitId, input.completed, input.loggedAt ?? null]
  );

  return result.rows[0] ?? null;
}

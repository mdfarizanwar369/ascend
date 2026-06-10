import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool";
import { requireAuth } from "../middleware/auth";

export const habitsRouter = Router();

const habitSchema = z.object({
  name: z.string().min(2),
  frequency: z.enum(["daily", "weekly"]).default("daily")
});

const habitLogSchema = z.object({
  habitId: z.string().uuid(),
  completed: z.boolean().default(true),
  loggedAt: z.string().datetime().optional()
});

habitsRouter.post("/habits", requireAuth, async (req, res, next) => {
  try {
    const input = habitSchema.parse(req.body);
  const result = await query(
    "insert into habits (user_id, name, frequency) values ($1, $2, coalesce($3, 'daily')) returning *",
    [req.user!.id, input.name, input.frequency]
  );
  res.status(201).json({ habit: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

habitsRouter.get("/habits", requireAuth, async (req, res) => {
  const result = await query("select * from habits where user_id = $1 and active = true order by created_at", [req.user!.id]);
  res.json({ habits: result.rows });
});

habitsRouter.patch("/habits/:id", requireAuth, async (req, res) => {
  const result = await query(
    "update habits set name = coalesce($3, name), active = coalesce($4, active) where id = $1 and user_id = $2 returning *",
    [req.params.id, req.user!.id, req.body.name ?? null, req.body.active ?? null]
  );
  res.json({ habit: result.rows[0] });
});

habitsRouter.post("/habit-logs", requireAuth, async (req, res, next) => {
  try {
    const input = habitLogSchema.parse(req.body);
  const result = await query(
    "insert into habit_logs (habit_id, user_id, completed, logged_at) values ($1, $2, coalesce($3, true), coalesce($4, now())) returning *",
    [input.habitId, req.user!.id, input.completed, input.loggedAt ?? null]
  );
  res.status(201).json({ habitLog: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

habitsRouter.get("/habit-logs", requireAuth, async (req, res) => {
  const result = await query("select * from habit_logs where user_id = $1 order by logged_at desc limit 100", [req.user!.id]);
  res.json({ habitLogs: result.rows });
});

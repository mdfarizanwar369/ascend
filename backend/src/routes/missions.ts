import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";
import { requireActivePlan } from "../middleware/subscription";

export const missionsRouter = Router();

const missionSchema = z.object({
  title: z.string().trim().min(3).max(180),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

function canOversee(roles: string[]) {
  return roles.includes("admin") || roles.includes("owner");
}

async function canAccessClient(clientId: string, trainerId: string | undefined, roles: string[]) {
  const result = await query<{ assigned_trainer_id: string | null; primary_role: string; status: string }>(
    "select assigned_trainer_id, primary_role, status from users where id = $1",
    [clientId]
  );
  const client = result.rows[0];
  if (!client || client.primary_role !== "client" || client.status !== "active") return false;
  return canOversee(roles) || (!!trainerId && client.assigned_trainer_id === trainerId);
}

missionsRouter.get("/missions/today", requireAuth, async (req, res, next) => {
  try {
    const result = await query(
      `
      select m.*, trainer_user.full_name as trainer_name
      from trainer_missions m
      left join trainers t on t.id = m.trainer_id
      left join users trainer_user on trainer_user.id = t.user_id
      where m.client_user_id = $1
        and m.due_date <= current_date
        and m.status in ('open', 'completed')
      order by case when m.status = 'open' then 0 else 1 end, m.due_date desc, m.created_at desc
      limit 1
      `,
      [req.user!.id]
    );
    res.json({ mission: result.rows[0] ?? null });
  } catch (error) {
    next(error);
  }
});

missionsRouter.patch("/missions/:missionId/complete", requireAuth, async (req, res, next) => {
  try {
    const result = await query(
      `
      update trainer_missions
      set status = 'completed', completed_at = coalesce(completed_at, now()), updated_at = now()
      where id = $1
        and client_user_id = $2
      returning *
      `,
      [req.params.missionId, req.user!.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Mission not found" });
    res.json({ mission: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

missionsRouter.get(
  "/trainer/clients/:clientId/missions",
  requireAuth,
  requireActivePlan("trainer_pro"),
  requireRole(["trainer", "admin", "owner"]),
  async (req, res, next) => {
    try {
      const allowed = await canAccessClient(req.params.clientId, req.user!.trainerId, req.user!.roles);
      if (!allowed) return res.status(404).json({ error: "Client not found" });

      const result = await query(
        `
        select m.*, creator.full_name as created_by_name
        from trainer_missions m
        left join users creator on creator.id = m.created_by_user_id
        where m.client_user_id = $1
        order by m.due_date desc, m.created_at desc
        limit 20
        `,
        [req.params.clientId]
      );
      res.json({ missions: result.rows });
    } catch (error) {
      next(error);
    }
  }
);

missionsRouter.post(
  "/trainer/clients/:clientId/missions",
  requireAuth,
  requireActivePlan("trainer_pro"),
  requireRole(["trainer", "admin", "owner"]),
  async (req, res, next) => {
    try {
      const input = missionSchema.parse(req.body);
      const allowed = await canAccessClient(req.params.clientId, req.user!.trainerId, req.user!.roles);
      if (!allowed) return res.status(404).json({ error: "Client not found" });

      const clientResult = await query<{ assigned_trainer_id: string | null }>("select assigned_trainer_id from users where id = $1", [
        req.params.clientId
      ]);
      const trainerId = req.user!.trainerId ?? clientResult.rows[0]?.assigned_trainer_id ?? null;

      const result = await query(
        `
        insert into trainer_missions (client_user_id, trainer_id, created_by_user_id, title, due_date)
        values ($1, $2, $3, $4, coalesce($5::date, current_date))
        returning *
        `,
        [req.params.clientId, trainerId, req.user!.id, input.title, input.dueDate ?? null]
      );
      res.status(201).json({ mission: result.rows[0] });
    } catch (error) {
      next(error);
    }
  }
);

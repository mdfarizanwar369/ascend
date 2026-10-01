import { Router } from "express";
import { query } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";
import { z } from "zod";
import { getAdminGymScope, getTrainerGymId, scopeAllowsGym } from "../services/adminScopeService";

export const referralsRouter = Router();

referralsRouter.get("/referrals/validate/:code", async (req, res) => {
  const result = await query(
    `
    select rc.id, rc.code, rc.type, coalesce(g.name, trainer_gym.name) as gym_name, u.full_name as trainer_name
    from referral_codes rc
    left join gyms g on g.id = rc.gym_id
    left join trainers t on t.id = rc.trainer_id
    left join gyms trainer_gym on trainer_gym.id = t.gym_id
    left join users u on u.id = t.user_id
    where rc.code = $1 and rc.active = true
    `,
    [req.params.code.toUpperCase()]
  );

  if (!result.rows[0]) return res.status(404).json({ error: "Referral code not found" });
  res.json({ referral: result.rows[0] });
});

referralsRouter.post("/admin/referrals", requireAuth, requireRole(["admin", "owner"]), async (req, res) => {
  const input = z.object({
    code: z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9_-]+$/),
    type: z.enum(["gym", "trainer"]),
    gymId: z.string().uuid().nullable().optional(),
    trainerId: z.string().uuid().nullable().optional()
  }).parse(req.body);
  const { code, type, gymId, trainerId } = input;
  if ((type === "gym" && (!gymId || trainerId)) || (type === "trainer" && !trainerId)) {
    return res.status(400).json({ error: "Referral target does not match type" });
  }
  const targetGymId = trainerId ? await getTrainerGymId(trainerId) : gymId;
  if (!targetGymId || (gymId && gymId !== targetGymId)) return res.status(400).json({ error: "Invalid referral target" });
  const scope = await getAdminGymScope(req.user!);
  if (!scopeAllowsGym(scope, targetGymId)) return res.status(403).json({ error: "Gym is outside your admin scope" });
  const result = await query(
    "insert into referral_codes (code, type, gym_id, trainer_id, created_by_user_id) values ($1, $2, $3, $4, $5) returning *",
    [code.toUpperCase(), type, targetGymId, trainerId ?? null, req.user!.id]
  );
  res.status(201).json({ referral: result.rows[0] });
});

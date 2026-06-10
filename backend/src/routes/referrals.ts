import { Router } from "express";
import { query } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";

export const referralsRouter = Router();

referralsRouter.get("/referrals/validate/:code", async (req, res) => {
  const result = await query(
    `
    select rc.id, rc.code, rc.type, g.name as gym_name, u.full_name as trainer_name
    from referral_codes rc
    left join gyms g on g.id = rc.gym_id
    left join trainers t on t.id = rc.trainer_id
    left join users u on u.id = t.user_id
    where rc.code = $1 and rc.active = true
    `,
    [req.params.code.toUpperCase()]
  );

  if (!result.rows[0]) return res.status(404).json({ error: "Referral code not found" });
  res.json({ referral: result.rows[0] });
});

referralsRouter.post("/admin/referrals", requireAuth, requireRole(["admin", "owner"]), async (req, res) => {
  const { code, type, gymId, trainerId } = req.body;
  const result = await query(
    "insert into referral_codes (code, type, gym_id, trainer_id, created_by_user_id) values ($1, $2, $3, $4, $5) returning *",
    [code.toUpperCase(), type, gymId ?? null, trainerId ?? null, req.user!.id]
  );
  res.status(201).json({ referral: result.rows[0] });
});


import { Router } from "express";
import { query } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { completeOnboarding, onboardingSchema } from "../services/userService";

export const meRouter = Router();

meRouter.get("/me", requireAuth, async (req, res) => {
  const result = await query(
    `
    select u.*, trainer_user.full_name as assigned_trainer_name
    from users u
    left join trainers t on t.id = u.assigned_trainer_id
    left join users trainer_user on trainer_user.id = t.user_id
    where u.id = $1
    `,
    [req.user!.id]
  );
  res.json({ user: result.rows[0], roles: req.user!.roles });
});

meRouter.post("/me/onboarding", requireAuth, async (req, res, next) => {
  try {
    const input = onboardingSchema.parse(req.body);
    const user = await completeOnboarding(req.user!.id, input);
    res.json({ user });
  } catch (error) {
    next(error);
  }
});

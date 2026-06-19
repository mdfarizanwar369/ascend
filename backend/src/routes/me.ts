import { Router } from "express";
import { query } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { acknowledgeGoalMilestone, completeOnboarding, getGoalStatus, guideProfileSchema, onboardingSchema, updateGuideProfile } from "../services/userService";

export const meRouter = Router();

meRouter.get("/me", requireAuth, async (req, res) => {
  const result = await query(
    `
    select u.*, trainer_user.full_name as assigned_trainer_name, current_trainer.status as trainer_status
    from users u
    left join trainers current_trainer on current_trainer.user_id = u.id
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

meRouter.patch("/me/guide-profile", requireAuth, async (req, res, next) => {
  try {
    const input = guideProfileSchema.parse(req.body);
    const user = await updateGuideProfile(req.user!.id, input);
    res.json({ user });
  } catch (error) {
    next(error);
  }
});

meRouter.get("/me/goal-status", requireAuth, async (req, res, next) => {
  try {
    res.json({ goalStatus: await getGoalStatus(req.user!.id) });
  } catch (error) {
    next(error);
  }
});

meRouter.patch("/me/goal-milestones/:milestoneId/acknowledge", requireAuth, async (req, res, next) => {
  try {
    const milestone = await acknowledgeGoalMilestone(req.user!.id, req.params.milestoneId);
    if (!milestone) return res.status(404).json({ error: "Milestone not found" });
    res.json({ milestone });
  } catch (error) {
    next(error);
  }
});

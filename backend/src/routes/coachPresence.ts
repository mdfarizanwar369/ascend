import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth";
import { requireActivePlan } from "../middleware/subscription";
import { canManageClient } from "../services/clientAccessService";
import {
  dismissCoachPresence,
  getCoachPresenceFeed,
  getCoachPresenceForTrainer,
  pauseCoachPresenceForClient,
  updateCoachPresenceStyle
} from "../services/coachPresenceService";

export const coachPresenceRouter = Router();

const styleSchema = z.object({
  style: z.enum(["motivational", "balanced", "minimal"])
});

const pauseSchema = z.object({
  pauseHours: z.number().int().min(1).max(168).nullable()
});

coachPresenceRouter.get("/coach-presence", requireAuth, async (req, res, next) => {
  try {
    res.json(await getCoachPresenceFeed(req.user!.id));
  } catch (error) {
    next(error);
  }
});

coachPresenceRouter.patch("/coach-presence/settings", requireAuth, requireActivePlan("premium"), async (req, res, next) => {
  try {
    const input = styleSchema.parse(req.body);
    res.json({ settings: await updateCoachPresenceStyle(req.user!.id, input.style) });
  } catch (error) {
    next(error);
  }
});

coachPresenceRouter.post("/coach-presence/:messageId/dismiss", requireAuth, requireActivePlan("premium"), async (req, res, next) => {
  try {
    await dismissCoachPresence(req.user!.id, req.params.messageId);
    res.json({ dismissed: true });
  } catch (error) {
    next(error);
  }
});

coachPresenceRouter.get(
  "/trainer/clients/:clientId/coach-presence",
  requireAuth,
  requireActivePlan("trainer_pro"),
  requireRole(["trainer", "admin", "owner"]),
  async (req, res, next) => {
    try {
      if (!await canManageClient(req.user!, req.params.clientId)) return res.status(404).json({ error: "Client not found" });
      res.json(await getCoachPresenceForTrainer(req.params.clientId));
    } catch (error) {
      next(error);
    }
  }
);

coachPresenceRouter.patch(
  "/trainer/clients/:clientId/coach-presence",
  requireAuth,
  requireActivePlan("trainer_pro"),
  requireRole(["trainer", "admin", "owner"]),
  async (req, res, next) => {
    try {
      if (!await canManageClient(req.user!, req.params.clientId)) return res.status(404).json({ error: "Client not found" });
      const input = pauseSchema.parse(req.body);
      res.json({ settings: await pauseCoachPresenceForClient(req.params.clientId, req.user!.id, input.pauseHours) });
    } catch (error) {
      next(error);
    }
  }
);

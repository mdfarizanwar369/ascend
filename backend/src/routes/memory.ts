import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { requireActivePlan } from "../middleware/subscription";
import { canManageClient } from "../services/clientAccessService";
import { getAscendMemoryTimeline } from "../services/ascendMemoryService";

export const memoryRouter = Router();

memoryRouter.get("/memory/me", requireAuth, requireActivePlan("premium"), async (req, res, next) => {
  try {
    res.json(await getAscendMemoryTimeline(req.user!.id));
  } catch (error) {
    next(error);
  }
});

memoryRouter.get(
  "/trainer/clients/:clientId/memory",
  requireAuth,
  requireActivePlan("trainer_pro"),
  requireRole(["trainer", "admin", "owner"]),
  async (req, res, next) => {
    try {
      if (!await canManageClient(req.user!, req.params.clientId)) return res.status(404).json({ error: "Client not found" });
      res.json(await getAscendMemoryTimeline(req.params.clientId));
    } catch (error) {
      next(error);
    }
  }
);

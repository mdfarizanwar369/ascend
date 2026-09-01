import type { NextFunction, Request, Response } from "express";
import { ascendCoachV1Enabled, isAscendCoachShellEligible } from "../services/ascendCoachPolicyService";

type Dependencies = {
  featureEnabled: typeof ascendCoachV1Enabled;
};

const defaults: Dependencies = {
  featureEnabled: ascendCoachV1Enabled
};

export function createRequireAscendCoachShellAccess(dependencies: Dependencies = defaults) {
  return function requireAscendCoachShellAccess(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!dependencies.featureEnabled()) {
      res.status(404).json({ error: "Ascend Coach is unavailable", code: "feature_disabled" });
      return;
    }
    if (!isAscendCoachShellEligible(req.user)) {
      res.status(403).json({ error: "Trainer or Platform Owner access required", code: "coach_role_required" });
      return;
    }
    next();
  };
}

export const requireAscendCoachShellAccess = createRequireAscendCoachShellAccess();

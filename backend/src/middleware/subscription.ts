import { NextFunction, Request, Response } from "express";
import { SubscriptionPlan } from "@ascend/shared";
import { getEffectiveEntitlement } from "../services/entitlementService";

const planRank: Record<SubscriptionPlan, number> = {
  free: 0,
  premium: 1,
  trainer_pro: 2
};

export function requireActivePlan(requiredPlan: Exclude<SubscriptionPlan, "free">) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Authentication required" });
      if (
        req.user.primaryRole === "owner" ||
        req.user.primaryRole === "admin" ||
        req.user.roles.includes("owner") ||
        req.user.roles.includes("admin")
      ) {
        return next();
      }

      const activePlan = (await getEffectiveEntitlement(req.user.id)).plan;
      if (planRank[activePlan] < planRank[requiredPlan]) {
        return res.status(402).json({
          error: `${requiredPlan === "trainer_pro" ? "Trainer Pro" : "Premium"} plan required`,
          requiredPlan,
          activePlan
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

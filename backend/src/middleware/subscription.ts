import { NextFunction, Request, Response } from "express";
import { SubscriptionPlan } from "@ascend/shared";
import { query } from "../db/pool";

const planRank: Record<SubscriptionPlan, number> = {
  free: 0,
  premium: 1,
  trainer_pro: 2
};

export function requireActivePlan(requiredPlan: Exclude<SubscriptionPlan, "free">) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Authentication required" });
    if (req.user.roles.includes("owner") || req.user.roles.includes("admin")) return next();

    const result = await query<{ plan: SubscriptionPlan; status: string }>(
      `
      select plan, status
      from subscriptions
      where user_id = $1 and status in ('active', 'trialing')
      order by created_at desc
      limit 1
      `,
      [req.user.id]
    );

    const activePlan = result.rows[0]?.plan ?? "free";
    if (planRank[activePlan] < planRank[requiredPlan]) {
      return res.status(402).json({
        error: `${requiredPlan === "trainer_pro" ? "Trainer Pro" : "Premium"} plan required`,
        requiredPlan,
        activePlan
      });
    }

    next();
  };
}

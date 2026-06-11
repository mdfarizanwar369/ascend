import { SubscriptionPlan } from "@ascend/shared";

export const planRank: Record<SubscriptionPlan, number> = {
  free: 0,
  premium: 1,
  trainer_pro: 2
};

export function isUsableSubscriptionStatus(status?: string | null) {
  return status === "active" || status === "trialing";
}

export function usablePlan(plan: SubscriptionPlan, status?: string | null): SubscriptionPlan {
  return isUsableSubscriptionStatus(status) ? plan : "free";
}

export function formatPlan(plan?: SubscriptionPlan | null) {
  if (plan === "trainer_pro") return "Trainer Pro";
  if (plan === "premium") return "Premium";
  return "Free Plan";
}

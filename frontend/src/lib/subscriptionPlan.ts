import { SubscriptionPlan } from "@ascend/shared";

export const planRank: Record<SubscriptionPlan, number> = {
  free: 0,
  premium: 1,
  trainer_pro: 2
};

export function isUsableSubscriptionStatus(status?: string | null, currentPeriodEnd?: string | null) {
  if (status === "active" || status === "trialing") return true;
  if (status !== "canceled" || !currentPeriodEnd) return false;
  const end = new Date(currentPeriodEnd).getTime();
  return Number.isFinite(end) && end > Date.now();
}

export function usablePlan(plan: SubscriptionPlan, status?: string | null, currentPeriodEnd?: string | null): SubscriptionPlan {
  return isUsableSubscriptionStatus(status, currentPeriodEnd) ? plan : "free";
}

export function formatPlan(plan?: SubscriptionPlan | null, t?: (key: string) => string) {
  if (plan === "trainer_pro") return t ? t("common.trainerPro") : "Trainer Pro";
  if (plan === "premium") return t ? t("common.premium") : "Premium";
  return t ? t("common.freePlan") : "Free Plan";
}

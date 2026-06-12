"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Lock, Sparkles } from "lucide-react";
import { SubscriptionPlan } from "@ascend/shared";
import { getMe, getMySubscription } from "@/lib/ascendApi";
import { planRank, usablePlan } from "@/lib/subscriptionPlan";

function planLabel(plan: Exclude<SubscriptionPlan, "free">) {
  return plan === "trainer_pro" ? "Trainer Pro" : "Premium";
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function RoleGate({
  allowedRoles,
  children,
  fallbackTitle,
  fallbackMessage,
  requiredPlan,
  planFeature
}: {
  allowedRoles: string[];
  children: React.ReactNode;
  fallbackTitle: string;
  fallbackMessage: string;
  requiredPlan?: Exclude<SubscriptionPlan, "free">;
  planFeature?: string;
}) {
  const [state, setState] = useState<"loading" | "allowed" | "role-blocked" | "plan-blocked">("loading");
  const allowedRoleKey = useMemo(() => allowedRoles.join("|"), [allowedRoles]);

  useEffect(() => {
    let isMounted = true;
    const allowedRoleSet = new Set(allowedRoleKey.split("|"));

    async function checkAccess() {
      const me = await getMe();
      const roles = Array.isArray(me.roles) ? me.roles : [];
      const primaryRole = me.user.primary_role;
      const hasRole = roles.some((role) => allowedRoleSet.has(role)) || Boolean(primaryRole && allowedRoleSet.has(primaryRole));
      const isOwnerOrAdmin = roles.some((role) => role === "owner" || role === "admin") || primaryRole === "owner" || primaryRole === "admin";

      if (!hasRole) return "role-blocked";
      if (!requiredPlan || isOwnerOrAdmin) return "allowed";

      try {
        const subscription = await getMySubscription();
        const activePlan = usablePlan(subscription.subscription.plan, subscription.subscription.status);
        return planRank[activePlan] >= planRank[requiredPlan] ? "allowed" : "plan-blocked";
      } catch {
        return "plan-blocked";
      }
    }

    async function checkAccessWithRetry() {
      let lastError: unknown;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          return await checkAccess();
        } catch (error) {
          lastError = error;
          await wait(700 * (attempt + 1));
        }
      }
      throw lastError;
    }

    function refreshAccess() {
      setState("loading");
      checkAccessWithRetry()
      .then((nextState) => {
        if (!isMounted) return;
        setState(nextState);
      })
      .catch(() => {
        if (isMounted) setState("role-blocked");
      });
    }

    function refreshAfterBack() {
      refreshAccess();
    }

    refreshAccess();
    window.addEventListener("pageshow", refreshAfterBack);

    return () => {
      isMounted = false;
      window.removeEventListener("pageshow", refreshAfterBack);
    };
  }, [allowedRoleKey, requiredPlan]);

  if (state === "loading") {
    return <p className="mt-4 rounded-lg border border-line bg-surface p-4 text-sm text-zinc-300">Checking account access...</p>;
  }

  if (state === "role-blocked") {
    return (
      <section className="mt-4 rounded-lg border border-line bg-surface p-4">
        <h1 className="text-xl font-semibold">{fallbackTitle}</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-400">{fallbackMessage}</p>
        <Link href="/dashboard" className="mt-4 flex h-12 items-center justify-center rounded-lg bg-lime font-semibold text-ink">
          Back to client dashboard
        </Link>
      </section>
    );
  }

  if (state === "plan-blocked" && requiredPlan) {
    return (
      <section className="mt-4 rounded-lg border border-lime/40 bg-lime/10 p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-lime text-ink">
            <Lock size={20} />
          </span>
          <div>
            <p className="text-sm text-zinc-400">{planFeature ?? "Feature"}</p>
            <h1 className="text-xl font-semibold">{planLabel(requiredPlan)} required</h1>
            <div className="mt-3 flex items-start gap-2">
              <Sparkles className="mt-0.5 shrink-0 text-lime" size={18} />
              <p className="text-sm leading-6 text-zinc-300">
                This feature is part of {planLabel(requiredPlan)}. You can activate a test plan from the subscription screen now.
              </p>
            </div>
            <Link href="/subscription" className="mt-4 flex h-12 items-center justify-center rounded-lg bg-lime font-semibold text-ink">
              View plans
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return <>{children}</>;
}

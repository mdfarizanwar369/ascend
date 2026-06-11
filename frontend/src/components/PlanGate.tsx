"use client";

import Link from "next/link";
import { Lock, Sparkles } from "lucide-react";
import { SubscriptionPlan } from "@ascend/shared";
import { useEffect, useMemo, useState } from "react";
import { BackButton } from "@/components/BackButton";
import { getMe, getMySubscription } from "@/lib/ascendApi";
import { planRank, usablePlan } from "@/lib/subscriptionPlan";

function planLabel(plan: Exclude<SubscriptionPlan, "free">) {
  return plan === "trainer_pro" ? "Trainer Pro" : "Premium";
}

export function PlanGate({
  requiredPlan,
  children,
  feature,
  fallbackHref = "/dashboard"
}: {
  requiredPlan: Exclude<SubscriptionPlan, "free">;
  children: React.ReactNode;
  feature: string;
  fallbackHref?: string;
}) {
  const [activePlan, setActivePlan] = useState<SubscriptionPlan>("free");
  const [roles, setRoles] = useState<string[]>([]);
  const [primaryRole, setPrimaryRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function loadAccess() {
    const [subscriptionResult, profileResult] = await Promise.allSettled([getMySubscription(), getMe()]);

    if (subscriptionResult.status === "fulfilled") {
      setActivePlan(usablePlan(subscriptionResult.value.subscription.plan, subscriptionResult.value.subscription.status));
    }

    if (profileResult.status === "fulfilled") {
      setRoles(Array.isArray(profileResult.value.roles) ? profileResult.value.roles : []);
      setPrimaryRole(profileResult.value.user.primary_role ?? null);
    }

    setIsLoading(false);
  }

  useEffect(() => {
    let isMounted = true;

    loadAccess().catch(() => {
      if (!isMounted) return;
      setActivePlan("free");
      setRoles([]);
      setPrimaryRole(null);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    function refreshAfterBack() {
      setIsLoading(true);
      loadAccess().catch(() => setIsLoading(false));
    }

    window.addEventListener("pageshow", refreshAfterBack);

    return () => {
      window.removeEventListener("pageshow", refreshAfterBack);
    };
  }, []);

  const hasAccess = useMemo(() => {
    if (roles.includes("owner") || roles.includes("admin") || primaryRole === "owner" || primaryRole === "admin") return true;
    return planRank[activePlan] >= planRank[requiredPlan];
  }, [activePlan, primaryRole, requiredPlan, roles]);

  if (isLoading) {
    return (
      <main className="min-h-screen bg-ink px-4 py-5 text-white">
        <div className="mx-auto max-w-md">
          <section className="rounded-lg border border-line bg-surface p-4 text-sm text-zinc-300">Checking your plan...</section>
        </div>
      </main>
    );
  }

  if (hasAccess) return <>{children}</>;

  return (
    <main className="min-h-screen bg-ink px-4 py-5 text-white">
      <div className="mx-auto max-w-md">
        <header className="flex items-center gap-3 py-3">
          <BackButton fallbackHref={fallbackHref} />
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-lime text-ink">
            <Lock size={20} />
          </span>
          <div>
            <p className="text-sm text-zinc-400">{feature}</p>
            <h1 className="text-2xl font-semibold">{planLabel(requiredPlan)} required</h1>
          </div>
        </header>

        <section className="mt-4 rounded-lg border border-lime/40 bg-lime/10 p-4">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 text-lime" size={20} />
            <div>
              <p className="font-semibold text-lime">This feature is part of {planLabel(requiredPlan)}.</p>
              <p className="mt-2 text-sm leading-6 text-zinc-300">
                You can activate a test plan from the subscription screen now. ToyyibPay live payment can be connected later.
              </p>
            </div>
          </div>
        </section>

        <Link href="/subscription" className="mt-4 flex h-12 items-center justify-center rounded-lg bg-lime font-semibold text-ink">
          View plans
        </Link>
      </div>
    </main>
  );
}

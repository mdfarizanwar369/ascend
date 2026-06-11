"use client";

import { useEffect, useState } from "react";
import { Check, CreditCard, ShieldCheck, Sparkles } from "lucide-react";
import { PLANS, SubscriptionPlan } from "@ascend/shared";
import { activateDemoSubscription, createCheckout, getMySubscription } from "@/lib/ascendApi";
import { BackButton } from "@/components/BackButton";
import { formatPlan, usablePlan } from "@/lib/subscriptionPlan";

const features: Record<SubscriptionPlan, string[]> = {
  free: ["Weight tracking", "Water tracking", "Basic logs"],
  premium: ["AI food photo estimates", "AI nutrition coach", "Weekly reports", "Trainer accountability"],
  trainer_pro: ["Trainer dashboard", "Client risk alerts", "AI weekly check-ins", "Client messaging"]
};

export function SubscriptionClient() {
  const [activePlan, setActivePlan] = useState<SubscriptionPlan>("free");
  const [status, setStatus] = useState("Loading your subscription...");
  const [isLoadingPlan, setIsLoadingPlan] = useState<SubscriptionPlan | null>(null);

  async function loadSubscription() {
    const response = await getMySubscription();
    const nextPlan = usablePlan(response.subscription.plan, response.subscription.status);
    setActivePlan(nextPlan);
    setStatus(
      nextPlan !== "free"
        ? `Current plan: ${formatPlan(nextPlan)}`
        : "Current plan: Free Plan"
    );
  }

  useEffect(() => {
    loadSubscription().catch(() => setStatus("Log in to manage your subscription."));
  }, []);

  async function startCheckout(plan: Exclude<SubscriptionPlan, "free">) {
    setIsLoadingPlan(plan);
    setStatus("Creating ToyyibPay checkout...");

    try {
      const response = await createCheckout(plan);
      window.location.href = response.checkoutUrl;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not create checkout.");
      setIsLoadingPlan(null);
    }
  }

  async function activateDemo(plan: Exclude<SubscriptionPlan, "free">) {
    setIsLoadingPlan(plan);
    setStatus("Activating test subscription...");

    try {
      const response = await activateDemoSubscription(plan);
      setActivePlan(response.subscription.plan);
      setStatus(`${formatPlan(response.subscription.plan)} is active for testing.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not activate test subscription.");
    } finally {
      setIsLoadingPlan(null);
    }
  }

  return (
    <main className="min-h-screen bg-ink px-4 py-5 text-white">
      <div className="mx-auto max-w-md">
        <header className="flex items-center gap-3 py-3">
          <BackButton fallbackHref="/dashboard" />
          <div>
            <p className="text-sm text-zinc-400">Subscriptions</p>
            <h1 className="text-2xl font-semibold">Upgrade accountability</h1>
          </div>
        </header>

        <section className="mt-4 rounded-lg border border-lime/40 bg-lime/10 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 text-lime" size={20} />
            <div>
              <p className="text-sm font-semibold text-lime">{status}</p>
              <p className="mt-1 text-sm leading-6 text-zinc-300">Payments are ToyyibPay-first for Malaysia. Stripe can be added later through the same checkout layer.</p>
            </div>
          </div>
        </section>

        <section className="mt-4 space-y-3">
          {(Object.keys(PLANS) as SubscriptionPlan[]).map((plan) => {
            const isActive = activePlan === plan;
            const paidPlan = plan !== "free";
            const checkoutPlan = plan as Exclude<SubscriptionPlan, "free">;
            return (
              <article key={plan} className={`rounded-lg border p-4 ${isActive ? "border-lime bg-lime/10" : "border-line bg-surface"}`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold">{PLANS[plan].label}</h2>
                    <p className="mt-1 text-sm text-zinc-400">{PLANS[plan].audience}</p>
                  </div>
                  <p className="text-right text-xl font-semibold text-lime">RM{PLANS[plan].priceRm}/mo</p>
                </div>
                <div className="mt-4 space-y-2">
                  {features[plan].map((feature) => (
                    <div key={feature} className="flex items-center gap-2 text-sm text-zinc-300">
                      <Check size={16} className="text-lime" />
                      {feature}
                    </div>
                  ))}
                </div>

                {isActive ? (
                  <div className="mt-4 flex h-11 items-center justify-center rounded-lg border border-lime/40 bg-ink font-semibold text-lime">
                    <ShieldCheck className="mr-2" size={18} />
                    Current plan
                  </div>
                ) : paidPlan ? (
                  <div className="mt-4 grid grid-cols-1 gap-2">
                    <button
                      type="button"
                      disabled={isLoadingPlan !== null}
                      onClick={() => startCheckout(checkoutPlan)}
                      className="flex h-11 items-center justify-center rounded-lg bg-lime font-semibold text-ink disabled:opacity-60"
                    >
                      <CreditCard className="mr-2" size={18} />
                      {isLoadingPlan === plan ? "Opening..." : "Checkout"}
                    </button>
                    <button
                      type="button"
                      disabled={isLoadingPlan !== null}
                      onClick={() => activateDemo(checkoutPlan)}
                      className="flex h-11 items-center justify-center rounded-lg border border-line bg-ink font-semibold text-white disabled:opacity-60"
                    >
                      <Sparkles className="mr-2" size={18} />
                      Activate test plan
                    </button>
                  </div>
                ) : (
                  <div className="mt-4 flex h-11 items-center justify-center rounded-lg border border-line bg-ink font-semibold text-zinc-300">
                    Included
                  </div>
                )}
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}

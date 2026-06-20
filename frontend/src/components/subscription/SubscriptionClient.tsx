"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, CreditCard, ExternalLink, ShieldCheck } from "lucide-react";
import { PLANS, SubscriptionPlan } from "@ascend/shared";
import { createCheckout, getBillingPortal, getMe, getMySubscription } from "@/lib/ascendApi";
import { BackButton } from "@/components/BackButton";
import { formatPlan, usablePlan } from "@/lib/subscriptionPlan";
import { PublicFooter } from "@/components/legal/PublicFooter";

const features: Record<SubscriptionPlan, string[]> = {
  free: ["Weight tracking", "Water tracking", "Basic logs"],
  premium: ["AI food photo estimates", "AI Coach guidance", "Weekly reports", "Human Coach ready"],
  trainer_pro: ["Trainer dashboard", "Client risk alerts", "AI weekly check-ins", "Client messaging"]
};

function formatBillingDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export function SubscriptionClient() {
  const [activePlan, setActivePlan] = useState<SubscriptionPlan>("free");
  const [backHref, setBackHref] = useState("/dashboard");
  const [status, setStatus] = useState("Loading your subscription...");
  const [isLoadingPlan, setIsLoadingPlan] = useState<SubscriptionPlan | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [billingStatus, setBillingStatus] = useState("active");
  const [currentPeriodEnd, setCurrentPeriodEnd] = useState<string | null>(null);
  const hasHostedBilling = provider === "stripe" || provider === "lemonsqueezy";

  const loadSubscription = useCallback(async () => {
    const [response, profile] = await Promise.all([getMySubscription(), getMe().catch(() => null)]);
    const nextPlan = usablePlan(
      response.subscription.plan,
      response.subscription.status,
      response.subscription.current_period_end
    );
    const roles = profile?.roles ?? [];
    const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const returnedFromCheckout =
      params?.has("status_id") ||
      params?.has("billcode") ||
      params?.has("transaction_id") ||
      params?.has("pilot_reference") ||
      params?.get("checkout") === "success";

    if (roles.includes("owner") || roles.includes("admin")) {
      setBackHref("/admin");
    } else if (roles.includes("trainer")) {
      setBackHref("/trainer");
    } else {
      setBackHref("/dashboard");
    }

    setActivePlan(nextPlan);
    setProvider(response.subscription.provider ?? null);
    setBillingStatus(response.subscription.status);
    setCurrentPeriodEnd(response.subscription.current_period_end ?? null);
    const billingDate = formatBillingDate(response.subscription.current_period_end ?? null);
    if (response.subscription.status === "canceled" && nextPlan !== "free") {
      setStatus(`Subscription cancelled. ${formatPlan(nextPlan)} access remains until ${billingDate ?? "the end of your paid period"}.`);
    } else if (response.subscription.status === "past_due") {
      setStatus("Payment needs attention. Open billing to update your payment method or complete checkout.");
    } else if (response.subscription.status === "expired") {
      setStatus("Your paid subscription has ended. Choose a plan below to restart it.");
    } else if (nextPlan !== "free") {
      setStatus(`Current plan: ${formatPlan(nextPlan)}${billingDate ? `. Renews on ${billingDate}.` : "."}`);
    } else if (returnedFromCheckout) {
      setStatus("Payment received. Your plan will unlock as soon as the payment provider confirms the subscription.");
    } else {
      setStatus("Current plan: Free Plan");
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const returnedFromCheckout = new URLSearchParams(window.location.search).get("checkout") === "success";

    async function refresh() {
      const attempts = returnedFromCheckout ? 5 : 1;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (!isMounted) return;
        try {
          await loadSubscription();
          if (!returnedFromCheckout) return;
          const latest = await getMySubscription();
          if (["active", "trialing"].includes(latest.subscription.status)) return;
        } catch {
          if (attempt === attempts - 1 && isMounted) setStatus("Log in to manage your subscription.");
        }
        await new Promise((resolve) => window.setTimeout(resolve, 2_000));
      }
    }

    void refresh();
    return () => { isMounted = false; };
  }, [loadSubscription]);

  async function startCheckout(plan: Exclude<SubscriptionPlan, "free">) {
    setIsLoadingPlan(plan);
    setStatus("Opening secure checkout...");

    try {
      const response = await createCheckout(plan);
      window.location.href = response.checkoutUrl;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not create checkout.");
      setIsLoadingPlan(null);
    }
  }

  async function openBillingPortal() {
    setStatus("Opening your billing portal...");
    try {
      const response = await getBillingPortal();
      window.location.href = response.url;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not open the billing portal.");
    }
  }

  return (
    <main className="min-h-screen bg-ink px-4 py-5 text-white">
      <div className="mx-auto max-w-md">
        <header className="flex items-center gap-3 py-3">
          <BackButton fallbackHref={backHref} />
          <div>
            <p className="text-sm text-zinc-400">Subscriptions</p>
            <h1 className="text-2xl font-semibold">Upgrade accountability</h1>
          </div>
        </header>

        <section aria-live="polite" className="mt-4 rounded-lg border border-lime/40 bg-lime/10 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 text-lime" size={20} />
            <div>
              <p className="text-sm font-semibold text-lime">{status}</p>
              <p className="mt-1 text-sm leading-6 text-zinc-300">
                Pay securely by card. Stripe manages checkout, recurring billing, receipts, renewals, and cancellations.
              </p>
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
                  <div className="mt-4 space-y-2">
                    <div className="flex h-11 items-center justify-center rounded-lg border border-lime/40 bg-ink font-semibold text-lime">
                      <ShieldCheck className="mr-2" size={18} />
                      Current plan
                    </div>
                    {hasHostedBilling ? (
                      <button
                        type="button"
                        onClick={openBillingPortal}
                        className="flex h-11 w-full items-center justify-center rounded-lg border border-line bg-ink font-semibold text-zinc-200"
                      >
                        <ExternalLink className="mr-2" size={18} />
                        Manage billing
                      </button>
                    ) : null}
                  </div>
                ) : paidPlan ? (
                  <div className="mt-4 grid grid-cols-1 gap-2">
                    <button
                      type="button"
                      disabled={isLoadingPlan !== null || (hasHostedBilling && billingStatus === "past_due")}
                      onClick={() => startCheckout(checkoutPlan)}
                      className="flex h-11 items-center justify-center rounded-lg bg-lime font-semibold text-ink disabled:opacity-60"
                    >
                      <CreditCard className="mr-2" size={18} />
                      {isLoadingPlan === plan ? "Opening..." : "Subscribe monthly"}
                    </button>
                    {hasHostedBilling && billingStatus === "past_due" ? (
                      <button
                        type="button"
                        onClick={openBillingPortal}
                        className="flex h-11 w-full items-center justify-center rounded-lg border border-line bg-ink font-semibold text-zinc-200"
                      >
                        <ExternalLink className="mr-2" size={18} />
                        Fix payment
                      </button>
                    ) : null}
                    <p className="rounded-lg border border-line bg-ink p-3 text-center text-sm text-zinc-400">
                      Pilot access can still be approved manually by a trainer or gym owner.
                    </p>
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
        <p className="mt-5 text-center text-xs leading-5 text-zinc-500">
          By subscribing, you agree to the monthly renewal and cancellation terms shown at checkout.
        </p>
        {billingStatus === "canceled" && currentPeriodEnd ? (
          <p className="mt-2 text-center text-xs text-zinc-500">You can reactivate from Manage billing before access ends.</p>
        ) : null}
        <PublicFooter compact />
      </div>
    </main>
  );
}

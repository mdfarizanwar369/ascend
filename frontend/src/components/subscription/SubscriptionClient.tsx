"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, CreditCard, ExternalLink, ShieldCheck, XCircle } from "lucide-react";
import { PLANS, SubscriptionPlan } from "@ascend/shared";
import { cancelSubscription, createCheckout, getBillingPortal, getMe, getMySubscription, verifyGooglePlaySubscription } from "@/lib/ascendApi";
import { BackButton } from "@/components/BackButton";
import { formatPlan, usablePlan } from "@/lib/subscriptionPlan";
import { PublicFooter } from "@/components/legal/PublicFooter";
import { getNativeBillingMessage, shouldHideHostedBilling, shouldUseAndroidPlayBilling } from "@/lib/billingPlatform";
import {
  acknowledgeNativeGooglePlayPurchase,
  getNativeGooglePlayProducts,
  getNativeGooglePlayPurchases,
  NativeGooglePlayProduct,
  openNativeGooglePlaySubscriptions,
  startNativeGooglePlayPurchase,
} from "@/lib/googlePlayBilling";

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
  const [nativeProducts, setNativeProducts] = useState<NativeGooglePlayProduct[]>([]);
  const [isNativeProductsLoading, setIsNativeProductsLoading] = useState(false);
  const hasHostedBilling = provider === "stripe" || provider === "lemonsqueezy";
  const isGooglePlaySubscription = provider === "google_play";
  const hideHostedBilling = shouldHideHostedBilling();
  const nativePlayBilling = shouldUseAndroidPlayBilling();
  const nativeBillingMessage = getNativeBillingMessage();
  const didAttemptNativeRestore = useRef(false);
  const nativeProductIds = useMemo(() => ["ascend_premium_monthly", "ascend_premium_yearly"], []);

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

  useEffect(() => {
    if (!nativePlayBilling) {
      setNativeProducts([]);
      return;
    }

    let mounted = true;
    setIsNativeProductsLoading(true);
    getNativeGooglePlayProducts(nativeProductIds)
      .then((response) => {
        if (!mounted) return;
        setNativeProducts(response.products ?? []);
      })
      .catch(() => {
        if (!mounted) return;
        setNativeProducts([]);
      })
      .finally(() => mounted && setIsNativeProductsLoading(false));

    return () => {
      mounted = false;
    };
  }, [nativePlayBilling, nativeProductIds]);

  async function startCheckout(plan: Exclude<SubscriptionPlan, "free">) {
    if (nativePlayBilling) {
      setStatus(plan === "trainer_pro" ? "Trainer Pro upgrades are not available in the Android app yet." : "Choose a Google Play option below.");
      return;
    }

    if (hideHostedBilling) {
      setStatus(nativeBillingMessage ?? "Premium upgrades are not available in this app build yet.");
      return;
    }

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

  const syncExistingGooglePlayPurchase = useCallback(async (options: { silent?: boolean } = {}) => {
    try {
      const response = await getNativeGooglePlayPurchases();
      const purchase = response.purchases.find((entry) => entry.productId);
      if (!purchase) return false;

      const verification = await verifyGooglePlaySubscription({
        purchaseToken: purchase.purchaseToken,
        productId: purchase.productId,
        packageName: purchase.packageName ?? undefined,
      });

      if (verification.purchase.acknowledgementState === "pending") {
        await acknowledgeNativeGooglePlayPurchase(purchase.purchaseToken);
      }

      await loadSubscription();
      if (!options.silent) {
        setStatus("Your Google Play subscription is now active.");
      }
      return true;
    } catch (error) {
      if (!options.silent) {
        setStatus(error instanceof Error ? error.message : "Google Play purchase could not be restored.");
      }
      return false;
    }
  }, [loadSubscription]);

  useEffect(() => {
    if (!nativePlayBilling) return;
    if (didAttemptNativeRestore.current) return;
    if (activePlan !== "free") return;

    didAttemptNativeRestore.current = true;
    void syncExistingGooglePlayPurchase({ silent: true });
  }, [activePlan, nativePlayBilling, syncExistingGooglePlayPurchase]);

  async function startNativePlayCheckout(product: NativeGooglePlayProduct) {
    setIsLoadingPlan("premium");
    setStatus("Opening Google Play...");

    try {
      const purchase = await startNativeGooglePlayPurchase(product.productId);
      const verification = await verifyGooglePlaySubscription({
        purchaseToken: purchase.purchase.purchaseToken,
        productId: purchase.purchase.productId || product.productId,
        packageName: purchase.purchase.packageName ?? undefined,
      });

      if (verification.purchase.acknowledgementState === "pending") {
        await acknowledgeNativeGooglePlayPurchase(purchase.purchase.purchaseToken);
      }

      await loadSubscription();
      setStatus("Premium is now active through Google Play.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Google Play checkout could not be completed.");
    } finally {
      setIsLoadingPlan(null);
    }
  }

  async function openBillingPortal() {
    if (isGooglePlaySubscription && !nativePlayBilling) {
      setStatus("This Premium subscription is managed by Google Play. Open Ascend on your Android device to change or cancel it.");
      return;
    }

    if (nativePlayBilling || isGooglePlaySubscription) {
      setStatus("Opening Google Play subscription management...");
      try {
        await openNativeGooglePlaySubscriptions();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Could not open Google Play subscription management.");
      }
      return;
    }

    if (hideHostedBilling) {
      setStatus(nativeBillingMessage ?? "Subscription management is not available in this app build yet.");
      return;
    }

    setStatus("Opening your billing portal...");
    try {
      const response = await getBillingPortal();
      window.location.href = response.url;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not open the billing portal.");
    }
  }

  async function cancelCurrentSubscription() {
    if (activePlan === "free") return;
    if (isGooglePlaySubscription && !nativePlayBilling) {
      setStatus("This Premium subscription is managed by Google Play. Open Ascend on your Android device to change or cancel it.");
      return;
    }
    if (nativePlayBilling || isGooglePlaySubscription) {
      setStatus("Open Google Play to cancel or change this subscription.");
      await openBillingPortal();
      return;
    }
    if (hasHostedBilling) {
      setStatus("Opening cancellation options...");
      await openBillingPortal();
      return;
    }

    const confirmed = window.confirm("Cancel this subscription? Future renewals will stop. Access normally continues until the end of the current period.");
    if (!confirmed) return;

    setStatus("Cancelling subscription...");
    try {
      await cancelSubscription();
      await loadSubscription();
      setStatus("Subscription cancelled. Future renewals have been stopped.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not cancel this subscription.");
    }
  }

  return (
    <main className="min-h-screen bg-ink px-4 py-5 text-white">
      <div className="mx-auto max-w-2xl">
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
                {nativePlayBilling
                  ? "Google Play manages checkout, renewals, receipts, and cancellation for Premium inside the Android app."
                  : nativeBillingMessage ?? "Pay securely by card. Stripe manages checkout, recurring billing, receipts, renewals, and cancellations."}
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
              <article key={plan} className={`relative rounded-xl border p-5 ${isActive ? "border-lime bg-lime/10" : plan === "premium" ? "border-calm/60 bg-surface shadow-soft" : "border-line bg-surface"}`}>
                {plan === "premium" && !isActive ? <span className="absolute right-4 top-0 -translate-y-1/2 rounded-full bg-calm px-3 py-1 text-xs font-semibold text-ink">Recommended</span> : null}
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
                    {isGooglePlaySubscription ? (
                      <>
                        <button
                          type="button"
                          onClick={openBillingPortal}
                          className="flex h-11 w-full items-center justify-center rounded-lg border border-line bg-ink font-semibold text-zinc-200"
                        >
                          <ExternalLink className="mr-2" size={18} />
                          Manage in Google Play
                        </button>
                        <button
                          type="button"
                          onClick={cancelCurrentSubscription}
                          className="flex h-11 w-full items-center justify-center rounded-lg border border-amber/40 bg-amber/10 font-semibold text-amber"
                        >
                          <XCircle className="mr-2" size={18} />
                          Cancel in Google Play
                        </button>
                      </>
                    ) : hasHostedBilling && !hideHostedBilling ? (
                      <>
                        <button
                          type="button"
                          onClick={openBillingPortal}
                          className="flex h-11 w-full items-center justify-center rounded-lg border border-line bg-ink font-semibold text-zinc-200"
                        >
                          <ExternalLink className="mr-2" size={18} />
                          Manage Subscription
                        </button>
                        <button
                          type="button"
                          onClick={cancelCurrentSubscription}
                          disabled={billingStatus === "canceled"}
                          className="flex h-11 w-full items-center justify-center rounded-lg border border-amber/40 bg-amber/10 font-semibold text-amber disabled:opacity-60"
                        >
                          <XCircle className="mr-2" size={18} />
                          {billingStatus === "canceled" ? "Cancellation Scheduled" : "Cancel Subscription"}
                        </button>
                      </>
                    ) : hasHostedBilling && hideHostedBilling ? (
                      <p className="rounded-lg border border-calm/40 bg-calm/10 p-3 text-center text-sm text-zinc-200">
                        {nativeBillingMessage ?? "Subscription management is not available in this app build yet."}
                      </p>
                    ) : activePlan !== "free" ? (
                      <button
                        type="button"
                        onClick={cancelCurrentSubscription}
                        disabled={billingStatus === "canceled"}
                        className="flex h-11 w-full items-center justify-center rounded-lg border border-amber/40 bg-amber/10 font-semibold text-amber disabled:opacity-60"
                      >
                        <XCircle className="mr-2" size={18} />
                        {billingStatus === "canceled" ? "Cancellation Scheduled" : "Cancel Subscription"}
                      </button>
                    ) : null}
                  </div>
                ) : paidPlan ? (
                  <div className="mt-4 grid grid-cols-1 gap-2">
                    {nativePlayBilling && plan === "premium" ? (
                      <div className="space-y-2">
                        {isNativeProductsLoading ? (
                          <p className="rounded-lg border border-line bg-ink p-3 text-center text-sm text-zinc-400">
                            Loading Google Play options...
                          </p>
                        ) : nativeProducts.length ? (
                          nativeProducts.map((product) => {
                            const cadence = /P1Y/i.test(product.billingPeriod ?? "") ? "yearly" : "monthly";
                            return (
                              <button
                                key={product.productId}
                                type="button"
                                disabled={isLoadingPlan !== null}
                                onClick={() => startNativePlayCheckout(product)}
                                className="flex h-11 items-center justify-center rounded-lg bg-lime font-semibold text-ink disabled:opacity-60"
                              >
                                <CreditCard className="mr-2" size={18} />
                                {isLoadingPlan === "premium" ? "Opening..." : `Subscribe ${cadence} · ${product.formattedPrice || product.title}`}
                              </button>
                            );
                          })
                        ) : (
                          <p className="rounded-lg border border-calm/40 bg-calm/10 p-3 text-center text-sm text-zinc-200">
                            Google Play products are not ready in this build yet. Testers can request Premium access from the Ascend team.
                          </p>
                        )}
                      </div>
                    ) : nativePlayBilling && plan === "trainer_pro" ? (
                      <p className="rounded-lg border border-calm/40 bg-calm/10 p-3 text-center text-sm text-zinc-200">
                        Trainer Pro upgrades are not available in the Android app yet. Please use the web app for trainer billing.
                      </p>
                    ) : hideHostedBilling ? (
                      <p className="rounded-lg border border-calm/40 bg-calm/10 p-3 text-center text-sm text-zinc-200">
                        {nativeBillingMessage}
                      </p>
                    ) : (
                      <button
                        type="button"
                        disabled={isLoadingPlan !== null || (hasHostedBilling && billingStatus === "past_due")}
                        onClick={() => startCheckout(checkoutPlan)}
                        className="flex h-11 items-center justify-center rounded-lg bg-lime font-semibold text-ink disabled:opacity-60"
                      >
                        <CreditCard className="mr-2" size={18} />
                        {isLoadingPlan === plan ? "Opening..." : "Subscribe monthly"}
                      </button>
                    )}
                    {!hideHostedBilling && hasHostedBilling && billingStatus === "past_due" ? (
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
          {nativePlayBilling
            ? "Google Play manages Android Premium billing. Web checkout continues to use Stripe."
            : hideHostedBilling
            ? "Premium access can still be granted manually for closed testing while in-app billing is being prepared."
            : "By subscribing, you agree to the monthly renewal and cancellation terms shown at checkout."}
        </p>
        {billingStatus === "canceled" && currentPeriodEnd ? (
          <p className="mt-2 text-center text-xs text-zinc-500">You can reactivate from Manage billing before access ends.</p>
        ) : null}
        <PublicFooter compact />
      </div>
    </main>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BackButton } from "@/components/BackButton";
import { AppleBilling, confirmAppleTransaction, syncAppleTransactions, type AppleProduct } from "@/lib/appleBilling";
import { getAppleBillingConfig, getMySubscription } from "@/lib/ascendApi";
import { formatPlan, usablePlan } from "@/lib/subscriptionPlan";

export function AppleSubscriptionClient() {
  const [products, setProducts] = useState<AppleProduct[]>([]);
  const [subscription, setSubscription] = useState<Awaited<ReturnType<typeof getMySubscription>>["subscription"] | null>(null);
  const [message, setMessage] = useState("Loading your subscription…");
  const [busy, setBusy] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [purchaseBlocked, setPurchaseBlocked] = useState(false);
  const [canPurchaseTrainerPro, setCanPurchaseTrainerPro] = useState(false);
  const [intentProductId, setIntentProductId] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const refresh = useCallback(async () => {
    const response = await getMySubscription();
    setSubscription(response.subscription);
  }, []);
  useEffect(() => {
    let mounted = true;
    setBusy(true);
    (async () => {
      try {
        const config = await getAppleBillingConfig();
        if (!mounted) return;
        setEnabled(config.enabled);
        setPurchaseBlocked(config.purchaseBlocked);
        setCanPurchaseTrainerPro(config.canPurchaseTrainerPro === true);
        await refresh();
        if (!config.enabled) { setMessage("Apple subscriptions will be available soon."); return; }
        const response = await AppleBilling.getProducts();
        const intent = await AppleBilling.getPurchaseIntent();
        if (mounted) {
          setIntentProductId(intent.productId ?? null);
          setProducts(response.products.filter(product => config.productIds.includes(product.id)));
          setMessage(response.products.length ? "Choose a monthly plan." : "Apple subscriptions are not available right now. Please try again later.");
        }
      } catch (error) { if (mounted) setMessage(error instanceof Error ? error.message : "Could not load Apple subscriptions."); }
      finally { if (mounted) setBusy(false); }
    })();
    return () => { mounted = false; };
  }, [refresh, loadAttempt]);

  const currentPlan = subscription ? usablePlan(subscription.plan, subscription.status, subscription.current_period_end) : "free";
  const otherPaidProvider = purchaseBlocked || (currentPlan !== "free" && subscription?.provider !== "app_store" && subscription?.provider !== "manual");

  async function purchase(product: AppleProduct) {
    if (busy || otherPaidProvider) return;
    setBusy(true);
    try {
      // Re-check account entitlements immediately before opening Apple's purchase sheet.
      const existing = (await getMySubscription()).subscription;
      if (!["app_store", "manual"].includes(existing.provider ?? "") && usablePlan(existing.plan, existing.status, existing.current_period_end) !== "free") {
        setMessage("You already have a subscription with another billing provider. Manage that subscription first to avoid paying twice."); return;
      }
      const config = await getAppleBillingConfig();
      if (!config.enabled) throw new Error("Apple subscriptions are not available yet.");
      if (product.id.endsWith(".trainerpro.monthly") && !config.canPurchaseTrainerPro) throw new Error("Trainer Pro requires a trainer account linked to a gym. Contact support for trainer account setup before subscribing.");
      if (config.purchaseBlocked) { setPurchaseBlocked(true); throw new Error("You already have a subscription with another billing provider. Manage that subscription first to avoid paying twice."); }
      const result = await AppleBilling.purchase({ productId: product.id, appAccountToken: config.appAccountToken });
      if (result.outcome === "cancelled") { setMessage("Purchase cancelled. Your plan has not changed."); return; }
      if (result.outcome === "pending") { setMessage("Awaiting approval from Apple. Your plan will update after the purchase is approved."); return; }
      if (!result.transaction) throw new Error("Apple did not return a purchase confirmation.");
      setMessage("Confirming your subscription…");
      await confirmAppleTransaction(result.transaction);
      await refresh();
      setMessage("Your Apple subscription has been confirmed.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not confirm the purchase. Use Restore Purchases to retry safely."); }
    finally { setBusy(false); }
  }

  async function restore() {
    setBusy(true);
    try {
      const count = await syncAppleTransactions(true);
      await refresh();
      setMessage(count ? "Your Apple purchases have been restored." : "No active Apple subscription was found for this Apple Account.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not restore purchases. Please try again."); }
    finally { setBusy(false); }
  }

  return <main className="min-h-screen bg-ink px-4 py-5 text-white"><div className="mx-auto max-w-2xl">
    <header className="flex items-center gap-3 py-3"><BackButton fallbackHref="/profile" /><h1 className="text-2xl font-semibold">Subscriptions</h1></header>
    <p className="mt-4 text-lg">Current plan: {formatPlan(currentPlan)}</p>
    {subscription?.current_period_end && currentPlan !== "free" ? <p className="mt-2 text-sm text-zinc-300">{subscription.status === "canceled" ? "Access ends" : "Current period ends"}: {new Date(subscription.current_period_end).toLocaleDateString()}</p> : null}
    <p role="status" className="mt-4 rounded-lg border border-line bg-surface p-4">{message}</p>
    {enabled && products.length < 2 ? <button disabled={busy} onClick={() => setLoadAttempt(attempt => attempt + 1)} className="mt-4 min-h-12 w-full rounded-lg border border-line disabled:opacity-50">{busy ? "Loading prices…" : "Retry Apple prices"}</button> : null}
    {otherPaidProvider ? <p className="mt-4 text-sm text-amber">You already have a subscription with another billing provider. Manage that subscription first to avoid paying twice.</p> : null}
    <div className="mt-6 space-y-4">{products.map(product => <section key={product.id} className="rounded-xl border border-line bg-surface p-5">
      {intentProductId === product.id ? <p className="mb-3 text-sm text-calm">Selected in the App Store. Confirm below to link this subscription to your Ascend account.</p> : null}
      <h2 className="text-xl font-semibold">{product.title}</h2><p className="mt-2 text-zinc-300">{product.description}</p>
      <p className="mt-4 text-lg text-calm">{product.displayPrice} / month</p>
      {product.id.endsWith(".trainerpro.monthly") && !canPurchaseTrainerPro ? <p className="mt-3 text-sm text-zinc-300">Trainer Pro requires a trainer account linked to a gym. Contact support for trainer account setup before subscribing.</p> : null}
      <button disabled={busy || otherPaidProvider || (product.id.endsWith(".trainerpro.monthly") && !canPurchaseTrainerPro) || (subscription?.provider === "app_store" && currentPlan !== "free")} onClick={() => purchase(product)} className="mt-4 min-h-12 w-full rounded-lg bg-calm px-4 font-semibold text-ink disabled:opacity-50">{subscription?.provider === "app_store" && currentPlan !== "free" ? "Change plan in Manage Apple Subscriptions" : `Subscribe to ${product.title}`}</button>
    </section>)}</div>
    {intentProductId ? <button onClick={() => { void AppleBilling.clearPurchaseIntent().then(() => setIntentProductId(null)).catch(() => setMessage("Could not dismiss the request. Please try again.")); }} className="mt-4 min-h-12 w-full rounded-lg border border-line">Dismiss App Store request</button> : null}
    <button disabled={busy || !enabled} onClick={restore} className="mt-5 min-h-12 w-full rounded-lg border border-line disabled:opacity-50">Restore Purchases</button>
    <button disabled={busy} onClick={() => { void AppleBilling.manageSubscriptions().catch(() => setMessage("Could not open Apple subscriptions. Try again.")); }} className="mt-3 min-h-12 w-full rounded-lg border border-line">Manage Apple Subscriptions</button>
    <p className="mt-6 text-sm leading-6 text-zinc-400">Payment is charged to your Apple Account when you confirm. Subscriptions renew automatically unless cancelled at least 24 hours before the current period ends. Manage or cancel anytime in your Apple Account subscription settings.</p>
    <div className="mt-4 flex gap-5 text-sm text-calm"><Link href="/privacy/ios">Privacy Policy</Link><a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/">Terms of Use</a></div>
  </div></main>;
}

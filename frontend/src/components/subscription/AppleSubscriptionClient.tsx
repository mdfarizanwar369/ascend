"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BackButton } from "@/components/BackButton";
import { AppleBilling, confirmAppleTransaction, syncAppleTransactions, type AppleProduct, type AppleSubscriptionPeriod } from "@/lib/appleBilling";
import { getAppleBillingConfig, getMySubscription, saveTrainerOnboardingIntent, validateTrainerGymInvitation, type TrainerOnboardingStatus } from "@/lib/ascendApi";
import { formatPlan, usablePlan } from "@/lib/subscriptionPlan";

export function AppleSubscriptionClient() {
  const [products, setProducts] = useState<AppleProduct[]>([]);
  const [subscription, setSubscription] = useState<Awaited<ReturnType<typeof getMySubscription>>["subscription"] | null>(null);
  const [message, setMessage] = useState("Loading your subscription…");
  const [busy, setBusy] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [purchaseBlocked, setPurchaseBlocked] = useState(false);
  const [canPurchaseTrainerPro, setCanPurchaseTrainerPro] = useState(false);
  const [trainerOnboarding, setTrainerOnboarding] = useState<TrainerOnboardingStatus | null>(null);
  const [trainerSetupProduct, setTrainerSetupProduct] = useState<AppleProduct | null>(null);
  const [trainerMode, setTrainerMode] = useState<"independent" | "gym">("independent");
  const [workspaceName, setWorkspaceName] = useState("");
  const [invitationCode, setInvitationCode] = useState("");
  const [verifiedInvitationCode, setVerifiedInvitationCode] = useState("");
  const [verifiedGymName, setVerifiedGymName] = useState("");
  const [intentProductId, setIntentProductId] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const refresh = useCallback(async () => {
    const response = await getMySubscription();
    setSubscription(response.subscription);
    return response.subscription;
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
        setTrainerOnboarding(config.trainerOnboarding ?? null);
        const currentSubscription = await refresh();
        if (!config.enabled) { setMessage("Apple subscriptions will be available soon."); return; }
        const response = await AppleBilling.getProducts();
        const intent = await AppleBilling.getPurchaseIntent();
        if (mounted) {
          setIntentProductId(intent.productId ?? null);
          const availableProducts = response.products.filter(product => config.productIds.includes(product.id));
          setProducts(availableProducts);
          const periodEnd = currentSubscription.current_period_end ? new Date(currentSubscription.current_period_end).toLocaleDateString() : null;
          const currentProduct = availableProducts.find(product => product.id.endsWith(currentSubscription.plan === "trainer_pro" ? ".trainerpro.monthly" : ".premium.monthly"));
          if (currentSubscription.status === "trialing") {
            setMessage(`Your ${formatPlan(currentSubscription.plan)} trial is active${periodEnd ? ` until ${periodEnd}` : ""}. It will renew${currentProduct ? ` at ${currentProduct.displayPrice} / month` : ""} unless cancelled.`);
          } else if (currentSubscription.status === "canceled" && periodEnd) {
            setMessage(`${formatPlan(currentSubscription.plan)} remains available until ${periodEnd}. Automatic renewal is off.`);
          } else if (usablePlan(currentSubscription.plan, currentSubscription.status, currentSubscription.current_period_end) !== "free") {
            setMessage(`${formatPlan(currentSubscription.plan)} is active${periodEnd ? ` through ${periodEnd}` : ""}.`);
          } else {
            setMessage(availableProducts.length ? "Choose a monthly plan." : "Apple subscriptions are not available right now. Please try again later.");
          }
        }
      } catch (error) { if (mounted) setMessage(error instanceof Error ? error.message : "Could not load Apple subscriptions."); }
      finally { if (mounted) setBusy(false); }
    })();
    return () => { mounted = false; };
  }, [refresh, loadAttempt]);

  const currentPlan = subscription ? usablePlan(subscription.plan, subscription.status, subscription.current_period_end) : "free";
  const otherPaidProvider = purchaseBlocked || (currentPlan !== "free" && subscription?.provider !== "app_store" && subscription?.provider !== "manual");
  const hasAppleSubscription = subscription?.provider === "app_store" && currentPlan !== "free";

  function periodLabel(period: AppleSubscriptionPeriod, count = 1) {
    const total = period.value * count;
    if (period.unit === "week" && total === 2) return "14 days";
    return `${total} ${period.unit}${total === 1 ? "" : "s"}`;
  }

  function eligibleTrial(product: AppleProduct) {
    const offer = product.introductoryOffer;
    return offer?.eligible && offer.paymentMode === "freeTrial" ? offer : null;
  }

  function productTerms(product: AppleProduct) {
    const trial = eligibleTrial(product);
    return trial ? `${periodLabel(trial.period, trial.periodCount)} free, then ${product.displayPrice} / month` : `${product.displayPrice} / month`;
  }

  async function performPurchase(product: AppleProduct) {
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
      if (product.id.endsWith(".trainerpro.monthly") && !config.canPurchaseTrainerPro) throw new Error("Trainer Pro is not available for this account right now. Check for another active subscription and try again.");
      if (config.purchaseBlocked) { setPurchaseBlocked(true); throw new Error("You already have a subscription with another billing provider. Manage that subscription first to avoid paying twice."); }
      const result = await AppleBilling.purchase({ productId: product.id, appAccountToken: config.appAccountToken });
      if (result.outcome === "cancelled") { setMessage("Purchase cancelled. Your plan has not changed."); return; }
      if (result.outcome === "pending") { setMessage("Awaiting approval from Apple. Your plan will update after the purchase is approved."); return; }
      if (!result.transaction) throw new Error("Apple did not return a purchase confirmation.");
      setMessage("Confirming your subscription…");
      await confirmAppleTransaction(result.transaction);
      await refresh();
      setTrainerSetupProduct(null);
      setMessage(product.id.endsWith(".trainerpro.monthly") ? "Trainer Pro is ready. Your trainer workspace and referral code have been created." : "Your Apple subscription has been confirmed.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not confirm the purchase. Use Restore Purchases to retry safely."); }
    finally { setBusy(false); }
  }

  async function purchase(product: AppleProduct) {
    if (product.id.endsWith(".trainerpro.monthly") && !trainerOnboarding?.trainer_id) {
      setTrainerMode(trainerOnboarding?.mode === "gym" ? "gym" : "independent");
      setWorkspaceName(trainerOnboarding?.workspace_name ?? "");
      setTrainerSetupProduct(product);
      setMessage("Choose how you coach before starting Trainer Pro.");
      return;
    }
    await performPurchase(product);
  }

  async function saveTrainerSetupAndPurchase() {
    if (!trainerSetupProduct || busy) return;
    if (trainerMode === "gym" && verifiedInvitationCode !== invitationCode.trim().toUpperCase()) {
      setMessage("Verify the gym invitation before continuing.");
      return;
    }
    setBusy(true);
    try {
      const response = await saveTrainerOnboardingIntent({
        mode: trainerMode,
        workspaceName: trainerMode === "independent" ? workspaceName.trim() || undefined : undefined,
        country: "Malaysia",
        timezone: "Asia/Kuala_Lumpur",
        invitationCode: trainerMode === "gym" ? invitationCode.trim().toUpperCase() : undefined
      });
      setTrainerOnboarding(response.onboarding);
      if (hasAppleSubscription) {
        setMessage("Trainer setup saved. Choose Trainer Pro in your Apple subscription settings to complete the upgrade.");
        await AppleBilling.manageSubscriptions();
        setTrainerSetupProduct(null);
        setBusy(false);
        return;
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the trainer setup.");
      setBusy(false);
      return;
    }
    setBusy(false);
    await performPurchase(trainerSetupProduct);
  }

  async function verifyGymInvitation() {
    const code = invitationCode.trim().toUpperCase();
    if (code.length < 6 || busy) return;
    setBusy(true);
    try {
      const response = await validateTrainerGymInvitation(code);
      setVerifiedInvitationCode(code);
      setVerifiedGymName(response.invitation.gymName);
      setMessage(`Gym invitation confirmed for ${response.invitation.gymName}.`);
    } catch (error) {
      setVerifiedInvitationCode("");
      setVerifiedGymName("");
      setMessage(error instanceof Error ? error.message : "Could not verify that gym invitation. You can continue as an Independent Trainer instead.");
    } finally { setBusy(false); }
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
    {trainerSetupProduct ? <section className="mt-6 rounded-xl border border-calm/50 bg-surface p-5">
      <h2 className="text-xl font-semibold">Set up Trainer Pro</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-300">Choose the workspace that matches how you coach. Independent trainers do not need approval.</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button type="button" onClick={() => setTrainerMode("independent")} className={`min-h-12 rounded-lg border px-3 ${trainerMode === "independent" ? "border-calm bg-calm/10" : "border-line"}`}>Independent Trainer</button>
        <button type="button" onClick={() => setTrainerMode("gym")} className={`min-h-12 rounded-lg border px-3 ${trainerMode === "gym" ? "border-calm bg-calm/10" : "border-line"}`}>Gym Trainer</button>
      </div>
      {trainerMode === "independent" ? <label className="mt-4 block text-sm text-zinc-300">Workspace name
        <input value={workspaceName} onChange={event => setWorkspaceName(event.target.value)} maxLength={80} placeholder="Your name or coaching business" className="mt-2 min-h-12 w-full rounded-lg border border-line bg-ink px-3 text-white" />
      </label> : <div className="mt-4">
        <label className="block text-sm text-zinc-300">Gym trainer invitation
          <input value={invitationCode} onChange={event => { setInvitationCode(event.target.value.toUpperCase()); setVerifiedInvitationCode(""); setVerifiedGymName(""); }} maxLength={64} autoCapitalize="characters" placeholder="TRAINER-..." className="mt-2 min-h-12 w-full rounded-lg border border-line bg-ink px-3 text-white" />
        </label>
        <button type="button" onClick={() => void verifyGymInvitation()} disabled={busy || invitationCode.trim().length < 6} className="mt-3 min-h-11 w-full rounded-lg border border-line font-semibold disabled:opacity-50">Verify gym invitation</button>
        {verifiedGymName ? <p className="mt-3 rounded-lg border border-lime/40 bg-lime/10 p-3 text-sm text-lime">Confirmed: {verifiedGymName}</p> : <p className="mt-2 text-xs leading-5 text-zinc-500">If the invitation is invalid or unavailable, choose Independent Trainer to continue without approval.</p>}
      </div>}
      <div className="mt-5 rounded-lg border border-line bg-ink p-4">
        <p className="font-semibold text-calm">{productTerms(trainerSetupProduct)}</p>
        <p className="mt-2 text-sm leading-6 text-zinc-400">Includes your trainer dashboard and personal Premium features. Trial accounts can connect up to two real clients. The subscription renews automatically unless cancelled.</p>
      </div>
      <button disabled={busy || (trainerMode === "gym" && verifiedInvitationCode !== invitationCode.trim().toUpperCase())} onClick={() => void saveTrainerSetupAndPurchase()} className="mt-4 min-h-12 w-full rounded-lg bg-calm px-4 font-semibold text-ink disabled:opacity-50">{busy ? "Preparing Trainer Pro…" : hasAppleSubscription ? "Save setup and manage subscription" : eligibleTrial(trainerSetupProduct) ? `Start ${periodLabel(eligibleTrial(trainerSetupProduct)!.period, eligibleTrial(trainerSetupProduct)!.periodCount)} Free Trial` : "Continue to Apple"}</button>
      <button disabled={busy} onClick={() => setTrainerSetupProduct(null)} className="mt-3 min-h-11 w-full rounded-lg border border-line disabled:opacity-50">Back to plans</button>
    </section> : null}
    <div className="mt-6 space-y-4">{products.map(product => <section key={product.id} className="rounded-xl border border-line bg-surface p-5">
      {intentProductId === product.id ? <p className="mb-3 text-sm text-calm">Selected in the App Store. Confirm below to link this subscription to your Ascend account.</p> : null}
      <h2 className="text-xl font-semibold">{product.title}</h2><p className="mt-2 text-zinc-300">{product.description}</p>
      <p className="mt-4 text-lg text-calm">{productTerms(product)}</p>
      {product.id.endsWith(".trainerpro.monthly") ? <p className="mt-3 text-sm leading-6 text-zinc-300">For independent or gym trainers. Trainer Pro includes personal Premium features and client coaching tools.</p> : null}
      <button disabled={busy || otherPaidProvider || (product.id.endsWith(".trainerpro.monthly") && !canPurchaseTrainerPro) || (hasAppleSubscription && !product.id.endsWith(".trainerpro.monthly"))} onClick={() => void purchase(product)} className="mt-4 min-h-12 w-full rounded-lg bg-calm px-4 font-semibold text-ink disabled:opacity-50">{hasAppleSubscription ? (product.id.endsWith(".trainerpro.monthly") ? "Set up Trainer Pro upgrade" : "Change plan in Manage Apple Subscriptions") : eligibleTrial(product) ? `Start ${periodLabel(eligibleTrial(product)!.period, eligibleTrial(product)!.periodCount)} Free Trial` : `Subscribe to ${product.title}`}</button>
    </section>)}</div>
    {intentProductId ? <button onClick={() => { void AppleBilling.clearPurchaseIntent().then(() => setIntentProductId(null)).catch(() => setMessage("Could not dismiss the request. Please try again.")); }} className="mt-4 min-h-12 w-full rounded-lg border border-line">Dismiss App Store request</button> : null}
    <button disabled={busy || !enabled} onClick={restore} className="mt-5 min-h-12 w-full rounded-lg border border-line disabled:opacity-50">Restore Purchases</button>
    <button disabled={busy} onClick={() => { void AppleBilling.manageSubscriptions().catch(() => setMessage("Could not open Apple subscriptions. Try again.")); }} className="mt-3 min-h-12 w-full rounded-lg border border-line">Manage Apple Subscriptions</button>
    <p className="mt-6 text-sm leading-6 text-zinc-400">For an eligible free trial, no subscription fee is charged until the displayed trial ends. It then renews at Apple's displayed monthly price unless cancelled. Otherwise, payment is charged when you confirm. Subscriptions renew automatically unless cancelled at least 24 hours before the current period ends. Manage or cancel anytime in your Apple Account subscription settings.</p>
    <div className="mt-4 flex gap-5 text-sm text-calm"><Link href="/privacy/ios">Privacy Policy</Link><a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/">Terms of Use</a></div>
  </div></main>;
}

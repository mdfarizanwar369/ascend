"use client";

import { ChangeEvent, useEffect, useState } from "react";
import Link from "next/link";
import { updateProfile as updateFirebaseProfile } from "firebase/auth";
import { Activity, Camera, Check, CreditCard, ExternalLink, Pencil, ScanLine, Trash2, XCircle } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { InstallAscendButton } from "@/components/InstallAscendButton";
import { EnableCoachNotificationsButton } from "@/components/EnableCoachNotificationsButton";
import { cancelSubscription, getBillingPortal, getMe, getMySubscription, removeProfilePhoto, saveProfilePhoto, updateMyProfile } from "@/lib/ascendApi";
import { clearCachedAccountProfile } from "@/lib/accountSession";
import { getFirebaseClientAuth } from "@/lib/firebase";
import { compressProfileImage } from "@/lib/profileImage";
import { formatPlan, usablePlan } from "@/lib/subscriptionPlan";
import { SectionShell, SkeletonBlock, SkeletonStatGrid } from "@/components/PerceivedLoading";
import { getNativeBillingMessage, shouldHideHostedBilling, shouldUseAndroidPlayBilling } from "@/lib/billingPlatform";
import { openNativeGooglePlaySubscriptions } from "@/lib/googlePlayBilling";
import { useI18n } from "@/lib/i18n/I18nProvider";

function formatBytes(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatBillingDate(value: string | null | undefined, t: (key: string) => string) {
  if (!value) return t("profile.notScheduled");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("profile.notScheduled");
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export function ProfileClient() {
  const { t } = useI18n();
  const [user, setUser] = useState<Awaited<ReturnType<typeof getMe>>["user"] | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [plan, setPlan] = useState<"free" | "premium" | "trainer_pro">("free");
  const [rawPlan, setRawPlan] = useState<"free" | "premium" | "trainer_pro">("free");
  const [subscriptionProvider, setSubscriptionProvider] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState("active");
  const [renewalDate, setRenewalDate] = useState<string | null>(null);
  const [preview, setPreview] = useState("");
  const [compressed, setCompressed] = useState("");
  const [compressionLabel, setCompressionLabel] = useState("");
  const [status, setStatus] = useState(t("profile.loading"));
  const [billingStatus, setBillingStatus] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [isBillingWorking, setIsBillingWorking] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [nameStatus, setNameStatus] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);

  async function loadProfile() {
    const [me, subscription] = await Promise.all([getMe(), getMySubscription()]);
    setUser(me.user);
    setNameDraft(me.user.full_name ?? "");
    setRoles(me.roles);
    setRawPlan(subscription.subscription.plan);
    setPlan(usablePlan(subscription.subscription.plan, subscription.subscription.status, subscription.subscription.current_period_end));
    setSubscriptionProvider(subscription.subscription.provider ?? null);
    setSubscriptionStatus(subscription.subscription.status);
    setRenewalDate(subscription.subscription.current_period_end ?? null);
    return [me, subscription] as const;
  }

  useEffect(() => {
    let mounted = true;
    loadProfile()
      .then(() => {
        if (!mounted) return;
        setStatus("");
      })
      .catch((error) => mounted && setStatus(error instanceof Error ? error.message : t("profile.loadError")));
    return () => { mounted = false; };
  }, [t]);

  const canUpload = roles.some((role) => role === "owner" || role === "admin") || plan === "premium" || plan === "trainer_pro";
  const backHref = roles.some((role) => role === "owner" || role === "admin") ? "/admin" : roles.includes("trainer") ? "/trainer" : "/dashboard";
  const shownPhoto = preview || user?.profile_photo_url || null;
  const hasHostedBilling = subscriptionProvider === "stripe" || subscriptionProvider === "lemonsqueezy";
  const isGooglePlaySubscription = subscriptionProvider === "google_play";
  const hideHostedBilling = shouldHideHostedBilling();
  const nativePlayBilling = shouldUseAndroidPlayBilling();
  const nativeBillingMessage = getNativeBillingMessage();
  const hasPaidPlan = plan !== "free" || rawPlan !== "free";
  const isCancelled = subscriptionStatus === "canceled";
  const renewalTimestamp = renewalDate ? new Date(renewalDate).getTime() : Number.NaN;
  const hasUpcomingBillingDate = Number.isFinite(renewalTimestamp) && renewalTimestamp > Date.now();
  const localizedSubscriptionStatus = ["active", "canceled", "past_due", "trialing"].includes(subscriptionStatus)
    ? t(`profile.subscriptionStatus.${subscriptionStatus}`)
    : subscriptionStatus.replace(/_/g, " ");
  const renewalLabel = isCancelled
    ? (hasUpcomingBillingDate ? t("profile.accessEnds") : t("profile.access"))
    : (hasUpcomingBillingDate ? t("profile.renewalDate") : t("profile.billingStatus"));
  const renewalValue = !hasPaidPlan
    ? t("profile.noPaidRenewal")
    : hasUpcomingBillingDate
      ? formatBillingDate(renewalDate, t)
      : isCancelled
        ? t("profile.ended")
        : t("profile.active");
  const isInitialLoading = !user && Boolean(status);

  async function saveName() {
    const fullName = nameDraft.trim();
    if (!fullName || fullName.length > 120 || isSavingName) return;
    setIsSavingName(true);
    setNameStatus(t("profile.savingName"));
    try {
      const response = await updateMyProfile({ fullName });
      setUser((current) => current ? { ...current, full_name: response.user.full_name } : current);
      setNameDraft(response.user.full_name);
      clearCachedAccountProfile();
      setIsEditingName(false);
      setNameStatus(t("profile.nameSaved"));

      try {
        const firebaseUser = getFirebaseClientAuth().currentUser;
        if (firebaseUser && firebaseUser.displayName !== response.user.full_name) {
          await updateFirebaseProfile(firebaseUser, { displayName: response.user.full_name });
        }
      } catch {
        // Ascend's profile is canonical. Provider metadata is a best-effort compatibility sync.
      }
    } catch (error) {
      setNameStatus(error instanceof Error ? error.message : t("profile.nameSaveError"));
    } finally {
      setIsSavingName(false);
    }
  }

  async function selectPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setIsWorking(true);
    setStatus(t("profile.preparingPhoto"));
    try {
      const result = await compressProfileImage(file);
      setCompressed(result.dataUrl);
      setPreview(result.dataUrl);
      setCompressionLabel(t("profile.photoReduced", { original: formatBytes(result.originalBytes), compressed: formatBytes(result.compressedBytes) }));
      setStatus(t("profile.photoPrepared"));
    } catch (error) {
      setCompressed("");
      setPreview("");
      setCompressionLabel("");
      setStatus(error instanceof Error ? error.message : t("profile.photoPrepareError"));
    } finally {
      setIsWorking(false);
    }
  }

  async function save() {
    if (!compressed || isWorking) return;
    setIsWorking(true);
    setStatus(t("profile.savingPhoto"));
    try {
      const response = await saveProfilePhoto(compressed);
      setUser((current) => current ? { ...current, profile_photo_url: response.profilePhotoUrl } : current);
      setCompressed("");
      setPreview("");
      setStatus(t("profile.photoSaved"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("profile.photoSaveError"));
    } finally {
      setIsWorking(false);
    }
  }

  async function remove() {
    if (isWorking) return;
    setIsWorking(true);
    setStatus(t("profile.removingPhoto"));
    try {
      await removeProfilePhoto();
      setUser((current) => current ? { ...current, profile_photo_url: null } : current);
      setCompressed("");
      setPreview("");
      setCompressionLabel("");
      setStatus(t("profile.photoRemoved"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("profile.photoRemoveError"));
    } finally {
      setIsWorking(false);
    }
  }

  async function openBillingPortal(action: "manage" | "cancel") {
    if (isGooglePlaySubscription && !nativePlayBilling) {
      setBillingStatus("This Premium subscription is managed by Google Play. Open Ascend on your Android device to change or cancel it.");
      return;
    }

    if (nativePlayBilling || isGooglePlaySubscription) {
      setBillingStatus("Opening Google Play subscription management...");
      try {
        await openNativeGooglePlaySubscriptions();
      } catch (error) {
        setBillingStatus(error instanceof Error ? error.message : "Could not open Google Play subscription management.");
      } finally {
        setIsBillingWorking(false);
      }
      return;
    }

    if (hideHostedBilling) {
      setBillingStatus(nativeBillingMessage ?? "Subscription management is not available in this app build yet.");
      return;
    }

    if (isBillingWorking) return;
    setIsBillingWorking(true);
    setBillingStatus(action === "cancel" ? "Opening cancellation options..." : "Opening subscription management...");
    try {
      const response = await getBillingPortal();
      window.location.href = response.url;
    } catch (error) {
      setBillingStatus(error instanceof Error ? error.message : "Could not open subscription management.");
      setIsBillingWorking(false);
    }
  }

  async function cancelManualSubscription() {
    if (isBillingWorking) return;
    if (isGooglePlaySubscription && !nativePlayBilling) {
      setBillingStatus("This Premium subscription is managed by Google Play. Open Ascend on your Android device to change or cancel it.");
      return;
    }
    if (nativePlayBilling || isGooglePlaySubscription) {
      await openBillingPortal("cancel");
      return;
    }
    const confirmed = window.confirm("Cancel this subscription? Future renewals will stop. Access normally continues until the end of the current period.");
    if (!confirmed) return;
    setIsBillingWorking(true);
    setBillingStatus("Cancelling subscription...");
    try {
      await cancelSubscription();
      await loadProfile();
      setBillingStatus("Subscription cancelled. Future renewals have been stopped.");
    } catch (error) {
      setBillingStatus(error instanceof Error ? error.message : "Could not cancel this subscription.");
    } finally {
      setIsBillingWorking(false);
    }
  }

  if (isInitialLoading) {
    return (
      <main className="min-h-screen bg-ink px-4 py-5 text-white">
        <div className="mx-auto w-full max-w-md">
          <header className="flex items-center gap-3 py-3">
            <BackButton fallbackHref="/dashboard" />
            <div><p className="text-sm text-zinc-400">{t("profile.account")}</p><h1 className="text-2xl font-semibold">{t("profile.profileSettings")}</h1></div>
          </header>
          <SectionShell title={t("common.profile")}>
            <div className="flex flex-col items-center">
              <SkeletonBlock className="h-24 w-24 rounded-full" />
              <SkeletonBlock className="mt-4 h-5 w-32" />
              <SkeletonBlock className="mt-2 h-3 w-40" />
              <SkeletonBlock className="mt-5 h-12 w-full rounded-lg" />
            </div>
          </SectionShell>
          <SectionShell title={t("profile.subscription")}>
            <SkeletonStatGrid count={2} />
          </SectionShell>
          <p className="mt-4 rounded-lg border border-line bg-surface p-3 text-sm text-zinc-300">{status}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ink px-4 py-5 text-white">
      <div className="mx-auto w-full max-w-xl">
        <header className="flex items-center gap-3 py-3">
          <BackButton fallbackHref={backHref} />
          <div><p className="text-sm text-zinc-400">{t("profile.account")}</p><h1 className="text-2xl font-semibold">{t("profile.profileSettings")}</h1></div>
        </header>

        <section className="mt-4 rounded-xl border border-line bg-surface p-5 text-center shadow-soft">
          <div className="flex justify-center"><ProfileAvatar src={shownPhoto} name={user?.full_name} size="lg" /></div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <h2 className="break-words text-lg font-semibold">{user?.full_name || t("profile.ascendMember")}</h2>
            <button
              type="button"
              onClick={() => {
                setNameDraft(user?.full_name ?? "");
                setNameStatus("");
                setIsEditingName(true);
              }}
              disabled={isSavingName}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-ink px-3 text-xs font-semibold text-zinc-300 hover:border-calm/50 hover:text-white disabled:opacity-60"
              aria-label={t("profile.editName")}
            >
              <Pencil size={15} /> {t("profile.editName")}
            </button>
          </div>
          <p className="mt-1 text-sm text-zinc-400">{user?.email}</p>

          {isEditingName ? (
            <form
              className="mt-4 rounded-lg border border-line bg-ink p-4 text-left"
              onSubmit={(event) => {
                event.preventDefault();
                void saveName();
              }}
            >
              <label className="block text-sm font-semibold" htmlFor="profile-full-name">{t("profile.fullName")}</label>
              <input
                id="profile-full-name"
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                maxLength={120}
                autoComplete="name"
                disabled={isSavingName}
                className="mt-2 h-12 w-full rounded-lg border border-line bg-surface px-4 text-white outline-none focus:border-calm disabled:opacity-60"
              />
              <p className="mt-2 text-xs leading-5 text-zinc-500">{t("profile.nameHelp")}</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setNameDraft(user?.full_name ?? "");
                    setNameStatus("");
                    setIsEditingName(false);
                  }}
                  disabled={isSavingName}
                  className="h-11 rounded-lg border border-line bg-surface font-semibold text-zinc-200 disabled:opacity-60"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={!nameDraft.trim() || nameDraft.trim().length > 120 || isSavingName}
                  className="h-11 rounded-lg bg-lime font-semibold text-ink disabled:opacity-60"
                >
                  {isSavingName ? t("common.saving") : t("profile.saveName")}
                </button>
              </div>
            </form>
          ) : null}
          {nameStatus ? <p className="mt-3 text-sm text-zinc-300" role="status">{nameStatus}</p> : null}

          {canUpload ? (
            <>
              <label className={`mt-5 flex h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border border-line bg-ink font-semibold ${isWorking ? "pointer-events-none opacity-60" : ""}`}>
                <Camera size={19} /> {t("profile.choosePhoto")}
                <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={selectPhoto} className="sr-only" disabled={isWorking} />
              </label>
              {compressionLabel ? <p className="mt-3 text-xs font-medium text-lime">{compressionLabel}</p> : null}
              {compressed ? (
                <button type="button" onClick={save} disabled={isWorking} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-lime font-semibold text-ink disabled:opacity-60">
                  <Check size={19} /> {isWorking ? t("common.saving") : t("profile.savePhoto")}
                </button>
              ) : null}
              {user?.profile_photo_url ? (
                <button type="button" onClick={remove} disabled={isWorking} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold text-zinc-300 disabled:opacity-60">
                  <Trash2 size={17} /> {t("profile.removePhoto")}
                </button>
              ) : null}
              <p className="mt-4 text-xs leading-5 text-zinc-500">{t("profile.photoPrivacy")}</p>
            </>
          ) : (
            <div className="mt-5 rounded-lg border border-calm/40 bg-calm/10 p-4 text-left">
              <p className="text-sm font-semibold text-calm">{t("profile.photoPremium")}</p>
              <Link href="/subscription" className="mt-3 flex h-11 items-center justify-center rounded-lg bg-lime font-semibold text-ink">
                {hideHostedBilling ? t("profile.premiumOptions") : t("profile.viewPlans")}
              </Link>
            </div>
          )}
        </section>

        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">{t("profile.subscription")}</p>
        <section className="mt-2 rounded-xl border border-line bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">{t("profile.subscription")}</p>
              <p className="mt-1 text-sm text-zinc-400">{t("profile.subscriptionHelp")}</p>
            </div>
            <CreditCard className="text-calm" size={21} />
          </div>
          <div className="mt-4 grid gap-3">
            <div className="rounded-lg bg-ink p-3">
              <p className="text-[11px] uppercase tracking-[0.12em] text-zinc-500">{t("profile.currentPlan")}</p>
              <p className="mt-1 text-lg font-semibold">{formatPlan(plan)}</p>
              <p className="mt-1 text-xs text-zinc-500">{t("profile.statusLabel", { status: localizedSubscriptionStatus })}</p>
            </div>
            <div className="rounded-lg bg-ink p-3">
              <p className="text-[11px] uppercase tracking-[0.12em] text-zinc-500">{renewalLabel}</p>
              <p className="mt-1 text-lg font-semibold">{renewalValue}</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3">
            <Link href="/subscription" className="flex h-11 items-center justify-center rounded-lg border border-line bg-ink font-semibold text-zinc-200">
              {hideHostedBilling ? t("profile.premiumOptions") : t("profile.viewPlans")}
            </Link>
            {hasPaidPlan ? (
              <>
                {isGooglePlaySubscription ? (
                  <>
                    <button
                      type="button"
                      onClick={() => openBillingPortal("manage")}
                      disabled={isBillingWorking}
                      className="flex h-11 items-center justify-center rounded-lg bg-lime font-semibold text-ink disabled:opacity-60"
                    >
                      <ExternalLink className="mr-2" size={18} />
                      {t("profile.manageGooglePlay")}
                    </button>
                    <button
                      type="button"
                      onClick={() => openBillingPortal("cancel")}
                      disabled={isBillingWorking}
                      className="flex h-11 items-center justify-center rounded-lg border border-amber/40 bg-amber/10 font-semibold text-amber disabled:opacity-60"
                    >
                      <XCircle className="mr-2" size={18} />
                      {t("profile.cancelGooglePlay")}
                    </button>
                  </>
                ) : hasHostedBilling && !hideHostedBilling ? (
                  <>
                    <button
                      type="button"
                      onClick={() => openBillingPortal("manage")}
                      disabled={isBillingWorking}
                      className="flex h-11 items-center justify-center rounded-lg bg-lime font-semibold text-ink disabled:opacity-60"
                    >
                      <ExternalLink className="mr-2" size={18} />
                      {t("profile.manageSubscription")}
                    </button>
                    <button
                      type="button"
                      onClick={() => openBillingPortal("cancel")}
                      disabled={isBillingWorking || isCancelled}
                      className="flex h-11 items-center justify-center rounded-lg border border-amber/40 bg-amber/10 font-semibold text-amber disabled:opacity-60"
                    >
                      <XCircle className="mr-2" size={18} />
                      {isCancelled ? t("profile.cancellationScheduled") : t("profile.cancelSubscription")}
                    </button>
                  </>
                ) : hasHostedBilling && hideHostedBilling ? (
                  <p className="rounded-lg border border-calm/40 bg-calm/10 p-3 text-sm leading-6 text-zinc-200">
                    {nativeBillingMessage}
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={cancelManualSubscription}
                    disabled={isBillingWorking || isCancelled}
                    className="flex h-11 items-center justify-center rounded-lg border border-amber/40 bg-amber/10 font-semibold text-amber disabled:opacity-60"
                  >
                    <XCircle className="mr-2" size={18} />
                    {isCancelled ? t("profile.cancellationScheduled") : t("profile.cancelSubscription")}
                  </button>
                )}
              </>
            ) : null}
          </div>
          {billingStatus ? <p className="mt-3 rounded-lg border border-line bg-ink p-3 text-sm leading-6 text-zinc-300">{billingStatus}</p> : null}
          <p className="mt-3 text-xs leading-5 text-zinc-500">
            {nativePlayBilling || isGooglePlaySubscription
              ? t("profile.googleBillingHelp")
              : hideHostedBilling
              ? t("profile.manualPremiumHelp")
              : t("profile.cancellationHelp")}
          </p>
        </section>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">{t("profile.connectedServices")}</p>
        <section className="mt-2 rounded-xl border border-line bg-surface p-4">
          <p className="text-sm font-semibold">{t("profile.appSettings")}</p>
          <p className="mt-2 text-sm leading-6 text-zinc-400">{t("profile.installHelp")}</p>
          <div className="mt-4 space-y-3">
            <InstallAscendButton />
            <EnableCoachNotificationsButton />
            <Link href="/profile/health-sync" className="flex h-11 items-center justify-center gap-2 rounded-lg border border-line bg-ink text-sm font-semibold text-zinc-200">
              <Activity size={17} /> {t("profile.healthSync")}
            </Link>
            {user?.athlete_mode_enabled || user?.body_scan_introductory_enabled ? (
              <Link href={user?.athlete_mode_enabled ? "/athlete/body-composition" : "/body-scan"} className="flex h-11 items-center justify-center gap-2 rounded-lg border border-violet-500/40 bg-violet-500/10 text-sm font-semibold text-violet-200">
                <ScanLine size={17} /> {t("profile.bodyScan")}
              </Link>
            ) : null}
          </div>
        </section>

        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">{t("profile.accountSecurity")}</p>
        <section className="mt-2 rounded-xl border border-line bg-surface p-4">
          <p className="text-sm font-semibold">{t("profile.account")}</p>
          <p className="mt-2 text-sm leading-6 text-zinc-400">{t("profile.accountHelp")}</p>
          <Link href="/profile/account" className="mt-4 flex h-11 items-center justify-center rounded-lg border border-line bg-ink font-semibold text-zinc-200">
            {t("profile.openAccountSettings")}
          </Link>
        </section>
        {status ? <p className="mt-4 rounded-lg border border-line bg-surface p-3 text-sm text-zinc-300">{status}</p> : null}
      </div>
    </main>
  );
}

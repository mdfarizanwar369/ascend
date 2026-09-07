"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Camera, Droplets, Home, Scale, Sparkles } from "lucide-react";
import { GoalType, MotivationAnchor, PrimaryBarrier } from "@ascend/shared";
import { completeOnboarding, getMe } from "@/lib/ascendApi";
import { Field, inputClass, selectClass } from "@/components/Field";
import { useI18n } from "@/lib/i18n/I18nProvider";

const draftKey = "ascend:onboarding:v2:draft";
const welcomeSeenKey = "ascend:onboarding:v2:welcome-seen";

type GoalChoice = GoalType | "performance" | "healthy_lifestyle";

const barrierOptions: Array<{ value: PrimaryBarrier; labelKey: string }> = [
  { value: "motivation_loss", labelKey: "onboarding.barrierMotivationLoss" },
  { value: "too_busy", labelKey: "onboarding.barrierTooBusy" },
  { value: "stress_or_fatigue", labelKey: "onboarding.barrierStressFatigue" },
  { value: "unsure_what_to_do", labelKey: "onboarding.barrierUnsure" },
  { value: "all_or_nothing", labelKey: "onboarding.barrierAllOrNothing" }
];

const motivationOptions: Array<{ value: MotivationAnchor; labelKey: string }> = [
  { value: "health", labelKey: "onboarding.motivationHealth" },
  { value: "family", labelKey: "onboarding.motivationFamily" },
  { value: "confidence", labelKey: "onboarding.motivationConfidence" },
  { value: "capability", labelKey: "onboarding.motivationCapability" },
  { value: "milestone", labelKey: "onboarding.motivationMilestone" }
];

interface Draft {
  step: number;
  referralCode: string;
  goalChoice: GoalChoice;
  ageYears: string;
  heightCm: string;
  gender: "female" | "male" | "prefer_not_to_say";
  currentWeightKg: string;
  targetWeightKg: string;
  activityLevel: "low" | "moderate" | "high";
  primaryBarrier: PrimaryBarrier | null;
  motivationAnchor: MotivationAnchor | null;
}

const defaultDraft: Draft = {
  step: 0,
  referralCode: "",
  goalChoice: "fat_loss",
  ageYears: "",
  heightCm: "",
  gender: "prefer_not_to_say",
  currentWeightKg: "",
  targetWeightKg: "",
  activityLevel: "moderate",
  primaryBarrier: null,
  motivationAnchor: null
};

function mapGoal(choice: GoalChoice): GoalType {
  if (choice === "performance" || choice === "healthy_lifestyle") return "maintenance";
  return choice;
}

function goalLabelKey(choice: GoalChoice) {
  if (choice === "fat_loss") return "onboarding.goalFatLoss";
  if (choice === "muscle_gain") return "onboarding.goalMuscleGain";
  if (choice === "maintenance") return "onboarding.goalMaintain";
  if (choice === "performance") return "onboarding.goalPerformance";
  return "onboarding.goalHealthyLifestyle";
}

function readDraft(): Draft {
  try {
    const saved = window.localStorage.getItem(draftKey);
    return saved ? { ...defaultDraft, ...JSON.parse(saved) } : defaultDraft;
  } catch {
    return defaultDraft;
  }
}

export function ProgressiveClientOnboarding() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const startProfile = searchParams.get("profile") === "1";
  const [draft, setDraft] = useState<Draft>(defaultDraft);
  const [showProfileFlow, setShowProfileFlow] = useState(startProfile);
  const [fullName, setFullName] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const saved = readDraft();
    setDraft(saved);
    if (startProfile) setShowProfileFlow(true);
    try {
      setShowProfileFlow(startProfile || window.localStorage.getItem(welcomeSeenKey) === "profile");
    } catch {
      setShowProfileFlow(startProfile);
    }
    getMe()
      .then((profile) => setFullName(profile.user.full_name || profile.user.email || "Ascend Member"))
      .catch(() => setFullName("Ascend Member"));
  }, [startProfile]);

  useEffect(() => {
    try {
      window.localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {
      // Draft restore is best effort only.
    }
  }, [draft]);

  const stepTitle = useMemo(() => {
    if (draft.step === 0) return t("onboarding.stepGoal");
    if (draft.step === 1) return t("onboarding.stepPersonalise");
    if (draft.step === 2) return t("onboarding.stepStarting");
    if (draft.step === 3) return t("onboarding.stepActivity");
    if (draft.step === 4) return t("onboarding.stepBarrier");
    return t("onboarding.stepMotivation");
  }, [draft.step, t]);

  function updateDraft(next: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  function chooseFirstStep(href: string) {
    try {
      window.localStorage.setItem(welcomeSeenKey, "seen");
    } catch {
      // Non-blocking.
    }
    router.push(href);
  }

  function startProfileSetup() {
    try {
      window.localStorage.setItem(welcomeSeenKey, "profile");
    } catch {
      // Non-blocking.
    }
    setShowProfileFlow(true);
  }

  function validateStep() {
    if (draft.step === 1) {
      const age = Number(draft.ageYears);
      const height = Number(draft.heightCm);
      if (!Number.isFinite(age) || age < 18 || age > 100) return t("onboarding.errorAdult");
      if (!Number.isFinite(height) || height <= 0) return t("onboarding.errorHeightCm");
    }
    if (draft.step === 2) {
      const currentWeight = Number(draft.currentWeightKg);
      const targetWeight = draft.targetWeightKg ? Number(draft.targetWeightKg) : null;
      if (!Number.isFinite(currentWeight) || currentWeight <= 0) return t("onboarding.errorCurrentWeight");
      if (targetWeight !== null && (!Number.isFinite(targetWeight) || targetWeight <= 0)) return t("onboarding.errorTargetWeight");
      if (draft.goalChoice !== "maintenance" && draft.goalChoice !== "healthy_lifestyle" && !targetWeight) {
        return t("onboarding.errorTargetRequired");
      }
    }
    if (draft.step === 4 && !draft.primaryBarrier) {
      return t("onboarding.errorChooseBest");
    }
    return null;
  }

  async function saveOnboarding(motivationAnchor: MotivationAnchor | null = draft.motivationAnchor) {
    if (!draft.primaryBarrier) {
      setStatus(t("onboarding.errorChooseBest"));
      return;
    }

    setIsSaving(true);
    try {
      await completeOnboarding({
        fullName,
        referralCode: draft.referralCode.trim() || undefined,
        coachingMode: draft.referralCode.trim() ? "human_coach" : "self_coached",
        goalType: mapGoal(draft.goalChoice),
        gender: draft.gender,
        ageYears: Number(draft.ageYears),
        heightCm: Number(draft.heightCm),
        activityLevel: draft.activityLevel,
        startingWeightKg: Number(draft.currentWeightKg),
        targetWeightKg: draft.targetWeightKg ? Number(draft.targetWeightKg) : undefined,
        primaryBarrier: draft.primaryBarrier,
        motivationAnchor
      });
      try {
        window.localStorage.removeItem(draftKey);
        window.localStorage.setItem(welcomeSeenKey, "complete");
      } catch {
        // Non-blocking.
      }
      router.push("/dashboard");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("onboarding.errorSaveProfile"));
    } finally {
      setIsSaving(false);
    }
  }

  async function nextStep() {
    setStatus(null);
    const validation = validateStep();
    if (validation) {
      setStatus(validation);
      return;
    }
    if (draft.step < 5) {
      updateDraft({ step: draft.step + 1 });
      return;
    }
    await saveOnboarding();
  }

  if (!showProfileFlow) {
    return (
      <section className="mt-6 space-y-4">
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-soft">
          <p className="text-sm text-zinc-400">{t("onboarding.welcome")}</p>
          <h1 className="mt-2 text-4xl font-semibold leading-tight">{t("onboarding.welcomeCardTitle")}</h1>
          <p className="mt-4 text-sm leading-6 text-zinc-300">
            {t("onboarding.welcomeCardBody")}
          </p>
        </div>

        <div className="rounded-2xl border border-calm/40 bg-calm/10 p-4">
          <p className="text-sm font-semibold text-calm">{t("onboarding.firstStep")}</p>
          <div className="mt-4 grid gap-3">
            {[
              { icon: Camera, title: t("onboarding.firstLogFood"), detail: t("onboarding.firstLogFoodDetail"), href: "/food-log" },
              { icon: Scale, title: t("onboarding.firstRecordWeight"), detail: t("onboarding.firstRecordWeightDetail"), href: "/weight-log" },
              { icon: Droplets, title: t("onboarding.firstLogWater"), detail: t("onboarding.firstLogWaterDetail"), href: "/water-log" },
              { icon: Home, title: t("onboarding.firstExploreDashboard"), detail: t("onboarding.firstExploreDashboardDetail"), href: "/dashboard" }
            ].map((item) => (
              <button
                key={item.title}
                type="button"
                onClick={() => chooseFirstStep(item.href)}
                className="flex items-start gap-3 rounded-xl border border-line bg-ink p-4 text-left transition hover:border-calm/60"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-calm text-ink">
                  <item.icon size={19} />
                </span>
                <span>
                  <span className="block font-semibold">{item.title}</span>
                  <span className="mt-1 block text-sm leading-5 text-zinc-400">{item.detail}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={startProfileSetup}
          className="flex h-12 w-full items-center justify-center rounded-xl border border-line bg-surface font-semibold text-lime"
        >
          {t("onboarding.setupTargets")}
        </button>
        <p className="text-center text-xs leading-5 text-zinc-500">{t("onboarding.completeLater")}</p>
      </section>
    );
  }

  return (
    <section className="mt-6 rounded-2xl border border-line bg-surface p-5 shadow-soft">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-lime text-ink">
          <Sparkles size={20} />
        </span>
        <div>
          <p className="text-sm text-zinc-400">{t("onboarding.progressStep", { step: draft.step + 1, total: 6 })}</p>
          <h1 className="mt-1 text-2xl font-semibold">{stepTitle}</h1>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {draft.step === 0 ? (
          <>
            <div className="grid gap-2">
              {(["fat_loss", "muscle_gain", "maintenance", "performance", "healthy_lifestyle"] as GoalChoice[]).map((goal) => (
                <button
                  key={goal}
                  type="button"
                  aria-pressed={draft.goalChoice === goal}
                  onClick={() => updateDraft({ goalChoice: goal })}
                  className={`rounded-xl border p-4 text-left font-semibold ${
                    draft.goalChoice === goal ? "border-lime bg-lime/10 text-lime" : "border-line bg-ink text-white"
                  }`}
                >
                  {t(goalLabelKey(goal))}
                </button>
              ))}
            </div>
            <Field label={t("onboarding.referralCode")} hint={t("onboarding.referralOptional")}>
              <input
                className={inputClass}
                value={draft.referralCode}
                onChange={(event) => updateDraft({ referralCode: event.target.value.toUpperCase() })}
                placeholder={t("onboarding.optional")}
              />
            </Field>
          </>
        ) : null}

        {draft.step === 1 ? (
          <>
            <Field label={t("onboarding.age")}>
              <input className={inputClass} value={draft.ageYears} inputMode="numeric" onChange={(event) => updateDraft({ ageYears: event.target.value })} />
            </Field>
            <Field label={t("onboarding.height")}>
              <input className={inputClass} value={draft.heightCm} inputMode="decimal" placeholder="cm" onChange={(event) => updateDraft({ heightCm: event.target.value })} />
            </Field>
            <Field label={t("onboarding.sexForCalories")}>
              <select className={selectClass} value={draft.gender} onChange={(event) => updateDraft({ gender: event.target.value as Draft["gender"] })}>
                <option value="prefer_not_to_say">{t("onboarding.preferNotSay")}</option>
                <option value="female">{t("onboarding.female")}</option>
                <option value="male">{t("onboarding.male")}</option>
              </select>
            </Field>
          </>
        ) : null}

        {draft.step === 2 ? (
          <>
            <Field label={t("onboarding.currentWeight")}>
              <input className={inputClass} value={draft.currentWeightKg} inputMode="decimal" placeholder="kg" onChange={(event) => updateDraft({ currentWeightKg: event.target.value })} />
            </Field>
            <Field label={t("onboarding.targetWeight")} hint={t("onboarding.targetWeightHint")}>
              <input className={inputClass} value={draft.targetWeightKg} inputMode="decimal" placeholder="kg" onChange={(event) => updateDraft({ targetWeightKg: event.target.value })} />
            </Field>
          </>
        ) : null}

        {draft.step === 3 ? (
          <Field label={t("onboarding.activityLevel")}>
            <select className={selectClass} value={draft.activityLevel} onChange={(event) => updateDraft({ activityLevel: event.target.value as Draft["activityLevel"] })}>
              <option value="low">{t("onboarding.activityLow")}</option>
              <option value="moderate">{t("onboarding.activityModerate")}</option>
              <option value="high">{t("onboarding.activityHigh")}</option>
            </select>
          </Field>
        ) : null}

        {draft.step === 4 ? (
          <div className="grid gap-2">
            {barrierOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={draft.primaryBarrier === option.value}
                onClick={() => updateDraft({ primaryBarrier: option.value })}
                className={`rounded-xl border p-4 text-left font-semibold ${
                  draft.primaryBarrier === option.value ? "border-lime bg-lime/10 text-lime" : "border-line bg-ink text-white"
                }`}
              >
                {t(option.labelKey)}
              </button>
            ))}
          </div>
        ) : null}

        {draft.step === 5 ? (
          <div className="grid gap-2">
            {motivationOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={draft.motivationAnchor === option.value}
                onClick={() => updateDraft({ motivationAnchor: option.value })}
                className={`rounded-xl border p-4 text-left font-semibold ${
                  draft.motivationAnchor === option.value ? "border-lime bg-lime/10 text-lime" : "border-line bg-ink text-white"
                }`}
              >
                {t(option.labelKey)}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {status ? <p role="alert" className="mt-4 rounded-lg border border-amber/40 bg-amber/10 p-3 text-sm leading-6 text-amber">{status}</p> : null}

      <div className="mt-5 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={isSaving || draft.step === 0}
          onClick={() => updateDraft({ step: Math.max(0, draft.step - 1) })}
          className="h-12 rounded-xl border border-line bg-ink font-semibold text-white disabled:opacity-40"
        >
          {t("common.back")}
        </button>
        <button
          type="button"
          disabled={isSaving}
          onClick={nextStep}
          className="flex h-12 items-center justify-center rounded-xl bg-lime font-semibold text-ink disabled:cursor-wait disabled:opacity-60"
        >
          {isSaving ? t("common.saving") : draft.step === 5 ? t("common.done") : t("common.continue")}
          {!isSaving ? <ArrowRight className="ml-2" size={18} /> : null}
        </button>
      </div>

      {draft.step === 5 ? (
        <button
          type="button"
          disabled={isSaving}
          onClick={() => saveOnboarding(null)}
          className="mt-4 min-h-11 w-full text-sm font-medium text-zinc-300 underline decoration-zinc-600 underline-offset-4 disabled:opacity-50"
        >
          {t("common.skipForNow")}
        </button>
      ) : (
        <button type="button" onClick={() => router.push("/dashboard")} className="mt-4 min-h-11 w-full text-sm font-medium text-zinc-400">
          {t("common.skipForNow")}
        </button>
      )}
    </section>
  );
}

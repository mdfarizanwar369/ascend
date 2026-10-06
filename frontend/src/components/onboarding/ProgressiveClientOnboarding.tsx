"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Beef, Check, CheckCircle2, Droplets, Dumbbell, Flame, HeartPulse, Target } from "lucide-react";
import { calculateNutritionTargets, GoalType } from "@ascend/shared";
import { completeOnboarding, getMe, getMyNutritionTargets } from "@/lib/ascendApi";
import { Field, inputClass, selectClass } from "@/components/Field";

const draftKey = "ascend:onboarding:v2:draft";
const oldWelcomeSeenKey = "ascend:onboarding:v2:welcome-seen";

type GoalChoice = GoalType;

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
}

interface StartingGuide {
  calories: number;
  proteinG: number;
  waterMl: number;
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
  activityLevel: "moderate"
};

const goalOptions = [
  { value: "fat_loss", label: "Lose weight", detail: "Build steady, sustainable progress", icon: Target },
  { value: "muscle_gain", label: "Build muscle", detail: "Support strength and growth", icon: Dumbbell },
  { value: "maintenance", label: "Maintain & feel healthier", detail: "Keep a balanced routine", icon: HeartPulse }
] as const;

const activityOptions = [
  { value: "low", label: "Mostly seated" },
  { value: "moderate", label: "Some movement" },
  { value: "high", label: "Active most days" }
] as const;

function readDraft(): Draft {
  try {
    const saved = window.localStorage.getItem(draftKey);
    if (!saved) return defaultDraft;
    const parsed = JSON.parse(saved) as Omit<Partial<Draft>, "goalChoice"> & { goalChoice?: string };
    const restored = { ...defaultDraft, ...parsed } as Draft;
    restored.step = Math.max(0, Math.min(2, Number(parsed.step) || 0));
    restored.goalChoice = parsed.goalChoice === "muscle_gain"
      ? "muscle_gain"
      : parsed.goalChoice === "maintenance" || parsed.goalChoice === "performance" || parsed.goalChoice === "healthy_lifestyle"
        ? "maintenance"
        : "fat_loss";
    return restored;
  } catch {
    return defaultDraft;
  }
}

export function ProgressiveClientOnboarding() {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(defaultDraft);
  const [fullName, setFullName] = useState("Ascend Member");
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [startingGuide, setStartingGuide] = useState<StartingGuide | null>(null);

  useEffect(() => {
    let hasSavedDraft = false;
    try {
      hasSavedDraft = Boolean(window.localStorage.getItem(draftKey));
    } catch {
      // Draft restore is best effort only.
    }
    setDraft(readDraft());

    getMe()
      .then((profile) => {
        setFullName(profile.user.full_name || profile.user.email || "Ascend Member");
        if (hasSavedDraft) return;
        setDraft((current) => ({
          ...current,
          goalChoice: profile.user.goal_type ?? current.goalChoice,
          ageYears: profile.user.age_years ? String(profile.user.age_years) : current.ageYears,
          heightCm: profile.user.height_cm ? String(profile.user.height_cm) : current.heightCm,
          gender: profile.user.gender === "female" || profile.user.gender === "male" || profile.user.gender === "prefer_not_to_say"
            ? profile.user.gender
            : current.gender,
          currentWeightKg: profile.user.starting_weight_kg ? String(profile.user.starting_weight_kg) : current.currentWeightKg,
          targetWeightKg: profile.user.target_weight_kg ? String(profile.user.target_weight_kg) : current.targetWeightKg,
          activityLevel: profile.user.activity_level === "low" || profile.user.activity_level === "moderate" || profile.user.activity_level === "high"
            ? profile.user.activity_level
            : current.activityLevel
        }));
      })
      .catch(() => setFullName("Ascend Member"));
  }, []);

  useEffect(() => {
    if (startingGuide) return;
    try {
      window.localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {
      // Draft restore is best effort only.
    }
  }, [draft, startingGuide]);

  const screen = useMemo(() => {
    if (draft.step === 0) return { title: "What would you like to achieve?", helper: "We'll use this to personalise your daily guide." };
    if (draft.step === 1) return { title: "Tell us about you", helper: "This helps Ascend calculate a safe starting guide." };
    return { title: "Your starting point", helper: "You can change these anytime." };
  }, [draft.step]);

  function updateDraft(next: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  function validateStep() {
    if (draft.step === 1) {
      const age = Number(draft.ageYears);
      const height = Number(draft.heightCm);
      if (!Number.isFinite(age) || age < 18 || age > 100) return "You must be 18 or older to create and manage your own Ascend account.";
      if (!Number.isFinite(height) || height <= 0) return "Please enter your height in cm.";
    }
    if (draft.step === 2) {
      const currentWeight = Number(draft.currentWeightKg);
      const targetWeight = draft.targetWeightKg ? Number(draft.targetWeightKg) : null;
      if (!Number.isFinite(currentWeight) || currentWeight <= 0) return "Please enter your current weight.";
      if (targetWeight !== null && (!Number.isFinite(targetWeight) || targetWeight <= 0)) return "Please enter a valid target weight.";
      if (draft.goalChoice !== "maintenance" && !targetWeight) return "Please add a target weight for this goal.";
    }
    return null;
  }

  async function saveOnboarding() {
    if (isSaving) return;
    setIsSaving(true);
    setStatus(null);

    const calculated = calculateNutritionTargets({
      goalType: draft.goalChoice,
      sex: draft.gender,
      ageYears: Number(draft.ageYears),
      heightCm: Number(draft.heightCm),
      weightKg: Number(draft.currentWeightKg),
      targetWeightKg: draft.targetWeightKg ? Number(draft.targetWeightKg) : null,
      activityLevel: draft.activityLevel
    });

    try {
      await completeOnboarding({
        fullName,
        referralCode: draft.referralCode.trim() || undefined,
        coachingMode: draft.referralCode.trim() ? "human_coach" : "self_coached",
        goalType: draft.goalChoice,
        gender: draft.gender,
        ageYears: Number(draft.ageYears),
        heightCm: Number(draft.heightCm),
        activityLevel: draft.activityLevel,
        startingWeightKg: Number(draft.currentWeightKg),
        targetWeightKg: draft.targetWeightKg ? Number(draft.targetWeightKg) : undefined
      });

      const targetResponse = await getMyNutritionTargets().catch(() => null);
      setStartingGuide(targetResponse?.targets ?? {
        calories: calculated.calorieTarget,
        proteinG: calculated.proteinTargetG,
        waterMl: calculated.waterTargetMl
      });
      try {
        window.localStorage.removeItem(draftKey);
        window.localStorage.removeItem(oldWelcomeSeenKey);
      } catch {
        // Non-blocking.
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save your profile yet. Please try again.");
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
    if (draft.step < 2) {
      updateDraft({ step: draft.step + 1 });
      return;
    }
    await saveOnboarding();
  }

  if (startingGuide) {
    const guideItems = [
      { label: "Calories", value: startingGuide.calories.toLocaleString(), unit: "daily guide", icon: Flame },
      { label: "Protein", value: `${startingGuide.proteinG} g`, unit: "daily guide", icon: Beef },
      { label: "Water", value: `${(startingGuide.waterMl / 1000).toFixed(1)} L`, unit: "daily guide", icon: Droplets }
    ];

    return (
      <section className="ascend-card-rise mt-6 overflow-hidden rounded-3xl border border-calm/25 bg-[radial-gradient(circle_at_top,rgba(53,242,208,0.08),transparent_42%),rgba(18,27,39,0.96)] p-5 shadow-soft">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-lime text-ink shadow-[0_0_28px_rgba(53,242,208,0.22)]">
          <CheckCircle2 size={29} strokeWidth={2.2} />
        </div>
        <h1 className="mx-auto mt-5 max-w-xs text-center text-3xl font-semibold leading-tight text-white">Your starting guide is ready</h1>
        <p className="mx-auto mt-3 max-w-xs text-center text-sm leading-6 text-zinc-400">A simple place to begin. We&apos;ll adjust as you log.</p>

        <div className="mt-6 grid gap-3">
          {guideItems.map((item) => (
            <div key={item.label} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-calm/10 text-calm"><item.icon size={21} /></span>
              <span>
                <span className="block text-sm text-zinc-400">{item.label}</span>
                <span className="mt-0.5 block text-2xl font-semibold text-white">{item.value}</span>
                <span className="block text-xs text-zinc-500">{item.unit}</span>
              </span>
            </div>
          ))}
        </div>

        <button type="button" onClick={() => router.push("/dashboard")} className="ascend-pressable mt-6 flex h-14 w-full items-center justify-center rounded-2xl bg-lime text-base font-semibold text-ink">
          Go to Today <ArrowRight className="ml-2" size={19} />
        </button>
        <button type="button" onClick={() => setStartingGuide(null)} className="mt-3 min-h-11 w-full text-sm font-medium text-zinc-300 underline decoration-zinc-600 underline-offset-4">
          Review my answers
        </button>
      </section>
    );
  }

  return (
    <section className="ascend-card-rise mt-6 rounded-3xl border border-line bg-surface p-5 shadow-soft">
      <div className="flex min-h-8 items-center justify-between gap-3">
        {draft.step === 0 ? (
          <p className="text-sm font-medium text-zinc-300">Welcome to Ascend</p>
        ) : (
          <button type="button" onClick={() => updateDraft({ step: draft.step - 1 })} className="ascend-pressable inline-flex min-h-8 items-center gap-1 text-sm font-medium text-zinc-300">
            <ArrowLeft size={17} /> Back
          </button>
        )}
        <p className="text-sm text-zinc-400">{draft.step + 1} of 3</p>
      </div>

      <h1 className="mt-5 text-3xl font-semibold leading-tight text-white">{screen.title}</h1>
      <p className="mt-2 text-sm leading-6 text-zinc-400">{screen.helper}</p>

      <div className="mt-6 space-y-4">
        {draft.step === 0 ? (
          <div className="grid gap-3">
            {goalOptions.map((option) => {
              const selected = draft.goalChoice === option.value;
              return (
                <button key={option.value} type="button" aria-label={option.label} aria-pressed={selected} onClick={() => updateDraft({ goalChoice: option.value })} className={`ascend-pressable flex min-h-[5.25rem] items-center gap-4 rounded-2xl border px-4 py-3 text-left ${selected ? "border-lime bg-lime/[0.09]" : "border-line bg-ink"}`}>
                  <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${selected ? "bg-lime/15 text-lime" : "bg-white/[0.04] text-zinc-300"}`}><option.icon size={22} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-white">{option.label}</span>
                    <span className="mt-1 block text-sm leading-5 text-zinc-400">{option.detail}</span>
                  </span>
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${selected ? "border-lime bg-lime text-ink" : "border-zinc-600 text-transparent"}`}><Check size={15} strokeWidth={3} /></span>
                </button>
              );
            })}
          </div>
        ) : null}

        {draft.step === 1 ? (
          <>
            <Field label="Age">
              <input className={inputClass} value={draft.ageYears} inputMode="numeric" placeholder="e.g. 32" onChange={(event) => updateDraft({ ageYears: event.target.value })} />
            </Field>
            <Field label="Height">
              <input className={inputClass} value={draft.heightCm} inputMode="decimal" placeholder="cm" onChange={(event) => updateDraft({ heightCm: event.target.value })} />
            </Field>
            <Field label="Sex for calorie estimate">
              <select className={selectClass} value={draft.gender} onChange={(event) => updateDraft({ gender: event.target.value as Draft["gender"] })}>
                <option value="prefer_not_to_say">Prefer not to say</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
              </select>
            </Field>
          </>
        ) : null}

        {draft.step === 2 ? (
          <>
            <Field label="Current weight">
              <input className={inputClass} value={draft.currentWeightKg} inputMode="decimal" placeholder="kg" onChange={(event) => updateDraft({ currentWeightKg: event.target.value })} />
            </Field>
            <Field label="Target weight" hint={draft.goalChoice === "maintenance" ? "Optional for this goal." : "Used to track progress toward your goal."}>
              <input className={inputClass} value={draft.targetWeightKg} inputMode="decimal" placeholder={draft.goalChoice === "maintenance" ? "Optional" : "kg"} onChange={(event) => updateDraft({ targetWeightKg: event.target.value })} />
            </Field>
            <fieldset>
              <legend className="text-sm font-medium text-zinc-200">How active are you?</legend>
              <div className="mt-2 grid gap-2">
                {activityOptions.map((option) => {
                  const selected = draft.activityLevel === option.value;
                  return (
                    <button key={option.value} type="button" aria-label={option.label} aria-pressed={selected} onClick={() => updateDraft({ activityLevel: option.value })} className={`ascend-pressable flex min-h-12 items-center justify-between rounded-xl border px-4 text-left text-sm font-semibold ${selected ? "border-lime bg-lime/[0.09] text-white" : "border-line bg-ink text-zinc-300"}`}>
                      {option.label}
                      <span className={`grid h-5 w-5 place-items-center rounded-full border ${selected ? "border-lime bg-lime text-ink" : "border-zinc-600 text-transparent"}`}><Check size={13} strokeWidth={3} /></span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </>
        ) : null}
      </div>

      {status ? <p role="alert" className="mt-4 rounded-xl border border-amber/40 bg-amber/10 p-3 text-sm leading-6 text-amber">{status}</p> : null}

      <button type="button" disabled={isSaving} onClick={() => void nextStep()} className="ascend-pressable mt-6 flex h-14 w-full items-center justify-center rounded-2xl bg-lime text-base font-semibold text-ink disabled:cursor-wait disabled:opacity-60">
        {isSaving ? "Creating your guide..." : draft.step === 2 ? "Create my guide" : "Continue"}
        {!isSaving ? <ArrowRight className="ml-2" size={19} /> : null}
      </button>

      {draft.step === 0 ? (
        <button type="button" onClick={() => router.push("/dashboard")} className="mt-3 min-h-11 w-full text-sm font-medium text-zinc-300 underline decoration-zinc-600 underline-offset-4">
          Explore first
        </button>
      ) : null}
    </section>
  );
}

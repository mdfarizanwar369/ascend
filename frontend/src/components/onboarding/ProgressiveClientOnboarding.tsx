"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Camera, Droplets, Home, Scale, Sparkles } from "lucide-react";
import { GoalType } from "@ascend/shared";
import { completeOnboarding, getMe } from "@/lib/ascendApi";
import { Field, inputClass } from "@/components/Field";

const draftKey = "ascend:onboarding:v2:draft";
const welcomeSeenKey = "ascend:onboarding:v2:welcome-seen";

type GoalChoice = GoalType | "performance" | "healthy_lifestyle";

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

function mapGoal(choice: GoalChoice): GoalType {
  if (choice === "performance" || choice === "healthy_lifestyle") return "maintenance";
  return choice;
}

function goalLabel(choice: GoalChoice) {
  if (choice === "fat_loss") return "Fat Loss";
  if (choice === "muscle_gain") return "Muscle Gain";
  if (choice === "maintenance") return "Maintain";
  if (choice === "performance") return "Performance";
  return "Healthy Lifestyle";
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
    if (draft.step === 0) return "What are you working toward?";
    if (draft.step === 1) return "Help Ascend personalise your guide.";
    if (draft.step === 2) return "Where are you starting from?";
    return "How active are you right now?";
  }, [draft.step]);

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
      if (!Number.isFinite(age) || age < 13 || age > 100) return "Please enter an age between 13 and 100.";
      if (!Number.isFinite(height) || height <= 0) return "Please enter your height in cm.";
    }
    if (draft.step === 2) {
      const currentWeight = Number(draft.currentWeightKg);
      const targetWeight = draft.targetWeightKg ? Number(draft.targetWeightKg) : null;
      if (!Number.isFinite(currentWeight) || currentWeight <= 0) return "Please enter your current weight.";
      if (targetWeight !== null && (!Number.isFinite(targetWeight) || targetWeight <= 0)) return "Please enter a valid target weight.";
      if (draft.goalChoice !== "maintenance" && draft.goalChoice !== "healthy_lifestyle" && !targetWeight) {
        return "Please add a target weight for this goal.";
      }
    }
    return null;
  }

  async function nextStep() {
    setStatus(null);
    const validation = validateStep();
    if (validation) {
      setStatus(validation);
      return;
    }
    if (draft.step < 3) {
      updateDraft({ step: draft.step + 1 });
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
        targetWeightKg: draft.targetWeightKg ? Number(draft.targetWeightKg) : undefined
      });
      try {
        window.localStorage.removeItem(draftKey);
        window.localStorage.setItem(welcomeSeenKey, "complete");
      } catch {
        // Non-blocking.
      }
      router.push("/dashboard");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save your profile yet. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  if (!showProfileFlow) {
    return (
      <section className="mt-6 space-y-4">
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-soft">
          <p className="text-sm text-zinc-400">Welcome to Ascend</p>
          <h1 className="mt-2 text-4xl font-semibold leading-tight">Great to have you here.</h1>
          <p className="mt-4 text-sm leading-6 text-zinc-300">
            Your coach only sees a few hours of your week. Ascend helps you stay accountable during the other 166 hours.
          </p>
        </div>

        <div className="rounded-2xl border border-calm/40 bg-calm/10 p-4">
          <p className="text-sm font-semibold text-calm">What&apos;s your first step today?</p>
          <div className="mt-4 grid gap-3">
            {[
              { icon: Camera, title: "Log Food", detail: "Recommended. Snap your first meal and let AI estimate calories and macros.", href: "/food-log" },
              { icon: Scale, title: "Record Weight", detail: "Start tracking your progress.", href: "/weight-log" },
              { icon: Droplets, title: "Log Water", detail: "Build your first healthy habit.", href: "/water-log" },
              { icon: Home, title: "Explore Dashboard", detail: "Skip for now and discover Ascend.", href: "/dashboard" }
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
          Set up personalised targets
        </button>
        <p className="text-center text-xs leading-5 text-zinc-500">You can complete your profile later. No pressure.</p>
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
          <p className="text-sm text-zinc-400">Step {draft.step + 1} of 4</p>
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
                  {goalLabel(goal)}
                </button>
              ))}
            </div>
            <Field label="Referral code" hint="Optional. Add your gym or trainer code if you have one.">
              <input
                className={inputClass}
                value={draft.referralCode}
                onChange={(event) => updateDraft({ referralCode: event.target.value.toUpperCase() })}
                placeholder="Optional"
              />
            </Field>
          </>
        ) : null}

        {draft.step === 1 ? (
          <>
            <Field label="Age">
              <input className={inputClass} value={draft.ageYears} inputMode="numeric" onChange={(event) => updateDraft({ ageYears: event.target.value })} />
            </Field>
            <Field label="Height">
              <input className={inputClass} value={draft.heightCm} inputMode="decimal" placeholder="cm" onChange={(event) => updateDraft({ heightCm: event.target.value })} />
            </Field>
            <Field label="Sex for calorie estimate">
              <select className={inputClass} value={draft.gender} onChange={(event) => updateDraft({ gender: event.target.value as Draft["gender"] })}>
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
            <Field label="Target weight" hint="Optional for maintenance and healthy lifestyle goals.">
              <input className={inputClass} value={draft.targetWeightKg} inputMode="decimal" placeholder="kg" onChange={(event) => updateDraft({ targetWeightKg: event.target.value })} />
            </Field>
          </>
        ) : null}

        {draft.step === 3 ? (
          <Field label="Activity level">
            <select className={inputClass} value={draft.activityLevel} onChange={(event) => updateDraft({ activityLevel: event.target.value as Draft["activityLevel"] })}>
              <option value="low">Low - mostly sitting</option>
              <option value="moderate">Moderate - train/walk a few days weekly</option>
              <option value="high">High - active most days</option>
            </select>
          </Field>
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
          Back
        </button>
        <button
          type="button"
          disabled={isSaving}
          onClick={nextStep}
          className="flex h-12 items-center justify-center rounded-xl bg-lime font-semibold text-ink disabled:cursor-wait disabled:opacity-60"
        >
          {isSaving ? "Saving..." : draft.step === 3 ? "Done" : "Continue"}
          {!isSaving ? <ArrowRight className="ml-2" size={18} /> : null}
        </button>
      </div>

      <button type="button" onClick={() => router.push("/dashboard")} className="mt-4 w-full text-sm font-medium text-zinc-400">
        Skip for now
      </button>
    </section>
  );
}

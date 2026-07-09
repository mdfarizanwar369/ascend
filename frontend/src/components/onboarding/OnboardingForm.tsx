"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { CoachingMode } from "@ascend/shared";
import { Field, inputClass, selectClass } from "@/components/Field";
import { completeOnboarding, validateReferral } from "@/lib/ascendApi";

const draftKey = "ascend:onboarding:draft";

const coachingOptions: Array<{ value: CoachingMode; title: string; detail: string }> = [
  { value: "self_coached", title: "Self-Coached", detail: "Use Ascend to stay consistent on your own." },
  { value: "ai_coach", title: "AI Coach", detail: "Add AI guidance for meals, check-ins, and weekly support." },
  { value: "human_coach", title: "Human Coach", detail: "Connect with a real trainer between sessions." }
];

export function OnboardingForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [coachingMode, setCoachingMode] = useState<CoachingMode>("self_coached");
  const [goalType, setGoalType] = useState<"fat_loss" | "muscle_gain" | "maintenance">("fat_loss");
  const [gender, setGender] = useState<"female" | "male" | "prefer_not_to_say">("prefer_not_to_say");
  const [ageYears, setAgeYears] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [activityLevel, setActivityLevel] = useState<"low" | "moderate" | "high">("moderate");
  const [startingWeightKg, setStartingWeightKg] = useState("");
  const [targetWeightKg, setTargetWeightKg] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(draftKey) || window.sessionStorage.getItem(draftKey);
      if (!saved) return;
      const draft = JSON.parse(saved) as Partial<{
        fullName: string;
        referralCode: string;
        coachingMode: CoachingMode;
        goalType: "fat_loss" | "muscle_gain" | "maintenance";
        gender: "female" | "male" | "prefer_not_to_say";
        ageYears: string;
        heightCm: string;
        activityLevel: "low" | "moderate" | "high";
        startingWeightKg: string;
        targetWeightKg: string;
      }>;
      setFullName(draft.fullName ?? "");
      setReferralCode(draft.referralCode ?? "");
      setCoachingMode(draft.coachingMode ?? "self_coached");
      setGoalType(draft.goalType ?? "fat_loss");
      setGender(draft.gender ?? "prefer_not_to_say");
      setAgeYears(draft.ageYears ?? "");
      setHeightCm(draft.heightCm ?? "");
      setActivityLevel(draft.activityLevel ?? "moderate");
      setStartingWeightKg(draft.startingWeightKg ?? "");
      setTargetWeightKg(draft.targetWeightKg ?? "");
    } catch {
      // Some older Safari modes can reject storage. Onboarding still works without drafts.
    }
  }, []);

  useEffect(() => {
    try {
      const draft = JSON.stringify({
        fullName,
        referralCode,
        coachingMode,
        goalType,
        gender,
        ageYears,
        heightCm,
        activityLevel,
        startingWeightKg,
        targetWeightKg
      });
      window.localStorage.setItem(draftKey, draft);
      window.sessionStorage.setItem(draftKey, draft);
    } catch {
      // Draft restore is best effort only.
    }
  }, [activityLevel, ageYears, coachingMode, fullName, gender, goalType, heightCm, referralCode, startingWeightKg, targetWeightKg]);

  async function saveOnboarding() {
    if (isSaving) return;
    setStatus(null);

    if (!fullName.trim()) {
      setStatus("Please enter your name.");
      return;
    }

    if (!startingWeightKg || Number.isNaN(Number(startingWeightKg)) || Number(startingWeightKg) <= 0) {
      setStatus("Please enter your current weight.");
      return;
    }

    if (!heightCm || Number.isNaN(Number(heightCm)) || Number(heightCm) <= 0) {
      setStatus("Please enter your height.");
      return;
    }

    if (!ageYears || Number.isNaN(Number(ageYears)) || Number(ageYears) < 13 || Number(ageYears) > 100) {
      setStatus("Please enter an age between 13 and 100.");
      return;
    }

    if (targetWeightKg && (Number.isNaN(Number(targetWeightKg)) || Number(targetWeightKg) <= 0)) {
      setStatus("Please enter a valid target weight.");
      return;
    }

    setIsSaving(true);

    try {
      if (referralCode.trim()) {
        setStatus("Checking your referral code...");
        await validateReferral(referralCode.trim());
      }
      await completeOnboarding({
        fullName,
        referralCode: referralCode.trim() || undefined,
        coachingMode,
        goalType,
        gender,
        ageYears: Number(ageYears),
        heightCm: Number(heightCm),
        activityLevel,
        startingWeightKg: Number(startingWeightKg),
        targetWeightKg: targetWeightKg ? Number(targetWeightKg) : undefined
      });

      try {
        window.localStorage.removeItem(draftKey);
        window.sessionStorage.removeItem(draftKey);
      } catch {
        // Ignore draft cleanup failures.
      }
      router.push("/dashboard");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? `${error.message}. Please log in again and try once more.`
          : "Could not save onboarding. Please try again."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={(event) => event.preventDefault()}
      className="mt-4 space-y-4 rounded-lg border border-line bg-surface p-4"
    >
      <Field label="Full name">
        <input className={inputClass} value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your name" required />
      </Field>
      <Field label="Referral code" hint="Optional. Use your gym or trainer code if you have one.">
        <input
          className={selectClass}
          value={referralCode}
          onChange={(event) => setReferralCode(event.target.value.toUpperCase())}
        />
      </Field>
      <section>
        <p className="text-sm font-medium text-zinc-200">How do you want to use Ascend?</p>
        <div className="mt-2 grid gap-2">
          {coachingOptions.map((option) => {
            const selected = coachingMode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => setCoachingMode(option.value)}
                className={`rounded-lg border p-3 text-left ${
                  selected ? "border-lime bg-lime/10 text-white" : "border-line bg-ink text-zinc-300"
                }`}
              >
                <span className="block text-sm font-semibold">{option.title}</span>
                <span className="mt-1 block text-xs leading-5 text-zinc-400">{option.detail}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs leading-5 text-zinc-500">Trainer codes connect you to Human Coach mode automatically.</p>
      </section>
      <Field label="Goal">
        <select
          className={inputClass}
          value={goalType}
          onChange={(event) => setGoalType(event.target.value as "fat_loss" | "muscle_gain" | "maintenance")}
        >
          <option value="fat_loss">Fat loss</option>
          <option value="muscle_gain">Muscle gain</option>
          <option value="maintenance">Maintenance</option>
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Age">
          <input
            className={inputClass}
            value={ageYears}
            onChange={(event) => setAgeYears(event.target.value)}
            inputMode="numeric"
            placeholder="e.g. 32"
            required
          />
        </Field>
        <Field label="Height">
          <input
            className={inputClass}
            value={heightCm}
            onChange={(event) => setHeightCm(event.target.value)}
            inputMode="decimal"
            placeholder="cm"
            required
          />
        </Field>
      </div>
      <Field label="Activity level">
        <select className={selectClass} value={activityLevel} onChange={(event) => setActivityLevel(event.target.value as "low" | "moderate" | "high")}>
          <option value="low">Low - mostly sitting</option>
          <option value="moderate">Moderate - train/walk a few days weekly</option>
          <option value="high">High - active most days</option>
        </select>
      </Field>
      <Field label="Sex for calorie estimate">
        <select className={selectClass} value={gender} onChange={(event) => setGender(event.target.value as "female" | "male" | "prefer_not_to_say")}>
          <option value="prefer_not_to_say">Prefer not to say</option>
          <option value="female">Female</option>
          <option value="male">Male</option>
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Current weight">
          <input
            className={inputClass}
            value={startingWeightKg}
            onChange={(event) => setStartingWeightKg(event.target.value)}
            inputMode="decimal"
            placeholder="e.g. 82"
            required
          />
        </Field>
        <Field label="Target weight">
          <input
            className={inputClass}
            value={targetWeightKg}
            onChange={(event) => setTargetWeightKg(event.target.value)}
            inputMode="decimal"
            placeholder="Optional"
          />
        </Field>
      </div>

      {status ? <p role="alert" aria-live="polite" className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-100">{status}</p> : null}

      <button
        type="button"
        onClick={saveOnboarding}
        disabled={isSaving}
        className="flex h-12 w-full items-center justify-center rounded-lg bg-lime px-4 font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSaving ? "Saving..." : "Continue"}
        {!isSaving ? <ArrowRight className="ml-2" size={19} /> : null}
      </button>
    </form>
  );
}

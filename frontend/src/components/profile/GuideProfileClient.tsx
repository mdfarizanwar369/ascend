"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Save, Sparkles } from "lucide-react";
import { calculateAdaptiveNutritionTargets, GoalType } from "@ascend/shared";
import { BackButton } from "@/components/BackButton";
import { Field, inputClass, selectClass } from "@/components/Field";
import { getMe, getWeightLogs, updateGuideProfile } from "@/lib/ascendApi";

function toInputValue(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "";
  return String(value);
}

export function GuideProfileClient() {
  const [gender, setGender] = useState<"female" | "male" | "prefer_not_to_say">("prefer_not_to_say");
  const [ageYears, setAgeYears] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [activityLevel, setActivityLevel] = useState<"low" | "moderate" | "high">("moderate");
  const [goalType, setGoalType] = useState<GoalType>("maintenance");
  const [targetWeightKg, setTargetWeightKg] = useState("");
  const [currentWeightKg, setCurrentWeightKg] = useState<number | null>(null);
  const [weightLogs, setWeightLogs] = useState<Array<{ weight_kg: string | number; logged_at: string }>>([]);
  const [status, setStatus] = useState("Loading your guide profile...");
  const [isSaving, setIsSaving] = useState(false);
  const initialGoalRef = useRef<{ goalType: GoalType; targetWeightKg: number | null }>({ goalType: "maintenance", targetWeightKg: null });

  useEffect(() => {
    let isMounted = true;

    Promise.all([getMe(), getWeightLogs()])
      .then(([response, logs]) => {
        if (!isMounted) return;
        const user = response.user;
        setGender(user.gender === "female" || user.gender === "male" ? user.gender : "prefer_not_to_say");
        setAgeYears(toInputValue(user.age_years));
        setHeightCm(toInputValue(user.height_cm));
        setActivityLevel(
          user.activity_level === "low" || user.activity_level === "moderate" || user.activity_level === "high"
            ? user.activity_level
            : "moderate"
        );
        setGoalType(user.goal_type ?? "maintenance");
        setTargetWeightKg(toInputValue(user.target_weight_kg));
        initialGoalRef.current = {
          goalType: user.goal_type ?? "maintenance",
          targetWeightKg: user.target_weight_kg ? Number(user.target_weight_kg) : null
        };
        const latestWeight = Number(logs.weightLogs[0]?.weight_kg ?? user.starting_weight_kg);
        setCurrentWeightKg(Number.isFinite(latestWeight) && latestWeight > 0 ? latestWeight : null);
        setWeightLogs(logs.weightLogs);
        setStatus("");
      })
      .catch(() => {
        if (isMounted) setStatus("Please log in again if this profile does not load.");
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const targetPreview = calculateAdaptiveNutritionTargets({
    goalType,
    sex: gender,
    ageYears,
    heightCm,
    weightKg: currentWeightKg,
    targetWeightKg,
    activityLevel
  }, weightLogs.map((log) => ({ weightKg: log.weight_kg, loggedAt: log.logged_at })));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!ageYears || Number.isNaN(Number(ageYears)) || Number(ageYears) < 13 || Number(ageYears) > 100) {
      setStatus("Please enter an age between 13 and 100.");
      return;
    }

    if (!heightCm || Number.isNaN(Number(heightCm)) || Number(heightCm) <= 0) {
      setStatus("Please enter your height in cm.");
      return;
    }

    if (goalType !== "maintenance" && (!targetWeightKg || Number(targetWeightKg) <= 0)) {
      setStatus("Please enter a target weight for this goal.");
      return;
    }

    const goalChanged = goalType !== initialGoalRef.current.goalType || Number(targetWeightKg || 0) !== Number(initialGoalRef.current.targetWeightKg ?? 0);

    if (goalChanged && currentWeightKg && goalType === "fat_loss" && Number(targetWeightKg) >= currentWeightKg) {
      setStatus("For fat loss, choose a target below your current weight.");
      return;
    }

    if (goalChanged && currentWeightKg && goalType === "muscle_gain" && Number(targetWeightKg) <= currentWeightKg) {
      setStatus("For muscle gain, choose a target above your current weight.");
      return;
    }

    setIsSaving(true);
    setStatus("Saving your daily guide...");

    try {
      await updateGuideProfile({
        gender,
        ageYears: Number(ageYears),
        activityLevel,
        heightCm: Number(heightCm),
        goalType,
        targetWeightKg: targetWeightKg ? Number(targetWeightKg) : currentWeightKg
      });
      initialGoalRef.current = { goalType, targetWeightKg: targetWeightKg ? Number(targetWeightKg) : currentWeightKg };
      setStatus("Daily guide updated.");
      window.setTimeout(() => {
        window.location.href = "/dashboard";
      }, 500);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not update your guide. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-ink px-4 py-5 text-white">
      <div className="mx-auto max-w-md">
        <header className="flex items-center gap-3 py-3">
          <BackButton fallbackHref="/dashboard" />
          <span className="grid h-11 w-11 place-items-center rounded-lg bg-calm text-ink">
            <Sparkles size={21} />
          </span>
          <div>
            <p className="text-sm text-zinc-400">Nutrition guide</p>
            <h1 className="text-2xl font-semibold">Improve my daily guide</h1>
          </div>
        </header>

        <section className="mt-4 rounded-lg border border-line bg-surface p-4">
          <p className="text-sm leading-6 text-zinc-300">
            These details help Ascend estimate your daily calories and protein more accurately. It is still a guide, not a strict rule.
          </p>
        </section>

        <form onSubmit={onSubmit} className="mt-4 space-y-4 rounded-lg border border-line bg-surface p-4">
          <Field label="Current goal">
            <select className={selectClass} value={goalType} onChange={(event) => setGoalType(event.target.value as GoalType)}>
              <option value="fat_loss">Fat loss</option>
              <option value="muscle_gain">Muscle gain</option>
              <option value="maintenance">Maintain my result</option>
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Current weight">
              <div className={`${inputClass} flex items-center text-zinc-300`}>{currentWeightKg ? `${currentWeightKg.toFixed(1)} kg` : "Log weight first"}</div>
            </Field>
            <Field label={goalType === "maintenance" ? "Maintenance weight" : "Target weight"}>
              <input className={inputClass} value={targetWeightKg} onChange={(event) => setTargetWeightKg(event.target.value)} inputMode="decimal" placeholder={currentWeightKg ? currentWeightKg.toFixed(1) : "kg"} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Age">
              <input className={inputClass} value={ageYears} onChange={(event) => setAgeYears(event.target.value)} inputMode="numeric" placeholder="e.g. 32" required />
            </Field>
            <Field label="Height">
              <input className={inputClass} value={heightCm} onChange={(event) => setHeightCm(event.target.value)} inputMode="decimal" placeholder="cm" required />
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

          <div className="rounded-lg border border-lime/30 bg-lime/10 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-lime">Updated daily guide</p>
                <p className="mt-1 text-xs leading-5 text-zinc-300">{targetPreview.explanation}</p>
              </div>
              <span className="shrink-0 rounded-lg bg-ink px-3 py-2 text-sm font-semibold">{targetPreview.calorieTarget.toLocaleString()} kcal</span>
            </div>
            <p className="mt-2 text-xs text-zinc-400">Protein {targetPreview.proteinTargetG}g / Carbs {targetPreview.carbsTargetG}g / Fat {targetPreview.fatTargetG}g</p>
            {targetPreview.adaptationReason ? <p className="mt-2 text-xs leading-5 text-calm">{targetPreview.adaptationReason}</p> : null}
          </div>

          <p className="text-xs leading-5 text-zinc-400">
            Changing your goal or target starts a fresh progress journey from your latest logged weight. Your previous records stay safe.
          </p>

          {status ? <p className="rounded-lg border border-calm/40 bg-calm/10 p-3 text-sm leading-6 text-zinc-200">{status}</p> : null}

          <button type="submit" disabled={isSaving} className="flex h-12 w-full items-center justify-center rounded-lg bg-lime font-semibold text-ink disabled:opacity-60">
            <Save className="mr-2" size={18} />
            {isSaving ? "Saving..." : "Update daily guide"}
          </button>
        </form>
      </div>
    </main>
  );
}

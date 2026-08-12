"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Save, Sparkles } from "lucide-react";
import { calculateAdaptiveNutritionTargets, GoalType } from "@ascend/shared";
import { BackButton } from "@/components/BackButton";
import { Field, inputClass, selectClass } from "@/components/Field";
import { getMe, getMyNutritionTargets, getWeightLogs, ResolvedNutritionTargets, saveMyNutritionTargets, updateGuideProfile } from "@/lib/ascendApi";

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
  const [resolvedTargets, setResolvedTargets] = useState<ResolvedNutritionTargets | null>(null);
  const [targetMode, setTargetMode] = useState<"ascend" | "custom">("ascend");
  const [customCalories, setCustomCalories] = useState("");
  const [customProtein, setCustomProtein] = useState("");
  const [customCarbs, setCustomCarbs] = useState("");
  const [customFat, setCustomFat] = useState("");
  const [targetStatus, setTargetStatus] = useState("");
  const [isSavingTargets, setIsSavingTargets] = useState(false);
  const initialGoalRef = useRef<{ goalType: GoalType; targetWeightKg: number | null }>({ goalType: "maintenance", targetWeightKg: null });

  useEffect(() => {
    let isMounted = true;

    Promise.all([getMe(), getWeightLogs(), getMyNutritionTargets()])
      .then(([response, logs, targetResponse]) => {
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
        const targets = targetResponse.targets;
        setResolvedTargets(targets);
        setTargetMode(targets.memberPreferenceMode);
        const editable = targets.savedMemberTargets ?? targets;
        setCustomCalories(String(editable.calories));
        setCustomProtein(String(editable.proteinG));
        setCustomCarbs(String(editable.carbsG));
        setCustomFat(String(editable.fatG));
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

  async function saveTargets() {
    if (!resolvedTargets?.editableByMember || isSavingTargets) return;
    setIsSavingTargets(true);
    setTargetStatus(targetMode === "custom" ? "Saving your targets..." : "Restoring Ascend's recommendation...");
    try {
      const response = await saveMyNutritionTargets(targetMode === "custom" ? {
        mode: "custom",
        calories: Number(customCalories),
        proteinG: Number(customProtein),
        carbsG: Number(customCarbs),
        fatG: Number(customFat)
      } : { mode: "ascend" });
      setResolvedTargets(response.targets);
      setTargetMode(response.targets.memberPreferenceMode);
      setTargetStatus(targetMode === "custom" ? "Your nutrition targets are now active everywhere in Ascend." : "Ascend's recommendation is active again.");
    } catch (error) {
      setTargetStatus(error instanceof Error ? error.message : "Could not update your nutrition targets.");
    } finally {
      setIsSavingTargets(false);
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

        <section className="mt-4 rounded-lg border border-line bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Calories & macros</p>
              <p className="mt-1 text-sm leading-6 text-zinc-400">Choose Ascend's guide or set targets you already follow.</p>
            </div>
            <span className="shrink-0 rounded-lg border border-line bg-ink px-2 py-1 text-xs font-semibold text-zinc-300">
              {resolvedTargets?.sourceLabel ?? "Loading"}
            </span>
          </div>

          {resolvedTargets?.source === "coach_plan" ? (
            <div className="mt-4 rounded-lg border border-calm/40 bg-calm/10 p-4">
              <p className="font-semibold text-calm">Your coach set these targets</p>
              <p className="mt-2 text-sm leading-6 text-zinc-300">Your coach's current plan stays authoritative so you both work from the same numbers.</p>
              <p className="mt-3 text-sm font-semibold">
                {resolvedTargets.calories} kcal / P {resolvedTargets.proteinG}g / C {resolvedTargets.carbsG}g / F {resolvedTargets.fatG}g
              </p>
            </div>
          ) : resolvedTargets ? (
            <>
              <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg border border-line bg-ink p-1">
                <button type="button" onClick={() => setTargetMode("ascend")} className={`min-h-11 rounded-md px-3 text-sm font-semibold ${targetMode === "ascend" ? "bg-lime text-ink" : "text-zinc-300"}`}>
                  Ascend guide
                </button>
                <button type="button" onClick={() => setTargetMode("custom")} className={`min-h-11 rounded-md px-3 text-sm font-semibold ${targetMode === "custom" ? "bg-lime text-ink" : "text-zinc-300"}`}>
                  My targets
                </button>
              </div>

              {targetMode === "custom" ? (
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Field label="Calories"><input className={inputClass} value={customCalories} onChange={(event) => setCustomCalories(event.target.value)} inputMode="numeric" /></Field>
                  <Field label="Protein (g)"><input className={inputClass} value={customProtein} onChange={(event) => setCustomProtein(event.target.value)} inputMode="numeric" /></Field>
                  <Field label="Carbs (g)"><input className={inputClass} value={customCarbs} onChange={(event) => setCustomCarbs(event.target.value)} inputMode="numeric" /></Field>
                  <Field label="Fat (g)"><input className={inputClass} value={customFat} onChange={(event) => setCustomFat(event.target.value)} inputMode="numeric" /></Field>
                </div>
              ) : (
                <div className="mt-4 rounded-lg bg-ink p-3">
                  <p className="text-sm font-semibold">{targetPreview.calorieTarget} kcal / P {targetPreview.proteinTargetG}g / C {targetPreview.carbsTargetG}g / F {targetPreview.fatTargetG}g</p>
                  <p className="mt-2 text-xs leading-5 text-zinc-400">Ascend recalculates this guide when your profile, weight trend, or eligible Body Scan data changes.</p>
                </div>
              )}

              {targetStatus ? <p className="mt-3 rounded-lg border border-calm/40 bg-calm/10 p-3 text-sm leading-6 text-zinc-200">{targetStatus}</p> : null}
              <button type="button" onClick={saveTargets} disabled={isSavingTargets} className="mt-4 flex h-12 w-full items-center justify-center rounded-lg bg-lime font-semibold text-ink disabled:opacity-60">
                <Save className="mr-2" size={18} /> {isSavingTargets ? "Saving..." : targetMode === "custom" ? "Use my targets" : "Use Ascend guide"}
              </button>
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}

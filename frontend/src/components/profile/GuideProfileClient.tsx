"use client";

import { FormEvent, useEffect, useState } from "react";
import { Save, Sparkles } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { Field, inputClass } from "@/components/Field";
import { getMe, updateGuideProfile } from "@/lib/ascendApi";

function toInputValue(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "";
  return String(value);
}

export function GuideProfileClient() {
  const [gender, setGender] = useState<"female" | "male" | "prefer_not_to_say">("prefer_not_to_say");
  const [ageYears, setAgeYears] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [activityLevel, setActivityLevel] = useState<"low" | "moderate" | "high">("moderate");
  const [status, setStatus] = useState("Loading your guide profile...");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;

    getMe()
      .then((response) => {
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
        setStatus("");
      })
      .catch(() => {
        if (isMounted) setStatus("Please log in again if this profile does not load.");
      });

    return () => {
      isMounted = false;
    };
  }, []);

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

    setIsSaving(true);
    setStatus("Saving your daily guide...");

    try {
      await updateGuideProfile({
        gender,
        ageYears: Number(ageYears),
        activityLevel,
        heightCm: Number(heightCm)
      });
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
          <div className="grid grid-cols-2 gap-3">
            <Field label="Age">
              <input className={inputClass} value={ageYears} onChange={(event) => setAgeYears(event.target.value)} inputMode="numeric" placeholder="e.g. 32" required />
            </Field>
            <Field label="Height">
              <input className={inputClass} value={heightCm} onChange={(event) => setHeightCm(event.target.value)} inputMode="decimal" placeholder="cm" required />
            </Field>
          </div>

          <Field label="Activity level">
            <select className={inputClass} value={activityLevel} onChange={(event) => setActivityLevel(event.target.value as "low" | "moderate" | "high")}>
              <option value="low">Low - mostly sitting</option>
              <option value="moderate">Moderate - train/walk a few days weekly</option>
              <option value="high">High - active most days</option>
            </select>
          </Field>

          <Field label="Sex for calorie estimate">
            <select className={inputClass} value={gender} onChange={(event) => setGender(event.target.value as "female" | "male" | "prefer_not_to_say")}>
              <option value="prefer_not_to_say">Prefer not to say</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
            </select>
          </Field>

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

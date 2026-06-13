"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Field, inputClass } from "@/components/Field";
import { completeOnboarding } from "@/lib/ascendApi";

export function OnboardingForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [goalType, setGoalType] = useState<"fat_loss" | "muscle_gain" | "maintenance">("fat_loss");
  const [startingWeightKg, setStartingWeightKg] = useState("");
  const [targetWeightKg, setTargetWeightKg] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);

    if (!fullName.trim()) {
      setStatus("Please enter your name.");
      return;
    }

    if (!startingWeightKg || Number.isNaN(Number(startingWeightKg)) || Number(startingWeightKg) <= 0) {
      setStatus("Please enter your current weight.");
      return;
    }

    if (targetWeightKg && (Number.isNaN(Number(targetWeightKg)) || Number(targetWeightKg) <= 0)) {
      setStatus("Please enter a valid target weight.");
      return;
    }

    setIsSaving(true);

    try {
      await completeOnboarding({
        fullName,
        referralCode: referralCode.trim() || undefined,
        goalType,
        startingWeightKg: Number(startingWeightKg),
        targetWeightKg: targetWeightKg ? Number(targetWeightKg) : undefined
      });

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
    <form onSubmit={onSubmit} className="mt-4 space-y-4 rounded-lg border border-line bg-surface p-4">
      <Field label="Full name">
        <input className={inputClass} value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your name" required />
      </Field>
      <Field label="Referral code" hint="Examples: AF-AUSTIN, AF-KULAI, TRAINER-JASON">
        <input
          className={inputClass}
          value={referralCode}
          onChange={(event) => setReferralCode(event.target.value.toUpperCase())}
        />
      </Field>
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

      {status ? <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-100">{status}</p> : null}

      <button
        type="submit"
        disabled={isSaving}
        className="flex h-12 w-full items-center justify-center rounded-lg bg-lime px-4 font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSaving ? "Saving..." : "Continue"}
        {!isSaving ? <ArrowRight className="ml-2" size={19} /> : null}
      </button>
    </form>
  );
}

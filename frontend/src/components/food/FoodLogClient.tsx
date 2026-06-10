"use client";

import { ChangeEvent, useMemo, useState } from "react";
import { Camera, Check, ImagePlus, Pencil, Save, Sparkles } from "lucide-react";
import { FoodEstimate } from "@ascend/shared";
import { saveFoodLog } from "@/lib/ascendApi";
import { saveDemoFoodLog } from "@/lib/demoFoodLogs";
import { Field, inputClass } from "@/components/Field";

const demoEstimates: FoodEstimate[] = [
  {
    foodName: "Nasi Lemak",
    confidence: 0.82,
    calories: 620,
    proteinG: 18,
    carbsG: 72,
    fatG: 28,
    notes: "Estimate assumes rice, sambal, egg, peanuts, anchovies, and a standard portion."
  },
  {
    foodName: "Chicken Rice",
    confidence: 0.78,
    calories: 590,
    proteinG: 32,
    carbsG: 68,
    fatG: 18,
    notes: "Estimate assumes one plate of rice with steamed or roasted chicken and light sauce."
  },
  {
    foodName: "Roti Canai with Curry",
    confidence: 0.74,
    calories: 430,
    proteinG: 10,
    carbsG: 48,
    fatG: 22,
    notes: "Estimate assumes one roti canai with a small portion of dhal or curry."
  }
];

function pickDemoEstimate(fileName: string) {
  const name = fileName.toLowerCase();
  if (name.includes("chicken") || name.includes("rice")) return demoEstimates[1];
  if (name.includes("roti") || name.includes("canai")) return demoEstimates[2];
  return demoEstimates[0];
}

export function FoodLogClient() {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [estimate, setEstimate] = useState<FoodEstimate | null>(null);
  const [status, setStatus] = useState("Upload a food photo to estimate calories and macros.");
  const [isEstimating, setIsEstimating] = useState(false);
  const [wasEdited, setWasEdited] = useState(false);

  const macroTotal = useMemo(() => {
    if (!estimate) return 0;
    return Math.round(estimate.proteinG * 4 + estimate.carbsG * 4 + estimate.fatG * 9);
  }, [estimate]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setPreviewUrl(URL.createObjectURL(file));
    setFileName(file.name);
    setEstimate(null);
    setWasEdited(false);
    setStatus("Photo selected. Generate an AI estimate next.");
  }

  async function handleEstimate() {
    setIsEstimating(true);
    setStatus("Estimating food, calories, protein, carbs, and fat...");

    try {
      // Demo mode is used until Firebase auth, S3 upload, and OpenAI credentials are configured.
      await new Promise((resolve) => setTimeout(resolve, 500));
      const nextEstimate = pickDemoEstimate(fileName);
      setEstimate(nextEstimate);
      setStatus("Demo AI estimate generated. Review and edit before saving.");
    } finally {
      setIsEstimating(false);
    }
  }

  function updateEstimate<K extends keyof FoodEstimate>(key: K, value: FoodEstimate[K]) {
    if (!estimate) return;
    setEstimate({ ...estimate, [key]: value });
    setWasEdited(true);
  }

  async function handleSave() {
    if (!estimate) return;

    const savedLog = {
      id: crypto.randomUUID(),
      imagePreviewUrl: previewUrl,
      mealType: "lunch",
      estimatedFoodName: estimate.foodName,
      calories: estimate.calories,
      proteinG: estimate.proteinG,
      carbsG: estimate.carbsG,
      fatG: estimate.fatG,
      aiEstimateRaw: estimate,
      wasEditedByUser: wasEdited,
      loggedAt: new Date().toISOString()
    };

    try {
      await saveFoodLog({
        mealType: savedLog.mealType,
        estimatedFoodName: savedLog.estimatedFoodName,
        calories: savedLog.calories,
        proteinG: savedLog.proteinG,
        carbsG: savedLog.carbsG,
        fatG: savedLog.fatG,
        aiEstimateRaw: estimate,
        wasEditedByUser: wasEdited
      });
      setStatus("Food log saved to Ascend.");
    } catch {
      saveDemoFoodLog(savedLog);
      setStatus("Saved in demo mode. Connect Firebase/backend auth to save to PostgreSQL.");
    }
  }

  return (
    <main className="min-h-screen bg-ink px-4 py-5 text-white">
      <div className="mx-auto max-w-md">
        <header className="py-3">
          <p className="text-sm text-zinc-400">Food photo AI</p>
          <h1 className="mt-1 text-2xl font-semibold">Estimate meal macros</h1>
        </header>

        <section className="mt-3 grid aspect-[4/3] place-items-center overflow-hidden rounded-lg border border-line bg-surface">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Selected food" className="h-full w-full object-cover" />
          ) : (
            <label className="grid h-full w-full cursor-pointer place-items-center text-center">
              <input accept="image/*" className="hidden" type="file" onChange={handleFileChange} />
              <span>
                <Camera className="mx-auto text-lime" size={36} />
                <span className="mt-3 block text-sm text-zinc-300">Tap to select food photo</span>
              </span>
            </label>
          )}
        </section>

        {previewUrl ? (
          <label className="mt-3 flex h-11 cursor-pointer items-center justify-center rounded-lg border border-line bg-surface text-sm font-medium">
            <ImagePlus className="mr-2" size={18} />
            Change photo
            <input accept="image/*" className="hidden" type="file" onChange={handleFileChange} />
          </label>
        ) : null}

        <section className="mt-4 rounded-lg border border-calm/40 bg-calm/10 p-4">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 text-calm" size={20} />
            <div>
              <p className="text-sm font-semibold text-calm">AI estimate</p>
              <p className="mt-1 text-sm leading-6 text-zinc-300">{status}</p>
            </div>
          </div>
        </section>

        {!estimate ? (
          <button
            className="mt-4 flex h-12 w-full items-center justify-center rounded-lg bg-lime font-semibold text-ink disabled:opacity-50"
            disabled={!previewUrl || isEstimating}
            onClick={handleEstimate}
          >
            <Sparkles className="mr-2" size={18} />
            {isEstimating ? "Estimating..." : "Estimate calories and macros"}
          </button>
        ) : (
          <form className="mt-4 space-y-4 rounded-lg border border-line bg-surface p-4">
            <Field label="Food name">
              <input className={inputClass} value={estimate.foodName} onChange={(event) => updateEstimate("foodName", event.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Calories">
                <input
                  className={inputClass}
                  inputMode="numeric"
                  value={estimate.calories}
                  onChange={(event) => updateEstimate("calories", Number(event.target.value))}
                />
              </Field>
              <Field label="Protein">
                <input
                  className={inputClass}
                  inputMode="decimal"
                  value={estimate.proteinG}
                  onChange={(event) => updateEstimate("proteinG", Number(event.target.value))}
                />
              </Field>
              <Field label="Carbs">
                <input
                  className={inputClass}
                  inputMode="decimal"
                  value={estimate.carbsG}
                  onChange={(event) => updateEstimate("carbsG", Number(event.target.value))}
                />
              </Field>
              <Field label="Fat">
                <input
                  className={inputClass}
                  inputMode="decimal"
                  value={estimate.fatG}
                  onChange={(event) => updateEstimate("fatG", Number(event.target.value))}
                />
              </Field>
            </div>
            <div className="rounded-lg bg-ink p-3 text-sm leading-6 text-zinc-300">
              Macro calories: {macroTotal} kcal · Confidence: {Math.round(estimate.confidence * 100)}%
              <br />
              {estimate.notes}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button className="flex h-12 items-center justify-center rounded-lg border border-line bg-ink font-semibold text-white" type="button">
                <Pencil className="mr-2" size={18} />
                Editable
              </button>
              <button className="flex h-12 items-center justify-center rounded-lg bg-lime font-semibold text-ink" onClick={handleSave} type="button">
                {wasEdited ? <Save className="mr-2" size={18} /> : <Check className="mr-2" size={18} />}
                Save log
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}

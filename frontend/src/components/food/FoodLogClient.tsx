"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Camera, Check, ImagePlus, Pencil, Save, Sparkles } from "lucide-react";
import { FoodEstimate } from "@ascend/shared";
import { estimateFoodFromDataUrl, getFoodLogs, saveFoodLog } from "@/lib/ascendApi";
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

type FoodLog = Awaited<ReturnType<typeof getFoodLogs>>["foodLogs"][number];

function pickDemoEstimate(fileName: string) {
  const name = fileName.toLowerCase();
  if (name.includes("chicken") || name.includes("rice")) return demoEstimates[1];
  if (name.includes("roti") || name.includes("canai")) return demoEstimates[2];
  return demoEstimates[0];
}

function resizeImageToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      const maxSize = 900;
      const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));

      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Could not prepare image."));
        return;
      }

      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read image."));
    };

    image.src = objectUrl;
  });
}

async function buildEstimate(file: File) {
  const imageDataUrl = await resizeImageToDataUrl(file);
  const response = await estimateFoodFromDataUrl(imageDataUrl);
  return response.estimate;
}

export function FoodLogClient() {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [estimate, setEstimate] = useState<FoodEstimate | null>(null);
  const [foodLogs, setFoodLogs] = useState<FoodLog[]>([]);
  const [status, setStatus] = useState("Upload a food photo to estimate calories and macros.");
  const [isEstimating, setIsEstimating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [wasEdited, setWasEdited] = useState(false);

  async function loadFoodLogs() {
    const response = await getFoodLogs();
    setFoodLogs(response.foodLogs);
  }

  useEffect(() => {
    loadFoodLogs().catch(() => {
      setStatus("Upload a food photo to estimate calories and macros.");
    });
  }, []);

  const todaysFoodLogs = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return foodLogs.filter((log) => log.logged_at.slice(0, 10) === today);
  }, [foodLogs]);

  const todaysTotals = useMemo(
    () =>
      todaysFoodLogs.reduce(
        (total, log) => ({
          calories: total.calories + Number(log.calories),
          proteinG: total.proteinG + Number(log.protein_g),
          carbsG: total.carbsG + Number(log.carbs_g),
          fatG: total.fatG + Number(log.fat_g)
        }),
        { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }
      ),
    [todaysFoodLogs]
  );

  const macroTotal = useMemo(() => {
    if (!estimate) return 0;
    return Math.round(estimate.proteinG * 4 + estimate.carbsG * 4 + estimate.fatG * 9);
  }, [estimate]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setPreviewUrl(URL.createObjectURL(file));
    setSelectedFile(file);
    setEstimate(null);
    setWasEdited(false);
    setStatus("Photo selected. Estimating calories and macros...");
    setIsEstimating(true);

    buildEstimate(file)
      .then((nextEstimate) => {
        setEstimate(nextEstimate);
        setStatus("AI estimate ready. Review, edit if needed, then save.");
      })
      .catch(() => {
        setEstimate(pickDemoEstimate(file.name));
        setStatus("Demo estimate ready. Add OPENAI_API_KEY on Railway for live food photo AI.");
      })
      .finally(() => setIsEstimating(false));
  }

  async function handleEstimate() {
    setIsEstimating(true);
    setStatus("Estimating food, calories, protein, carbs, and fat...");

    try {
      if (!selectedFile) return;
      const nextEstimate = await buildEstimate(selectedFile);
      setEstimate(nextEstimate);
      setStatus("AI estimate ready. Review, edit if needed, then save.");
    } catch {
      if (selectedFile) {
        setEstimate(pickDemoEstimate(selectedFile.name));
        setStatus("Demo estimate ready. Add OPENAI_API_KEY on Railway for live food photo AI.");
      }
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

    setIsSaving(true);
    setStatus("Saving food log...");

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
      await loadFoodLogs();
      setPreviewUrl(null);
      setEstimate(null);
      setWasEdited(false);
      setStatus("Food log saved to Ascend.");
    } catch (error) {
      saveDemoFoodLog(savedLog);
      setStatus(error instanceof Error ? error.message : "Saved in demo mode. Connect Firebase/backend auth to save to PostgreSQL.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-ink px-4 py-5 text-white">
      <div className="mx-auto max-w-md">
        <header className="flex items-center gap-3 py-3">
          <a href="/dashboard" className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-surface" aria-label="Back to dashboard">
            <ArrowLeft size={19} />
          </a>
          <div>
            <p className="text-sm text-zinc-400">Food photo AI</p>
            <h1 className="text-2xl font-semibold">Snap, review, save</h1>
          </div>
        </header>

        <section className="mt-3 rounded-lg border border-line bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Today's meals</p>
              <p className="mt-1 text-sm text-zinc-400">
                {todaysFoodLogs.length ? `${todaysFoodLogs.length} meals logged` : "No meals logged yet"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-semibold">{todaysTotals.calories}</p>
              <p className="text-xs text-zinc-400">kcal</p>
            </div>
          </div>

          {todaysFoodLogs.length ? (
            <div className="mt-4 space-y-2">
              {todaysFoodLogs.map((log) => (
                <article key={log.id} className="rounded-lg bg-ink p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{log.estimated_food_name}</p>
                      <p className="mt-1 text-xs text-zinc-400">
                        P {Math.round(Number(log.protein_g))}g / C {Math.round(Number(log.carbs_g))}g / F{" "}
                        {Math.round(Number(log.fat_g))}g
                      </p>
                    </div>
                    <p className="text-sm font-semibold">{log.calories} kcal</p>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </section>

        <section className="mt-3 grid aspect-[4/3] place-items-center overflow-hidden rounded-lg border border-line bg-surface">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Selected food" className="h-full w-full object-cover" />
          ) : (
            <label className="grid h-full w-full cursor-pointer place-items-center text-center">
              <input accept="image/*" className="hidden" type="file" onChange={handleFileChange} />
              <span>
                <Camera className="mx-auto text-lime" size={36} />
                <span className="mt-3 block text-sm font-semibold text-zinc-200">Tap to add a meal photo</span>
                <span className="mt-1 block text-xs text-zinc-500">Ascend estimates calories and macros automatically.</span>
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
              <p className="text-sm font-semibold text-calm">Next step</p>
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
            {isEstimating ? "Estimating..." : "Estimate again"}
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
              Macro calories: {macroTotal} kcal / Confidence: {Math.round(estimate.confidence * 100)}%
              <br />
              {estimate.notes}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button className="flex h-12 items-center justify-center rounded-lg border border-line bg-ink font-semibold text-white" type="button">
                <Pencil className="mr-2" size={18} />
                Editable
              </button>
              <button
                className="flex h-12 items-center justify-center rounded-lg bg-lime font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSaving}
                onClick={handleSave}
                type="button"
              >
                {wasEdited ? <Save className="mr-2" size={18} /> : <Check className="mr-2" size={18} />}
                {isSaving ? "Saving..." : "Save log"}
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}

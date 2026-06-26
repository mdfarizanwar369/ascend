"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, ImagePlus, Pencil, Save, Sparkles } from "lucide-react";
import { calculateAdaptiveNutritionTargets, FoodEstimate } from "@ascend/shared";
import {
  estimateFoodFromDataUrl,
  FoodAiAllowance,
  FoodAiPerformanceReport,
  getFoodAiAllowance,
  getFoodLogs,
  getMe,
  getWeightLogs,
  saveFoodLog,
  uploadFoodPhotoDataUrl
} from "@/lib/ascendApi";
import { BackButton } from "@/components/BackButton";
import { rememberSavedFoodLog } from "@/lib/dataSync";
import { markInstallEligible } from "@/lib/installAscend";
import { Field, inputClass } from "@/components/Field";
import { localDateKey } from "@/lib/date";

type FoodLog = Awaited<ReturnType<typeof getFoodLogs>>["foodLogs"][number];
type FoodUser = Awaited<ReturnType<typeof getMe>>["user"];
type WeightLog = Awaited<ReturnType<typeof getWeightLogs>>["weightLogs"][number];
type FrontendFoodAiStage = {
  name: string;
  startOffsetMs: number;
  endOffsetMs: number;
  durationMs: number;
  metadata?: Record<string, unknown>;
};
type FrontendFoodAiTrace = {
  traceId: string;
  startedAt: string;
  startedAtMs: number;
  source: string;
  stages: FrontendFoodAiStage[];
  backend?: FoodAiPerformanceReport;
};

const frontendFoodAiPerformanceEnabled = process.env.NEXT_PUBLIC_FOOD_AI_PERFORMANCE_LOGS === "true";

function manualEstimate(): FoodEstimate {
  return {
    foodName: "",
    confidence: 0,
    calories: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    notes: "AI could not estimate this photo reliably. Please type the food name and macros before saving, or try a clearer photo."
  };
}

function resizeImageToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      const maxSize = 640;
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
      resolve(canvas.toDataURL("image/jpeg", 0.76));
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read image."));
    };

    image.src = objectUrl;
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isOwnerUser(user: FoodUser | null) {
  return user?.primary_role === "owner";
}

function createFrontendFoodAiTrace(source: string, user: FoodUser | null): FrontendFoodAiTrace | null {
  if (!isOwnerUser(user)) return null;
  if (!frontendFoodAiPerformanceEnabled || typeof performance === "undefined") return null;
  const startedAtMs = performance.now();
  return {
    traceId: `frontend-food-ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    startedAt: new Date().toISOString(),
    startedAtMs,
    source,
    stages: []
  };
}

function frontendOffset(trace: FrontendFoodAiTrace, value: number) {
  return Math.round(value - trace.startedAtMs);
}

function markFrontendStage(trace: FrontendFoodAiTrace | null, name: string, metadata?: Record<string, unknown>) {
  if (!trace || typeof performance === "undefined") return;
  const now = performance.now();
  trace.stages.push({
    name,
    startOffsetMs: frontendOffset(trace, now),
    endOffsetMs: frontendOffset(trace, now),
    durationMs: 0,
    metadata
  });
}

async function timeFrontendStage<T>(
  trace: FrontendFoodAiTrace | null,
  name: string,
  action: () => Promise<T>,
  metadata?: Record<string, unknown>
) {
  if (!trace || typeof performance === "undefined") return action();
  const started = performance.now();
  try {
    return await action();
  } finally {
    const ended = performance.now();
    trace.stages.push({
      name,
      startOffsetMs: frontendOffset(trace, started),
      endOffsetMs: frontendOffset(trace, ended),
      durationMs: Math.round(ended - started),
      metadata
    });
  }
}

function logFrontendFoodAiReport(trace: FrontendFoodAiTrace | null) {
  if (!trace || typeof performance === "undefined") return;
  const totalMs = Math.round(performance.now() - trace.startedAtMs);
  const slowestFrontend = [...trace.stages].sort((a, b) => b.durationMs - a.durationMs)[0];
  console.info(
    "[Ascend Food AI Frontend Performance]",
    JSON.stringify({
      traceId: trace.traceId,
      source: trace.source,
      startedAt: trace.startedAt,
      totalMs,
      frontend: {
        stages: trace.stages,
        slowestStage: slowestFrontend?.name,
        slowestStageMs: slowestFrontend?.durationMs
      },
      backend: trace.backend ?? null,
      rootCauseSummary: {
        slowestOverallStage:
          trace.backend?.summary.slowestStage && (trace.backend.summary.slowestStageMs ?? 0) > (slowestFrontend?.durationMs ?? 0)
            ? trace.backend.summary.slowestStage
            : slowestFrontend?.name,
        geminiFallbackOccurred: trace.backend?.summary.geminiFallbackOccurred ?? false,
        firstGeminiAttemptSucceeded: trace.backend?.summary.firstAttemptSucceeded ?? false,
        jsonParsingFailed: trace.backend?.summary.jsonParsingFailed ?? false,
        duplicateWorkObserved: trace.backend?.summary.duplicateWorkObserved ?? [],
        unnecessarySequentialWaiting: trace.backend?.summary.unnecessarySequentialWaiting ?? []
      }
    })
  );
}

function shouldRetryEstimate(error: unknown) {
  if (!(error instanceof Error)) return true;
  if (/premium plan required|401|403/i.test(error.message)) return false;
  if (/quota|billing|AI provider/i.test(error.message)) return false;
  return true;
}

function estimateFailureMessage(error: unknown) {
  if (error instanceof Error && /Premium plan required/i.test(error.message)) {
    return "Premium access is required for AI food estimates. Ask your trainer or gym owner for approved access, or open plans.";
  }
  if (error instanceof Error && /limit reached/i.test(error.message)) {
    return error.message;
  }
  if (error instanceof Error && /quota|billing|AI provider/i.test(error.message)) {
    return "Food AI is temporarily unavailable. You can enter this meal manually now, then try AI again later.";
  }
  return "AI could not estimate this photo reliably. Please edit the fields before saving, or try AI again.";
}

function allowanceText(allowance: FoodAiAllowance | null) {
  if (!allowance) return "Checking AI scan allowance...";
  if (allowance.limit === null) return "Unlimited owner/admin AI scans";
  const used = Math.min(allowance.used, allowance.limit);
  return `${used} / ${allowance.limit} used ${allowance.period === "week" ? "this week" : "today"}`;
}

function allowanceHint(allowance: FoodAiAllowance | null) {
  if (!allowance) return "Your food scan limit will appear here.";
  if (allowance.limit === null) return "Your scans are still tracked in the owner AI dashboard.";
  if ((allowance.remaining ?? 0) <= 0) return "You can still save food manually until this allowance resets.";
  return `${allowance.remaining} AI ${allowance.remaining === 1 ? "scan" : "scans"} remaining.`;
}

function mealInsight(estimate: FoodEstimate, targets: ReturnType<typeof calculateAdaptiveNutritionTargets>) {
  const calorieShare = estimate.calories / targets.calorieTarget;
  const proteinCalories = estimate.proteinG * 4;
  const proteinRatio = estimate.calories > 0 ? proteinCalories / estimate.calories : 0;
  const fatShare = estimate.fatG / targets.fatTargetG;
  const carbsShare = estimate.carbsG / targets.carbsTargetG;

  if (estimate.calories <= 0) {
    return {
      title: "Add meal details",
      detail: "Enter the food name and macros so Ascend can guide the rest of your day."
    };
  }

  if (proteinRatio < 0.16 && estimate.proteinG < 25) {
    return {
      title: "Protein looks low",
      detail: "Add chicken, eggs, tofu, fish, tempeh, or Greek yogurt later today to support recovery."
    };
  }

  if (fatShare >= 0.55) {
    return {
      title: "High-fat meal",
      detail: "This uses a lot of today's fat guide. Keep the next meal leaner and add vegetables or fruit."
    };
  }

  if (carbsShare >= 0.5 && calorieShare < 0.45) {
    return {
      title: "Carb-heavy meal",
      detail: "Useful for training energy. Balance the next meal with more protein and lighter fats."
    };
  }

  if (calorieShare >= 0.45) {
    return {
      title: "Big meal",
      detail: "This uses a larger part of today's calorie guide. Keep the next meal simple and protein-focused."
    };
  }

  return {
    title: "Balanced enough",
    detail: "Good start. Keep the next meal aligned with your protein and water guide."
  };
}

function formatLogDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(date);
}

function formatLogTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

export function FoodLogClient({ initialView = "log" }: { initialView?: "log" | "history" }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedImageDataUrl, setSelectedImageDataUrl] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<FoodEstimate | null>(null);
  const [foodLogs, setFoodLogs] = useState<FoodLog[]>([]);
  const [user, setUser] = useState<FoodUser | null>(null);
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [status, setStatus] = useState("Upload a food photo to estimate calories and macros.");
  const [isEstimating, setIsEstimating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [wasEdited, setWasEdited] = useState(false);
  const [aiFailed, setAiFailed] = useState(false);
  const [allowance, setAllowance] = useState<FoodAiAllowance | null>(null);
  const [view, setView] = useState<"log" | "history">(initialView);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const foodLogsRequestRef = useRef(0);
  const saveLockRef = useRef(false);

  async function loadFoodLogs() {
    const requestId = ++foodLogsRequestRef.current;
    const response = await getFoodLogs();
    if (requestId === foodLogsRequestRef.current) {
      setFoodLogs(response.foodLogs);
    }
  }

  async function loadUser() {
    const [response, weights] = await Promise.all([getMe(), getWeightLogs()]);
    setUser(response.user);
    setWeightLogs(weights.weightLogs);
  }

  async function loadAllowance() {
    const response = await getFoodAiAllowance();
    setAllowance(response.allowance);
  }

  useEffect(() => {
    Promise.allSettled([loadFoodLogs(), loadAllowance(), loadUser()]).catch(() => {
      setStatus("Upload a food photo to estimate calories and macros.");
    });
  }, []);

  const todaysFoodLogs = useMemo(() => {
    const today = localDateKey();
    return foodLogs.filter((log) => localDateKey(log.logged_at) === today);
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

  const nutritionTargets = calculateAdaptiveNutritionTargets({
    goalType: user?.goal_type,
    sex: user?.gender === "female" || user?.gender === "male" ? user.gender : "prefer_not_to_say",
    ageYears: user?.age_years,
    heightCm: user?.height_cm,
    weightKg: weightLogs[0]?.weight_kg ?? user?.starting_weight_kg,
    targetWeightKg: user?.target_weight_kg,
    activityLevel:
      user?.activity_level === "low" || user?.activity_level === "moderate" || user?.activity_level === "high"
        ? user.activity_level
        : "moderate",
    bodyComposition: user?.athlete_mode_enabled ? user.body_composition_nutrition ?? undefined : undefined
  }, weightLogs.map((log) => ({ weightKg: log.weight_kg, loggedAt: log.logged_at })));

  const canSaveEstimate = useMemo(() => {
    if (!estimate) return false;
    return estimate.foodName.trim().length > 0 && Number(estimate.calories) > 0;
  }, [estimate]);

  const currentMealInsight = estimate ? mealInsight(estimate, nutritionTargets) : null;

  async function estimateFoodWithRetry(imageDataUrl: string, trace?: FrontendFoodAiTrace | null) {
    let lastError: unknown;

    for (let attempt = 0; attempt < 1; attempt += 1) {
      try {
        if (attempt > 0) {
          setStatus("AI is taking another look at the same photo...");
          await sleep(1200 * attempt);
        }
        markFrontendStage(trace ?? null, "API request starts", { attempt: attempt + 1 });
        const response = await timeFrontendStage(trace ?? null, "API request to /food-logs/estimate-data-url", () => estimateFoodFromDataUrl(imageDataUrl), {
          attempt: attempt + 1
        });
        markFrontendStage(trace ?? null, "API response received", { attempt: attempt + 1 });
        if (response.performance && trace) trace.backend = response.performance;
        if (response.allowance) setAllowance(response.allowance);
        return response;
      } catch (error) {
        lastError = error;
        if (!shouldRetryEstimate(error) || attempt === 0) break;
      }
    }

    throw lastError instanceof Error ? lastError : new Error("AI estimate failed.");
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const trace = createFrontendFoodAiTrace("image-selected-auto-analysis", user);
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    markFrontendStage(trace, "Image selected", { sizeBytes: file.size, type: file.type });

    setPreviewUrl(URL.createObjectURL(file));
    setSelectedFile(file);
    setEstimate(null);
    setWasEdited(false);
    setAiFailed(false);
    setStatus("Photo selected. Estimating calories and macros...");
    setIsEstimating(true);

    markFrontendStage(trace, "Image compression starts");
    timeFrontendStage(trace, "Image preprocessing/compression", () => resizeImageToDataUrl(file), {
      sourceSizeBytes: file.size
    })
      .then(async (imageDataUrl) => {
        markFrontendStage(trace, "Image compression ends", { dataUrlLength: imageDataUrl.length });
        setSelectedImageDataUrl(imageDataUrl);
        return estimateFoodWithRetry(imageDataUrl, trace);
      })
      .then((response) => {
        setEstimate(response.estimate);
        setAiFailed(false);
        setStatus("AI estimate ready. Review, edit if needed, then save.");
        window.setTimeout(() => {
          markFrontendStage(trace, "Result rendered to user");
          logFrontendFoodAiReport(trace);
        }, 0);
      })
      .catch((error) => {
        setEstimate(manualEstimate());
        setWasEdited(true);
        setAiFailed(true);
        setStatus(estimateFailureMessage(error));
        loadAllowance().catch(() => {});
        window.setTimeout(() => {
          markFrontendStage(trace, "Result rendered to user", { state: "manual_fallback" });
          logFrontendFoodAiReport(trace);
        }, 0);
      })
      .finally(() => setIsEstimating(false));
  }

  function openCameraPicker() {
    if (isEstimating || isSaving) return;
    cameraInputRef.current?.click();
  }

  function openGalleryPicker() {
    if (isEstimating || isSaving) return;
    galleryInputRef.current?.click();
  }

  async function handleEstimate() {
    if (!selectedFile) return;
    const trace = createFrontendFoodAiTrace("manual-analyze-button", user);
    markFrontendStage(trace, "User taps Analyze", { sizeBytes: selectedFile.size, type: selectedFile.type });
    setIsEstimating(true);
    setAiFailed(false);
    setEstimate(null);
    setStatus("Estimating food, calories, protein, carbs, and fat...");

    try {
      markFrontendStage(trace, "Image compression starts");
      const imageDataUrl = await timeFrontendStage(trace, "Image preprocessing/compression", () => resizeImageToDataUrl(selectedFile), {
        sourceSizeBytes: selectedFile.size
      });
      markFrontendStage(trace, "Image compression ends", { dataUrlLength: imageDataUrl.length });
      setSelectedImageDataUrl(imageDataUrl);
      const response = await estimateFoodWithRetry(imageDataUrl, trace);
      setEstimate(response.estimate);
      setAiFailed(false);
      setStatus("AI estimate ready. Review, edit if needed, then save.");
      window.setTimeout(() => {
        markFrontendStage(trace, "Result rendered to user");
        logFrontendFoodAiReport(trace);
      }, 0);
    } catch (error) {
      if (selectedFile) {
        setEstimate(manualEstimate());
        setWasEdited(true);
        setAiFailed(true);
        setStatus(estimateFailureMessage(error));
        loadAllowance().catch(() => {});
        window.setTimeout(() => {
          markFrontendStage(trace, "Result rendered to user", { state: "manual_fallback" });
          logFrontendFoodAiReport(trace);
        }, 0);
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
    if (saveLockRef.current) return;
    if (!estimate || !canSaveEstimate) {
      setStatus("Please add the food name and calories before saving.");
      return;
    }

    saveLockRef.current = true;
    setIsSaving(true);
    setStatus("Saving food log and photo...");

    const savedLog = {
      id: `food-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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
      let imageS3Key: string | null = null;
      if (selectedImageDataUrl) {
        try {
          const upload = await uploadFoodPhotoDataUrl(selectedImageDataUrl);
          imageS3Key = upload.storageConfigured === false ? null : upload.key;
        } catch {
          imageS3Key = null;
        }
      }

      const response = await saveFoodLog({
        imageS3Key: imageS3Key ?? undefined,
        mealType: savedLog.mealType,
        estimatedFoodName: savedLog.estimatedFoodName,
        calories: savedLog.calories,
        proteinG: savedLog.proteinG,
        carbsG: savedLog.carbsG,
        fatG: savedLog.fatG,
        aiEstimateRaw: estimate,
        wasEditedByUser: wasEdited
      });
      foodLogsRequestRef.current += 1;
      rememberSavedFoodLog({
        ...response.foodLog,
        image_url: null
      });
      setFoodLogs((current) => [
        {
          ...response.foodLog,
          image_url: previewUrl
        },
        ...current.filter((log) => log.id !== response.foodLog.id)
      ]);
      loadFoodLogs().catch(() => {});
      setPreviewUrl(null);
      setEstimate(null);
      setSelectedFile(null);
      setSelectedImageDataUrl(null);
      setWasEdited(false);
      setAiFailed(false);
      setStatus(imageS3Key ? "Food log and photo saved to Ascend." : "Food log saved. Photo storage is temporarily unavailable.");
      markInstallEligible("first_action");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save food log. Please check your connection and try again.");
    } finally {
      saveLockRef.current = false;
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-ink px-4 py-5 text-white">
      <div className="mx-auto max-w-md">
        <header className="flex items-center gap-3 py-3">
          <BackButton fallbackHref="/dashboard" disabled={isSaving} />
          <div>
            <p className="text-sm text-zinc-400">Food photo AI</p>
            <h1 className="text-2xl font-semibold">{view === "history" ? "All meals" : "Snap, review, save"}</h1>
          </div>
        </header>

        <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg border border-line bg-surface p-1">
          <button
            type="button"
            onClick={() => setView("log")}
            className={`h-10 rounded-md text-sm font-semibold ${view === "log" ? "bg-lime text-ink" : "text-zinc-300"}`}
          >
            Log Food
          </button>
          <button
            type="button"
            onClick={() => setView("history")}
            className={`h-10 rounded-md text-sm font-semibold ${view === "history" ? "bg-lime text-ink" : "text-zinc-300"}`}
          >
            Meal History
          </button>
        </div>

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
              <p className="text-xs text-zinc-400">of {nutritionTargets.calorieTarget.toLocaleString()} kcal</p>
            </div>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-ink">
            <div
              className="h-full rounded-full bg-lime"
              style={{ width: `${Math.min(100, Math.round((todaysTotals.calories / nutritionTargets.calorieTarget) * 100))}%` }}
            />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-ink p-2">
              <p className="text-[10px] uppercase text-zinc-500">Protein</p>
              <p className="mt-1 text-sm font-semibold">{Math.round(todaysTotals.proteinG)} / {nutritionTargets.proteinTargetG}g</p>
            </div>
            <div className="rounded-lg bg-ink p-2">
              <p className="text-[10px] uppercase text-zinc-500">Carbs</p>
              <p className="mt-1 text-sm font-semibold">{Math.round(todaysTotals.carbsG)} / {nutritionTargets.carbsTargetG}g</p>
            </div>
            <div className="rounded-lg bg-ink p-2">
              <p className="text-[10px] uppercase text-zinc-500">Fat</p>
              <p className="mt-1 text-sm font-semibold">{Math.round(todaysTotals.fatG)} / {nutritionTargets.fatTargetG}g</p>
            </div>
          </div>
          <p className="mt-2 text-xs text-zinc-500">Daily guide, not a strict limit. Review portions with your trainer if unsure.</p>

          {todaysFoodLogs.length ? (
            <div className="mt-4 space-y-2">
              {todaysFoodLogs.map((log) => (
                <article key={log.id} className="rounded-lg bg-ink p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      {log.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={log.image_url} alt={log.estimated_food_name} className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                      ) : null}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{log.estimated_food_name}</p>
                        <p className="mt-1 text-xs text-zinc-400">
                          P {Math.round(Number(log.protein_g))}g / C {Math.round(Number(log.carbs_g))}g / F{" "}
                          {Math.round(Number(log.fat_g))}g
                        </p>
                      </div>
                    </div>
                    <p className="shrink-0 text-sm font-semibold">{log.calories} kcal</p>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </section>

        {view === "history" ? (
          <section className="mt-3 rounded-lg border border-line bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">All meal logs</h2>
                <p className="mt-1 text-sm text-zinc-400">{foodLogs.length ? `${foodLogs.length} meals saved` : "No saved meals yet"}</p>
              </div>
              <button
                type="button"
                onClick={() => setView("log")}
                className="rounded-lg bg-lime px-3 py-2 text-sm font-semibold text-ink"
              >
                Add meal
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {foodLogs.map((log) => (
                <article key={log.id} className="rounded-lg bg-ink p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      {log.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={log.image_url} alt={log.estimated_food_name} className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                      ) : (
                        <div className="grid h-16 w-16 shrink-0 place-items-center rounded-lg bg-surface text-xs text-zinc-500">No photo</div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{log.estimated_food_name}</p>
                        <p className="mt-1 text-xs text-zinc-400">
                          {formatLogDate(log.logged_at)} at {formatLogTime(log.logged_at)}
                        </p>
                        <p className="mt-1 text-xs text-zinc-400">
                          P {Math.round(Number(log.protein_g))}g / C {Math.round(Number(log.carbs_g))}g / F {Math.round(Number(log.fat_g))}g
                        </p>
                      </div>
                    </div>
                    <p className="shrink-0 text-sm font-semibold">{Number(log.calories).toLocaleString()} kcal</p>
                  </div>
                </article>
              ))}
              {!foodLogs.length ? (
                <button
                  type="button"
                  onClick={() => setView("log")}
                  className="flex h-12 w-full items-center justify-center rounded-lg bg-lime font-semibold text-ink"
                >
                  Log your first meal
                </button>
              ) : null}
            </div>
          </section>
        ) : (
          <>
        <section className="mt-3 rounded-lg border border-line bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">AI scans</p>
              <p className="mt-1 text-xs text-zinc-400">{allowance?.label ?? "Food photo estimate allowance"}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-lime">{allowanceText(allowance)}</p>
              <p className="mt-1 text-xs text-zinc-500">{allowanceHint(allowance)}</p>
            </div>
          </div>
        </section>

        <section className="mt-3 grid aspect-[4/3] place-items-center overflow-hidden rounded-lg border border-line bg-surface">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Selected food" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center p-5 text-center">
              <div className="w-full">
                <Camera className="mx-auto text-lime" size={36} />
                <span className="mt-3 block text-sm font-semibold text-zinc-200">Tap to add a meal photo</span>
                <span className="mt-1 block text-xs text-zinc-500">Ascend estimates calories and macros automatically.</span>
                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={openCameraPicker}
                    disabled={isEstimating || isSaving}
                    className="flex h-12 items-center justify-center rounded-lg bg-lime font-semibold text-ink disabled:opacity-60"
                  >
                    <Camera className="mr-2" size={18} />
                    Take photo
                  </button>
                  <button
                    type="button"
                    onClick={openGalleryPicker}
                    disabled={isEstimating || isSaving}
                    className="flex h-12 items-center justify-center rounded-lg border border-line bg-ink font-semibold text-white disabled:opacity-60"
                  >
                    <ImagePlus className="mr-2" size={18} />
                    Choose from gallery
                  </button>
                </div>
                <p className="mt-3 text-[11px] leading-5 text-zinc-500">
                  If camera capture is not supported on this browser, Ascend will open your photo library instead.
                </p>
              </div>
            </div>
          )}
        </section>

        <input
          ref={cameraInputRef}
          accept="image/*"
          capture="environment"
          className="hidden"
          type="file"
          onChange={handleFileChange}
          disabled={isEstimating || isSaving}
        />
        <input
          ref={galleryInputRef}
          accept="image/*"
          className="hidden"
          type="file"
          onChange={handleFileChange}
          disabled={isEstimating || isSaving}
        />

        {previewUrl ? (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={openCameraPicker}
              disabled={isEstimating || isSaving}
              className="flex h-11 items-center justify-center rounded-lg border border-line bg-surface text-sm font-medium disabled:opacity-60"
            >
              <Camera className="mr-2" size={18} />
              Retake
            </button>
            <button
              type="button"
              onClick={openGalleryPicker}
              disabled={isEstimating || isSaving}
              className="flex h-11 items-center justify-center rounded-lg border border-line bg-surface text-sm font-medium disabled:opacity-60"
            >
              <ImagePlus className="mr-2" size={18} />
              Gallery
            </button>
          </div>
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
            {aiFailed ? (
              <button
                className="flex h-12 w-full items-center justify-center rounded-lg bg-calm font-semibold text-ink disabled:opacity-60"
                disabled={isEstimating}
                onClick={handleEstimate}
                type="button"
              >
                <Sparkles className="mr-2" size={18} />
                {isEstimating ? "Trying again..." : "Try AI again"}
              </button>
            ) : null}
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
            {currentMealInsight ? (
              <div className="rounded-lg border border-lime/30 bg-lime/10 p-3">
                <p className="text-sm font-semibold text-lime">{currentMealInsight.title}</p>
                <p className="mt-1 text-sm leading-6 text-zinc-200">{currentMealInsight.detail}</p>
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <button className="flex h-12 items-center justify-center rounded-lg border border-line bg-ink font-semibold text-white" type="button">
                <Pencil className="mr-2" size={18} />
                Editable
              </button>
              <button
                className="flex h-12 items-center justify-center rounded-lg bg-lime font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSaving || !canSaveEstimate}
                onClick={handleSave}
                type="button"
              >
                {wasEdited ? <Save className="mr-2" size={18} /> : <Check className="mr-2" size={18} />}
                {isSaving ? "Saving..." : "Save log"}
              </button>
            </div>
          </form>
        )}
          </>
        )}
      </div>
    </main>
  );
}

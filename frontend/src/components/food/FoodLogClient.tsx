"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Camera, Check, ChevronDown, ChevronUp, ImagePlus, Pencil, Save, Sparkles, Utensils } from "lucide-react";
import { calculateAdaptiveNutritionTargets, FoodEstimate } from "@ascend/shared";
import {
  estimateFoodFromDataUrl,
  estimateFoodFromText,
  FoodAiAllowance,
  FoodAiPerformanceReport,
  getFoodAiAllowance,
  getFoodLogs,
  getMe,
  getMyNutritionTargets,
  getWeightLogs,
  saveFoodLog,
  uploadFoodPhotoDataUrl
} from "@/lib/ascendApi";
import { BackButton } from "@/components/BackButton";
import { rememberSavedFoodLog } from "@/lib/dataSync";
import { markInstallEligible } from "@/lib/installAscend";
import { Field, inputClass } from "@/components/Field";
import { localDateKey } from "@/lib/date";
import { DelightEmptyState } from "@/components/Delight";
import { pickNativeImage } from "@/lib/nativeImagePicker";

type FoodLog = Awaited<ReturnType<typeof getFoodLogs>>["foodLogs"][number];
type FoodUser = Awaited<ReturnType<typeof getMe>>["user"];
type WeightLog = Awaited<ReturnType<typeof getWeightLogs>>["weightLogs"][number];
type ResolvedNutritionTargets = Awaited<ReturnType<typeof getMyNutritionTargets>>["targets"];
type RangeFilter = "today" | "7d" | "30d" | "all";
type OrderFilter = "newest" | "oldest";
type SavedMealSummary = {
  foodName: string;
  calories: number;
  proteinG: number;
};
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
const rangeOptions: Array<{ label: string; value: RangeFilter }> = [
  { label: "Today", value: "today" },
  { label: "Last 7 Days", value: "7d" },
  { label: "Last 30 Days", value: "30d" },
  { label: "All Time", value: "all" }
];

function asNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

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
  if (error instanceof Error && /quota|billing|AI provider|temporarily unavailable|timed out|malformed response|empty result|request was rejected/i.test(error.message)) {
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

function formatHistoryTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "--:--";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function dateLabel(dateKey: string) {
  const today = localDateKey();
  const yesterday = localDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
  if (dateKey === today) return "Today";
  if (dateKey === yesterday) return "Yesterday";
  const date = new Date(`${dateKey}T12:00:00`);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", year: "numeric" })
    : dateKey;
}

function dateKeysForRange(range: RangeFilter) {
  if (range === "all") return [];
  const days = range === "today" ? 1 : range === "7d" ? 7 : 30;
  return Array.from({ length: days }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - index);
    return localDateKey(date);
  });
}

function parseAiEstimate(raw: unknown): { confidence?: number; notes?: string } {
  if (!raw || typeof raw !== "object") return {};
  const source = raw as Record<string, unknown>;
  const confidence = Number(source.confidence ?? source.confidenceScore ?? source.confidence_score);
  const notes = source.notes ?? source.note ?? source.explanation;
  return {
    confidence: Number.isFinite(confidence) ? confidence : undefined,
    notes: typeof notes === "string" ? notes : undefined
  };
}

function summarizeLogs(logs: FoodLog[]) {
  return logs.reduce(
    (total, log) => ({
      calories: total.calories + asNumber(log.calories),
      proteinG: total.proteinG + asNumber(log.protein_g),
      carbsG: total.carbsG + asNumber(log.carbs_g),
      fatG: total.fatG + asNumber(log.fat_g)
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }
  );
}

function complianceStatus(logs: FoodLog[], totals: ReturnType<typeof summarizeLogs>, targets: ReturnType<typeof calculateAdaptiveNutritionTargets>) {
  if (!logs.length) return { label: "No Food Logged", tone: "danger" as const };
  const proteinRatio = targets.proteinTargetG ? totals.proteinG / targets.proteinTargetG : 0;
  const calorieRatio = targets.calorieTarget ? totals.calories / targets.calorieTarget : 0;
  if (logs.length >= 2 && proteinRatio >= 0.8 && calorieRatio >= 0.65 && calorieRatio <= 1.15) {
    return { label: "Strong Day", tone: "success" as const };
  }
  return { label: "Partially Logged", tone: "warning" as const };
}

function mealObservations(logs: FoodLog[], totals: ReturnType<typeof summarizeLogs>, targets: ReturnType<typeof calculateAdaptiveNutritionTargets>) {
  if (!logs.length) return ["No meals logged for this date."];

  const observations: string[] = [];
  const proteinRatio = targets.proteinTargetG ? totals.proteinG / targets.proteinTargetG : 0;
  const calorieRatio = targets.calorieTarget ? totals.calories / targets.calorieTarget : 0;
  const lateNightMeal = logs.some((log) => {
    const hour = new Date(log.logged_at).getHours();
    return hour >= 22 || hour < 4;
  });

  observations.push(proteinRatio >= 0.9 ? "Protein target achieved." : "Protein could use a top-up.");
  if (calorieRatio >= 0.8 && calorieRatio <= 1.1) observations.push("Calories are close to your daily guide.");
  if (calorieRatio > 1.1) observations.push("Calories are above today's guide.");
  if (calorieRatio < 0.8) observations.push("Calories are still below today's guide.");
  observations.push(logs.length >= 2 ? "Good logging consistency for the day." : "One meal logged so far.");
  if (lateNightMeal) observations.push("Late-night meal recorded.");

  return observations;
}

function progressPercent(value: number, target: number) {
  if (!Number.isFinite(value) || !Number.isFinite(target) || target <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((value / target) * 100)));
}

function MacroProgress({ label, value, target, unit = "g" }: { label: string; value: number; target: number; unit?: string }) {
  const percentage = progressPercent(value, target);
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-zinc-200">{label}</span>
        <span className="text-zinc-400">{Math.round(value)}{unit} <span className="text-zinc-600">/</span> {Math.round(target)}{unit}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink">
        <div className="ascend-food-progress h-full rounded-full bg-lime" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

export function FoodLogClient({ initialView = "log" }: { initialView?: "log" | "history" }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedImageDataUrl, setSelectedImageDataUrl] = useState<string | null>(null);
  const [manualMealText, setManualMealText] = useState("");
  const [estimate, setEstimate] = useState<FoodEstimate | null>(null);
  const [foodLogs, setFoodLogs] = useState<FoodLog[]>([]);
  const [historyLogs, setHistoryLogs] = useState<FoodLog[]>([]);
  const [historyRange, setHistoryRange] = useState<RangeFilter>("7d");
  const [historyOrder, setHistoryOrder] = useState<OrderFilter>("newest");
  const [historyNextOffset, setHistoryNextOffset] = useState<number | null>(null);
  const [historyStatus, setHistoryStatus] = useState("");
  const [isLoadingHistoryMore, setIsLoadingHistoryMore] = useState(false);
  const [user, setUser] = useState<FoodUser | null>(null);
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [resolvedTargets, setResolvedTargets] = useState<ResolvedNutritionTargets | null>(null);
  const [status, setStatus] = useState("Upload a food photo to estimate calories and macros.");
  const [isEstimating, setIsEstimating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [wasEdited, setWasEdited] = useState(false);
  const [aiFailed, setAiFailed] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [showEstimateEditor, setShowEstimateEditor] = useState(false);
  const [savedMeal, setSavedMeal] = useState<SavedMealSummary | null>(null);
  const [allowance, setAllowance] = useState<FoodAiAllowance | null>(null);
  const [view, setView] = useState<"log" | "history">(initialView);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const foodNameInputRef = useRef<HTMLInputElement | null>(null);
  const foodLogsRequestRef = useRef(0);
  const saveLockRef = useRef(false);

  async function loadFoodLogs() {
    const requestId = ++foodLogsRequestRef.current;
    const response = await getFoodLogs();
    if (requestId === foodLogsRequestRef.current) {
      setFoodLogs(response.foodLogs);
    }
  }

  const loadHistoryLogs = useCallback(async (offset = 0, append = false) => {
    setHistoryStatus(offset ? "" : "Loading your meal history...");
    const response = await getFoodLogs({ range: historyRange, order: historyOrder, limit: 30, offset });
    setHistoryLogs((current) => append ? [...current, ...response.foodLogs] : response.foodLogs);
    setHistoryNextOffset(response.nextOffset ?? null);
    setHistoryStatus("");
  }, [historyOrder, historyRange]);

  async function loadUser() {
    const [response, weights, targets] = await Promise.all([getMe(), getWeightLogs(), getMyNutritionTargets()]);
    setUser(response.user);
    setWeightLogs(weights.weightLogs);
    setResolvedTargets(targets.targets);
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

  useEffect(() => {
    if (view !== "history") return;
    loadHistoryLogs().catch((error) => {
      setHistoryStatus(error instanceof Error ? error.message : "Could not load meal history.");
    });
  }, [view, loadHistoryLogs]);

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

  const nutritionTargets = useMemo(() => calculateAdaptiveNutritionTargets({
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
  }, weightLogs.map((log) => ({ weightKg: log.weight_kg, loggedAt: log.logged_at }))), [user, weightLogs]);

  const effectiveNutritionTargets = useMemo(() => ({
    ...nutritionTargets,
    calorieTarget: resolvedTargets?.calories ?? nutritionTargets.calorieTarget,
    proteinTargetG: resolvedTargets?.proteinG ?? nutritionTargets.proteinTargetG,
    carbsTargetG: resolvedTargets?.carbsG ?? nutritionTargets.carbsTargetG,
    fatTargetG: resolvedTargets?.fatG ?? nutritionTargets.fatTargetG,
    waterTargetMl: resolvedTargets?.waterMl ?? nutritionTargets.waterTargetMl
  }), [nutritionTargets, resolvedTargets]);

  const canSaveEstimate = useMemo(() => {
    if (!estimate) return false;
    return estimate.foodName.trim().length > 0 && Number(estimate.calories) > 0;
  }, [estimate]);

  const currentMealInsight = estimate ? mealInsight(estimate, effectiveNutritionTargets) : null;
  const groupedHistoryDays = useMemo(() => {
    const map = new Map<string, FoodLog[]>();
    for (const log of historyLogs) {
      const key = localDateKey(log.logged_at);
      if (!key) continue;
      map.set(key, [...(map.get(key) ?? []), log]);
    }

    const visibleKeys = historyRange === "all"
      ? Array.from(map.keys()).sort((a, b) => historyOrder === "newest" ? b.localeCompare(a) : a.localeCompare(b))
      : dateKeysForRange(historyRange);

    return visibleKeys.map((dateKey) => {
      const logs = [...(map.get(dateKey) ?? [])].sort((a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime());
      const totals = summarizeLogs(logs);
      const status = complianceStatus(logs, totals, effectiveNutritionTargets);
      return {
        dateKey,
        logs,
        totals,
        status,
        observations: mealObservations(logs, totals, effectiveNutritionTargets)
      };
    });
  }, [effectiveNutritionTargets, historyLogs, historyOrder, historyRange]);

  async function loadMoreHistory() {
    if (historyNextOffset === null) return;
    setIsLoadingHistoryMore(true);
    try {
      await loadHistoryLogs(historyNextOffset, true);
    } catch (error) {
      setHistoryStatus(error instanceof Error ? error.message : "Could not load more meals.");
    } finally {
      setIsLoadingHistoryMore(false);
    }
  }

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

  function beginSelectedFileFlow(file: File | null, traceSource = "image-selected-auto-analysis") {
    const trace = createFrontendFoodAiTrace(traceSource, user);
    if (!file) return;
    markFrontendStage(trace, "Image selected", { sizeBytes: file.size, type: file.type });

    setPreviewUrl(URL.createObjectURL(file));
    setSelectedFile(file);
    setEstimate(null);
    setManualMealText("");
    setWasEdited(false);
    setAiFailed(false);
    setSavedMeal(null);
    setShowEstimateEditor(false);
    setShowManualEntry(false);
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
        setShowEstimateEditor(false);
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
        setShowEstimateEditor(true);
        setStatus(estimateFailureMessage(error));
        loadAllowance().catch(() => {});
        window.setTimeout(() => {
          markFrontendStage(trace, "Result rendered to user", { state: "manual_fallback" });
          logFrontendFoodAiReport(trace);
        }, 0);
      })
      .finally(() => setIsEstimating(false));
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    beginSelectedFileFlow(file);
  }

  async function openCameraPicker() {
    if (isEstimating || isSaving) return;
    try {
      const nativeFile = await pickNativeImage("camera");
      if (nativeFile) {
        beginSelectedFileFlow(nativeFile, "native-camera-auto-analysis");
        return;
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Camera could not open yet. Try again.");
      return;
    }
    cameraInputRef.current?.click();
  }

  async function openGalleryPicker() {
    if (isEstimating || isSaving) return;
    try {
      const nativeFile = await pickNativeImage("gallery");
      if (nativeFile) {
        beginSelectedFileFlow(nativeFile, "native-gallery-auto-analysis");
        return;
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Photo library could not open yet. Try again.");
      return;
    }
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
    setSavedMeal(null);
    setShowEstimateEditor(false);

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
      setShowEstimateEditor(false);
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
        setShowEstimateEditor(true);
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

  async function handleTextEstimate() {
    const description = manualMealText.trim();
    if (description.length < 2) {
      setStatus("Type what you ate first, for example chicken rice or 2 eggs and toast.");
      return;
    }
    setIsEstimating(true);
    setAiFailed(false);
    setEstimate(null);
    setPreviewUrl(null);
    setSelectedFile(null);
    setSelectedImageDataUrl(null);
    setWasEdited(false);
    setSavedMeal(null);
    setShowEstimateEditor(false);
    setStatus("Analysing your meal description...");

    try {
      const response = await estimateFoodFromText(description);
      setEstimate(response.estimate);
      if (response.allowance) setAllowance(response.allowance);
      setShowEstimateEditor(false);
      setStatus("Meal estimate ready. Review, edit if needed, then save.");
    } catch (error) {
      setEstimate({
        foodName: description,
        confidence: 0,
        calories: 0,
        proteinG: 0,
        carbsG: 0,
        fatG: 0,
        notes: "AI could not estimate this text reliably. Please add the calories and macros before saving."
      });
      setWasEdited(true);
      setAiFailed(true);
      setShowEstimateEditor(true);
      setStatus(estimateFailureMessage(error));
      loadAllowance().catch(() => {});
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
    setStatus(selectedImageDataUrl ? "Saving food log and photo..." : "Saving food log...");

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
        description: manualMealText.trim() || undefined,
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
      setHistoryLogs((current) => [
        {
          ...response.foodLog,
          image_url: previewUrl
        },
        ...current.filter((log) => log.id !== response.foodLog.id)
      ]);
      loadFoodLogs().catch(() => {});
      setSavedMeal({
        foodName: savedLog.estimatedFoodName,
        calories: savedLog.calories,
        proteinG: savedLog.proteinG
      });
      setPreviewUrl(null);
      setEstimate(null);
      setSelectedFile(null);
      setSelectedImageDataUrl(null);
      setWasEdited(false);
      setAiFailed(false);
      setShowManualEntry(false);
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
            <h1 className="text-2xl font-semibold">{view === "history" ? "All meals" : "Log a meal"}</h1>
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
                {todaysFoodLogs.length ? `${todaysFoodLogs.length} meals logged` : "Your first meal today will appear here."}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-semibold">{todaysTotals.calories}</p>
              <p className="text-xs text-zinc-400">of {effectiveNutritionTargets.calorieTarget.toLocaleString()} kcal</p>
            </div>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-ink">
            <div
              className="h-full rounded-full bg-lime"
              style={{ width: `${Math.min(100, Math.round((todaysTotals.calories / effectiveNutritionTargets.calorieTarget) * 100))}%` }}
            />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-ink p-2">
              <p className="text-[10px] uppercase text-zinc-500">Protein</p>
              <p className="mt-1 text-sm font-semibold">{Math.round(todaysTotals.proteinG)} / {effectiveNutritionTargets.proteinTargetG}g</p>
            </div>
            <div className="rounded-lg bg-ink p-2">
              <p className="text-[10px] uppercase text-zinc-500">Carbs</p>
              <p className="mt-1 text-sm font-semibold">{Math.round(todaysTotals.carbsG)} / {effectiveNutritionTargets.carbsTargetG}g</p>
            </div>
            <div className="rounded-lg bg-ink p-2">
              <p className="text-[10px] uppercase text-zinc-500">Fat</p>
              <p className="mt-1 text-sm font-semibold">{Math.round(todaysTotals.fatG)} / {effectiveNutritionTargets.fatTargetG}g</p>
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
                        <img src={log.image_url} alt={log.estimated_food_name} className="h-14 w-14 shrink-0 rounded-lg object-cover" loading="lazy" decoding="async" />
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
          <>
            <section className="mt-3 rounded-lg border border-line bg-surface p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CalendarDays className="text-lime" size={19} />
                  <h2 className="text-base font-semibold">Meal history filters</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setView("log")}
                  className="rounded-lg bg-lime px-3 py-2 text-sm font-semibold text-ink"
                >
                  Add meal
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {rangeOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setHistoryRange(option.value)}
                    className={`h-11 rounded-lg border px-2 text-sm font-semibold ${
                      historyRange === option.value ? "border-lime bg-lime text-ink" : "border-line bg-ink text-zinc-300"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setHistoryOrder((current) => current === "newest" ? "oldest" : "newest")}
                className="mt-3 h-11 w-full rounded-lg border border-line bg-ink text-sm font-semibold text-zinc-200"
              >
                {historyOrder === "newest" ? "Newest First" : "Oldest First"}
              </button>
            </section>

            {historyStatus ? <p className="mt-3 rounded-lg border border-line bg-surface p-3 text-sm text-zinc-300">{historyStatus}</p> : null}

            <section className="mt-3 space-y-4">
              {groupedHistoryDays.map((day) => (
                <article key={day.dateKey} className="rounded-lg border border-line bg-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold">{dateLabel(day.dateKey)}</h2>
                      <p className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                        day.status.tone === "success"
                          ? "bg-lime text-ink"
                          : day.status.tone === "warning"
                            ? "bg-amber/20 text-amber"
                            : "bg-red-500/15 text-red-300"
                      }`}>
                        {day.status.label}
                      </p>
                    </div>
                    <span className="rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-lime">{day.logs.length} meals</span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {[
                      ["Calories", `${Math.round(day.totals.calories).toLocaleString()} kcal`],
                      ["Protein", `${Math.round(day.totals.proteinG)}g`],
                      ["Carbs", `${Math.round(day.totals.carbsG)}g`],
                      ["Fat", `${Math.round(day.totals.fatG)}g`]
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-lg bg-ink p-3">
                        <p className="text-xs uppercase text-zinc-500">{label}</p>
                        <p className="mt-1 text-lg font-semibold">{value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 rounded-lg bg-ink p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-lime">Daily notes</p>
                    <div className="mt-2 space-y-1">
                      {day.observations.map((observation) => (
                        <p key={observation} className="text-sm leading-6 text-zinc-300">{observation}</p>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    {day.logs.map((log) => {
                      const ai = parseAiEstimate(log.ai_estimate_raw);
                      return (
                        <div key={log.id} className="rounded-lg bg-ink p-3">
                          <div className="flex items-start gap-3">
                            {log.image_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={log.image_url} alt={log.estimated_food_name} className="h-16 w-16 shrink-0 rounded-lg object-cover" loading="lazy" decoding="async" />
                            ) : (
                              <div className="grid h-16 w-16 shrink-0 place-items-center rounded-lg bg-surface text-zinc-500">
                                <Utensils size={18} />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold">{log.estimated_food_name}</p>
                                  <p className="mt-1 text-xs text-zinc-500">{formatHistoryTime(log.logged_at)}</p>
                                </div>
                                <p className="shrink-0 text-sm font-semibold">{Math.round(asNumber(log.calories))} kcal</p>
                              </div>
                              <p className="mt-2 text-xs text-zinc-400">
                                P {Math.round(asNumber(log.protein_g))}g / C {Math.round(asNumber(log.carbs_g))}g / F {Math.round(asNumber(log.fat_g))}g
                              </p>
                              {ai.confidence !== undefined ? (
                                <p className="mt-2 text-xs text-zinc-500">AI confidence: {Math.round(ai.confidence * 100)}%</p>
                              ) : null}
                              {ai.notes || log.description ? (
                                <p className="mt-2 text-xs leading-5 text-zinc-400">{ai.notes ?? log.description}</p>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {!day.logs.length ? <p className="rounded-lg bg-ink p-3 text-sm text-zinc-400">No meals were recorded on this date.</p> : null}
                  </div>
                </article>
              ))}

              {!groupedHistoryDays.length && !historyStatus ? (
                <article>
                  <DelightEmptyState
                    tone="teal"
                    title="Your meal story starts with one photo."
                    body="No meals match this view yet. Try another range or log your next meal when you're ready."
                    action={
                      <button
                        type="button"
                        onClick={() => setView("log")}
                        className="ascend-pressable flex h-11 w-full items-center justify-center rounded-lg bg-lime font-semibold text-ink"
                      >
                        Log your first meal
                      </button>
                    }
                  />
                </article>
              ) : null}
            </section>

            {historyNextOffset !== null ? (
              <button
                type="button"
                disabled={isLoadingHistoryMore}
                onClick={loadMoreHistory}
                className="ascend-pressable mt-4 h-12 w-full rounded-lg border border-lime/40 bg-lime/10 font-semibold text-lime disabled:opacity-60"
              >
                {isLoadingHistoryMore ? "Loading..." : "Load more meals"}
              </button>
            ) : null}
          </>
        ) : (
          <>
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

        {savedMeal ? (
          <section className="ascend-food-result mt-3 overflow-hidden rounded-lg border border-lime/35 bg-surface p-5 text-center" aria-live="polite">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-lime text-ink shadow-[0_0_32px_rgba(53,242,208,0.28)]">
              <Check size={28} strokeWidth={2.5} />
            </div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-lime">Meal saved</p>
            <h2 className="mt-2 text-xl font-semibold">{savedMeal.foodName}</h2>
            <p className="mt-2 text-sm text-zinc-400">{Math.round(savedMeal.calories)} kcal / {Math.round(savedMeal.proteinG)}g protein</p>
            <p className="mt-4 text-sm leading-6 text-zinc-300">Your daily progress has been updated.</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setView("history")} className="ascend-pressable h-12 rounded-lg border border-line bg-ink font-semibold text-white">
                Meal history
              </button>
              <button type="button" onClick={() => setSavedMeal(null)} className="ascend-pressable h-12 rounded-lg bg-lime font-semibold text-ink">
                Log another
              </button>
            </div>
          </section>
        ) : !estimate ? (
          <section className="mt-3 overflow-hidden rounded-lg border border-line bg-surface">
            <div className="relative aspect-[4/3] overflow-hidden bg-ink">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="Selected meal" className="h-full w-full object-cover" />
              ) : (
                <button type="button" onClick={openCameraPicker} disabled={isEstimating || isSaving} className="grid h-full w-full place-items-center p-6 text-center disabled:opacity-60">
                  <span>
                    <span className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-lime/30 bg-lime/10 text-lime shadow-[0_0_32px_rgba(53,242,208,0.12)]">
                      <Camera size={30} />
                    </span>
                    <span className="mt-4 block text-lg font-semibold text-white">Photograph your meal</span>
                    <span className="mt-2 block text-sm text-zinc-400">Ascend reads the food and prepares an estimate.</span>
                  </span>
                </button>
              )}

              <span className="pointer-events-none absolute left-4 top-4 h-7 w-7 border-l-2 border-t-2 border-lime" />
              <span className="pointer-events-none absolute right-4 top-4 h-7 w-7 border-r-2 border-t-2 border-lime" />
              <span className="pointer-events-none absolute bottom-4 left-4 h-7 w-7 border-b-2 border-l-2 border-lime" />
              <span className="pointer-events-none absolute bottom-4 right-4 h-7 w-7 border-b-2 border-r-2 border-lime" />

              {isEstimating ? (
                <div className="absolute inset-0 grid place-items-center bg-black/65 px-6 text-center" aria-live="polite">
                  <div>
                    <Sparkles className="mx-auto text-lime" size={30} />
                    <p className="mt-3 text-lg font-semibold text-white">Reading your meal</p>
                    <p className="mt-2 text-sm text-zinc-300">Identifying foods and estimating portions...</p>
                  </div>
                  <div className="ascend-food-scan-line absolute left-4 right-4 h-px bg-lime shadow-[0_0_14px_rgba(53,242,208,0.95)]" />
                </div>
              ) : null}
            </div>

            <div className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">AI meal estimate</p>
                  <p className="mt-1 text-xs text-zinc-500">{allowance?.label ?? "Food photo analysis"}</p>
                </div>
                <span className="rounded-full border border-lime/30 bg-lime/10 px-3 py-1 text-xs font-semibold text-lime">{allowanceText(allowance)}</span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <button type="button" onClick={openCameraPicker} disabled={isEstimating || isSaving} className="ascend-pressable flex h-12 items-center justify-center rounded-lg bg-lime font-semibold text-ink disabled:opacity-60">
                  <Camera className="mr-2" size={18} />
                  {previewUrl ? "Retake" : "Take photo"}
                </button>
                <button type="button" onClick={openGalleryPicker} disabled={isEstimating || isSaving} className="ascend-pressable flex h-12 items-center justify-center rounded-lg border border-line bg-ink font-semibold text-white disabled:opacity-60">
                  <ImagePlus className="mr-2" size={18} />
                  Gallery
                </button>
              </div>

              <button type="button" onClick={() => setShowManualEntry((current) => !current)} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold text-zinc-300">
                <Utensils size={17} />
                Type meal instead
                {showManualEntry ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {showManualEntry ? (
                <div className="ascend-soft-enter mt-2 rounded-lg border border-line bg-ink p-3">
                  <label className="text-sm font-semibold text-zinc-100" htmlFor="manual-meal-text">What did you eat?</label>
                  <textarea
                    id="manual-meal-text"
                    value={manualMealText}
                    onChange={(event) => setManualMealText(event.target.value)}
                    disabled={isEstimating || isSaving}
                    rows={2}
                    className="mt-3 w-full resize-none rounded-lg border border-line bg-surface px-4 py-3 text-base text-white outline-none transition focus:border-lime disabled:opacity-60"
                    placeholder="Chicken rice, protein shake..."
                  />
                  <button type="button" disabled={isEstimating || manualMealText.trim().length < 2} onClick={handleTextEstimate} className="mt-3 flex h-12 w-full items-center justify-center rounded-lg bg-lime font-semibold text-ink disabled:opacity-50">
                    <Sparkles className="mr-2" size={18} />
                    {isEstimating ? "Analysing..." : "Analyse meal"}
                  </button>
                </div>
              ) : null}

              {previewUrl && !isEstimating ? (
                <button type="button" onClick={handleEstimate} className="mt-3 flex h-12 w-full items-center justify-center rounded-lg bg-lime font-semibold text-ink">
                  <Sparkles className="mr-2" size={18} />
                  Analyse meal
                </button>
              ) : null}
              <p className="mt-3 text-center text-[11px] leading-5 text-zinc-500">Estimates can be reviewed before anything is saved.</p>
            </div>
          </section>
        ) : (
          <form className="ascend-food-result mt-3 overflow-hidden rounded-lg border border-line bg-surface">
            {previewUrl ? (
              <div className="relative aspect-[16/9] overflow-hidden bg-ink">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt={estimate.foodName || "Analysed meal"} className="h-full w-full object-cover" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-4 pb-4 pt-12">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-lime">Meal identified</p>
                  <h2 className="mt-1 text-xl font-semibold text-white">{estimate.foodName || "Review this meal"}</h2>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 border-b border-line p-4">
                <div className="grid h-11 w-11 place-items-center rounded-lg bg-lime/10 text-lime"><Utensils size={21} /></div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-lime">Meal identified</p>
                  <h2 className="mt-1 text-lg font-semibold">{estimate.foodName || "Review this meal"}</h2>
                </div>
              </div>
            )}

            <div className="p-4">
              <div className="flex items-center gap-5">
                <div
                  className="grid h-28 w-28 shrink-0 place-items-center rounded-full p-[7px] shadow-[0_0_34px_rgba(53,242,208,0.13)]"
                  style={{ background: `conic-gradient(rgb(53 242 208) ${progressPercent(estimate.calories, effectiveNutritionTargets.calorieTarget) * 3.6}deg, rgba(113,113,122,0.2) 0deg)` }}
                >
                  <div className="grid h-full w-full place-items-center rounded-full bg-ink text-center">
                    <span>
                      <strong className="block text-2xl font-semibold text-white">{Math.round(estimate.calories)}</strong>
                      <span className="text-xs text-zinc-400">kcal</span>
                    </span>
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Estimated nutrition</p>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">Review the estimate, then save it to today.</p>
                  <p className="mt-2 text-xs text-zinc-500">{Math.round(estimate.confidence * 100)}% AI confidence</p>
                </div>
              </div>

              <div className="mt-5 space-y-4 rounded-lg bg-ink p-4">
                <MacroProgress label="Protein" value={estimate.proteinG} target={effectiveNutritionTargets.proteinTargetG} />
                <MacroProgress label="Carbohydrates" value={estimate.carbsG} target={effectiveNutritionTargets.carbsTargetG} />
                <MacroProgress label="Fat" value={estimate.fatG} target={effectiveNutritionTargets.fatTargetG} />
              </div>

              {currentMealInsight ? (
                <div className="mt-4 rounded-lg border border-lime/25 bg-lime/10 p-3">
                  <p className="text-sm font-semibold text-lime">{currentMealInsight.title}</p>
                  <p className="mt-1 text-sm leading-6 text-zinc-200">{currentMealInsight.detail}</p>
                </div>
              ) : null}

              {aiFailed ? (
                <div className="mt-4 rounded-lg border border-amber/40 bg-amber/10 p-3">
                  <p className="text-sm leading-6 text-amber">{status}</p>
                  <button className="mt-3 flex h-11 w-full items-center justify-center rounded-lg bg-amber font-semibold text-ink disabled:opacity-60" disabled={isEstimating} onClick={selectedFile ? handleEstimate : handleTextEstimate} type="button">
                    <Sparkles className="mr-2" size={18} />
                    {isEstimating ? "Trying again..." : "Try AI again"}
                  </button>
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => {
                  setShowEstimateEditor((current) => !current);
                  window.setTimeout(() => foodNameInputRef.current?.focus(), 0);
                }}
                className="mt-4 flex h-11 w-full items-center justify-between rounded-lg border border-line bg-ink px-4 text-sm font-semibold text-zinc-200"
              >
                <span className="flex items-center gap-2"><Pencil size={17} /> Edit estimate</span>
                {showEstimateEditor ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
              </button>

              {showEstimateEditor ? (
                <div className="ascend-soft-enter mt-3 space-y-4 rounded-lg border border-line bg-ink p-4">
                  <Field label="Detected foods"><input ref={foodNameInputRef} className={inputClass} value={estimate.foodName} onChange={(event) => updateEstimate("foodName", event.target.value)} /></Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Calories"><input className={inputClass} inputMode="numeric" value={estimate.calories} onChange={(event) => updateEstimate("calories", Number(event.target.value))} /></Field>
                    <Field label="Protein"><input className={inputClass} inputMode="decimal" value={estimate.proteinG} onChange={(event) => updateEstimate("proteinG", Number(event.target.value))} /></Field>
                    <Field label="Carbs"><input className={inputClass} inputMode="decimal" value={estimate.carbsG} onChange={(event) => updateEstimate("carbsG", Number(event.target.value))} /></Field>
                    <Field label="Fat"><input className={inputClass} inputMode="decimal" value={estimate.fatG} onChange={(event) => updateEstimate("fatG", Number(event.target.value))} /></Field>
                  </div>
                  <p className="text-xs leading-5 text-zinc-500">Macro calories: {macroTotal} kcal. {estimate.notes}</p>
                </div>
              ) : null}

              <button type="button" disabled={isSaving || !canSaveEstimate} onClick={handleSave} className="ascend-pressable mt-4 flex h-14 w-full items-center justify-center rounded-lg bg-lime text-base font-semibold text-ink shadow-[0_12px_30px_rgba(53,242,208,0.16)] disabled:cursor-not-allowed disabled:opacity-60">
                {wasEdited ? <Save className="mr-2" size={19} /> : <Check className="mr-2" size={19} />}
                {isSaving ? "Saving meal..." : "Save meal"}
              </button>
              <button type="button" onClick={previewUrl ? openCameraPicker : () => { setEstimate(null); setShowManualEntry(true); }} disabled={isSaving} className="mt-2 h-11 w-full rounded-lg text-sm font-semibold text-zinc-400 disabled:opacity-60">
                {previewUrl ? "Retake photo" : "Change description"}
              </button>
              {!aiFailed && status.startsWith("Could not") ? <p className="mt-3 text-center text-sm text-red-300">{status}</p> : null}
            </div>
          </form>
        )}
          </>
        )}
      </div>
    </main>
  );
}

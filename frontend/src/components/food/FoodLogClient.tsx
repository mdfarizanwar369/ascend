"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CalendarDays, Camera, Check, ChevronDown, ChevronUp, ImagePlus, Mic, Pencil, Save, SlidersHorizontal, Sparkles, Square, Trash2, Utensils } from "lucide-react";
import {
  aggregatePortionNutrition,
  calculateAdaptiveNutritionTargets,
  FoodEstimate,
  FoodPortionItem,
  PORTION_QUANTITY_MAXIMUMS,
  recalculatePortionItem
} from "@ascend/shared";
import {
  estimateFoodFromDataUrl,
  estimateFoodFromText,
  deleteFoodLog,
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
import { TrackingPageHeader } from "@/components/tracking/TrackingVisuals";
import { clearPendingFoodLog, rememberSavedFoodLog } from "@/lib/dataSync";
import { markInstallEligible } from "@/lib/installAscend";
import { Field, inputClass } from "@/components/Field";
import { localDateKey } from "@/lib/date";
import { DelightEmptyState } from "@/components/Delight";
import { pickNativeImage } from "@/lib/nativeImagePicker";
import {
  cancelMealSpeechRecognition,
  getMealSpeechAvailability,
  isMealSpeechCancellation,
  isMealSpeechPotentiallyAvailable,
  mealSpeechErrorMessage,
  startMealSpeechRecognition,
  stopMealSpeechRecognition
} from "@/lib/mealSpeech";
import { messages } from "@/lib/i18n/messages";
import { renderedMessages } from "@/lib/i18n/renderedMessages";
import { useI18n } from "@/lib/i18n/I18nProvider";

type FoodLog = Awaited<ReturnType<typeof getFoodLogs>>["foodLogs"][number];
type FoodUser = Awaited<ReturnType<typeof getMe>>["user"];
type WeightLog = Awaited<ReturnType<typeof getWeightLogs>>["weightLogs"][number];
type ResolvedNutritionTargets = Awaited<ReturnType<typeof getMyNutritionTargets>>["targets"];
type RangeFilter = "today" | "7d" | "30d" | "all";
type OrderFilter = "newest" | "oldest";
type Translate = (key: string, values?: Record<string, string | number>) => string;
type SavedMealSummary = {
  foodName: string;
  calories: number;
  proteinG: number;
  imagePreviewUrl: string | null;
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

function english(key: string, values?: Record<string, string | number>) {
  let value = renderedMessages.en[key] ?? messages.en[key] ?? key;
  for (const [name, replacement] of Object.entries(values ?? {})) {
    value = value.replaceAll(`{${name}}`, String(replacement));
  }
  return value;
}

const frontendFoodAiPerformanceEnabled = process.env.NEXT_PUBLIC_FOOD_AI_PERFORMANCE_LOGS === "true";
const rangeOptions: Array<{ labelKey: string; value: RangeFilter }> = [
  { labelKey: "client360.today", value: "today" },
  { labelKey: "client360.last7Days", value: "7d" },
  { labelKey: "client360.last30Days", value: "30d" },
  { labelKey: "food.allTime", value: "all" }
];

function asNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function manualEstimate(t: Translate, source: "photo" | "text" = "photo"): FoodEstimate {
  return {
    foodName: "",
    confidence: 0,
    calories: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    notes: t(source === "photo" ? "food.manualPhotoFallbackNote" : "food.manualTextFallbackNote")
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

function estimateFailureMessage(error: unknown, t: Translate = english) {
  if (error instanceof Error && /Premium plan required/i.test(error.message)) {
    return t("food.aiPremiumRequired");
  }
  if (error instanceof Error && /limit reached/i.test(error.message)) {
    return error.message;
  }
  if (error instanceof Error && /quota|billing|AI provider|temporarily unavailable|timed out|malformed response|empty result|request was rejected/i.test(error.message)) {
    return t("food.estimateFailure");
  }
  return t("food.estimateFailure");
}

function allowanceText(allowance: FoodAiAllowance | null, t: Translate = english) {
  if (!allowance) return t("food.checkingAllowance");
  if (allowance.limit === null) return t("food.unlimitedOwnerScans");
  const used = Math.min(allowance.used, allowance.limit);
  return t(allowance.period === "week" ? "food.allowanceUsedWeek" : "food.allowanceUsedToday", { used, limit: allowance.limit });
}

function allowanceHint(allowance: FoodAiAllowance | null, t: Translate = english) {
  if (!allowance) return t("food.allowancePlaceholder");
  if (allowance.limit === null) return t("food.ownerScansTracked");
  if ((allowance.remaining ?? 0) <= 0) return t("food.manualUntilReset");
  return t("food.aiScansRemaining", { count: allowance.remaining ?? 0 });
}

function portionLabel(value: FoodEstimate["visiblePortionLabel"], t: Translate = english) {
  if (!value || value === "unknown") return t("food.standardEstimate");
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function formatPortionItemQuantity(item: FoodPortionItem, t: Translate = english) {
  if (item.estimatedQuantity === null && item.portionSource === "standard_serving_fallback") return t("food.standardServing");
  const quantity = item.finalQuantity ?? item.estimatedQuantity;
  if (quantity === null) return t("food.amountUnclear");
  const unit = item.unit === "piece" || item.unit === "slice" || item.unit === "serving"
    ? `${item.unit}${quantity === 1 ? "" : "s"}`
    : item.unit;
  return `${quantity}${item.unit === "g" || item.unit === "ml" ? "" : " "}${unit}`;
}

function PortionQuantityInput({ item, onCommit }: { item: FoodPortionItem; onCommit: (quantity: number) => void }) {
  const quantity = item.finalQuantity ?? item.estimatedQuantity ?? item.nutritionBasis.amount;
  const [draft, setDraft] = useState(String(quantity));

  useEffect(() => setDraft(String(quantity)), [quantity]);

  function commit(value: string) {
    setDraft(value);
    if (!value.trim()) return;
    const number = Number(value);
    if (Number.isFinite(number) && number > 0 && number <= PORTION_QUANTITY_MAXIMUMS[item.unit]) onCommit(number);
  }

  return (
    <input
      id={`portion-${item.id}`}
      aria-label={`${item.name} quantity`}
      className="h-10 w-24 rounded-lg border border-line bg-ink px-3 text-right text-sm text-white outline-none focus:border-lime"
      inputMode="decimal"
      min="0.5"
      max={PORTION_QUANTITY_MAXIMUMS[item.unit]}
      step={item.unit === "g" || item.unit === "ml" ? 5 : 0.5}
      type="number"
      value={draft}
      onChange={(event) => commit(event.target.value)}
      onBlur={() => {
        const number = Number(draft);
        if (!draft.trim() || !Number.isFinite(number) || number <= 0 || number > PORTION_QUANTITY_MAXIMUMS[item.unit]) {
          setDraft(String(quantity));
        }
      }}
    />
  );
}

function mealInsight(estimate: FoodEstimate, targets: ReturnType<typeof calculateAdaptiveNutritionTargets>, t: Translate = english) {
  const calorieShare = estimate.calories / targets.calorieTarget;
  const proteinCalories = estimate.proteinG * 4;
  const proteinRatio = estimate.calories > 0 ? proteinCalories / estimate.calories : 0;
  const fatShare = estimate.fatG / targets.fatTargetG;
  const carbsShare = estimate.carbsG / targets.carbsTargetG;

  if (estimate.calories <= 0) {
    return {
      title: t("food.insight.add.title"),
      detail: t("food.insight.add.body")
    };
  }

  if (proteinRatio < 0.16 && estimate.proteinG < 25) {
    return {
      title: t("food.insight.protein.title"),
      detail: t("food.insight.protein.body")
    };
  }

  if (fatShare >= 0.55) {
    return {
      title: t("food.insight.fat.title"),
      detail: t("food.insight.fat.body")
    };
  }

  if (carbsShare >= 0.5 && calorieShare < 0.45) {
    return {
      title: t("food.insight.carbs.title"),
      detail: t("food.insight.carbs.body")
    };
  }

  if (calorieShare >= 0.45) {
    return {
      title: t("food.insight.big.title"),
      detail: t("food.insight.big.body")
    };
  }

  return {
    title: t("food.insight.balanced.title"),
    detail: t("food.insight.balanced.body")
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

function dateLabel(dateKey: string, t: Translate = english) {
  const today = localDateKey();
  const yesterday = localDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
  if (dateKey === today) return t("client360.today");
  if (dateKey === yesterday) return t("client360.yesterday");
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

function complianceStatus(logs: FoodLog[], totals: ReturnType<typeof summarizeLogs>, targets: ReturnType<typeof calculateAdaptiveNutritionTargets>, t: Translate = english) {
  if (!logs.length) return { label: t("food.status.none"), tone: "danger" as const };
  const proteinRatio = targets.proteinTargetG ? totals.proteinG / targets.proteinTargetG : 0;
  const calorieRatio = targets.calorieTarget ? totals.calories / targets.calorieTarget : 0;
  if (logs.length >= 2 && proteinRatio >= 0.8 && calorieRatio >= 0.65 && calorieRatio <= 1.15) {
    return { label: t("food.status.strong"), tone: "success" as const };
  }
  return { label: t("food.status.partial"), tone: "warning" as const };
}

function mealObservations(logs: FoodLog[], totals: ReturnType<typeof summarizeLogs>, targets: ReturnType<typeof calculateAdaptiveNutritionTargets>, t: Translate = english) {
  if (!logs.length) return [t("food.observation.none")];

  const observations: string[] = [];
  const proteinRatio = targets.proteinTargetG ? totals.proteinG / targets.proteinTargetG : 0;
  const calorieRatio = targets.calorieTarget ? totals.calories / targets.calorieTarget : 0;
  const lateNightMeal = logs.some((log) => {
    const hour = new Date(log.logged_at).getHours();
    return hour >= 22 || hour < 4;
  });

  observations.push(t(proteinRatio >= 0.9 ? "food.observation.proteinMet" : "food.observation.proteinLow"));
  if (calorieRatio >= 0.8 && calorieRatio <= 1.1) observations.push(t("food.observation.caloriesClose"));
  if (calorieRatio > 1.1) observations.push(t("food.observation.caloriesHigh"));
  if (calorieRatio < 0.8) observations.push(t("food.observation.caloriesLow"));
  observations.push(t(logs.length >= 2 ? "food.observation.loggingGood" : "food.observation.oneMeal"));
  if (lateNightMeal) observations.push(t("food.observation.lateMeal"));

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
  const { t } = useI18n();
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
  const [deletingFoodLogId, setDeletingFoodLogId] = useState<string | null>(null);
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
  const [showPortionEditor, setShowPortionEditor] = useState(false);
  const [showPortionDiagnostics, setShowPortionDiagnostics] = useState(false);
  const [savedMeal, setSavedMeal] = useState<SavedMealSummary | null>(null);
  const [allowance, setAllowance] = useState<FoodAiAllowance | null>(null);
  const [mealSpeechAvailable, setMealSpeechAvailable] = useState(false);
  const [isListeningForMeal, setIsListeningForMeal] = useState(false);
  const [mealSpeechMessage, setMealSpeechMessage] = useState("");
  const [view, setView] = useState<"log" | "history">(initialView);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const foodNameInputRef = useRef<HTMLInputElement | null>(null);
  const foodLogsRequestRef = useRef(0);
  const saveLockRef = useRef(false);
  const mealSpeechRequestRef = useRef(0);
  const mealSpeechLockRef = useRef(false);

  async function loadFoodLogs() {
    const requestId = ++foodLogsRequestRef.current;
    const response = await getFoodLogs();
    if (requestId === foodLogsRequestRef.current) {
      setFoodLogs(response.foodLogs);
    }
  }

  const loadHistoryLogs = useCallback(async (offset = 0, append = false) => {
    setHistoryStatus(offset ? "" : t("food.historyLoading"));
    const response = await getFoodLogs({ range: historyRange, order: historyOrder, limit: 30, offset });
    setHistoryLogs((current) => append ? [...current, ...response.foodLogs] : response.foodLogs);
    setHistoryNextOffset(response.nextOffset ?? null);
    setHistoryStatus("");
  }, [historyOrder, historyRange, t]);

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
      setStatus(t("food.uploadPrompt"));
    });
  }, [t]);

  useEffect(() => {
    let active = true;
    getMealSpeechAvailability().then((availability) => {
      if (active) setMealSpeechAvailable(availability.available);
    });
    return () => {
      active = false;
      mealSpeechRequestRef.current += 1;
      cancelMealSpeechRecognition().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    if (view !== "history") return;
    loadHistoryLogs().catch((error) => {
      setHistoryStatus(t("food.historyLoadError"));
    });
  }, [view, loadHistoryLogs, t]);

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

  const isStarterNutritionGuide = resolvedTargets?.source === "ascend_recommendation" && !(
    user?.goal_type &&
    user?.age_years &&
    user?.height_cm &&
    (weightLogs[0]?.weight_kg ?? user?.starting_weight_kg)
  );

  const canSaveEstimate = useMemo(() => {
    if (!estimate) return false;
    return estimate.foodName.trim().length > 0 && Number(estimate.calories) > 0;
  }, [estimate]);

  const currentMealInsight = estimate ? mealInsight(estimate, effectiveNutritionTargets, t) : null;
  const portionAwareEstimate = estimate?.analysisVersion === "portion_aware_v1" && estimate.items?.length
    ? estimate
    : null;
  const groupedHistoryDays = useMemo(() => {
    const map = new Map<string, FoodLog[]>();
    for (const log of historyLogs) {
      const key = localDateKey(log.logged_at);
      if (!key) continue;
      map.set(key, [...(map.get(key) ?? []), log]);
    }

    const visibleKeys = Array.from(map.keys())
      .filter((dateKey) => historyRange === "all" || dateKeysForRange(historyRange).includes(dateKey))
      .sort((a, b) => historyOrder === "newest" ? b.localeCompare(a) : a.localeCompare(b));

    return visibleKeys.map((dateKey) => {
      const logs = [...(map.get(dateKey) ?? [])].sort((a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime());
      const totals = summarizeLogs(logs);
      const status = complianceStatus(logs, totals, effectiveNutritionTargets, t);
      return {
        dateKey,
        logs,
        totals,
        status,
        observations: mealObservations(logs, totals, effectiveNutritionTargets, t)
      };
    });
  }, [effectiveNutritionTargets, historyLogs, historyOrder, historyRange, t]);

  async function loadMoreHistory() {
    if (historyNextOffset === null) return;
    setIsLoadingHistoryMore(true);
    try {
      await loadHistoryLogs(historyNextOffset, true);
    } catch (error) {
      setHistoryStatus(t("food.historyMoreError"));
    } finally {
      setIsLoadingHistoryMore(false);
    }
  }

  async function handleDeleteFoodLog(log: FoodLog) {
    if (deletingFoodLogId) return;
    const confirmed = window.confirm(t("food.removeConfirm", { food: log.estimated_food_name }));
    if (!confirmed) return;

    setDeletingFoodLogId(log.id);
    setStatus(t("food.removingMeal"));
    try {
      await deleteFoodLog(log.id);
      foodLogsRequestRef.current += 1;
      setFoodLogs((current) => current.filter((item) => item.id !== log.id));
      setHistoryLogs((current) => current.filter((item) => item.id !== log.id));
      clearPendingFoodLog(log.id);
      setStatus(t("food.removedMessage"));
    } catch (error) {
      setStatus(t("food.removeError"));
    } finally {
      setDeletingFoodLogId(null);
    }
  }

  async function estimateFoodWithRetry(imageDataUrl: string, trace?: FrontendFoodAiTrace | null) {
    let lastError: unknown;

    for (let attempt = 0; attempt < 1; attempt += 1) {
      try {
        if (attempt > 0) {
          setStatus(t("food.retryingPhoto"));
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

    mealSpeechRequestRef.current += 1;
    cancelMealSpeechRecognition().catch(() => undefined);
    mealSpeechLockRef.current = false;
    setIsListeningForMeal(false);
    setMealSpeechMessage("");

    setPreviewUrl(URL.createObjectURL(file));
    setSelectedFile(file);
    setEstimate(null);
    setManualMealText("");
    setWasEdited(false);
    setAiFailed(false);
    setSavedMeal(null);
    setShowEstimateEditor(false);
    setShowPortionEditor(false);
    setShowPortionDiagnostics(false);
    setShowManualEntry(false);
    setStatus(t("food.photoSelected"));
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
        setStatus(t("food.estimateReady"));
        window.setTimeout(() => {
          markFrontendStage(trace, "Result rendered to user");
          logFrontendFoodAiReport(trace);
        }, 0);
      })
      .catch((error) => {
        setEstimate(manualEstimate(t));
        setWasEdited(true);
        setAiFailed(true);
        setShowEstimateEditor(true);
        setStatus(estimateFailureMessage(error, t));
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
      setStatus(t("food.cameraError"));
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
      setStatus(t("food.galleryError"));
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
    setStatus(t("food.estimatingDetails"));
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
      setShowPortionEditor(false);
      setShowPortionDiagnostics(false);
      setStatus(t("food.estimateReady"));
      window.setTimeout(() => {
        markFrontendStage(trace, "Result rendered to user");
        logFrontendFoodAiReport(trace);
      }, 0);
    } catch (error) {
      if (selectedFile) {
        setEstimate(manualEstimate(t));
        setWasEdited(true);
        setAiFailed(true);
        setShowEstimateEditor(true);
        setStatus(estimateFailureMessage(error, t));
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
      setStatus(t("food.describeFirst"));
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
    setShowPortionEditor(false);
    setShowPortionDiagnostics(false);
    setStatus(t("food.analysingDescription"));

    try {
      const response = await estimateFoodFromText(description);
      setEstimate(response.estimate);
      if (response.allowance) setAllowance(response.allowance);
      setShowEstimateEditor(false);
      setShowPortionEditor(false);
      setShowPortionDiagnostics(false);
      setStatus(t("food.descriptionReady"));
    } catch (error) {
      setEstimate({
        foodName: description,
        confidence: 0,
        calories: 0,
        proteinG: 0,
        carbsG: 0,
        fatG: 0,
        notes: t("food.manualTextFallbackNote")
      });
      setWasEdited(true);
      setAiFailed(true);
      setShowEstimateEditor(true);
      setStatus(estimateFailureMessage(error, t));
      loadAllowance().catch(() => {});
    } finally {
      setIsEstimating(false);
    }
  }

  async function handleMealSpeech() {
    if (isListeningForMeal) {
      setMealSpeechMessage(t("food.finishingSpeech"));
      await stopMealSpeechRecognition().catch(() => {
        setMealSpeechMessage(t("food.speechFinishError"));
      });
      return;
    }
    if (mealSpeechLockRef.current || isEstimating || isSaving) return;

    mealSpeechLockRef.current = true;
    const requestId = ++mealSpeechRequestRef.current;
    setShowManualEntry(true);
    setIsListeningForMeal(true);
    setMealSpeechMessage(t("food.listening"));

    try {
      const result = await startMealSpeechRecognition();
      if (mealSpeechRequestRef.current !== requestId) return;
      const transcript = result.transcript.trim();
      setManualMealText(transcript);
      setMealSpeechMessage(t("food.heardTranscript", { transcript }));
      setStatus(t("food.voiceReady"));
    } catch (error) {
      if (mealSpeechRequestRef.current !== requestId || isMealSpeechCancellation(error)) return;
      setMealSpeechMessage(mealSpeechErrorMessage(error, t));
    } finally {
      if (mealSpeechRequestRef.current === requestId) {
        setIsListeningForMeal(false);
        mealSpeechLockRef.current = false;
      }
    }
  }

  function updateEstimate<K extends keyof FoodEstimate>(key: K, value: FoodEstimate[K]) {
    if (!estimate) return;
    const next = { ...estimate, [key]: value };
    if (estimate.analysisVersion === "portion_aware_v1" && ["calories", "proteinG", "carbsG", "fatG"].includes(String(key))) {
      next.analysisVersion = undefined;
      next.items = undefined;
      next.portionFallback = undefined;
    }
    setEstimate(next);
    setWasEdited(true);
  }

  function updatePortionItemQuantity(itemId: string, quantity: number) {
    if (!Number.isFinite(quantity) || quantity <= 0) return;
    setEstimate((current) => {
      if (current?.analysisVersion !== "portion_aware_v1" || !current.items?.length) return current;
      const items = current.items.map((item) => item.id === itemId ? recalculatePortionItem(item, quantity) : item);
      const totals = aggregatePortionNutrition(items);
      return {
        ...current,
        items,
        calories: Math.round(totals.calories),
        proteinG: Math.round(totals.proteinG * 10) / 10,
        carbsG: Math.round(totals.carbsG * 10) / 10,
        fatG: Math.round(totals.fatG * 10) / 10
      };
    });
    setWasEdited(true);
  }

  async function handleSave() {
    if (saveLockRef.current) return;
    if (!estimate || !canSaveEstimate) {
      setStatus(t("food.missingNameCalories"));
      return;
    }

    saveLockRef.current = true;
    setIsSaving(true);
    setStatus(t(selectedImageDataUrl ? "food.savingPhoto" : "food.savingLog"));

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
        portionAnalysis: estimate.analysisVersion === "portion_aware_v1" ? estimate : undefined,
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
        proteinG: savedLog.proteinG,
        imagePreviewUrl: previewUrl
      });
      setPreviewUrl(null);
      setEstimate(null);
      setSelectedFile(null);
      setSelectedImageDataUrl(null);
      setWasEdited(false);
      setAiFailed(false);
      setShowManualEntry(false);
      setShowPortionEditor(false);
      setShowPortionDiagnostics(false);
      setManualMealText("");
      setMealSpeechMessage("");
      setStatus(t(imageS3Key ? "food.savedPhoto" : "food.photoUnavailable"));
      markInstallEligible("first_action");
    } catch (error) {
      setStatus(t("food.saveError"));
    } finally {
      saveLockRef.current = false;
      setIsSaving(false);
    }
  }

  return (
    <main className="ascend-page px-4 py-3 text-white sm:py-5">
      <div className="ascend-member-frame">
        <TrackingPageHeader eyebrow={t("food.foodNutrition")} title={view === "history" ? t("food.mealHistory") : t("food.logMeal")} disabled={isSaving} />

        <div className="ascend-surface mt-2 grid grid-cols-2 gap-1 p-1">
          <button
            type="button"
            onClick={() => setView("log")}
            className={`ascend-pressable h-11 rounded-[0.65rem] text-sm font-semibold ${view === "log" ? "bg-lime text-ink" : "text-zinc-300"}`}
          >
            {t("food.logFood")}
          </button>
          <button
            type="button"
            onClick={() => setView("history")}
            className={`ascend-pressable h-11 rounded-[0.65rem] text-sm font-semibold ${view === "history" ? "bg-lime text-ink" : "text-zinc-300"}`}
          >
            {t("food.mealHistory")}
          </button>
        </div>

        <section className="ascend-surface mt-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">{t("food.todaysMeals")}</p>
              <p className="mt-1 text-sm text-zinc-400">
                {todaysFoodLogs.length ? t("food.mealsLogged", { count: todaysFoodLogs.length }) : t("food.firstMealToday")}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-semibold">{todaysTotals.calories}</p>
              <p className="text-xs text-zinc-400">{t("food.ofTarget", { value: effectiveNutritionTargets.calorieTarget.toLocaleString() })}</p>
            </div>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-ink">
            <div
              className="h-full rounded-full bg-lime"
              style={{ width: `${Math.min(100, Math.round((todaysTotals.calories / effectiveNutritionTargets.calorieTarget) * 100))}%` }}
            />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="ascend-inset p-2.5">
              <p className="text-[10px] uppercase text-zinc-500">{t("client360.protein")}</p>
              <p className="mt-1 text-sm font-semibold">{Math.round(todaysTotals.proteinG)} / {effectiveNutritionTargets.proteinTargetG}g</p>
            </div>
            <div className="ascend-inset p-2.5">
              <p className="text-[10px] uppercase text-zinc-500">{t("food.carbohydrates")}</p>
              <p className="mt-1 text-sm font-semibold">{Math.round(todaysTotals.carbsG)} / {effectiveNutritionTargets.carbsTargetG}g</p>
            </div>
            <div className="ascend-inset p-2.5">
              <p className="text-[10px] uppercase text-zinc-500">{t("food.fat")}</p>
              <p className="mt-1 text-sm font-semibold">{Math.round(todaysTotals.fatG)} / {effectiveNutritionTargets.fatTargetG}g</p>
            </div>
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            {isStarterNutritionGuide
              ? t("food.starterGuide")
              : t("food.dailyGuide")}
          </p>

          {todaysFoodLogs.length ? (
            <div className="mt-4 space-y-2">
              {todaysFoodLogs.map((log, index) =>
                index === 0 && log.image_url ? (
                  <article key={log.id} className="overflow-hidden rounded-xl border border-line bg-ink">
                    <div className="relative aspect-[16/7] overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={log.image_url}
                        alt={log.estimated_food_name}
                        className="h-full w-full object-cover"
                        loading="eager"
                        decoding="async"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/15 to-transparent" />
                      <button
                        type="button"
                        disabled={deletingFoodLogId === log.id}
                        onClick={() => handleDeleteFoodLog(log)}
                        className="ascend-pressable absolute right-3 top-3 z-10 grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-black/65 text-white backdrop-blur-sm disabled:opacity-60"
                        aria-label={t("food.removeAria", { food: log.estimated_food_name })}
                        title={t("food.removeMeal")}
                      >
                        <Trash2 size={17} />
                      </button>
                      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4">
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-lime">{t("food.latestMeal")}</p>
                          <p className="mt-1 truncate text-base font-semibold text-white">{log.estimated_food_name}</p>
                          <p className="mt-1 text-xs text-white/70">
                            P {Math.round(Number(log.protein_g))}g / C {Math.round(Number(log.carbs_g))}g / F {Math.round(Number(log.fat_g))}g
                          </p>
                        </div>
                        <p className="shrink-0 rounded-full border border-white/15 bg-black/45 px-3 py-1.5 text-sm font-semibold text-white backdrop-blur-sm">
                          {log.calories} kcal
                        </p>
                      </div>
                    </div>
                  </article>
                ) : (
                  <article key={log.id} className="ascend-surface-subtle p-3">
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
                      <div className="flex shrink-0 items-center gap-2">
                        <p className="text-sm font-semibold">{log.calories} kcal</p>
                        <button
                          type="button"
                          disabled={deletingFoodLogId === log.id}
                          onClick={() => handleDeleteFoodLog(log)}
                          className="ascend-pressable grid h-11 w-11 place-items-center rounded-xl border border-red-400/30 bg-red-500/10 text-red-300 disabled:opacity-60"
                          aria-label={t("food.removeAria", { food: log.estimated_food_name })}
                          title={t("food.removeMeal")}
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </div>
                  </article>
                )
              )}
            </div>
          ) : null}
        </section>

        {view === "history" ? (
          <>
            <section className="ascend-surface mt-3 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CalendarDays className="text-lime" size={19} />
                  <h2 className="text-base font-semibold">{t("food.historyFilters")}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setView("log")}
                  className="ascend-pressable rounded-xl bg-lime px-3 py-2.5 text-sm font-semibold text-ink"
                >
                  {t("food.addMeal")}
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {rangeOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setHistoryRange(option.value)}
                    className={`ascend-pressable h-11 rounded-xl border px-2 text-sm font-semibold ${
                      historyRange === option.value ? "border-lime bg-lime text-ink" : "border-line bg-ink text-zinc-300"
                    }`}
                  >
                    {t(option.labelKey)}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setHistoryOrder((current) => current === "newest" ? "oldest" : "newest")}
                className="ascend-pressable mt-3 h-11 w-full rounded-xl border border-line bg-ink text-sm font-semibold text-zinc-200"
              >
                {t(historyOrder === "newest" ? "food.newestFirst" : "food.oldestFirst")}
              </button>
            </section>

            {historyStatus ? <p className="ascend-surface-subtle mt-3 p-3 text-sm text-zinc-300">{historyStatus}</p> : null}

            <section className="mt-3 space-y-4">
              {groupedHistoryDays.map((day) => (
                <article key={day.dateKey} className="ascend-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold">{dateLabel(day.dateKey, t)}</h2>
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
                    <span className="ascend-inset px-3 py-2 text-sm font-semibold text-lime">{t("food.mealCount", { count: day.logs.length })}</span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {[
                      [t("nutrition.calories"), `${Math.round(day.totals.calories).toLocaleString()} kcal`],
                      [t("nutrition.protein"), `${Math.round(day.totals.proteinG)}g`],
                      [t("food.carbohydrates"), `${Math.round(day.totals.carbsG)}g`],
                      [t("food.fat"), `${Math.round(day.totals.fatG)}g`]
                    ].map(([label, value]) => (
                      <div key={label} className="ascend-inset p-3">
                        <p className="text-xs uppercase text-zinc-500">{label}</p>
                        <p className="mt-1 text-lg font-semibold">{value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="ascend-inset mt-4 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-lime">{t("food.dailyNotes")}</p>
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
                        <div key={log.id} className="ascend-surface-subtle p-3">
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
                                <p className="mt-2 text-xs text-zinc-500">{t("food.aiConfidence", { value: Math.round(ai.confidence * 100) })}</p>
                              ) : null}
                              {ai.notes || log.description ? (
                                <p className="mt-2 text-xs leading-5 text-zinc-400">{ai.notes ?? log.description}</p>
                              ) : null}
                              <button
                                type="button"
                                disabled={deletingFoodLogId === log.id}
                                onClick={() => handleDeleteFoodLog(log)}
                                className="ascend-pressable mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-400/30 bg-red-500/10 px-3 text-sm font-semibold text-red-300 disabled:opacity-60"
                              >
                                <Trash2 size={16} />
                                {deletingFoodLogId === log.id ? t("food.removing") : t("food.removeMeal")}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </article>
              ))}

              {!groupedHistoryDays.length && !historyStatus ? (
                <article>
                  <DelightEmptyState
                    tone="teal"
                    title={t("food.mealStoryStarts")}
                    body={t("food.noMealsMatch")}
                    action={
                      <button
                        type="button"
                        onClick={() => setView("log")}
                        className="ascend-pressable flex h-11 w-full items-center justify-center rounded-xl bg-lime font-semibold text-ink"
                      >
                        {t("food.logFirstMeal")}
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
                className="ascend-pressable mt-4 h-12 w-full rounded-xl border border-lime/40 bg-lime/10 font-semibold text-lime disabled:opacity-60"
              >
                {t(isLoadingHistoryMore ? "food.loadingMore" : "food.loadMore")}
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
          <section className="ascend-food-result mt-3 overflow-hidden rounded-2xl border border-lime/35 bg-surface" aria-live="polite">
            {savedMeal.imagePreviewUrl ? (
              <div className="relative aspect-[16/8] overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={savedMeal.imagePreviewUrl} alt={savedMeal.foodName} className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-4 text-left">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-lime text-ink shadow-[0_0_32px_rgba(53,242,208,0.28)]"><Check size={24} strokeWidth={2.5} /></span>
                  <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-lime">{t("food.mealSaved")}</p><h2 className="mt-1 text-xl font-semibold text-white">{savedMeal.foodName}</h2></div>
                </div>
              </div>
            ) : (
              <div className="px-5 pt-5 text-center">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-lime text-ink shadow-[0_0_32px_rgba(53,242,208,0.28)]"><Check size={28} strokeWidth={2.5} /></div>
                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-lime">{t("food.mealSaved")}</p>
                <h2 className="mt-2 text-xl font-semibold">{savedMeal.foodName}</h2>
              </div>
            )}
            <div className="p-5 text-center">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-ink p-3"><p className="text-xs uppercase tracking-[0.12em] text-zinc-500">{t("nutrition.calories")}</p><p className="mt-1 font-semibold text-white">{Math.round(savedMeal.calories)} kcal</p></div>
              <div className="rounded-xl bg-ink p-3"><p className="text-xs uppercase tracking-[0.12em] text-zinc-500">{t("nutrition.protein")}</p><p className="mt-1 font-semibold text-white">{Math.round(savedMeal.proteinG)}g</p></div>
            </div>
            <p className="mt-4 text-sm leading-6 text-zinc-300">{t("food.progressUpdated")}</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Link href="/dashboard" className="ascend-pressable flex h-12 items-center justify-center rounded-xl border border-lime/30 bg-ink font-semibold text-lime">
                {t("food.backToToday")}
              </Link>
              <button type="button" onClick={() => setView("history")} className="ascend-pressable h-12 rounded-xl border border-line bg-ink font-semibold text-white">
                {t("food.mealHistory")}
              </button>
              <button type="button" onClick={() => setSavedMeal(null)} className="ascend-pressable col-span-2 h-12 rounded-xl bg-lime font-semibold text-ink">
                {t("food.logAnother")}
              </button>
            </div>
            </div>
          </section>
        ) : !estimate ? (
          <section className="ascend-surface mt-3 overflow-hidden">
            <div className="relative aspect-[4/3] overflow-hidden bg-ink">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt={t("food.selectedMeal")} className="h-full w-full object-cover" />
              ) : (
                <button type="button" onClick={openCameraPicker} disabled={isEstimating || isSaving || isListeningForMeal} className="grid h-full w-full place-items-center p-6 text-center disabled:opacity-60">
                  <span>
                    <span className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-lime/30 bg-lime/10 text-lime shadow-[0_0_32px_rgba(53,242,208,0.12)]">
                      <Camera size={30} />
                    </span>
                    <span className="mt-4 block text-lg font-semibold text-white">{t("food.photoTitle")}</span>
                    <span className="mt-2 block text-sm text-zinc-400">{t("food.photoBody")}</span>
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
                    <p className="mt-3 text-lg font-semibold text-white">{t("food.readingMeal")}</p>
                    <p className="mt-2 text-sm text-zinc-300">{t("food.identifying")}</p>
                  </div>
                  <div className="ascend-food-scan-line absolute left-4 right-4 h-px bg-lime shadow-[0_0_14px_rgba(53,242,208,0.95)]" />
                </div>
              ) : null}
            </div>

            <div className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{t("food.aiEstimate")}</p>
                  <p className="mt-1 text-xs text-zinc-500">{t("food.photoAnalysis")}</p>
                </div>
                <span className="rounded-full border border-lime/30 bg-lime/10 px-3 py-1 text-xs font-semibold text-lime">{allowanceText(allowance, t)}</span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <button type="button" onClick={openCameraPicker} disabled={isEstimating || isSaving || isListeningForMeal} className="ascend-pressable flex h-12 items-center justify-center rounded-xl bg-lime font-semibold text-ink disabled:opacity-60">
                  <Camera className="mr-2" size={18} />
                  {t(previewUrl ? "food.retake" : "food.takePhoto")}
                </button>
                <button type="button" onClick={openGalleryPicker} disabled={isEstimating || isSaving || isListeningForMeal} className="ascend-pressable flex h-12 items-center justify-center rounded-xl border border-line bg-ink font-semibold text-white disabled:opacity-60">
                  <ImagePlus className="mr-2" size={18} />
                  {t("food.gallery")}
                </button>
              </div>

              <div className={`mt-3 grid gap-2 ${mealSpeechAvailable ? "grid-cols-2" : "grid-cols-1"}`}>
                <button
                  type="button"
                  disabled={isListeningForMeal}
                  onClick={() => setShowManualEntry((current) => !current)}
                  className="ascend-pressable flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold text-zinc-300 disabled:opacity-50"
                >
                  <Utensils size={17} />
                  {t("food.typeMeal")}
                  {showManualEntry ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                {mealSpeechAvailable ? (
                  <button
                    type="button"
                    aria-pressed={isListeningForMeal}
                    disabled={isEstimating || isSaving}
                    onClick={() => void handleMealSpeech()}
                    className={`ascend-pressable flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition disabled:opacity-50 ${
                      isListeningForMeal ? "border-lime/50 bg-lime/15 text-lime" : "border-line bg-ink text-zinc-200"
                    }`}
                  >
                    {isListeningForMeal ? <Square size={15} fill="currentColor" /> : <Mic size={17} />}
                    {t(isListeningForMeal ? "food.finish" : manualMealText.trim() ? "food.speakAgain" : "food.speakMeal")}
                  </button>
                ) : null}
              </div>

              {showManualEntry ? (
                <div className="ascend-inset ascend-soft-enter mt-2 p-3">
                  <label className="text-sm font-semibold text-zinc-100" htmlFor="manual-meal-text">{t("food.whatAte")}</label>
                  <textarea
                    id="manual-meal-text"
                    value={manualMealText}
                    onChange={(event) => setManualMealText(event.target.value)}
                    disabled={isEstimating || isSaving}
                    rows={2}
                    className="mt-3 w-full resize-none rounded-xl border border-line bg-surface px-4 py-3 text-base text-white outline-none transition focus:border-lime disabled:opacity-60"
                    placeholder={t("food.manualMealPlaceholder")}
                  />
                  {mealSpeechMessage ? (
                    <div className="mt-2" aria-live="polite">
                      <p className={`text-xs leading-5 ${isListeningForMeal ? "text-lime" : "text-zinc-400"}`}>{mealSpeechMessage}</p>
                      <p className="mt-1 text-[11px] leading-5 text-zinc-500">{t("food.voicePrivacy")}</p>
                    </div>
                  ) : null}
                  <button type="button" disabled={isEstimating || isListeningForMeal || manualMealText.trim().length < 2} onClick={handleTextEstimate} className="ascend-pressable mt-3 flex h-12 w-full items-center justify-center rounded-xl bg-lime font-semibold text-ink disabled:opacity-50">
                    <Sparkles className="mr-2" size={18} />
                    {t(isEstimating ? "food.analysing" : "food.analyseMeal")}
                  </button>
                </div>
              ) : null}

              {previewUrl && !isEstimating ? (
                <button type="button" onClick={handleEstimate} className="ascend-pressable mt-3 flex h-12 w-full items-center justify-center rounded-xl bg-lime font-semibold text-ink">
                  <Sparkles className="mr-2" size={18} />
                  {t("food.analyseMeal")}
                </button>
              ) : null}
              <p className="mt-3 text-center text-[11px] leading-5 text-zinc-500">{t("food.reviewBeforeSave")}</p>
            </div>
          </section>
        ) : (
          <form className="ascend-food-result ascend-surface mt-3 overflow-hidden">
            {previewUrl ? (
              <div className="relative aspect-[16/9] overflow-hidden bg-ink">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt={estimate.foodName || "Analysed meal"} className="h-full w-full object-cover" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-4 pb-4 pt-12">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-lime">{t("food.mealIdentified")}</p>
                  <h2 className="mt-1 text-xl font-semibold text-white">{estimate.foodName || t("food.reviewMeal")}</h2>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 border-b border-line p-4">
                <div className="grid h-11 w-11 place-items-center rounded-lg bg-lime/10 text-lime"><Utensils size={21} /></div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-lime">{t("food.mealIdentified")}</p>
                  <h2 className="mt-1 text-lg font-semibold">{estimate.foodName || t("food.reviewMeal")}</h2>
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
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">{t("food.estimatedNutrition")}</p>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">{t("food.reviewEstimate")}</p>
                  {portionAwareEstimate ? (
                    <p className="mt-2 text-xs leading-5 text-zinc-500">{t("food.photoEstimateCaveat")}</p>
                  ) : (
                    <p className="mt-2 text-xs text-zinc-500">{Math.round(estimate.confidence * 100)}% AI confidence</p>
                  )}
                </div>
              </div>

              <div className="ascend-inset mt-5 space-y-4 p-4">
                <MacroProgress label={t("client360.protein")} value={estimate.proteinG} target={effectiveNutritionTargets.proteinTargetG} />
                <MacroProgress label={t("trainer.carbohydrates")} value={estimate.carbsG} target={effectiveNutritionTargets.carbsTargetG} />
                <MacroProgress label={t("food.fat")} value={estimate.fatG} target={effectiveNutritionTargets.fatTargetG} />
              </div>

              {portionAwareEstimate ? (
                <section className="ascend-inset mt-4 p-4" aria-label={t("food.estimatedPortionsAria")}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-lime">{t("food.zoeAnalysed")}</p>
                      <p className="mt-2 text-sm font-semibold text-white">{t("food.estimatedPortion", { portion: portionLabel(portionAwareEstimate.visiblePortionLabel, t) })}</p>
                      <p className="mt-1 text-xs text-zinc-500">{t("food.photoEstimateCaveat")}</p>
                    </div>
                    {portionAwareEstimate.portionFallback ? (
                      <span className="rounded-full border border-amber/30 bg-amber/10 px-2.5 py-1 text-[11px] font-semibold text-amber">{t("food.amountsUnclear")}</span>
                    ) : null}
                  </div>

                  <div className="mt-4 divide-y divide-line/70">
                    {portionAwareEstimate.items!.map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-zinc-100">{item.name}</p>
                          <p className="mt-1 text-xs text-zinc-500">
                            {item.nutritionSource === "ascend_database" ? "Ascend nutrition data" : item.nutritionSource === "standard_serving_fallback" ? "Standard-serving fallback" : "AI nutrition estimate"}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold text-zinc-200">~{formatPortionItemQuantity(item, t)}</span>
                      </div>
                    ))}
                  </div>

                  {portionAwareEstimate.clarificationRequired && portionAwareEstimate.clarification ? (
                    <p className="mt-3 rounded-lg border border-amber/25 bg-amber/10 px-3 py-2 text-xs leading-5 text-amber">{portionAwareEstimate.clarification}</p>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => setShowPortionEditor((current) => !current)}
                    className="ascend-pressable mt-4 flex h-11 w-full items-center justify-between rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-zinc-200"
                  >
                    <span className="flex items-center gap-2"><SlidersHorizontal size={17} /> {t("food.adjustPortions")}</span>
                    {showPortionEditor ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
                  </button>

                  {showPortionEditor ? (
                    <div className="ascend-soft-enter mt-3 space-y-3">
                      {portionAwareEstimate.items!.map((item) => {
                        const estimatedBase = item.estimatedQuantity ?? item.nutritionBasis.amount;
                        return (
                          <div key={item.id} className="rounded-xl border border-line bg-surface p-3">
                            <div className="flex items-center justify-between gap-3">
                              <label className="min-w-0 truncate text-sm font-semibold text-zinc-100" htmlFor={`portion-${item.id}`}>{item.name}</label>
                              <div className="flex items-center gap-2">
                                <PortionQuantityInput item={item} onCommit={(quantity) => updatePortionItemQuantity(item.id, quantity)} />
                                <span className="w-12 text-xs text-zinc-500">{item.unit}</span>
                              </div>
                            </div>
                            {item.unit === "piece" || item.unit === "slice" ? (
                              <p className="mt-3 text-xs leading-5 text-zinc-500">{t("food.portionQuantityHelp")}</p>
                            ) : (
                              <div className="mt-3 grid grid-cols-3 gap-2">
                                {[
                                  { label: t("food.smaller"), multiplier: 0.75 },
                                  { label: t("food.estimated"), multiplier: 1 },
                                  { label: t("food.larger"), multiplier: 1.25 }
                                ].map((option) => (
                                  <button
                                    key={option.label}
                                    type="button"
                                    onClick={() => updatePortionItemQuantity(item.id, estimatedBase * option.multiplier)}
                                    className="ascend-pressable h-9 rounded-lg border border-line bg-ink text-xs font-semibold text-zinc-300"
                                  >
                                    {option.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <p className="text-xs leading-5 text-zinc-500">{t("food.portionNoAi")}</p>
                    </div>
                  ) : null}

                  {user?.is_platform_owner ? (
                    <div className="mt-3 border-t border-line/70 pt-3">
                      <button
                        type="button"
                        onClick={() => setShowPortionDiagnostics((current) => !current)}
                        className="ascend-pressable flex min-h-10 w-full items-center justify-between rounded-lg px-1 text-left text-xs font-semibold text-zinc-500"
                      >
                        <span>Owner pilot diagnostics</span>
                        {showPortionDiagnostics ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      </button>
                      {showPortionDiagnostics ? (
                        <div className="ascend-soft-enter mt-2 space-y-2" data-testid="owner-portion-diagnostics">
                          <p className="text-[11px] text-zinc-500">Analysis version: {portionAwareEstimate.analysisVersion}</p>
                          {portionAwareEstimate.items!.map((item) => (
                            <div key={item.id} className="rounded-lg border border-dashed border-line bg-ink/45 p-3 text-[11px] leading-5 text-zinc-400">
                              <p className="font-semibold text-zinc-200">{item.name}</p>
                              <p>AI quantity: {item.estimatedQuantity === null ? "Unavailable" : `${item.estimatedQuantity} ${item.unit}`}</p>
                              <p>Final quantity: {item.finalQuantity === null ? "Unavailable" : `${item.finalQuantity} ${item.unit}`}</p>
                              <p>Food confidence: {Math.round(item.foodConfidence * 100)}% · Portion confidence: {Math.round(item.portionConfidence * 100)}%</p>
                              <p>Nutrition source: {item.nutritionSource}</p>
                              <p>Scalable database density: {item.nutritionSource === "ascend_database" ? "Available" : "Unavailable"}</p>
                              <p>AI nutrition fallback: {item.nutritionSource === "ai_estimate" ? "Yes" : "No"} · Standard-serving fallback: {item.portionSource === "standard_serving_fallback" ? "Yes" : "No"}</p>
                              <p>Basis: {item.nutritionBasis.amount} {item.nutritionBasis.unit} · Final: {Math.round(item.nutrition.calories)} kcal / P {Math.round(item.nutrition.proteinG)}g / C {Math.round(item.nutrition.carbsG)}g / F {Math.round(item.nutrition.fatG)}g</p>
                              {item.fallbackReason ? <p>Fallback reason: {item.fallbackReason}</p> : null}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </section>
              ) : null}

              {currentMealInsight ? (
                <div className="mt-4 rounded-lg border border-lime/25 bg-lime/10 p-3">
                  <p className="text-sm font-semibold text-lime">{currentMealInsight.title}</p>
                  <p className="mt-1 text-sm leading-6 text-zinc-200">{currentMealInsight.detail}</p>
                </div>
              ) : null}

              {aiFailed ? (
                <div className="mt-4 rounded-lg border border-amber/40 bg-amber/10 p-3">
                  <p className="text-sm leading-6 text-amber">{status}</p>
                  <button className="ascend-pressable mt-3 flex h-11 w-full items-center justify-center rounded-xl bg-amber font-semibold text-ink disabled:opacity-60" disabled={isEstimating} onClick={selectedFile ? handleEstimate : handleTextEstimate} type="button">
                    <Sparkles className="mr-2" size={18} />
                    {t(isEstimating ? "food.tryingAgain" : "food.tryAiAgain")}
                  </button>
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => {
                  setShowEstimateEditor((current) => !current);
                  window.setTimeout(() => foodNameInputRef.current?.focus(), 0);
                }}
                className="ascend-pressable mt-4 flex h-11 w-full items-center justify-between rounded-xl border border-line bg-ink px-4 text-sm font-semibold text-zinc-200"
              >
                <span className="flex items-center gap-2"><Pencil size={17} /> {t("food.editEstimate")}</span>
                {showEstimateEditor ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
              </button>

              {showEstimateEditor ? (
                <div className="ascend-inset ascend-soft-enter mt-3 space-y-4 p-4">
                  <Field label={t("food.detectedFoods")}><input ref={foodNameInputRef} className={inputClass} value={estimate.foodName} onChange={(event) => updateEstimate("foodName", event.target.value)} /></Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={t("nutrition.calories")}><input className={inputClass} inputMode="numeric" value={estimate.calories} onChange={(event) => updateEstimate("calories", Number(event.target.value))} /></Field>
                    <Field label={t("nutrition.protein")}><input className={inputClass} inputMode="decimal" value={estimate.proteinG} onChange={(event) => updateEstimate("proteinG", Number(event.target.value))} /></Field>
                    <Field label={t("food.carbohydrates")}><input className={inputClass} inputMode="decimal" value={estimate.carbsG} onChange={(event) => updateEstimate("carbsG", Number(event.target.value))} /></Field>
                    <Field label={t("food.fat")}><input className={inputClass} inputMode="decimal" value={estimate.fatG} onChange={(event) => updateEstimate("fatG", Number(event.target.value))} /></Field>
                  </div>
                  <p className="text-xs leading-5 text-zinc-500">{t("food.macroCalories", { value: macroTotal, notes: estimate.notes })}</p>
                </div>
              ) : null}

              <button type="button" disabled={isSaving || !canSaveEstimate} onClick={handleSave} className="ascend-pressable mt-4 flex h-14 w-full items-center justify-center rounded-xl bg-lime text-base font-semibold text-ink shadow-[0_12px_30px_rgba(53,242,208,0.16)] disabled:cursor-not-allowed disabled:opacity-60">
                {wasEdited ? <Save className="mr-2" size={19} /> : <Check className="mr-2" size={19} />}
                {t(isSaving ? "food.savingMeal" : "food.saveMeal")}
              </button>
              <button type="button" onClick={previewUrl ? openCameraPicker : () => { setEstimate(null); setShowManualEntry(true); }} disabled={isSaving} className="ascend-pressable mt-2 h-11 w-full rounded-xl text-sm font-semibold text-zinc-400 disabled:opacity-60">
                {t(previewUrl ? "food.retakePhoto" : "food.changeDescription")}
              </button>
              {!aiFailed && status === t("food.saveError") ? <p className="mt-3 text-center text-sm text-red-300">{status}</p> : null}
            </div>
          </form>
        )}
          </>
        )}
      </div>
    </main>
  );
}

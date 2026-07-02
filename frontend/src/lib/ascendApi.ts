import { CoachingMode, FoodEstimate, GoalType, NutritionTargetInput, SubscriptionPlan } from "@ascend/shared";
import { api } from "./api";
import { getFirebaseToken } from "./authToken";

export interface ProgressComparison {
  periodDays: number;
  daysTracked: number;
  hasComparison: boolean;
  current: { weightKg: number | null; momentum: number | null; checkinDays: number };
  baseline: { weightKg: number | null; momentum: number | null; checkinDays: number };
  highlights: Array<{ key: string; label: string; message: string }>;
}

export type HealthSyncSummary = {
  connected: boolean;
  todaySteps: number;
  averageSteps7d: number;
  todayActiveCalories: number;
  workoutsThisWeek: number;
  workoutCompletedToday: boolean;
  lastSyncedAt: string | null;
};

export type HealthSyncStatus = {
  provider: "health_connect";
  connected: boolean;
  permissions: string[];
  timezone: string | null;
  lastSyncedAt: string | null;
  summary: HealthSyncSummary | null;
};

export type ImportedHealthSyncRecord = {
  type: "steps_daily" | "active_calories_daily" | "exercise_session";
  externalRecordId: string;
  recordedOn?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  valueNumeric?: number | null;
  unit?: string | null;
  sourceApp?: string | null;
  metadata?: Record<string, unknown> | null;
};

type BodyCompositionNutrition = NonNullable<NutritionTargetInput["bodyComposition"]>;
type CacheEntry<T> = { value: T; expiresAt: number };

const responseCache = new Map<string, CacheEntry<unknown>>();
const inflightRequests = new Map<string, Promise<unknown>>();

function perfLogsEnabled() {
  if (process.env.NEXT_PUBLIC_API_TIMING === "1") return true;
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem("ascend:api-timing") === "1";
}

function bodyCompositionSaveDebugEnabled() {
  if (process.env.NEXT_PUBLIC_BODY_COMPOSITION_SAVE_DEBUG === "1") return true;
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem("ascend:body-composition-save-debug") === "1";
}

function traceApi(label: string, startedAt: number, extra: Record<string, unknown> = {}) {
  if (!perfLogsEnabled()) return;
  console.info("[ascend-api-timing]", label, {
    durationMs: Math.round(performance.now() - startedAt),
    ...extra
  });
}

function readCached<T>(cacheKey: string) {
  const cached = responseCache.get(cacheKey) as CacheEntry<T> | undefined;
  if (!cached) return null;
  if (Date.now() >= cached.expiresAt) {
    responseCache.delete(cacheKey);
    return null;
  }
  return cached.value;
}

function writeCached<T>(cacheKey: string, value: T, ttlMs: number) {
  responseCache.set(cacheKey, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

function invalidateCached(match?: string | RegExp) {
  if (!match) {
    responseCache.clear();
    inflightRequests.clear();
    return;
  }

  for (const key of [...responseCache.keys()]) {
    if (typeof match === "string" ? key.startsWith(match) : match.test(key)) {
      responseCache.delete(key);
    }
  }

  for (const key of [...inflightRequests.keys()]) {
    if (typeof match === "string" ? key.startsWith(match) : match.test(key)) {
      inflightRequests.delete(key);
    }
  }
}

function shouldRefreshToken(error: unknown) {
  if (!(error instanceof Error)) return false;
  return /401|invalid or expired token|missing bearer token|authentication is still loading/i.test(error.message);
}

async function authed<T>(path: string, options: RequestInit = {}) {
  const startedAt = performance.now();
  const shouldLogBodyCompositionSave = path.includes("/body-composition/scans") && options.method === "POST" && bodyCompositionSaveDebugEnabled();
  try {
    if (shouldLogBodyCompositionSave) console.info("[body-composition-save] Entering authed()", { path, method: options.method });
    const token = await getFirebaseToken();
    if (shouldLogBodyCompositionSave) console.info("[body-composition-save] Token resolved, entering api()", { path });
    const response = await api<T>(path, options, token);
    traceApi(path, startedAt, { method: options.method ?? "GET" });
    return response;
  } catch (error) {
    traceApi(path, startedAt, { method: options.method ?? "GET", failed: true });
    if (shouldLogBodyCompositionSave) {
      console.error("[body-composition-save] authed() failed before/inside api()", {
        path,
        error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : null
      });
    }
    if (!shouldRefreshToken(error)) throw error;
    if (shouldLogBodyCompositionSave) console.info("[body-composition-save] Retrying with refreshed token", { path });
    const response = await api<T>(path, options, await getFirebaseToken(true));
    traceApi(`${path} retry`, startedAt, { method: options.method ?? "GET" });
    return response;
  }
}

async function authedCached<T>(cacheKey: string, path: string, ttlMs: number) {
  const startedAt = performance.now();
  const cached = readCached<T>(cacheKey);
  if (cached) {
    traceApi(`${path} cache hit`, startedAt, { cacheKey });
    return cached;
  }

  const inflight = inflightRequests.get(cacheKey) as Promise<T> | undefined;
  if (inflight) {
    traceApi(`${path} inflight reuse`, startedAt, { cacheKey });
    return inflight;
  }

  const request = authed<T>(path)
    .then((response) => writeCached(cacheKey, response, ttlMs))
    .finally(() => {
      inflightRequests.delete(cacheKey);
    });

  inflightRequests.set(cacheKey, request);
  return request;
}

async function withTimeout<T>(ms: number, action: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);

  try {
    return await action(controller.signal);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("AI is taking too long. Please try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function combineAbortSignals(signals: AbortSignal[]) {
  const availableSignals = signals.filter(Boolean);
  if (typeof AbortSignal !== "undefined" && "any" in AbortSignal) {
    return AbortSignal.any(availableSignals);
  }
  const controller = new AbortController();
  for (const signal of availableSignals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return controller.signal;
}

export function completeOnboarding(input: {
  fullName: string;
  referralCode?: string;
  coachingMode?: CoachingMode;
  goalType: GoalType;
  gender?: "female" | "male" | "prefer_not_to_say";
  ageYears?: number;
  activityLevel?: "low" | "moderate" | "high";
  heightCm?: number;
  startingWeightKg: number;
  targetWeightKg?: number;
}) {
  invalidateCached("me:");
  return authed("/me/onboarding", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateGuideProfile(input: {
  gender: "female" | "male" | "prefer_not_to_say";
  ageYears: number;
  activityLevel: "low" | "moderate" | "high";
  heightCm: number;
  goalType: GoalType;
  targetWeightKg?: number | null;
}) {
  invalidateCached("me:");
  return authed("/me/guide-profile", {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function bootstrapOwner() {
  invalidateCached();
  return authed<{
    user: {
      id: string;
      email: string;
      full_name: string;
      primary_role: string;
    };
    roles: string[];
  }>("/auth/bootstrap-owner", {
    method: "POST"
  });
}

export function getMe() {
  return authedCached<{
    user: {
      id: string;
      email: string;
      full_name: string;
      primary_role?: "client" | "trainer" | "admin" | "owner";
      coaching_mode?: CoachingMode | string | null;
      goal_type?: GoalType | null;
      goal_updated_at?: string | null;
      gender?: "female" | "male" | "prefer_not_to_say" | string | null;
      age_years?: string | number | null;
      activity_level?: "low" | "moderate" | "high" | string | null;
      height_cm?: string | number | null;
      starting_weight_kg?: string | number | null;
      target_weight_kg?: string | number | null;
      goal_version?: string | number | null;
      gym_id?: string | null;
      assigned_trainer_id?: string | null;
      assigned_trainer_name?: string | null;
      trainer_status?: string | null;
      profile_photo_url?: string | null;
      is_platform_owner?: boolean;
      athlete_mode_enabled?: boolean;
      body_composition_nutrition?: BodyCompositionNutrition | null;
    };
    roles: string[];
  }>("me:profile", "/me", 15_000);
}

export function saveProfilePhoto(imageDataUrl: string) {
  invalidateCached("me:");
  return authed<{ profilePhotoUrl: string }>("/me/profile-photo", {
    method: "POST",
    body: JSON.stringify({ imageDataUrl })
  });
}

export function removeProfilePhoto() {
  invalidateCached("me:");
  return authed<{ removed: boolean }>("/me/profile-photo", { method: "DELETE" });
}

export function getFoodLogs(
  filters: { range?: "today" | "7d" | "30d" | "all"; order?: "newest" | "oldest"; limit?: number; offset?: number } = {}
) {
  const params = new URLSearchParams();
  if (filters.range) params.set("range", filters.range);
  if (filters.order) params.set("order", filters.order);
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.offset) params.set("offset", String(filters.offset));
  const query = params.toString();

  return authed<{
    foodLogs: Array<{
      id: string;
      image_url?: string | null;
      image_s3_key?: string | null;
      meal_type?: "breakfast" | "lunch" | "dinner" | "snack" | string;
      estimated_food_name: string;
      description?: string | null;
      calories: number;
      protein_g: string | number;
      carbs_g: string | number;
      fat_g: string | number;
      ai_estimate_raw?: unknown;
      was_edited_by_user?: boolean;
      logged_at: string;
    }>;
    nextOffset?: number | null;
  }>(`/food-logs${query ? `?${query}` : ""}`);
}

export function getWeightLogs() {
  return authed<{
    weightLogs: Array<{
      id: string;
      weight_kg: string | number;
      logged_at: string;
    }>;
  }>("/weight-logs");
}

export function getWaterLogs() {
  return authed<{
    waterLogs: Array<{
      id: string;
      amount_ml: number;
      logged_at: string;
    }>;
  }>("/water-logs");
}

export function saveWeightLog(input: { weightKg: number; loggedAt?: string }) {
  invalidateCached("reports:weekly");
  invalidateCached("memory:");
  invalidateCached("coach:");
  invalidateCached("athlete:");
  return authed<{
    weightLog: {
      id: string;
      weight_kg: string | number;
      logged_at: string;
    };
    milestone?: {
      id: string;
      goal_type: GoalType;
      target_weight_kg: string | number;
      achieved_weight_kg: string | number;
      achieved_at: string;
    } | null;
  }>("/weight-logs", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getGoalStatus() {
  return authed<{
    goalStatus: {
      goal_type?: GoalType | null;
      goal_updated_at?: string | null;
      goal_version?: string | number | null;
      starting_weight_kg?: string | number | null;
      target_weight_kg?: string | number | null;
      current_weight_kg?: string | number | null;
      milestone_id?: string | null;
      milestone_goal_type?: GoalType | null;
      milestone_target_weight_kg?: string | number | null;
      achieved_weight_kg?: string | number | null;
      achieved_at?: string | null;
      acknowledged_at?: string | null;
    };
  }>("/me/goal-status");
}

export function getMyProgressComparison() {
  return authed<{ comparison: ProgressComparison }>("/me/progress-comparison");
}

export function acknowledgeGoalMilestone(milestoneId: string) {
  invalidateCached("memory:");
  return authed(`/me/goal-milestones/${milestoneId}/acknowledge`, { method: "PATCH" });
}

export function saveWaterLog(input: { amountMl: number; loggedAt?: string }) {
  invalidateCached("reports:weekly");
  invalidateCached("memory:");
  invalidateCached("coach:");
  invalidateCached("athlete:");
  return authed<{
    waterLog: {
      id: string;
      amount_ml: number;
      logged_at: string;
    };
  }>("/water-logs", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getHabits() {
  return authed<{
    habits: Array<{
      id: string;
      name: string;
      frequency: string;
      active: boolean;
      created_at: string;
    }>;
  }>("/habits");
}

export function createHabit(input: { name: string; frequency?: "daily" | "weekly" }) {
  return authed<{
    habit: {
      id: string;
      name: string;
      frequency: string;
      active: boolean;
      created_at: string;
    };
  }>("/habits", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getHabitLogs() {
  return authed<{
    habitLogs: Array<{
      id: string;
      habit_id: string;
      completed: boolean;
      logged_at: string;
    }>;
  }>("/habit-logs");
}

export function saveHabitLog(input: { habitId: string; completed?: boolean; loggedAt?: string }) {
  invalidateCached("reports:weekly");
  invalidateCached("memory:");
  invalidateCached("coach:");
  return authed<{
    habitLog: {
      id: string;
      habit_id: string;
      completed: boolean;
      logged_at: string;
    };
  }>("/habit-logs", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getComplianceToday() {
  return authed<{
    compliance: {
      id: string;
      score: number;
      food_score: number;
      weight_score: number;
      water_score: number;
      habit_score: number;
      calculated_for_date: string;
    } | null;
  }>("/compliance/today");
}

export function getMyStreak() {
  return authed<{
    streak: {
      current: number;
      best: number;
      activeDaysThisWeek: number;
      checkedInToday: boolean;
    };
  }>("/streaks/me");
}

export function getBurnLogs() {
  return authed<{
    burnLogs: Array<{
      id: string;
      metadata: {
        activityType?: string;
        durationMinutes?: number;
        caloriesBurned?: number;
        estimatedCaloriesBurned?: number;
        caloriesSource?: "estimated_met" | "health_provider_actual";
        workoutTitle?: string;
        workoutType?: string;
        workoutDifficulty?: "easy" | "moderate" | "challenging";
        workoutDifficultyLabel?: string;
        coachMessage?: string;
        momentumEarned?: number;
        source?: string;
      };
      created_at: string;
    }>;
  }>("/burn-logs");
}

export function getTodayMission() {
  return authed<{
    mission: {
      id: string;
      title: string;
      status: "open" | "completed";
      due_date: string;
      completed_at?: string | null;
      trainer_name?: string | null;
      created_at: string;
    } | null;
  }>("/missions/today");
}

export function getLatestRecognition() {
  return authed<{
    recognition: {
      id: string;
      message: string;
      signal: string;
      trainer_name?: string | null;
      created_at: string;
    } | null;
  }>("/recognitions/latest");
}

export type CoachPresenceMessage = {
  id: string;
  trigger_type: string;
  message: string;
  tone: string;
  dismissed_at?: string | null;
  shown_count?: number;
  created_at: string;
};

export type CoachPresenceSettings = {
  style: "motivational" | "balanced" | "minimal";
  paused: boolean;
  pauseUntil?: string | null;
};

export function getCoachPresence() {
  return authedCached<{
    latest: CoachPresenceMessage | null;
    history: CoachPresenceMessage[];
    settings: CoachPresenceSettings;
  }>("coach:presence", "/coach-presence", 20_000);
}

export function getHealthSyncStatus() {
  return authedCached<{ status: HealthSyncStatus }>("health-sync:status", "/health-sync/status", 20_000);
}

export function importHealthSync(input: {
  provider: "health_connect";
  permissions: string[];
  timezone: string | null;
  syncedAt?: string | null;
  records: ImportedHealthSyncRecord[];
}) {
  invalidateCached("health-sync:");
  return authed<{ importedCount: number; summary: HealthSyncSummary | null }>("/health-sync/import", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function disconnectHealthSync() {
  invalidateCached("health-sync:");
  return authed<{ disconnected: boolean }>("/health-sync/disconnect", {
    method: "POST"
  });
}

export type AscendMemoryItem = {
  id?: string;
  milestoneKey: string;
  type: string;
  title: string;
  subtitle: string;
  occurredAt: string;
  priority: number;
  reflection?: string | null;
  aiGenerated?: boolean;
  metadata?: Record<string, unknown>;
};

export type AscendMemoryResponse = {
  access: "none" | "premium" | "athlete";
  timeline: AscendMemoryItem[];
  stats: {
    aiReflectionsThisMonth: number;
    monthlyLimit: number;
    cacheHits: number;
  };
};

export function getAscendMemory() {
  return authedCached<AscendMemoryResponse>("memory:me", "/memory/me", 45_000);
}

export function updateCoachPresenceStyle(style: CoachPresenceSettings["style"]) {
  invalidateCached("coach:");
  return authed<{ settings: unknown }>("/coach-presence/settings", {
    method: "PATCH",
    body: JSON.stringify({ style })
  });
}

export function dismissCoachPresence(messageId: string) {
  invalidateCached("coach:");
  return authed<{ dismissed: boolean }>(`/coach-presence/${messageId}/dismiss`, {
    method: "POST"
  });
}

export function completeMission(missionId: string) {
  invalidateCached("coach:");
  return authed<{
    mission: {
      id: string;
      title: string;
      status: "completed";
      due_date: string;
      completed_at?: string | null;
    };
  }>(`/missions/${missionId}/complete`, {
    method: "PATCH"
  });
}

export function saveBurnLog(input: {
  activityType: string;
  durationMinutes: number;
  caloriesBurned: number;
  loggedAt?: string;
}) {
  invalidateCached("reports:weekly");
  invalidateCached("memory:");
  invalidateCached("coach:");
  invalidateCached("athlete:");
  return authed<{
    burnLog: {
      id: string;
      metadata: {
        activityType?: string;
        durationMinutes?: number;
        caloriesBurned?: number;
      };
      created_at: string;
    };
  }>("/burn-logs", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function saveCompletedWorkout(input: {
  workoutCompletionKey: string;
  workoutTitle: string;
  workoutType: string;
  workoutDifficulty: "easy" | "moderate" | "challenging";
  durationMinutes: number;
  completedAt?: string;
  exercises: GeneratedWorkout["exercises"];
  healthProviderCaloriesBurned?: number | null;
}) {
  invalidateCached("reports:weekly");
  invalidateCached("memory:");
  invalidateCached("coach:");
  invalidateCached("athlete:");
  return authed<{
    burnLog: {
      id: string;
      metadata: {
        activityType?: string;
        durationMinutes?: number;
        caloriesBurned?: number;
        estimatedCaloriesBurned?: number;
        caloriesSource?: "estimated_met" | "health_provider_actual";
        workoutTitle?: string;
        workoutType?: string;
        workoutDifficulty?: "easy" | "moderate" | "challenging";
        workoutDifficultyLabel?: string;
        coachMessage?: string;
        momentumEarned?: number;
        source?: string;
      };
      created_at: string;
    };
    summary: {
      workoutTitle: string;
      durationMinutes: number;
      workoutType: string;
      difficulty: string;
      estimatedCaloriesBurned: number;
      caloriesLabel: string;
      coachMessage: string;
      momentumEarned: number;
    };
  }>("/burn-logs/completed-workout", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function requestFoodUploadUrl(contentType: string) {
  return authed<{ uploadUrl: string; key: string; storageConfigured?: boolean }>("/food-logs/photo-upload-url", {
    method: "POST",
    body: JSON.stringify({ contentType })
  });
}

export function uploadFoodPhotoDataUrl(imageDataUrl: string) {
  return authed<{ key: string; storageConfigured?: boolean }>("/food-logs/photo-upload-data-url", {
    method: "POST",
    body: JSON.stringify({ imageDataUrl })
  });
}

export function requestProgressUploadUrl(contentType: string) {
  return authed<{ uploadUrl: string; key: string; storageConfigured?: boolean }>("/progress-photos/upload-url", {
    method: "POST",
    body: JSON.stringify({ contentType })
  });
}

export function uploadProgressPhotoDataUrl(imageDataUrl: string) {
  return authed<{ key: string; storageConfigured?: boolean }>("/progress-photos/upload-data-url", {
    method: "POST",
    body: JSON.stringify({ imageDataUrl })
  });
}

export function getProgressPhotos() {
  return authed<{
    progressPhotos: Array<{
      id: string;
      image_url?: string | null;
      image_s3_key?: string | null;
      photo_type: "front" | "side" | "back" | "other";
      logged_at: string;
    }>;
  }>("/progress-photos");
}

export function saveProgressPhoto(input: { imageS3Key: string; photoType: "front" | "side" | "back" | "other"; loggedAt?: string }) {
  invalidateCached("memory:");
  invalidateCached("athlete:");
  return authed<{
    progressPhoto: {
      id: string;
      image_s3_key: string;
      photo_type: string;
      logged_at: string;
    };
  }>("/progress-photos", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export type FoodAiAllowance = {
  period: "week" | "day" | "unlimited";
  label: string;
  limit: number | null;
  used: number;
  remaining: number | null;
};

export type FoodAiPerformanceReport = {
  traceId: string;
  enabled: boolean;
  startedAt: string;
  totalMs: number;
  route?: string;
  stages: Array<{
    name: string;
    startOffsetMs: number;
    endOffsetMs: number;
    durationMs: number;
    metadata?: Record<string, unknown>;
  }>;
  geminiAttempts: Array<{
    attempt: number;
    model: string;
    responseMode: string;
    startOffsetMs: number;
    endOffsetMs: number;
    durationMs: number;
    success: boolean;
    failureReason?: string;
    status?: number;
    timeout?: boolean;
    parseSuccess?: boolean;
    parseFailureReason?: string;
  }>;
  summary: {
    slowestStage?: string;
    slowestStageMs?: number;
    modelUsed?: string;
    totalGeminiDurationMs: number;
    retryCount: number;
    totalAttempts: number;
    successfulAttempts: number;
    failedAttempts: number;
    httpStatuses: Array<number | undefined>;
    geminiFallbackOccurred: boolean;
    firstAttemptSucceeded: boolean;
    jsonParsingFailed: boolean;
    duplicateWorkObserved: string[];
    unnecessarySequentialWaiting: string[];
  };
};

export function getFoodAiAllowance() {
  return authed<{ allowance: FoodAiAllowance }>("/food-logs/ai-allowance");
}

export function estimateFood(imageUrl: string) {
  return authed<{ estimate: FoodEstimate; allowance?: FoodAiAllowance; performance?: FoodAiPerformanceReport }>("/food-logs/estimate", {
    method: "POST",
    body: JSON.stringify({ imageUrl })
  });
}

export function estimateFoodFromDataUrl(imageDataUrl: string) {
  return withTimeout(75_000, (signal) =>
    authed<{ estimate: FoodEstimate; allowance?: FoodAiAllowance; performance?: FoodAiPerformanceReport }>("/food-logs/estimate-data-url", {
      method: "POST",
      body: JSON.stringify({ imageDataUrl }),
      signal
    })
  );
}

export function estimateFoodFromText(description: string) {
  return withTimeout(45_000, (signal) =>
    authed<{ estimate: FoodEstimate; allowance?: FoodAiAllowance }>("/food-logs/estimate-text", {
      method: "POST",
      body: JSON.stringify({ description }),
      signal
    })
  );
}

export function saveFoodLog(input: {
  imageS3Key?: string;
  mealType: string;
  description?: string;
  estimatedFoodName: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  aiEstimateRaw?: FoodEstimate;
  wasEditedByUser: boolean;
}) {
  invalidateCached("reports:weekly");
  invalidateCached("memory:");
  invalidateCached("coach:");
  return authed<{
    foodLog: {
      id: string;
      image_s3_key?: string | null;
      meal_type: string;
      estimated_food_name: string;
      calories: number;
      protein_g: string | number;
      carbs_g: string | number;
      fat_g: string | number;
      logged_at: string;
    };
  }>("/food-logs", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function createCheckout(plan: Exclude<SubscriptionPlan, "free">) {
  invalidateCached("subscription:");
  return authed<{ checkoutUrl: string; providerReference: string }>("/subscriptions/checkout", {
    method: "POST",
    body: JSON.stringify({ plan })
  });
}

export function getMySubscription() {
  return authedCached<{
    subscription: {
      id?: string;
      plan: SubscriptionPlan;
      provider?: string;
      status: string;
      amount_cents?: number;
      currency?: string;
      current_period_end?: string | null;
    };
  }>("subscription:me", "/subscriptions/me", 20_000);
}

export type CoachNutritionPlan = {
  id: string;
  user_id: string;
  status: "active" | "archived" | string;
  plan_label?: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  coach_note?: string | null;
  phase_type?: string | null;
  schedule_type?: string | null;
  metadata?: Record<string, unknown> | null;
  updated_at: string;
  created_at: string;
  updated_by_name?: string | null;
};

export function getMyNutritionPlan() {
  return authed<{ coachPlan: CoachNutritionPlan | null }>("/me/nutrition-plan");
}

export function getTrainerClientNutritionPlan(clientId: string) {
  return authed<{ coachPlan: CoachNutritionPlan | null }>(`/trainer/clients/${clientId}/nutrition-plan`);
}

export function saveTrainerClientNutritionPlan(clientId: string, input: {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  coachNote?: string | null;
  planLabel?: string | null;
}) {
  return authed<{ coachPlan: CoachNutritionPlan }>(`/trainer/clients/${clientId}/nutrition-plan`, {
    method: "PUT",
    body: JSON.stringify(input)
  });
}

export function getBillingPortal() {
  return authed<{ url: string }>("/subscriptions/billing-portal");
}

export function cancelSubscription() {
  invalidateCached("subscription:");
  return authed<{
    subscription: {
      id: string;
      plan: SubscriptionPlan;
      provider: string;
      status: string;
      current_period_end?: string | null;
    } | null;
  }>("/subscriptions/cancel", {
    method: "POST"
  });
}

export function activatePilotSubscription(plan: Exclude<SubscriptionPlan, "free">) {
  invalidateCached("subscription:");
  return authed<{
    subscription: {
      id: string;
      plan: SubscriptionPlan;
      provider: string;
      status: string;
      amount_cents: number;
      currency: string;
      current_period_end: string;
    };
  }>("/subscriptions/demo-activate", {
    method: "POST",
    body: JSON.stringify({ plan })
  });
}

export function sendCoachMessage(message: string) {
  return authed<{ reply: string }>("/ai/chat", {
    method: "POST",
    body: JSON.stringify({ message })
  });
}

export type WorkoutPlannerLocation = "gym" | "home" | "hotel" | "outdoors";
export type WorkoutPlannerGoal = "fat_loss" | "muscle_gain" | "strength" | "general_fitness" | "recovery" | "mobility";
export type GeneratedWorkout = {
  title: string;
  intro: string;
  estimatedDurationMinutes: number;
  focus: string;
  intensity: "easy" | "moderate" | "challenging";
  warmup: string[];
  exercises: Array<{
    name: string;
    sets?: number | null;
    reps?: string | null;
    duration?: string | null;
    rest?: string | null;
    note?: string | null;
  }>;
  cooldown: string[];
  coachTip: string;
  disclaimer: string;
};

export function generateTodayWorkout(input: {
  location: WorkoutPlannerLocation;
  timeAvailable: "20" | "30" | "45" | "60";
  goal: WorkoutPlannerGoal;
  equipment: string;
}) {
  return authed<{ workout: GeneratedWorkout }>("/ai/workout", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getCurrentWeeklyReport() {
  return authedCached<{
    report: {
      id: string;
      week_start: string;
      week_end: string;
      summary: string;
      ai_generated_checkin?: string | null;
      compliance_score?: number | null;
      created_at: string;
    } | null;
  }>("reports:weekly:current", "/reports/weekly/current", 30_000);
}

export function generateWeeklyReport() {
  invalidateCached("reports:weekly");
  return authed<{
    report: {
      id: string;
      week_start: string;
      week_end: string;
      summary: string;
      ai_generated_checkin?: string | null;
      compliance_score?: number | null;
      created_at: string;
    };
  }>("/reports/weekly/generate", {
    method: "POST"
  });
}

export function estimateBurnFromText(text: string) {
  return authed<{
    estimate: {
      activityType: string;
      durationMinutes: number;
      caloriesBurned: number;
      notes?: string;
    };
  }>("/ai/burn-estimate", {
    method: "POST",
    body: JSON.stringify({ text })
  });
}

export function getMessageContacts() {
  return authed<{
    contacts: Array<{
      id: string;
      full_name: string;
      email: string;
      primary_role: string;
      profile_photo_url?: string | null;
    }>;
  }>("/messages/contacts");
}

export function getMessages(userId: string) {
  return authed<{
    messages: Array<{
      id: string;
      sender_user_id: string;
      receiver_user_id: string;
      body: string;
      created_at: string;
      read_at?: string | null;
    }>;
  }>(`/messages/${userId}`);
}

export function sendMessage(input: { receiverUserId: string; body: string }) {
  return authed<{
    message: {
      id: string;
      sender_user_id: string;
      receiver_user_id: string;
      body: string;
      created_at: string;
    };
  }>("/messages", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getTrainerClientMessages(clientId: string) {
  return authed<{
    messages: Array<{
      id: string;
      sender_user_id: string;
      receiver_user_id: string;
      body: string;
      created_at: string;
      read_at?: string | null;
    }>;
  }>(`/trainer/clients/${clientId}/messages`);
}

export function getTrainerClientCoachPresence(clientId: string) {
  return authed<{
    latest: CoachPresenceMessage | null;
    history: CoachPresenceMessage[];
    settings: CoachPresenceSettings;
  }>(`/trainer/clients/${clientId}/coach-presence`);
}

export function getTrainerClientMemory(clientId: string) {
  return authed<AscendMemoryResponse>(`/trainer/clients/${clientId}/memory`);
}

export function pauseTrainerClientCoachPresence(clientId: string, pauseHours: number | null) {
  return authed<{ settings: unknown }>(`/trainer/clients/${clientId}/coach-presence`, {
    method: "PATCH",
    body: JSON.stringify({ pauseHours })
  });
}

export function sendTrainerClientMessage(clientId: string, body: string) {
  invalidateCached("trainer:");
  return authed<{
    message: {
      id: string;
      sender_user_id: string;
      receiver_user_id: string;
      body: string;
      created_at: string;
    };
  }>(`/trainer/clients/${clientId}/messages`, {
    method: "POST",
    body: JSON.stringify({ body })
  });
}

export function getTrainerClients() {
  return authedCached<{
    clients: Array<{
      id: string;
      full_name: string;
      email: string;
      goal_type?: GoalType | null;
      goal_updated_at?: string | null;
      goal_achieved_at?: string | null;
      gender?: "female" | "male" | "prefer_not_to_say" | string | null;
      age_years?: string | number | null;
      activity_level?: "low" | "moderate" | "high" | string | null;
      height_cm?: string | number | null;
      starting_weight_kg?: string | number | null;
      target_weight_kg?: string | number | null;
      compliance_score?: number | null;
      risk_severity?: string | null;
      last_food_logged_at?: string | null;
      calories_today?: string | number | null;
      protein_g_today?: string | number | null;
      carbs_g_today?: string | number | null;
      fat_g_today?: string | number | null;
      latest_weight_kg?: string | number | null;
      last_weight_logged_at?: string | null;
      last_water_logged_at?: string | null;
      last_client_message_at?: string | null;
      open_alerts?: string | number | null;
      consistency_streak?: string | number | null;
      profile_photo_url?: string | null;
      athlete_mode_enabled?: boolean;
      current_plan?: SubscriptionPlan;
      body_composition_nutrition?: BodyCompositionNutrition | null;
      body_composition_summary?: BodyCompositionSummary | null;
    }>;
  }>("trainer:clients", "/trainer/clients", 20_000);
}

export function getTrainerAttention() {
  return authed<{
    attention: Array<{
      id: string;
      full_name: string;
      email: string;
      goal_type?: GoalType | null;
      current_score?: string | number | null;
      reason: string;
      detail: string;
      priority: number;
      profile_photo_url?: string | null;
    }>;
    summary: {
      totalClients: number;
      needsAttention: number;
      allClear: boolean;
    };
  }>("/trainer/attention");
}

export function sendTrainerClientPraise(clientId: string) {
  invalidateCached("trainer:");
  return authed<{
    recognition: {
      id: string;
      message: string;
      signal: string;
      created_at: string;
    };
    reused: boolean;
  }>(`/trainer/clients/${clientId}/praise`, {
    method: "POST"
  });
}

export function getTrainerClient(clientId: string) {
  return authed<{
    client: {
      id: string;
      full_name: string;
      email: string;
      goal_type?: GoalType | null;
      goal_updated_at?: string | null;
      goal_achieved_at?: string | null;
      gender?: "female" | "male" | "prefer_not_to_say" | string | null;
      age_years?: string | number | null;
      activity_level?: "low" | "moderate" | "high" | string | null;
      height_cm?: string | number | null;
      starting_weight_kg?: string | number | null;
      target_weight_kg?: string | number | null;
      gym_name?: string | null;
      compliance_score?: number | null;
      last_trainer_message_at?: string | null;
      profile_photo_url?: string | null;
      athlete_mode_enabled?: boolean;
      body_composition_nutrition?: BodyCompositionNutrition | null;
    };
  }>(`/trainer/clients/${clientId}`);
}

export function getTrainerClientProgressComparison(clientId: string) {
  return authed<{ comparison: ProgressComparison }>(`/trainer/clients/${clientId}/progress-comparison`);
}

export function getTrainerClientFoodLogs(
  clientId: string,
  filters: { range?: "today" | "7d" | "30d" | "all"; order?: "newest" | "oldest"; limit?: number; offset?: number } = {}
) {
  const params = new URLSearchParams();
  if (filters.range) params.set("range", filters.range);
  if (filters.order) params.set("order", filters.order);
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.offset) params.set("offset", String(filters.offset));
  const query = params.toString();

  return authed<{
    foodLogs: Array<{
      id: string;
      image_url?: string | null;
      image_s3_key?: string | null;
      estimated_food_name: string;
      description?: string | null;
      calories: number;
      protein_g: string | number;
      carbs_g: string | number;
      fat_g: string | number;
      ai_estimate_raw?: unknown;
      was_edited_by_user?: boolean;
      logged_at: string;
    }>;
    nextOffset?: number | null;
  }>(`/trainer/clients/${clientId}/food-logs${query ? `?${query}` : ""}`);
}

export function getTrainerClientWeightLogs(clientId: string) {
  return authed<{
    weightLogs: Array<{
      id: string;
      weight_kg: string | number;
      logged_at: string;
    }>;
  }>(`/trainer/clients/${clientId}/weight-logs`);
}

export function getTrainerClientWaterLogs(clientId: string) {
  return authed<{
    waterLogs: Array<{
      id: string;
      amount_ml: number;
      logged_at: string;
    }>;
  }>(`/trainer/clients/${clientId}/water-logs`);
}

export function getTrainerClientBurnLogs(clientId: string) {
  return authed<{
    burnLogs: Array<{
      id: string;
      metadata: {
        activityType?: string;
        durationMinutes?: number;
        caloriesBurned?: number;
        estimatedCaloriesBurned?: number;
        caloriesSource?: "estimated_met" | "health_provider_actual";
        workoutTitle?: string;
        workoutType?: string;
        workoutDifficulty?: "easy" | "moderate" | "challenging";
        workoutDifficultyLabel?: string;
        coachMessage?: string;
        momentumEarned?: number;
        source?: string;
        exercises?: Array<{
          name?: string;
          sets?: string | number | null;
          reps?: string | number | null;
          duration?: string | null;
          rest?: string | null;
          note?: string | null;
          completed?: boolean;
        }>;
      };
      created_at: string;
    }>;
  }>(`/trainer/clients/${clientId}/burn-logs`);
}

export function getTrainerClientWeeklyReport(clientId: string) {
  return authed<{
    report: {
      id: string;
      week_start: string;
      week_end: string;
      summary: string;
      ai_generated_checkin?: string | null;
      compliance_score?: string | number | null;
      created_at: string;
    } | null;
  }>(`/trainer/clients/${clientId}/weekly-report`);
}

export function getTrainerClientProgressPhotos(clientId: string) {
  return authed<{
    progressPhotos: Array<{
      id: string;
      image_url?: string | null;
      image_s3_key?: string | null;
      photo_type: "front" | "side" | "back" | "other";
      logged_at: string;
    }>;
  }>(`/trainer/clients/${clientId}/progress-photos`);
}

export function getTrainerClientMissions(clientId: string) {
  return authed<{
    missions: Array<{
      id: string;
      title: string;
      status: "open" | "completed";
      due_date: string;
      completed_at?: string | null;
      created_by_name?: string | null;
      created_at: string;
    }>;
  }>(`/trainer/clients/${clientId}/missions`);
}

export function createTrainerClientMission(input: { clientId: string; title: string; dueDate?: string }) {
  invalidateCached("trainer:");
  return authed<{
    mission: {
      id: string;
      title: string;
      status: "open" | "completed";
      due_date: string;
      created_at: string;
    };
  }>(`/trainer/clients/${input.clientId}/missions`, {
    method: "POST",
    body: JSON.stringify({ title: input.title, dueDate: input.dueDate })
  });
}

export function getTrainerRiskAlerts() {
  return authedCached<{
    alerts: Array<{
      id: string;
      user_id: string;
      type: string;
      severity: string;
      message: string;
      status: string;
      created_at: string;
      full_name?: string | null;
      profile_photo_url?: string | null;
    }>;
  }>("trainer:risk-alerts", "/trainer/risk-alerts", 20_000);
}

export function createWeeklyCheckin(clientId: string) {
  return authed<{ summary: string }>(`/ai/weekly-checkin/${clientId}`, {
    method: "POST"
  });
}

export function getAdminRevenue() {
  return authedCached<{
    byGym: Array<{
      gym_name: string | null;
      revenue_cents: string | number;
      active_subscriptions: string | number;
    }>;
    byTrainer: Array<{
      trainer_name: string | null;
      revenue_cents: string | number;
      active_subscriptions: string | number;
    }>;
  }>("admin:revenue", "/admin/analytics/revenue", 30_000);
}

export function getAdminUsage() {
  return authedCached<{
    usage: Array<{
      gym_name: string;
      clients: string | number;
      food_logs: string | number;
      weight_logs: string | number;
      water_logs: string | number;
    }>;
  }>("admin:usage", "/admin/analytics/usage", 30_000);
}

export function getAdminCompliance() {
  return authedCached<{
    compliance: Array<{
      gym_name: string;
      average_compliance: string | number | null;
      low_compliance_clients: string | number;
    }>;
  }>("admin:compliance", "/admin/analytics/compliance", 30_000);
}

export function getAdminAiUsage() {
  return authedCached<{
    summary: {
      monthly_food_image_analyses: string | number;
      monthly_ai_chat_messages: string | number;
      monthly_weekly_reports: string | number;
      monthly_cache_hits: string | number;
      monthly_errors: string | number;
      monthly_estimated_cost_cents: string | number;
      projected_monthly_cost_cents: string | number;
      spend_limit_cents: string | number;
      spend_percent: string | number;
      warning_level: 50 | 75 | 90 | null;
      limits: {
        monthlySpendLimitCents: number;
        monthlyFoodAnalysisLimit: number;
        monthlyChatLimit: number;
        monthlyWeeklyReportLimit: number;
      };
    };
    daily: Array<Record<string, string | number | null>>;
    weekly: Array<Record<string, string | number | null>>;
    monthly: Array<Record<string, string | number | null>>;
  }>("admin:ai-usage", "/admin/analytics/ai-usage", 30_000);
}

export function getAdminPilotMetrics() {
  return authedCached<{
    clients: {
      dailyActiveUsers: number;
      weeklyActiveUsers: number;
      foodLoggingRate: number;
      weightLoggingRate: number;
      waterLoggingRate: number;
      habitCompletionRate: number;
      averageComplianceScore: number;
    };
    trainers: {
      dailyTrainerLogins: number;
      trainerResponseRate: number;
      riskAlertsGenerated: number;
      riskAlertsResolved: number;
      clientsMonitored: number;
    };
    business: {
      freeUsers: number;
      premiumUsers: number;
      trialConversions: number;
      monthlyRecurringRevenueCents: number;
      churnRate: number;
      referralPerformance: Array<{
        code: string;
        type: "gym" | "trainer";
        gym_name: string | null;
        trainer_name: string | null;
        referred_users: string | number;
        converted_users: string | number;
        revenue_cents: string | number;
      }>;
    };
    ai: {
      aiSpendCents: number;
      costPerActiveUserCents: number;
      cacheHitRate: number;
      estimatedMonthlyCostCents: number;
    };
    trends: Array<{
      period: string;
      active_users: string | number;
      food_logs: string | number;
      weight_logs: string | number;
      water_logs: string | number;
      habit_completions: string | number;
      average_compliance_score: string | number;
      ai_cost_cents: string | number;
    }>;
  }>("admin:pilot-metrics", "/admin/analytics/pilot-metrics", 30_000);
}

export function getAdminNotifications() {
  return authedCached<{
    notifications: Array<{
      id: string;
      type: string;
      severity: "critical" | "important";
      title: string;
      body: string;
      href: string;
      count: number;
    }>;
    summary: {
      total: number;
      critical: number;
      important: number;
    };
  }>("admin:notifications", "/admin/notifications", 20_000);
}

export function registerNotificationDevice(input: { fcmToken: string; platform: "android" | "ios" | "desktop" | "web" }) {
  return authed<{ device: { id: string; platform: string; enabled: boolean; last_seen_at: string } }>("/notifications/devices", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function unregisterNotificationDevice(fcmToken: string) {
  return authed<{ disabled: boolean }>("/notifications/devices", {
    method: "DELETE",
    body: JSON.stringify({ fcmToken })
  });
}

export function recordNotificationActivity(screenName: string) {
  return authed<{ recorded: boolean }>("/notifications/activity", {
    method: "POST",
    body: JSON.stringify({ screenName })
  });
}

export function getGyms() {
  return api<{
    gyms: Array<{
      id: string;
      name: string;
      slug: string;
      location: string;
      country: string;
      timezone: string;
    }>;
  }>("/gyms");
}

export function validateReferral(code: string) {
  return api<{
    referral: {
      id: string;
      code: string;
      type: "gym" | "trainer";
      gym_name: string | null;
      trainer_name: string | null;
    };
  }>(`/referrals/validate/${encodeURIComponent(code)}`);
}

export function getAdminUsers() {
  return authedCached<{
    canManageOwnerGyms: boolean;
    users: Array<{
      id: string;
      full_name: string;
      email: string;
      primary_role: "client" | "trainer" | "admin" | "owner";
      roles: string[];
      gym_id: string | null;
      gym_name: string | null;
      assigned_trainer_id: string | null;
      assigned_trainer_name: string | null;
      referred_by_gym_id: string | null;
      referred_gym_name: string | null;
      referred_by_trainer_id: string | null;
      referred_trainer_name: string | null;
      referral_source: "gym" | "trainer" | "none";
      coaching_mode: CoachingMode | string | null;
      athlete_mode_enabled: boolean;
      owner_gym_ids: string[];
      current_plan: SubscriptionPlan;
      subscription_status: string | null;
      status: "active" | "inactive";
      created_at: string;
    }>;
  }>("admin:users", "/admin/users", 20_000);
}

export function getAdminTrainers() {
  return authedCached<{
    trainers: Array<{
      id: string;
      user_id: string;
      gym_id: string;
      full_name: string;
      email: string;
      user_status: "active" | "inactive";
      gym_name: string;
      specialties: string[];
      status: string;
    }>;
  }>("admin:trainers", "/admin/trainers", 20_000);
}

export function updateAdminUserRole(input: { userId: string; role: "client" | "trainer" | "admin" | "owner"; gymId?: string }) {
  invalidateCached("admin:");
  return authed<{ user: unknown }>(`/admin/users/${input.userId}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role: input.role, gymId: input.gymId })
  });
}

export function grantAdminSubscription(input: { userId: string; plan: SubscriptionPlan }) {
  invalidateCached("admin:");
  invalidateCached("subscription:");
  return authed<{ subscription: unknown }>(`/admin/users/${input.userId}/subscription`, {
    method: "POST",
    body: JSON.stringify({ plan: input.plan })
  });
}

export function updateAdminUserStatus(input: { userId: string; status: "active" | "inactive" }) {
  invalidateCached("admin:");
  return authed<{
    user: {
      id: string;
      full_name: string;
      email: string;
      status: "active" | "inactive";
    };
  }>(`/admin/users/${input.userId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status: input.status })
  });
}

export function assignOwnerGym(userId: string, gymId: string) {
  invalidateCached("admin:");
  return authed<{ assigned: true }>(`/admin/owners/${userId}/gyms`, {
    method: "POST",
    body: JSON.stringify({ gymId })
  });
}

export function removeOwnerGym(userId: string, gymId: string) {
  invalidateCached("admin:");
  return authed<{ assigned: false }>(`/admin/owners/${userId}/gyms/${gymId}`, { method: "DELETE" });
}

export function deleteAdminUser(userId: string) {
  invalidateCached("admin:");
  return authed<{
    deleted: { id: string; full_name: string; email: string };
  }>(`/admin/users/${userId}`, { method: "DELETE" });
}

export function assignAdminClient(input: { clientId: string; trainerId: string | null }) {
  invalidateCached("admin:");
  invalidateCached("trainer:");
  return authed<{ user: unknown }>("/admin/assign-client", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function setAdminAthleteMode(userId: string, enabled: boolean) {
  invalidateCached("admin:");
  invalidateCached("trainer:");
  return authed<{ athleteProfile: AthleteProfile }>(`/admin/users/${userId}/athlete-mode`, {
    method: "PATCH",
    body: JSON.stringify({ enabled })
  });
}

export type AthleteProfile = {
  user_id: string;
  enabled: boolean;
  sport?: string | null;
  division?: string | null;
  competition_name?: string | null;
  competition_date?: string | null;
  coach_name?: string | null;
  goal_weight_kg?: string | number | null;
  current_weight_kg?: string | number | null;
  timezone?: string | null;
};

export type AthleteCheckin = {
  id: string;
  checkin_date: string;
  sleep_hours: string | number;
  energy: number;
  soreness: number;
  stress: number;
  hunger: number;
  motivation: number;
  readiness_score: number;
  readiness_band: "green" | "yellow" | "red";
};

export type AthleteTarget = {
  id: string;
  target_type: string;
  cadence: "daily" | "weekly";
  target_value: number;
  completed_value: number;
  today_completed_value: number;
  weekly_completed_value: number;
  unit: string;
  notes?: string | null;
  week_start: string;
};

export type AthleteReview = {
  id: string;
  week_start: string;
  week_end: string;
  readiness_average?: string | number | null;
  compliance_percent: string | number;
  checkins_completed: number;
  summary: string;
  coach_comment?: string | null;
};

export type AthleteDashboard = {
  profile: AthleteProfile;
  countdown: { days: number; weeks: number; milestone?: string | null } | null;
  latestCheckin: AthleteCheckin | null;
  readiness: {
    score: number | null;
    band: "green" | "yellow" | "red" | null;
    status: string;
    warningReasons: string[];
  };
  readinessTrend: {
    direction: "improving" | "steady" | "declining";
    warningPatterns: string[];
    days: Array<{ date: string; score: number; band: "green" | "yellow" | "red" }>;
  };
  checkins: AthleteCheckin[];
  targets: AthleteTarget[];
  compliancePercent: number;
  dailyCompliancePercent: number;
  weeklyCompliancePercent: number;
  latestReview: AthleteReview | null;
  progressPhotos: Array<{ id: string; photo_type: string; image_url?: string | null; logged_at: string }>;
};

export function getAthleteDashboard() {
  return authedCached<{ athlete: AthleteDashboard }>("athlete:dashboard", "/athlete/me", 15_000);
}

export function updateAthleteProfile(input: {
  sport?: string;
  division?: string | null;
  competitionName?: string | null;
  competitionDate?: string | null;
  coachName?: string | null;
  goalWeightKg?: number | null;
  timezone?: string;
}) {
  invalidateCached("athlete:");
  invalidateCached("trainer:");
  invalidateCached("me:");
  return authed<{ profile: AthleteProfile }>("/athlete/me/profile", { method: "PATCH", body: JSON.stringify(input) });
}

export function updateAthleteTimezone(timezone: string) {
  invalidateCached("athlete:");
  return authed<{ timezone: string }>("/athlete/me/timezone", {
    method: "PATCH",
    body: JSON.stringify({ timezone })
  });
}

export function saveAthleteCheckin(input: {
  sleepHours: number;
  energy: number;
  soreness: number;
  stress: number;
  hunger: number;
  motivation: number;
}) {
  invalidateCached("athlete:");
  return authed<{ checkin: AthleteCheckin }>("/athlete/me/checkins", { method: "POST", body: JSON.stringify(input) });
}

export function saveAthleteTargetProgress(targetId: string, completedValue: number) {
  invalidateCached("athlete:");
  return authed<{ progress: unknown }>(`/athlete/me/targets/${targetId}/progress`, {
    method: "PUT",
    body: JSON.stringify({ completedValue })
  });
}

export function generateAthleteWeeklyReview() {
  invalidateCached("athlete:");
  return authed<{ review: AthleteReview }>("/athlete/me/reviews/generate", { method: "POST" });
}

export function getTrainerAthleteDashboard(clientId: string) {
  return authed<{ athlete: AthleteDashboard }>(`/trainer/clients/${clientId}/athlete`);
}

export function createAthleteTarget(clientId: string, input: {
  targetType: string;
  cadence: "daily" | "weekly";
  targetValue: number;
  unit: string;
  notes?: string;
}) {
  return authed<{ target: AthleteTarget }>(`/trainer/clients/${clientId}/athlete/targets`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getAthleteCoachNotes(clientId: string) {
  return authed<{ notes: Array<{ id: string; body: string; author_name: string; created_at: string }> }>(
    `/trainer/clients/${clientId}/athlete/notes`
  );
}

export function createAthleteCoachNote(clientId: string, body: string) {
  return authed<{ note: { id: string; body: string; created_at: string } }>(`/trainer/clients/${clientId}/athlete/notes`, {
    method: "POST",
    body: JSON.stringify({ body })
  });
}

export function updateAthleteReviewComment(clientId: string, coachComment: string | null) {
  return authed<{ review: AthleteReview }>(`/trainer/clients/${clientId}/athlete/review`, {
    method: "PATCH",
    body: JSON.stringify({ coachComment })
  });
}

export type BodyCompositionScan = {
  id?: string;
  scanDate: string;
  machine?: string | null;
  weightKg?: number | null;
  bmi?: number | null;
  bodyFatPercent?: number | null;
  fatMassKg?: number | null;
  leanBodyMassKg?: number | null;
  estimatedLeanBodyMassKg?: number | null;
  skeletalMuscleMassKg?: number | null;
  muscleMassKg?: number | null;
  visceralFat?: number | null;
  bodyWaterPercent?: number | null;
  proteinPercent?: number | null;
  mineralPercent?: number | null;
  boneMassKg?: number | null;
  bmrKcal?: number | null;
  metabolicAge?: number | null;
  segmentalMuscle?: Record<string, unknown> | null;
  segmentalFat?: Record<string, unknown> | null;
  confidenceScore?: number | null;
  missingFields?: string[];
  notes?: string | null;
  importSource: "ai_import" | "manual_entry";
  sourceImages?: Array<{ key?: string | null; url?: string | null }>;
  userConfirmed?: boolean;
  createdAt?: string;
};

export type BodyCompositionSummary = {
  latestScan: BodyCompositionScan | null;
  previousScan: BodyCompositionScan | null;
  scanCount: number;
  derived: {
    fatFreeMassKg: number | null;
    estimatedLeanBodyMassKg: number | null;
    ffmi: number | null;
    estimatedDailyEnergyNeedsKcal: number | null;
    bodyRecompositionIndex: number | null;
    rateOfFatLossKgPerWeek: number | null;
    rateOfMuscleGainKgPerMonth: number | null;
    goalEtaWeeks: number | null;
    weeklyProgressPercent: number | null;
    monthlyProgressPercent: number | null;
  };
  dnaScore: { current: number | null; previous: number | null; change: number | null; label: string };
  trends: Array<{ metric: string; current: number | null; previous: number | null; bestEver: number | null; change: number | null }>;
  coachAlerts: Array<{ type: string; severity: "positive" | "medium" | "high"; message: string }>;
  insights: string[];
  nutritionDataSource: "Profile Only" | "Profile + Body Scan" | "Profile + Body Scan History";
};

export function extractBodyComposition(images: string[], externalSignal?: AbortSignal) {
  return withTimeout(90_000, (timeoutSignal) =>
    authed<{ draft: BodyCompositionScan }>("/athlete/body-composition/extract", {
      method: "POST",
      body: JSON.stringify({ images }),
      signal: externalSignal ? combineAbortSignals([timeoutSignal, externalSignal]) : timeoutSignal
    })
  );
}

export function saveBodyCompositionScan(scan: BodyCompositionScan) {
  if (bodyCompositionSaveDebugEnabled()) console.info("[body-composition-save] Entering saveBodyCompositionScan()", { scan });
  invalidateCached("athlete:");
  invalidateCached("me:");
  invalidateCached("trainer:");
  return authed<{ scan: BodyCompositionScan; summary: BodyCompositionSummary }>("/athlete/body-composition/scans", {
    method: "POST",
    body: JSON.stringify(scan)
  });
}

export function getBodyCompositionSummary() {
  return authedCached<{ summary: BodyCompositionSummary }>("athlete:body-composition:summary", "/athlete/body-composition/summary", 20_000);
}

export function getBodyCompositionScans() {
  return authedCached<{ scans: BodyCompositionScan[] }>("athlete:body-composition:scans", "/athlete/body-composition/scans", 20_000);
}

export function getTrainerBodyComposition(clientId: string) {
  return authed<{ summary: BodyCompositionSummary; scans: BodyCompositionScan[] }>(`/trainer/clients/${clientId}/body-composition`);
}

export function saveTrainerBodyCompositionScan(clientId: string, scan: BodyCompositionScan) {
  if (bodyCompositionSaveDebugEnabled()) console.info("[body-composition-save] Entering saveTrainerBodyCompositionScan()", { clientId, scan });
  invalidateCached("trainer:");
  invalidateCached("athlete:");
  return authed<{ scan: BodyCompositionScan; summary: BodyCompositionSummary }>(`/trainer/clients/${clientId}/body-composition/scans`, {
    method: "POST",
    body: JSON.stringify(scan)
  });
}

export function createAdminReferral(input: {
  code: string;
  type: "gym" | "trainer";
  gymId?: string | null;
  trainerId?: string | null;
}) {
  return authed<{ referral: unknown }>("/admin/referral-codes", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getAdminReferrals() {
  return authed<{
    referrals: Array<{
      code: string;
      type: "gym" | "trainer";
      gym_name: string | null;
      trainer_name: string | null;
      referred_users: string | number;
      active_revenue_cents: string | number;
    }>;
  }>("/admin/referrals/analytics");
}

export function getAdminSubscriptions() {
  return authed<{
    subscriptions: Array<{
      id: string;
      full_name: string;
      email: string;
      plan: string;
      provider: string;
      status: string;
      amount_cents: number;
      currency: string;
      referred_gym_name: string | null;
      referred_trainer_name: string | null;
      created_at: string;
    }>;
  }>("/admin/subscriptions");
}

export type FounderLeadStatus =
  | "Not Contacted"
  | "Email Sent"
  | "Replied"
  | "Meeting Booked"
  | "Demo Completed"
  | "Pilot"
  | "Customer"
  | "Lost";

export type FounderLead = {
  id: string;
  gymName: string;
  website: string | null;
  country: string | null;
  city: string | null;
  publicEmail: string | null;
  contactPerson: string | null;
  ownerManagerName: string | null;
  linkedinUrl: string | null;
  instagramUrl: string | null;
  gymSize: string | null;
  ptFocus: string | null;
  existingApp: string | null;
  aiFitScore: number;
  status: FounderLeadStatus;
  expectedMrrCents: number;
  currentMrrCents: number;
  lastContactedAt: string | null;
  nextActionAt: string | null;
  research: Record<string, unknown>;
  emailDrafts: Record<string, unknown>;
  sourceUrls: string[];
  createdAt: string;
  updatedAt: string;
};

export type FounderDashboardSummary = {
  leads: number;
  emailsSent: number;
  openRate: number | null;
  replyRate: number;
  meetingsBooked: number;
  pilots: number;
  customers: number;
  mrrCents: number;
  expectedMrrCents: number;
};

export function getFounderDashboard() {
  return authedCached<{
    summary: FounderDashboardSummary;
    byStatus: Array<{ status: FounderLeadStatus; count: number }>;
  }>("founder:dashboard", "/founder/dashboard", 15_000);
}

export function getFounderLeads() {
  return authedCached<{ leads: FounderLead[] }>("founder:leads", "/founder/leads", 15_000);
}

export function createFounderLead(input: Partial<FounderLead> & { gymName: string }) {
  invalidateCached("founder:");
  return authed<{ lead: FounderLead }>("/founder/leads", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateFounderLead(leadId: string, input: Partial<FounderLead>) {
  invalidateCached("founder:");
  return authed<{ lead: FounderLead }>(`/founder/leads/${leadId}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function researchFounderWebsite(input: { website: string; gymName?: string }) {
  return authed<{ research: Record<string, unknown>; sourceUrl: string; sourceChars: number }>("/founder/research", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function researchFounderLead(leadId: string) {
  invalidateCached("founder:");
  return authed<{ lead: FounderLead; research: Record<string, unknown>; sourceChars: number }>(`/founder/leads/${leadId}/research`, {
    method: "POST"
  });
}

export function generateFounderEmailDrafts(input: { leadId?: string; research?: Record<string, unknown>; outreachAngle?: string }) {
  invalidateCached("founder:");
  return authed<{ drafts: Record<string, unknown> }>("/founder/email-drafts", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function createFounderNote(leadId: string, input: { noteType: "general" | "meeting" | "objection" | "feature_request" | "next_action"; body: string }) {
  return authed<{ note: unknown }>(`/founder/leads/${leadId}/notes`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getFounderNotes(leadId: string) {
  return authed<{ notes: Array<{ id: string; lead_id: string; note_type: string; body: string; created_at: string }> }>(`/founder/leads/${leadId}/notes`);
}

export function createFounderConversation(input: {
  leadId: string;
  channel: "gmail" | "linkedin" | "instagram" | "manual";
  direction: "outbound" | "inbound";
  subject?: string | null;
  body: string;
  externalMessageId?: string | null;
  sentAt?: string | null;
  receivedAt?: string | null;
}) {
  invalidateCached("founder:");
  return authed<{ conversation: unknown }>("/founder/conversations", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getFounderGmailStatus() {
  return authed<{
    configured: boolean;
    connected: boolean;
    available: boolean;
    gmailEmail: string | null;
    lastSyncedAt: string | null;
    connectedAt: string | null;
    message: string;
    manualApprovalRequired: boolean;
  }>("/founder/gmail/status");
}

export function getFounderGmailAuthUrl() {
  return authed<{ authUrl: string }>("/founder/gmail/auth-url");
}

export function sendFounderGmail(input: { leadId: string; to?: string; subject: string; body: string; approved: true }) {
  invalidateCached("founder:");
  return authed<{ sent: boolean; messageId: string; threadId: string; conversation: unknown }>("/founder/gmail/send", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function syncFounderGmailReplies() {
  invalidateCached("founder:");
  return authed<{ importedReplies: number }>("/founder/gmail/sync-replies", { method: "POST" });
}

export function disconnectFounderGmail() {
  invalidateCached("founder:");
  return authed<{ disconnected: boolean }>("/founder/gmail", { method: "DELETE" });
}

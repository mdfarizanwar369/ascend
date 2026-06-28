"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AscendDNAService, AscendDnaEvent, calculateAdaptiveNutritionTargets, CoachingMode } from "@ascend/shared";
import { ChevronDown } from "lucide-react";
import {
  acknowledgeGoalMilestone,
  completeMission,
  getBurnLogs,
  getAscendMemory,
  getCoachPresence,
  getComplianceToday,
  getFoodLogs,
  getHabitLogs,
  getHabits,
  getLatestRecognition,
  getMe,
  getMyProgressComparison,
  getMyNutritionPlan,
  getGoalStatus,
  getMyStreak,
  getProgressPhotos,
  getTodayMission,
  getWaterLogs,
  getWeightLogs,
  updateCoachPresenceStyle,
  dismissCoachPresence,
  CoachPresenceMessage,
  CoachPresenceSettings,
  AscendMemoryResponse
} from "@/lib/ascendApi";
import { AccountBar } from "@/components/AccountBar";
import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { localDateKey } from "@/lib/date";
import { clearDashboardRecord, DashboardActionType, readDashboardRecord, readRecentDashboardAction } from "@/lib/dataSync";
import { ProgressComparisonCard } from "@/components/ProgressComparisonCard";
import { AscendMemoryCard } from "@/components/memory/AscendMemoryCard";
import { DelightBadge, DelightProgressBar } from "@/components/Delight";
import { AscendHeroPanel, MomentumHalo } from "@/components/AscendVisualIdentity";
import { cacheAccountProfile, getCachedAccountProfile, loadAccountPlan } from "@/lib/accountSession";

type DashboardUser = Awaited<ReturnType<typeof getMe>>["user"];
type FoodLog = Awaited<ReturnType<typeof getFoodLogs>>["foodLogs"][number];
type WeightLog = Awaited<ReturnType<typeof getWeightLogs>>["weightLogs"][number];
type WaterLog = Awaited<ReturnType<typeof getWaterLogs>>["waterLogs"][number];
type Habit = Awaited<ReturnType<typeof getHabits>>["habits"][number];
type HabitLog = Awaited<ReturnType<typeof getHabitLogs>>["habitLogs"][number];
type BurnLog = Awaited<ReturnType<typeof getBurnLogs>>["burnLogs"][number];
type DailyMission = Awaited<ReturnType<typeof getTodayMission>>["mission"];
type LatestRecognition = Awaited<ReturnType<typeof getLatestRecognition>>["recognition"];
type Streak = Awaited<ReturnType<typeof getMyStreak>>["streak"];
type GoalStatus = Awaited<ReturnType<typeof getGoalStatus>>["goalStatus"];
type ProgressComparison = Awaited<ReturnType<typeof getMyProgressComparison>>["comparison"];
type ProgressPhoto = Awaited<ReturnType<typeof getProgressPhotos>>["progressPhotos"][number];
type CoachNutritionPlan = Awaited<ReturnType<typeof getMyNutritionPlan>>["coachPlan"];
type CollapsibleKey =
  | "nutrition"
  | "weightHistory"
  | "waterHistory"
  | "workoutHistory"
  | "weeklyReport"
  | "memory"
  | "progressPhotos"
  | "habits"
  | "foodHistory"
  | "coachMessages"
  | "bodyScanHistory"
  | "settings";

const goalCelebrationMessages = [
  "This is what consistency looks like.",
  "You earned this moment, one check-in at a time.",
  "Small wins stacked into a real result.",
  "Proof that showing up works.",
  "Celebrate this, then choose the next climb."
];

function formatGoal(goal?: string | null) {
  if (goal === "fat_loss") return "Fat loss";
  if (goal === "muscle_gain") return "Muscle gain";
  if (goal === "maintenance") return "Maintenance";
  return "Goal not set";
}

function effectiveCoachingMode(user: DashboardUser | null): CoachingMode {
  if (user?.assigned_trainer_id) return "human_coach";
  if (user?.coaching_mode === "ai_coach" || user?.coaching_mode === "human_coach" || user?.coaching_mode === "self_coached") return user.coaching_mode;
  return "self_coached";
}

function coachingLabel(mode: CoachingMode) {
  if (mode === "human_coach") return "Human Coach";
  if (mode === "ai_coach") return "AI Coach";
  return "Self-Coached";
}

function asNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

function quickLogHref(item: string) {
  if (item === "Food") return "/food-log";
  if (item === "Weight") return "/weight-log";
  if (item === "Water") return "/water-log";
  if (item === "Burn") return "/burn-log";
  return "/dashboard";
}

function weightTrend(current?: WeightLog, previous?: WeightLog) {
  if (!current || !previous) return "Add 2 weigh-ins";
  const diff = asNumber(current.weight_kg) - asNumber(previous.weight_kg);
  if (Math.abs(diff) < 0.1) return "Stable";
  return `${diff > 0 ? "+" : ""}${diff.toFixed(1)}kg`;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function progressCopy(goal?: string | null) {
  if (goal === "fat_loss") return "toward your weight-loss goal";
  if (goal === "muscle_gain") return "toward your muscle-gain goal";
  if (goal === "maintenance") return "toward your maintenance range";
  return "after you set a goal";
}

function lastSevenDateKeys() {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    return localDateKey(date.toISOString());
  });
}

function uniqueDays<T>(items: T[], getDate: (item: T) => string) {
  return new Set(items.map((item) => localDateKey(getDate(item))));
}

function toDnaAction(type: DashboardActionType): "food" | "water" | "weight" | "habit" | "activity" | "progress_photo" {
  return type === "burn" ? "activity" : type;
}

function formatMealTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

function formatShortDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(date);
}

function CollapsibleSection({
  title,
  preview,
  children,
  isOpen,
  onToggle
}: {
  title: string;
  preview: string;
  children: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <section className="mt-4 rounded-2xl border border-line bg-surface shadow-soft">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <p className="mt-1 truncate text-sm text-zinc-400">{preview}</p>
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-ink text-zinc-200">
          <ChevronDown className={`transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} size={18} />
        </span>
      </button>
      <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="overflow-hidden">
          <div className="border-t border-line p-4 pt-3">{children}</div>
        </div>
      </div>
    </section>
  );
}

export function ClientDashboard() {
  const [user, setUser] = useState<DashboardUser | null>(null);
  const [foodLogs, setFoodLogs] = useState<FoodLog[]>([]);
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [waterLogs, setWaterLogs] = useState<WaterLog[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([]);
  const [burnLogs, setBurnLogs] = useState<BurnLog[]>([]);
  const [dailyMission, setDailyMission] = useState<DailyMission>(null);
  const [latestRecognition, setLatestRecognition] = useState<LatestRecognition>(null);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [goalStatus, setGoalStatus] = useState<GoalStatus | null>(null);
  const [progressComparison, setProgressComparison] = useState<ProgressComparison | null>(null);
  const [progressPhotos, setProgressPhotos] = useState<ProgressPhoto[]>([]);
  const [coachNutritionPlan, setCoachNutritionPlan] = useState<CoachNutritionPlan>(null);
  const [coachPresence, setCoachPresence] = useState<{
    latest: CoachPresenceMessage | null;
    history: CoachPresenceMessage[];
    settings: CoachPresenceSettings;
  }>({ latest: null, history: [], settings: { style: "balanced", paused: false, pauseUntil: null } });
  const [ascendMemory, setAscendMemory] = useState<AscendMemoryResponse | null>(null);
  const [momentumScore, setMomentumScore] = useState<number | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [plan, setPlan] = useState<"free" | "premium" | "trainer_pro" | null>(null);
  const [status, setStatus] = useState("Loading your Ascend profile...");
  const [missionStatus, setMissionStatus] = useState("");
  const [isCompletingMission, setIsCompletingMission] = useState(false);
  const [recentAction, setRecentAction] = useState<ReturnType<typeof readRecentDashboardAction>>(null);
  const [dashboardSessionCount, setDashboardSessionCount] = useState(1);
  const [isCelebratingGoal, setIsCelebratingGoal] = useState(false);
  const [hasCelebratedGoal, setHasCelebratedGoal] = useState(false);
  const [goalCelebrationMessage, setGoalCelebrationMessage] = useState(goalCelebrationMessages[0]);
  const [openSections, setOpenSections] = useState<Record<CollapsibleKey, boolean>>({
    nutrition: false,
    weightHistory: false,
    waterHistory: false,
    workoutHistory: false,
    weeklyReport: false,
    memory: false,
    progressPhotos: false,
    habits: false,
    foodHistory: false,
    coachMessages: false,
    bodyScanHistory: false,
    settings: false
  });
  const dashboardRequestRef = useRef(0);
  const dashboardLoadInFlightRef = useRef(false);
  const hasLoadedDashboardRef = useRef(false);
  const missionLockRef = useRef(false);
  const goalCelebrateLockRef = useRef(false);
  const progressDetailsRef = useRef<HTMLDivElement | null>(null);

  const loadDashboard = useCallback(async () => {
    if (dashboardLoadInFlightRef.current) return;
    dashboardLoadInFlightRef.current = true;
    if (hasLoadedDashboardRef.current) setStatus("Updating today's progress...");
    const requestId = ++dashboardRequestRef.current;
    const comparisonRequest = getMyProgressComparison();
    const pendingFoodLog = readDashboardRecord<FoodLog>("food");
    const pendingWeightLog = readDashboardRecord<WeightLog>("weight");
    const pendingWaterLog = readDashboardRecord<WaterLog>("water");
    const pendingBurnLog = readDashboardRecord<BurnLog>("burn");
    const pendingHabitLog = readDashboardRecord<HabitLog>("habit");
    if (pendingFoodLog) {
      setFoodLogs((current) => [pendingFoodLog, ...current.filter((log) => log.id !== pendingFoodLog.id)]);
    }
    if (pendingWeightLog) setWeightLogs((current) => [pendingWeightLog, ...current.filter((log) => log.id !== pendingWeightLog.id)]);
    if (pendingWaterLog) setWaterLogs((current) => [pendingWaterLog, ...current.filter((log) => log.id !== pendingWaterLog.id)]);
    if (pendingBurnLog) setBurnLogs((current) => [pendingBurnLog, ...current.filter((log) => log.id !== pendingBurnLog.id)]);
    if (pendingHabitLog) setHabitLogs((current) => [pendingHabitLog, ...current.filter((log) => log.id !== pendingHabitLog.id)]);

    try {
      const cachedProfile = getCachedAccountProfile();
      if (cachedProfile) {
        setUser((current) => current ?? ({
          id: "",
          email: cachedProfile.email,
          full_name: cachedProfile.fullName,
          profile_photo_url: cachedProfile.profilePhotoUrl ?? null
        } as DashboardUser));
        setRoles(cachedProfile.roles);
      }

      const me = await getMe();
      if (requestId !== dashboardRequestRef.current) return;

      setUser(me.user);
      setRoles(Array.isArray(me.roles) ? me.roles : []);
      cacheAccountProfile({
        email: me.user.email,
        fullName: me.user.full_name,
        roles: Array.isArray(me.roles) ? me.roles : [],
        profilePhotoUrl: me.user.profile_photo_url
      });
      setStatus("");

      const subscriptionRequest = loadAccountPlan().catch(() => "free" as const);
      const dashboardDataRequest = Promise.allSettled([
        getFoodLogs(),
        getWeightLogs(),
        getWaterLogs(),
        getHabits(),
        getHabitLogs(),
        getBurnLogs(),
        getComplianceToday(),
        getTodayMission(),
        getLatestRecognition(),
        getMyStreak(),
        getGoalStatus(),
        getProgressPhotos(),
        getMyNutritionPlan(),
        getCoachPresence(),
        getAscendMemory()
      ]);

      const plan = await subscriptionRequest;
      if (requestId !== dashboardRequestRef.current) return;
      setPlan(plan);

      const [foods, weights, waters, nextHabits, nextHabitLogs, burns, compliance, mission, recognition, nextStreak, nextGoalStatus, photos, nutritionPlan, presence, memory] = await dashboardDataRequest;
      if (requestId !== dashboardRequestRef.current) return;

      if (foods.status === "fulfilled") {
        const fetchedFoodLogs = Array.isArray(foods.value.foodLogs) ? foods.value.foodLogs : [];
        const includesPendingLog = pendingFoodLog && fetchedFoodLogs.some((log) => log.id === pendingFoodLog.id);
        setFoodLogs(
          pendingFoodLog && !includesPendingLog
            ? [pendingFoodLog, ...fetchedFoodLogs]
            : fetchedFoodLogs
        );
        if (pendingFoodLog && includesPendingLog) clearDashboardRecord("food", pendingFoodLog.id);
      }
      if (weights.status === "fulfilled") {
        const fetched = Array.isArray(weights.value.weightLogs) ? weights.value.weightLogs : [];
        const includesPending = pendingWeightLog && fetched.some((log) => log.id === pendingWeightLog.id);
        setWeightLogs(pendingWeightLog && !includesPending ? [pendingWeightLog, ...fetched] : fetched);
        if (pendingWeightLog && includesPending) clearDashboardRecord("weight", pendingWeightLog.id);
      }
      if (waters.status === "fulfilled") {
        const fetched = Array.isArray(waters.value.waterLogs) ? waters.value.waterLogs : [];
        const includesPending = pendingWaterLog && fetched.some((log) => log.id === pendingWaterLog.id);
        setWaterLogs(pendingWaterLog && !includesPending ? [pendingWaterLog, ...fetched] : fetched);
        if (pendingWaterLog && includesPending) clearDashboardRecord("water", pendingWaterLog.id);
      }
      if (nextHabits.status === "fulfilled") setHabits(Array.isArray(nextHabits.value.habits) ? nextHabits.value.habits : []);
      if (nextHabitLogs.status === "fulfilled") {
        const fetched = Array.isArray(nextHabitLogs.value.habitLogs) ? nextHabitLogs.value.habitLogs : [];
        const includesPending = pendingHabitLog && fetched.some((log) => log.id === pendingHabitLog.id);
        setHabitLogs(pendingHabitLog && !includesPending ? [pendingHabitLog, ...fetched] : fetched);
        if (pendingHabitLog && includesPending) clearDashboardRecord("habit", pendingHabitLog.id);
      }
      if (burns.status === "fulfilled") {
        const fetched = Array.isArray(burns.value.burnLogs) ? burns.value.burnLogs : [];
        const includesPending = pendingBurnLog && fetched.some((log) => log.id === pendingBurnLog.id);
        setBurnLogs(pendingBurnLog && !includesPending ? [pendingBurnLog, ...fetched] : fetched);
        if (pendingBurnLog && includesPending) clearDashboardRecord("burn", pendingBurnLog.id);
      }
      if (mission.status === "fulfilled") setDailyMission(mission.value.mission);
      if (recognition.status === "fulfilled") setLatestRecognition(recognition.value.recognition);
      if (nextStreak.status === "fulfilled") setStreak(nextStreak.value.streak);
      if (nextGoalStatus.status === "fulfilled") setGoalStatus(nextGoalStatus.value.goalStatus);
      if (photos.status === "fulfilled") setProgressPhotos(Array.isArray(photos.value.progressPhotos) ? photos.value.progressPhotos : []);
      if (nutritionPlan.status === "fulfilled") setCoachNutritionPlan(nutritionPlan.value.coachPlan);
      if (presence.status === "fulfilled") setCoachPresence(presence.value);
      if (memory.status === "fulfilled") setAscendMemory(memory.value);
      if (compliance.status === "fulfilled") {
        const nextCompliance = compliance.value.compliance;
        setMomentumScore(nextCompliance?.score ?? null);
      }
      hasLoadedDashboardRef.current = true;
      setStatus("");
      comparisonRequest
        .then((response) => {
          if (requestId === dashboardRequestRef.current) setProgressComparison(response.comparison);
        })
        .catch(() => undefined);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Log in again if this page does not load your profile.");
    } finally {
      dashboardLoadInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    try {
      const nextSessionCount = Number(window.localStorage.getItem("ascend:client-dashboard-sessions") ?? "0") + 1;
      window.localStorage.setItem("ascend:client-dashboard-sessions", String(nextSessionCount));
      setDashboardSessionCount(nextSessionCount);
    } catch {
      setDashboardSessionCount(1);
    }

    loadDashboard().catch(() => {
      if (isMounted) setStatus("Log in again if this page does not load your profile.");
    });

    return () => {
      isMounted = false;
    };
  }, [loadDashboard]);

  async function markMissionDone() {
    if (!dailyMission || dailyMission.status === "completed") return;
    if (missionLockRef.current) return;
    missionLockRef.current = true;
    setIsCompletingMission(true);
    setMissionStatus("Saving mission...");

    try {
      const response = await completeMission(dailyMission.id);
      setDailyMission({ ...dailyMission, ...response.mission });
      setMissionStatus("Mission completed. Nice work.");
    } catch {
      setMissionStatus("Could not complete this mission yet. Please try again.");
    } finally {
      missionLockRef.current = false;
      setIsCompletingMission(false);
    }
  }

  async function acknowledgeMilestone() {
    if (!goalStatus?.milestone_id) return;
    if (goalCelebrateLockRef.current) return;
    goalCelebrateLockRef.current = true;
    setHasCelebratedGoal(true);
    setGoalCelebrationMessage(goalCelebrationMessages[Math.floor(Math.random() * goalCelebrationMessages.length)]);
    setIsCelebratingGoal(true);
    if (typeof window !== "undefined" && "navigator" in window) {
      window.navigator.vibrate?.([18, 30, 18]);
    }
    try {
      await acknowledgeGoalMilestone(goalStatus.milestone_id);
      window.setTimeout(() => {
        setGoalStatus((current) => current ? { ...current, acknowledged_at: new Date().toISOString() } : current);
        setIsCelebratingGoal(false);
      }, 2000);
    } catch {
      goalCelebrateLockRef.current = false;
      setHasCelebratedGoal(false);
      setIsCelebratingGoal(false);
      setStatus("Your milestone is safe, but Ascend could not close this message yet.");
    }
  }

  async function changeCoachPresenceStyle(style: CoachPresenceSettings["style"]) {
    setCoachPresence((current) => ({ ...current, settings: { ...current.settings, style } }));
    try {
      await updateCoachPresenceStyle(style);
    } catch {
      setStatus("Could not update Coach Presence style yet.");
    }
  }

  async function dismissPresence(messageId: string) {
    setCoachPresence((current) => ({
      ...current,
      latest: current.latest?.id === messageId ? null : current.latest,
      history: current.history.filter((message) => message.id !== messageId)
    }));
    try {
      await dismissCoachPresence(messageId);
    } catch {
      setStatus("Could not dismiss this Coach Presence message yet.");
    }
  }

  useEffect(() => {
    function refreshDashboard() {
      if (document.visibilityState === "hidden") return;
      loadDashboard().catch(() => setStatus("Log in again if this page does not load your profile."));
    }

    window.addEventListener("focus", refreshDashboard);
    window.addEventListener("pageshow", refreshDashboard);

    return () => {
      window.removeEventListener("focus", refreshDashboard);
      window.removeEventListener("pageshow", refreshDashboard);
    };
  }, [loadDashboard]);

  useEffect(() => {
    setRecentAction(readRecentDashboardAction());
  }, []);

  useEffect(() => {
    if (!recentAction) return;
    const remainingMs = Math.max(0, recentAction.savedAt + 25 * 60_000 - Date.now());
    const timeout = window.setTimeout(() => {
      setRecentAction(readRecentDashboardAction());
    }, remainingMs + 250);
    return () => window.clearTimeout(timeout);
  }, [recentAction]);

  const today = useMemo(() => localDateKey(), []);
  const weekKeys = useMemo(() => lastSevenDateKeys(), []);
  const todaysFood = foodLogs.filter((log) => localDateKey(log.logged_at) === today);
  const todaysWaterMl = waterLogs.filter((log) => localDateKey(log.logged_at) === today).reduce((total, log) => total + Number(log.amount_ml ?? 0), 0);
  const todaysBurnCalories = burnLogs
    .filter((log) => localDateKey(log.created_at) === today)
    .reduce((total, log) => total + Number(log.metadata?.caloriesBurned ?? 0), 0);
  const latestMealsPreview = foodLogs.slice(0, 3);
  const latestWeight = weightLogs[0];
  const previousWeight = weightLogs[1];
  const latestWeightLoggedToday = latestWeight ? localDateKey(latestWeight.logged_at) === today : false;
  const latestProgressPhoto = progressPhotos[0];
  const currentWeight = asNumber(latestWeight?.weight_kg);
  const startWeight = asNumber(user?.starting_weight_kg);
  const targetWeight = asNumber(user?.target_weight_kg);
  const completedHabitIds = useMemo(
    () =>
      new Set(
        habitLogs.filter((log) => log.completed && localDateKey(log.logged_at) === today).map((log) => log.habit_id)
      ),
    [habitLogs, today]
  );
  const dashboardHabits = habits.slice(0, 3);
  const habitNameById = useMemo(() => new Map(habits.map((habit) => [habit.id, habit.name])), [habits]);
  const dnaEvents = useMemo<AscendDnaEvent[]>(
    () => [
      ...foodLogs.map((log) => ({ type: "food" as const, occurredAt: log.logged_at })),
      ...waterLogs.map((log) => ({ type: "water" as const, occurredAt: log.logged_at })),
      ...weightLogs.map((log) => ({ type: "weight" as const, occurredAt: log.logged_at })),
      ...burnLogs.map((log) => ({ type: "activity" as const, occurredAt: log.created_at })),
      ...progressPhotos.map((photo) => ({ type: "progress_photo" as const, occurredAt: photo.logged_at })),
      ...habitLogs.map((log) => ({
        type: "habit" as const,
        occurredAt: log.logged_at,
        completed: Boolean(log.completed),
        habitName: habitNameById.get(log.habit_id) ?? null
      }))
    ],
    [burnLogs, foodLogs, habitLogs, habitNameById, progressPhotos, waterLogs, weightLogs]
  );
  const calories = todaysFood.reduce((total, log) => total + Number(log.calories), 0);
  const protein = Math.round(todaysFood.reduce((total, log) => total + asNumber(log.protein_g), 0));
  const carbs = Math.round(todaysFood.reduce((total, log) => total + asNumber(log.carbs_g), 0));
  const fat = Math.round(todaysFood.reduce((total, log) => total + asNumber(log.fat_g), 0));
  const athleteBodyComposition = user?.athlete_mode_enabled ? user.body_composition_nutrition ?? null : null;
  const nutritionTargets = calculateAdaptiveNutritionTargets({
    goalType: user?.goal_type,
    sex: user?.gender === "female" || user?.gender === "male" ? user.gender : "prefer_not_to_say",
    ageYears: user?.age_years,
    heightCm: user?.height_cm,
    weightKg: currentWeight || startWeight,
    targetWeightKg: targetWeight,
    activityLevel:
      user?.activity_level === "low" || user?.activity_level === "moderate" || user?.activity_level === "high"
        ? user.activity_level
        : "moderate",
    bodyComposition: athleteBodyComposition ?? undefined
  }, weightLogs.map((log) => ({ weightKg: log.weight_kg, loggedAt: log.logged_at })));
  const hasCoachNutritionPlan = Boolean(coachNutritionPlan);
  const calorieTarget = coachNutritionPlan?.calories ?? nutritionTargets.calorieTarget;
  const proteinTarget = coachNutritionPlan?.protein_g ?? nutritionTargets.proteinTargetG;
  const carbsTarget = coachNutritionPlan?.carbs_g ?? nutritionTargets.carbsTargetG;
  const fatTarget = coachNutritionPlan?.fat_g ?? nutritionTargets.fatTargetG;
  const nutritionSourceLabel = hasCoachNutritionPlan
    ? "Coach Plan"
    : athleteBodyComposition
      ? "Nutrition powered by your latest Body Scan"
      : user?.athlete_mode_enabled
        ? "Using profile data until your first Body Scan"
        : "Ascend Recommendation";
  const nutritionSourceTone = hasCoachNutritionPlan ? "text-calm" : athleteBodyComposition ? "text-purple-300" : "text-lime";
  const caloriesLeft = Math.max(calorieTarget - calories, 0);
  const calorieOver = Math.max(calories - calorieTarget, 0);
  const proteinLeft = Math.max(proteinTarget - protein, 0);
  const waterLeftMl = Math.max(nutritionTargets.waterTargetMl - todaysWaterMl, 0);
  const calorieProgress = clamp(Math.round((calories / calorieTarget) * 100));
  const proteinProgress = clamp(Math.round((protein / proteinTarget) * 100));
  const needsGuideProfile = !user?.age_years || !user?.height_cm || !user?.activity_level || !user?.gender;
  const profileIncomplete = Boolean(user) && (!user?.goal_type || !user?.age_years || !user?.height_cm || !user?.starting_weight_kg || !user?.activity_level);
  const hasExperiencedAscend = foodLogs.length > 0 || weightLogs.length > 0 || waterLogs.length > 0 || dashboardSessionCount >= 3;
  const shouldShowProfileReminder = profileIncomplete && hasExperiencedAscend;
  const fallbackScore = Math.min(100, 35 + (todaysFood.length ? 25 : 0) + (latestWeight ? 20 : 0) + (todaysWaterMl >= 1500 ? 20 : 0));
  const score = momentumScore ?? fallbackScore;
  const scoreLabel = score >= 80 ? "Strong momentum" : score >= 60 ? "Building momentum" : "Start with one check-in";
  const momentumHeadline = score >= 70 ? "You're on track" : "Let's get back on track";
  const currentStreak = Number(streak?.current ?? 0);
  const streakTitle = currentStreak >= 2 ? `${currentStreak}-day consistency streak` : currentStreak === 1 ? "You checked in today" : "Start a streak today";
  const streakCopy =
    currentStreak >= 5
      ? "You are building a strong rhythm between sessions."
      : currentStreak >= 2
        ? "Keep showing up. Small check-ins are adding up."
        : streak?.checkedInToday
          ? "One check-in today counts. Come back tomorrow to build the streak."
          : "Log one thing today to get moving again.";
  const safeRoles = Array.isArray(roles) ? roles : [];
  const canTrain = safeRoles.some((role) => ["trainer", "admin", "owner"].includes(role));
  const canAdmin = safeRoles.some((role) => ["admin", "owner"].includes(role));
  const hasPremiumAccess = plan === "premium" || plan === "trainer_pro" || canAdmin;
  const progressPhotoDue = (() => {
    if (!hasPremiumAccess) return false;
    if (!latestProgressPhoto) return true;
    const latestPhotoDate = new Date(latestProgressPhoto.logged_at);
    if (Number.isNaN(latestPhotoDate.getTime())) return false;
    const daysSincePhoto = Math.floor((Date.now() - latestPhotoDate.getTime()) / 86_400_000);
    return daysSincePhoto >= 7;
  })();
  const coachingMode = effectiveCoachingMode(user);

  const weeklyFoodDays = uniqueDays(foodLogs.filter((log) => weekKeys.includes(localDateKey(log.logged_at))), (log) => log.logged_at);
  const weeklyWeightDays = uniqueDays(weightLogs.filter((log) => weekKeys.includes(localDateKey(log.logged_at))), (log) => log.logged_at);
  const weeklyWaterDays = uniqueDays(waterLogs.filter((log) => weekKeys.includes(localDateKey(log.logged_at))), (log) => log.logged_at);
  const weeklyBurnDays = uniqueDays(burnLogs.filter((log) => weekKeys.includes(localDateKey(log.created_at))), (log) => log.created_at);
  const weeklyHabitDays = uniqueDays(
    habitLogs.filter((log) => log.completed && weekKeys.includes(localDateKey(log.logged_at))),
    (log) => log.logged_at
  );
  const weeklyCheckInDays = new Set([
    ...weeklyFoodDays,
    ...weeklyWeightDays,
    ...weeklyWaterDays,
    ...weeklyBurnDays,
    ...weeklyHabitDays
  ]);
  const foodConsistency = weeklyFoodDays.size;
  const proteinConsistency = weekKeys.filter((key) => {
    const dailyProtein = foodLogs
      .filter((log) => localDateKey(log.logged_at) === key)
      .reduce((total, log) => total + asNumber(log.protein_g), 0);
    return dailyProtein >= proteinTarget;
  }).length;

  const goalProgress = (() => {
    if (!startWeight || !targetWeight || !currentWeight || startWeight === targetWeight) return null;
    const totalChangeNeeded = Math.abs(startWeight - targetWeight);
    const progressChange =
      user?.goal_type === "muscle_gain"
        ? currentWeight - startWeight
        : user?.goal_type === "maintenance"
          ? Math.max(0, totalChangeNeeded - Math.abs(currentWeight - targetWeight))
          : startWeight - currentWeight;
    return clamp(Math.round((progressChange / totalChangeNeeded) * 100));
  })();

  const remainingWeight = targetWeight && currentWeight ? Math.abs(currentWeight - targetWeight) : null;

  const premiumActions = [
    { href: "/messages", title: "Message trainer", detail: user?.assigned_trainer_name ?? "Ask a question" },
    { href: "/reports", title: "Weekly report", detail: "Review wins" },
    { href: "/coach", title: "AI coach", detail: "Meal ideas" },
    { href: "/progress", title: "Progress photo", detail: "Track changes" }
  ];
  const navItems = [
    { href: "/dashboard", label: "Home", selected: true, show: true },
    { href: "/trainer", label: "Trainer", selected: false, show: canTrain },
    { href: "/admin", label: "Admin", selected: false, show: canAdmin }
  ].filter((item) => item.show);
  const dnaProfile = useMemo(
    () =>
      AscendDNAService.buildProfile({
        now: new Date(),
        events: dnaEvents,
        currentStreak,
        bestStreak: streak?.best ?? currentStreak,
        momentumScores: momentumScore === null ? [] : [{ score: momentumScore, occurredAt: new Date() }]
      }),
    [currentStreak, dnaEvents, momentumScore, streak?.best]
  );
  const nextAction = AscendDNAService.getNextBestMove({
    now: new Date(),
    dna: dnaProfile,
    todaysFoodCount: todaysFood.length,
    caloriesLeft,
    calorieOver,
    proteinLeft,
    waterLeftMl,
    completedHabits: completedHabitIds.size,
    totalHabits: habits.length,
    todaysBurnCalories,
    latestWeightLoggedToday,
    progressPhotoDue
  });
  const recentCelebration = recentAction ? AscendDNAService.getCelebration(toDnaAction(recentAction.type)) : null;
  const goalCompletedToday = Boolean(goalStatus?.milestone_id);
  const greeting = AscendDNAService.getGreeting(dnaProfile, new Date());
  const yesterday = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return localDateKey(date.toISOString());
  }, []);
  const yesterdayProtein = foodLogs
    .filter((log) => localDateKey(log.logged_at) === yesterday)
    .reduce((total, log) => total + asNumber(log.protein_g), 0);
  const weightLostFromStart = startWeight && currentWeight && startWeight > currentWeight ? startWeight - currentWeight : 0;
  const enhancedNextAction = (() => {
    if (recentCelebration) return nextAction;
    if (!todaysFood.length && foodConsistency >= 5) {
      return {
        ...nextAction,
        title: `Make it ${foodConsistency + 1} food-logging days`,
        detail: `You've logged meals on ${foodConsistency} days this week. One honest meal log today keeps that rhythm alive.`
      };
    }
    if (proteinLeft > 25 && yesterdayProtein >= proteinTarget) {
      return {
        ...nextAction,
        title: "Make protein consistent again today",
        detail: "Yesterday you hit your protein goal. A protein-rich meal today keeps that momentum going."
      };
    }
    if (weightLostFromStart >= 5) {
      return {
        ...nextAction,
        title: "Protect the progress you've built",
        detail: `You've already moved ${weightLostFromStart.toFixed(1)}kg from your starting point. Today's job is simply to stay consistent.`
      };
    }
    if (currentStreak >= 3) {
      return {
        ...nextAction,
        title: `Keep your ${currentStreak}-day streak alive`,
        detail: "One small check-in today is enough to keep the chain going."
      };
    }
    return nextAction;
  })();
  const taskItems = [
    { label: "Food logged", done: todaysFood.length > 0, href: "/food-log" },
    { label: "Water completed", done: todaysWaterMl >= nutritionTargets.waterTargetMl, href: "/water-log" },
    { label: "Weight recorded", done: latestWeightLoggedToday, href: "/weight-log" },
    { label: "Workout completed", done: todaysBurnCalories > 0, href: "/burn-log" },
    { label: "Habit completed", done: completedHabitIds.size > 0, href: "/habits" }
  ];
  const completedTaskCount = taskItems.filter((item) => item.done).length;
  const dailyCompletion = Math.round((completedTaskCount / taskItems.length) * 100);
  const todayProgressItems = [
    goalCompletedToday
      ? { label: "Goal", value: "Done", detail: "completed" }
      : { label: "Food", value: `${todaysFood.length}`, detail: todaysFood.length === 1 ? "meal" : "meals" },
    { label: "Water", value: `${(todaysWaterMl / 1000).toFixed(1)}L`, detail: `${(nutritionTargets.waterTargetMl / 1000).toFixed(1)}L guide` },
    { label: "Activity", value: `${todaysBurnCalories}`, detail: "kcal burn" }
  ];
  const quickSnapshotItems = [
    { label: "Calories", value: calories.toLocaleString(), detail: `${calorieTarget.toLocaleString()} guide` },
    { label: "Protein", value: `${protein}g`, detail: `${proteinTarget}g guide` },
    { label: "Water", value: `${(todaysWaterMl / 1000).toFixed(1)}L`, detail: `${(nutritionTargets.waterTargetMl / 1000).toFixed(1)}L guide` },
    { label: "Weight", value: currentWeight ? `${currentWeight.toFixed(1)}kg` : "--", detail: weightTrend(latestWeight, previousWeight) },
    { label: "Momentum", value: `${score}/100`, detail: scoreLabel }
  ];
  const latestBurnLog = burnLogs[0];
  const weightDelta = latestWeight && previousWeight ? asNumber(latestWeight.weight_kg) - asNumber(previousWeight.weight_kg) : null;
  const latestMemoryMilestone = ascendMemory?.timeline?.[0];
  const nutritionPreview = `${calories.toLocaleString()} kcal / ${protein}g protein / ${todaysFood.length} meals today`;
  const weightPreview = latestWeight
    ? `${asNumber(latestWeight.weight_kg).toFixed(1)}kg${weightDelta !== null ? ` / ${weightDelta > 0 ? "+" : ""}${weightDelta.toFixed(1)}kg` : ""}`
    : "Record your first weight check-in";
  const waterPreview = `${(todaysWaterMl / 1000).toFixed(1)}L today / ${weeklyWaterDays.size}/7 days`;
  const workoutPreview = latestBurnLog
    ? `${Number(latestBurnLog.metadata?.caloriesBurned ?? 0).toLocaleString()} kcal / ${formatShortDate(latestBurnLog.created_at)}`
    : "Your first activity log is waiting";
  const weeklyReportPreview = hasPremiumAccess ? "Your weekly reflection is ready" : "Premium unlocks weekly reflections";
  const memoryPreview = latestMemoryMilestone ? `Latest milestone: ${latestMemoryMilestone.title}` : "Your first milestone is waiting";
  const photoPreview = progressPhotos.length ? `${progressPhotos.length} photos / latest ${formatShortDate(progressPhotos[0]?.logged_at)}` : "Take your first progress photo";
  const habitsPreview = dashboardHabits.length ? `${completedHabitIds.size}/${habits.length} habits done today` : "Build your first repeatable habit";
  const foodHistoryPreview = foodLogs.length ? `${foodLogs.length} total meals / ${todaysFood.length} today` : "Your first meal log starts the pattern";
  const coachMessagePreview = latestRecognition?.message
    ? `Latest: "${latestRecognition.message}"`
    : coachPresence.latest?.message
      ? `Latest: "${coachPresence.latest.message}"`
      : user?.assigned_trainer_name
        ? `Message ${user.assigned_trainer_name}`
        : "Coach messages will appear here";
  const bodyScanPreview = user?.athlete_mode_enabled
    ? athleteBodyComposition?.scanCount
      ? `Body fat ${athleteBodyComposition.bodyFatPercent ?? "--"}% / ${athleteBodyComposition.scanCount} scans`
      : "Your first Body Scan is waiting"
    : "Athlete Mode only";
  const whyTodayMatters = [
    currentStreak >= 30
      ? `${currentStreak} days of consistency is a real streak. Today protects that identity.`
      : currentStreak >= 7
        ? `${currentStreak} days in a row. One check-in today keeps the streak alive.`
        : null,
    weightLostFromStart >= 5 ? `${weightLostFromStart.toFixed(1)}kg down from your starting point. Stay steady today.` : null,
    goalProgress !== null && goalProgress >= 85 ? "Your goal is close. Today is about protecting the habits that got you here." : null,
    latestRecognition ? "Your trainer noticed your effort recently. Build on that today." : null,
    user?.athlete_mode_enabled && !athleteBodyComposition?.scanCount ? "Your first Body Scan can make your Athlete Mode targets more personal." : null,
    progressPhotoDue ? "A progress photo would help you see change that the scale can miss." : null
  ].filter((item): item is string => Boolean(item));
  const dailyCoachingMessage = (() => {
    if (coachPresence.latest?.message) {
      return {
        label: "Today",
        message: coachPresence.latest.message,
        detail: "A small check-in for your day."
      };
    }
    if (latestRecognition?.message) {
      return {
        label: "Trainer noticed",
        message: latestRecognition.message,
        detail: latestRecognition.trainer_name ? `From ${latestRecognition.trainer_name}` : "Your effort was seen."
      };
    }
    if (recentCelebration) {
      return {
        label: "Nice work",
        message: recentCelebration.secondary,
        detail: "Take the win before chasing the next task."
      };
    }
    if (!todaysFood.length) {
      return {
        label: "Next best move",
        message: "Start with one honest meal log today. It gives you and your coach a clearer picture.",
        detail: "Small records create better decisions."
      };
    }
    if (proteinLeft > 25) {
      return {
        label: "Nutrition nudge",
        message: `You have about ${Math.round(proteinLeft)}g protein left. A protein-rich meal would help today's target.`,
        detail: "Keep it simple and practical."
      };
    }
    if (waterLeftMl > 500) {
      return {
        label: "Hydration nudge",
        message: "One more bottle of water would bring you closer to today's hydration target.",
        detail: "No pressure, just an easy win."
      };
    }
    if (currentStreak >= 3) {
      return {
        label: "Momentum",
        message: `${currentStreak} days of consistency is not luck. Keep the rhythm going today.`,
        detail: "Consistency is doing the quiet work."
      };
    }
    return {
      label: "Today",
      message: "Choose one small check-in today. Food, water, weight, or movement all count.",
      detail: "Ascend works best when it stays simple."
    };
  })();

  function revealTodayProgress() {
    window.setTimeout(() => {
      const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      progressDetailsRef.current?.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start"
      });
    }, 80);
  }

  function setSectionOpen(key: CollapsibleKey, isOpen: boolean) {
    setOpenSections((current) => ({ ...current, [key]: isOpen }));
  }

  return (
    <main className="min-h-screen bg-ink pb-24 text-white">
      <div className="mx-auto min-h-screen w-full max-w-md px-4 pt-4">
        <header className="flex items-center justify-between py-3">
          <a href="/" className="flex items-center gap-2">
            <BrandMark size="sm" />
            <span>
              <span className="block text-lg font-semibold leading-5">Ascend</span>
              <span className="text-xs text-zinc-400">{coachingLabel(coachingMode)}</span>
            </span>
          </a>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <a href="/coach" className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-surface" aria-label="Open coach">
              AI
            </a>
          </div>
        </header>

        {status ? <p className="mt-3 overflow-hidden break-words rounded-lg border border-line bg-surface p-3 text-sm text-zinc-300">{status}</p> : null}

        <AccountBar email={user?.email} fullName={user?.full_name} roles={safeRoles} plan={plan} profilePhotoUrl={user?.profile_photo_url} />

        {shouldShowProfileReminder ? (
          <a href="/onboarding?profile=1" className="mt-3 block rounded-2xl border border-calm/50 bg-calm/10 p-5 shadow-soft">
            <p className="text-sm font-semibold text-calm">Complete your profile</p>
            <h2 className="mt-2 text-xl font-semibold">Unlock smarter coaching.</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              Add a few details when you&apos;re ready so Ascend can personalise calories, targets, and progress insights.
            </p>
            <span className="mt-4 inline-flex h-10 items-center rounded-lg bg-calm px-4 text-sm font-semibold text-ink">
              Continue Setup
            </span>
          </a>
        ) : null}

        {goalStatus?.milestone_id && !goalStatus.acknowledged_at ? (
          <section className={`relative mt-3 overflow-hidden rounded-2xl border border-lime bg-lime/15 p-4 text-center ${isCelebratingGoal ? "ascend-goal-celebrating" : ""}`}>
            {isCelebratingGoal ? (
              <div className="pointer-events-none absolute inset-0" aria-hidden="true">
                {Array.from({ length: 16 }, (_, index) => (
                  <span
                    key={index}
                    className="ascend-confetti-piece"
                    style={{
                      left: `${8 + ((index * 23) % 84)}%`,
                      animationDelay: `${(index % 5) * 70}ms`,
                      backgroundColor: index % 3 === 0 ? "#35f2d0" : index % 3 === 1 ? "#8b5cf6" : "#f8b84e"
                    }}
                  />
                ))}
              </div>
            ) : null}
            <p className="text-sm font-semibold uppercase text-lime">Goal achieved</p>
            <h1 className="mt-2 text-3xl font-semibold">You reached {Number(goalStatus.milestone_target_weight_kg).toFixed(1)}kg!</h1>
            <p className="mt-2 text-sm leading-6 text-zinc-200">
              {isCelebratingGoal ? goalCelebrationMessage : "This milestone came from consistent work. Celebrate it, then choose whether to maintain your result or begin a new journey."}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={hasCelebratedGoal}
                onClick={acknowledgeMilestone}
                className="h-11 rounded-lg border border-lime/50 bg-ink font-semibold text-lime disabled:cursor-default disabled:opacity-100"
              >
                {hasCelebratedGoal ? "🎉 Celebrated" : "Celebrate"}
              </button>
              <a href="/profile/guide" className="flex h-11 items-center justify-center rounded-lg bg-lime font-semibold text-ink">
                Choose next goal
              </a>
            </div>
          </section>
        ) : null}

        <AscendHeroPanel
          eyebrow={recentCelebration ? "Nice Work" : "Next Best Move"}
          title={recentCelebration?.title ?? enhancedNextAction.title}
          body={recentCelebration?.detail ?? enhancedNextAction.detail}
          tone="momentum"
          visual={<MomentumHalo value={score} />}
        >
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-zinc-400">{greeting}</p>
            <DelightBadge tone={recentCelebration ? "lime" : "teal"}>{momentumHeadline}</DelightBadge>
          </div>
          {recentCelebration ? <p className="mt-2 text-xs leading-5 text-zinc-400">{recentCelebration.secondary}</p> : null}
          {recentCelebration ? (
            <button
              type="button"
              onClick={revealTodayProgress}
              className="mt-5 flex h-14 w-full items-center justify-center rounded-xl bg-lime text-base font-semibold text-ink shadow-[0_18px_45px_rgba(61,230,209,0.22)]"
            >
              View Today&apos;s Progress
            </button>
          ) : enhancedNextAction.href === "/dashboard" ? (
            <button
              type="button"
              onClick={revealTodayProgress}
              className="mt-5 flex h-14 w-full items-center justify-center rounded-xl bg-lime text-base font-semibold text-ink shadow-[0_18px_45px_rgba(61,230,209,0.22)]"
            >
              {enhancedNextAction.cta}
            </button>
          ) : (
            <a href={enhancedNextAction.href} className="mt-5 flex h-14 items-center justify-center rounded-xl bg-lime text-base font-semibold text-ink shadow-[0_18px_45px_rgba(61,230,209,0.22)]">
              {enhancedNextAction.cta}
            </a>
          )}
        </AscendHeroPanel>

        <section className="mt-4 rounded-2xl border border-lime/40 bg-lime/10 p-5 shadow-soft">
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-sm font-semibold text-lime">Today&apos;s tasks</p>
              <h2 className="mt-1 text-xl font-semibold">{completedTaskCount}/{taskItems.length} completed</h2>
              <p className="mt-1 text-xs text-zinc-500">{formatGoal(user?.goal_type)}</p>
              <p className="mt-2 text-sm leading-6 text-zinc-300">Tick off the basics. Each small action makes the day easier to trust.</p>
              {dailyMission?.trainer_name ? <p className="mt-2 text-xs text-zinc-500">From {dailyMission.trainer_name}</p> : null}
            </div>
            <span className="rounded-full bg-ink px-3 py-1 text-xs font-semibold text-zinc-300">
              Checklist
            </span>
          </div>
          {dailyMission ? (
            <div className="mt-4 rounded-xl border border-calm/30 bg-calm/10 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-calm">Trainer mission</p>
                  <p className="mt-1 text-sm leading-6 text-zinc-200">{dailyMission.title}</p>
                </div>
                <span className={`rounded px-2 py-1 text-xs font-semibold ${dailyMission.status === "completed" ? "bg-lime text-ink" : "bg-ink text-zinc-300"}`}>
                  {dailyMission.status === "completed" ? "Done" : "Open"}
                </span>
              </div>
            </div>
          ) : null}
          {dailyMission && dailyMission.status !== "completed" ? (
            <button
              type="button"
              disabled={isCompletingMission}
              onClick={markMissionDone}
              className="mt-4 h-12 w-full rounded-xl bg-lime font-semibold text-ink disabled:cursor-wait disabled:opacity-60"
            >
              {isCompletingMission ? "Saving..." : "Mark mission done"}
            </button>
          ) : null}
          {missionStatus ? <p className="mt-3 text-sm text-zinc-300">{missionStatus}</p> : null}
          <div className="mt-4 space-y-2">
            {taskItems.map((item) => (
              <a key={item.label} href={item.href} className="flex items-center justify-between rounded-xl border border-line bg-ink px-3 py-3">
                <span className="text-sm font-semibold text-white">{item.label}</span>
                <span className={`grid h-7 min-w-7 place-items-center rounded-full px-2 text-xs font-semibold ${item.done ? "bg-lime text-ink" : "border border-line text-zinc-400"}`}>
                  {item.done ? "Done" : "Open"}
                </span>
              </a>
            ))}
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-line bg-surface p-5 shadow-soft">
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-sm font-semibold">Today&apos;s progress</p>
              <p className="mt-1 text-sm text-zinc-400">Daily completion at a glance.</p>
            </div>
            <span className="w-fit rounded-full bg-ink px-3 py-2 text-sm font-semibold leading-tight text-lime">{dailyCompletion}%</span>
          </div>
          <div className="mt-4"><DelightProgressBar value={dailyCompletion} /></div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {todayProgressItems.map((item) => (
              <div key={item.label} className="rounded-xl bg-ink p-3">
                <p className="text-xs text-zinc-400">{item.label}</p>
                <p className="mt-1 text-lg font-semibold">{item.value}</p>
                <p className="mt-1 text-[11px] text-zinc-500">{item.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section ref={progressDetailsRef} className="mt-4 rounded-2xl border border-line bg-surface p-5 shadow-soft">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-calm">Quick Snapshot</p>
              <p className="mt-1 text-sm text-zinc-400">The numbers that matter today.</p>
            </div>
            <a href="/momentum-score" className="rounded-full bg-ink px-3 py-2 text-xs font-semibold text-lime">
              How is this calculated?
            </a>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {quickSnapshotItems.map((item) => (
              <div key={item.label} className="rounded-xl bg-ink p-3">
                <p className="text-xs text-zinc-400">{item.label}</p>
                <p className="mt-1 text-lg font-semibold">{item.value}</p>
                <p className="mt-1 text-[11px] leading-4 text-zinc-500">{item.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-calm/30 bg-surface p-4 shadow-soft">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-calm">{dailyCoachingMessage.label}</p>
              <p className="mt-2 text-sm leading-6 text-zinc-200">{dailyCoachingMessage.message}</p>
              <p className="mt-1 text-xs text-zinc-500">{dailyCoachingMessage.detail}</p>
            </div>
            {coachPresence.latest ? (
              <button
                type="button"
                onClick={() => dismissPresence(coachPresence.latest!.id)}
                className="rounded-lg border border-line bg-ink px-3 py-2 text-xs font-semibold text-zinc-300"
              >
                Done
              </button>
            ) : null}
          </div>
        </section>

        {whyTodayMatters.length ? (
          <section className="mt-4 rounded-2xl border border-purple-400/40 bg-purple-400/10 p-4 shadow-soft">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-purple-300">Why today matters</p>
            <div className="mt-3 space-y-2">
              {whyTodayMatters.slice(0, 2).map((item) => (
                <p key={item} className="rounded-xl bg-ink p-3 text-sm leading-6 text-zinc-200">{item}</p>
              ))}
            </div>
          </section>
        ) : null}

        <CollapsibleSection
          title="Nutrition"
          preview={nutritionPreview}
          isOpen={openSections.nutrition}
          onToggle={() => setSectionOpen("nutrition", !openSections.nutrition)}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Today&apos;s nutrition guide</h2>
              <p className={`mt-1 text-xs font-bold uppercase tracking-[0.16em] ${nutritionSourceTone}`}>{nutritionSourceLabel}</p>
              <p className="mt-1 text-sm leading-6 text-zinc-400">
                {hasCoachNutritionPlan
                  ? "Your trainer customised these targets for your current phase."
                  : `${nutritionTargets.explanation} ${nutritionTargets.adaptationReason ?? (nutritionTargets.estimated ? "Complete your profile later for a sharper estimate." : "Use this as direction, not a strict rule.")}`}
              </p>
            </div>
            <span className="rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-lime">{calorieTarget.toLocaleString()} kcal</span>
          </div>
          {coachNutritionPlan?.coach_note ? (
            <div className="mt-4 rounded-lg border border-calm/30 bg-calm/10 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-calm">Coach note</p>
              <p className="mt-2 text-sm leading-6 text-zinc-200">{coachNutritionPlan.coach_note}</p>
            </div>
          ) : null}
          <div className="mt-4 space-y-4">
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-300">Calories</span>
                <span className="font-semibold">{calories.toLocaleString()} / {calorieTarget.toLocaleString()} kcal</span>
              </div>
              <div className="mt-2"><DelightProgressBar value={calorieProgress} /></div>
            </div>
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-300">Protein</span>
                <span className="font-semibold">{protein} / {proteinTarget}g</span>
              </div>
              <div className="mt-2"><DelightProgressBar value={proteinProgress} /></div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {[
              ["Carbs", `${carbs}g`, `${carbsTarget}g guide`],
              ["Fat", `${fat}g`, `${fatTarget}g guide`],
              ["Water", `${(todaysWaterMl / 1000).toFixed(1)}L`, `${(nutritionTargets.waterTargetMl / 1000).toFixed(1)}L guide`],
              ["Activity", `${todaysBurnCalories} kcal`, todaysBurnCalories ? "Movement logged" : "Add movement"]
            ].map(([label, value, detail]) => (
              <div key={label} className="rounded-lg bg-ink p-4">
                <p className="text-xs uppercase text-zinc-400">{label}</p>
                <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
                <p className="mt-1 text-sm text-zinc-400">{detail}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-ink p-3">
              <p className="text-xs text-zinc-400">Food days</p>
              <p className="mt-1 text-lg font-semibold">{foodConsistency}/7</p>
            </div>
            <div className="rounded-lg bg-ink p-3">
              <p className="text-xs text-zinc-400">Protein days</p>
              <p className="mt-1 text-lg font-semibold">{proteinConsistency}/7</p>
            </div>
          </div>
          <a href="/profile/guide" className="mt-4 flex h-11 items-center justify-center rounded-lg border border-line bg-ink text-sm font-semibold text-lime">
            Review goal and daily guide
          </a>
        </CollapsibleSection>

        <CollapsibleSection
          title="Weight History"
          preview={weightPreview}
          isOpen={openSections.weightHistory}
          onToggle={() => setSectionOpen("weightHistory", !openSections.weightHistory)}
        >
          <div className="rounded-lg border border-line bg-ink p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Weekly goal progress</p>
                <p className="mt-1 text-sm leading-6 text-zinc-400">
                  {goalProgress === null ? "Add weight logs to see progress toward your goal." : `${goalProgress}% ${progressCopy(user?.goal_type)}.`}
                </p>
              </div>
              <span className="rounded-lg bg-surface px-3 py-2 text-sm font-semibold text-lime">{goalProgress === null ? "--" : `${goalProgress}%`}</span>
            </div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-surface">
              <div className="h-full rounded-full bg-lime" style={{ width: `${goalProgress ?? 8}%` }} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-surface p-3">
                <p className="text-xs text-zinc-400">Current weight</p>
                <p className="mt-1 text-lg font-semibold">{currentWeight ? `${currentWeight.toFixed(1)}kg` : "--"}</p>
              </div>
              <div className="rounded-lg bg-surface p-3">
                <p className="text-xs text-zinc-400">To goal</p>
                <p className="mt-1 text-lg font-semibold">{remainingWeight === null ? "--" : `${remainingWeight.toFixed(1)}kg`}</p>
              </div>
            </div>
          </div>
          {progressComparison ? <div className="mt-4"><ProgressComparisonCard comparison={progressComparison} /></div> : null}
          <div className="mt-4 space-y-2">
            {weightLogs.slice(0, 5).map((log) => (
              <div key={log.id} className="flex items-center justify-between rounded-lg bg-ink p-3">
                <span className="text-sm text-zinc-400">{formatShortDate(log.logged_at)}</span>
                <span className="font-semibold">{asNumber(log.weight_kg).toFixed(1)}kg</span>
              </div>
            ))}
            {!weightLogs.length ? <a href="/weight-log" className="block rounded-lg bg-ink p-3 text-sm text-zinc-400">Record your first weight check-in.</a> : null}
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Water History"
          preview={waterPreview}
          isOpen={openSections.waterHistory}
          onToggle={() => setSectionOpen("waterHistory", !openSections.waterHistory)}
        >
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-ink p-3">
              <p className="text-xs text-zinc-400">Today</p>
              <p className="mt-1 text-lg font-semibold">{(todaysWaterMl / 1000).toFixed(1)}L</p>
            </div>
            <div className="rounded-lg bg-ink p-3">
              <p className="text-xs text-zinc-400">This week</p>
              <p className="mt-1 text-lg font-semibold">{weeklyWaterDays.size}/7 days</p>
            </div>
          </div>
          <a href="/water-log" className="mt-3 flex h-11 items-center justify-center rounded-lg bg-lime font-semibold text-ink">
            Log water
          </a>
        </CollapsibleSection>

        <CollapsibleSection
          title="Workout History"
          preview={workoutPreview}
          isOpen={openSections.workoutHistory}
          onToggle={() => setSectionOpen("workoutHistory", !openSections.workoutHistory)}
        >
          <div className="space-y-2">
            {burnLogs.slice(0, 5).map((log) => (
              <div key={log.id} className="flex items-center justify-between rounded-lg bg-ink p-3">
                <span className="text-sm text-zinc-400">{formatShortDate(log.created_at)}</span>
                <span className="font-semibold">{Number(log.metadata?.caloriesBurned ?? 0).toLocaleString()} kcal</span>
              </div>
            ))}
            {!burnLogs.length ? <p className="rounded-lg bg-ink p-3 text-sm text-zinc-400">Your first activity log will make your progress picture clearer.</p> : null}
          </div>
          <a href="/burn-log" className="mt-3 flex h-11 items-center justify-center rounded-lg bg-lime font-semibold text-ink">
            Log activity
          </a>
        </CollapsibleSection>

        <CollapsibleSection
          title="Weekly Reflection"
          preview={weeklyReportPreview}
          isOpen={openSections.weeklyReport}
          onToggle={() => setSectionOpen("weeklyReport", !openSections.weeklyReport)}
        >
          <p className="text-sm leading-6 text-zinc-300">A calm look at what improved this week and the one focus worth carrying into the next.</p>
          <a href="/reports" className="mt-3 flex h-11 items-center justify-center rounded-lg bg-lime font-semibold text-ink">
            Open weekly reflection
          </a>
        </CollapsibleSection>

        {hasPremiumAccess ? (
          <CollapsibleSection
            title="Ascend Memory"
            preview={memoryPreview}
            isOpen={openSections.memory}
            onToggle={() => setSectionOpen("memory", !openSections.memory)}
          >
            <AscendMemoryCard memory={ascendMemory} />
          </CollapsibleSection>
        ) : null}

        <CollapsibleSection
          title="Progress Photos"
          preview={photoPreview}
          isOpen={openSections.progressPhotos}
          onToggle={() => setSectionOpen("progressPhotos", !openSections.progressPhotos)}
        >
          {latestProgressPhoto?.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={latestProgressPhoto.image_url} alt="Latest progress" className="aspect-[4/5] w-full rounded-xl object-cover" />
          ) : (
            <p className="rounded-lg bg-ink p-3 text-sm text-zinc-400">Take a progress photo when you are ready. Future you will appreciate the comparison.</p>
          )}
          <a href="/progress" className="mt-3 flex h-11 items-center justify-center rounded-lg bg-lime font-semibold text-ink">
            Open progress photos
          </a>
        </CollapsibleSection>

        <CollapsibleSection
          title="Habits"
          preview={habitsPreview}
          isOpen={openSections.habits}
          onToggle={() => setSectionOpen("habits", !openSections.habits)}
        >
          <div className="space-y-2">
            {dashboardHabits.length ? (
              dashboardHabits.map((habit) => {
                const completed = completedHabitIds.has(habit.id);
                return (
                  <a key={habit.id} href="/habits" className="flex items-center justify-between rounded-lg bg-ink px-3 py-3">
                    <span className="text-sm">{habit.name}</span>
                    <span className={`grid h-7 min-w-7 place-items-center rounded px-2 text-xs font-semibold ${completed ? "bg-lime text-ink" : "border border-line text-zinc-400"}`}>
                      {completed ? "Done" : "Open"}
                    </span>
                  </a>
                );
              })
            ) : (
              <a href="/habits" className="block rounded-lg bg-ink px-3 py-3 text-sm text-zinc-400">Create one small habit you can repeat tomorrow.</a>
            )}
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Food Log History"
          preview={foodHistoryPreview}
          isOpen={openSections.foodHistory}
          onToggle={() => setSectionOpen("foodHistory", !openSections.foodHistory)}
        >
          <div className="flex gap-3 overflow-x-auto pb-1">
            {latestMealsPreview.length ? (
              latestMealsPreview.map((log) => (
                <a key={log.id} href="/food-log?view=history" className="w-44 shrink-0 rounded-lg bg-ink p-3">
                  <div className="grid aspect-square place-items-center overflow-hidden rounded-lg bg-surface">
                    {log.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={log.image_url} alt={log.estimated_food_name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xs text-zinc-500">No photo</span>
                    )}
                  </div>
                  <p className="mt-3 truncate text-sm font-semibold">{log.estimated_food_name}</p>
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs text-zinc-400">
                    <span>{Number(log.calories).toLocaleString()} kcal</span>
                    <span>{formatMealTime(log.logged_at)}</span>
                  </div>
                </a>
              ))
            ) : (
              <a href="/food-log" className="block w-full rounded-lg bg-ink p-4 text-sm leading-6 text-zinc-400">Your first meal log starts the pattern. Snap a photo when you eat next.</a>
            )}
          </div>
          <a href="/food-log?view=history" className="mt-3 flex h-11 items-center justify-center rounded-lg border border-line bg-ink font-semibold text-lime">
            View all meals
          </a>
        </CollapsibleSection>

        <CollapsibleSection
          title="Coach Messages"
          preview={coachMessagePreview}
          isOpen={openSections.coachMessages}
          onToggle={() => setSectionOpen("coachMessages", !openSections.coachMessages)}
        >
          <p className="text-sm leading-6 text-zinc-300">
            {user?.assigned_trainer_name
              ? `Your trainer is ${user.assigned_trainer_name}. Use messages when you need help between sessions.`
              : coachingMode === "human_coach"
                ? "Your account is ready for trainer accountability. Ask your gym owner to assign a trainer."
                : "You can connect with a trainer later if you want human support."}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {premiumActions.map((item) => (
              <a key={item.title} href={item.href} className="rounded-lg border border-line bg-ink p-3">
                <span className="block text-sm font-semibold text-white">{item.title}</span>
                <span className="mt-1 block text-xs text-zinc-400">{item.detail}</span>
              </a>
            ))}
          </div>
          {!hasPremiumAccess ? (
            <a href="/subscription" className="mt-3 flex h-11 items-center justify-center rounded-lg bg-lime font-semibold text-ink">
              Unlock trainer support
            </a>
          ) : null}
        </CollapsibleSection>

        {user?.athlete_mode_enabled ? (
          <CollapsibleSection
            title="Body Scan History"
            preview={bodyScanPreview}
            isOpen={openSections.bodyScanHistory}
            onToggle={() => setSectionOpen("bodyScanHistory", !openSections.bodyScanHistory)}
          >
            <p className="text-sm leading-6 text-zinc-300">Open Athlete Mode to review Body Scan trends, Ascend DNA, readiness, and event preparation.</p>
            <a href="/athlete" className="mt-3 flex h-11 items-center justify-center rounded-lg bg-purple-400 font-semibold text-ink">
              Open Athlete Mode
            </a>
          </CollapsibleSection>
        ) : null}

        <CollapsibleSection
          title="Settings"
          preview={needsGuideProfile ? "Complete profile for smarter targets" : `${coachingLabel(coachingMode)} / ${plan ?? "checking plan"}`}
          isOpen={openSections.settings}
          onToggle={() => setSectionOpen("settings", !openSections.settings)}
        >
          {needsGuideProfile ? (
            <div className="mb-3 rounded-lg border border-calm/40 bg-calm/10 p-3">
              <p className="text-sm font-semibold text-calm">Make your daily guide more accurate</p>
              <p className="mt-2 text-sm leading-6 text-zinc-300">Add age, height, and activity level so Ascend can personalize your daily targets.</p>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <a href="/profile" className="rounded-lg border border-line bg-ink p-3 text-sm font-semibold text-white">Profile</a>
            <a href="/profile/guide" className="rounded-lg border border-line bg-ink p-3 text-sm font-semibold text-white">Daily guide</a>
            <a href="/subscription" className="rounded-lg border border-line bg-ink p-3 text-sm font-semibold text-white">Plan</a>
          </div>
          {hasPremiumAccess ? (
            <div className="mt-4 rounded-lg border border-line bg-ink p-3">
              <p className="text-sm font-semibold text-white">Coaching tone</p>
              <p className="mt-1 text-xs leading-5 text-zinc-500">Choose how Ascend writes small daily nudges.</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {(["motivational", "balanced", "minimal"] as const).map((style) => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => changeCoachPresenceStyle(style)}
                    className={`rounded-full px-3 py-2 text-xs font-semibold capitalize ${
                      coachPresence.settings.style === style ? "bg-calm text-ink" : "border border-line bg-surface text-zinc-300"
                    }`}
                  >
                    {style}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </CollapsibleSection>
      </div>

      <nav className="fixed inset-x-0 bottom-0 border-t border-line bg-ink/95 px-4 pb-3 pt-2 backdrop-blur">
        <div className={`mx-auto grid max-w-md gap-2 ${navItems.length === 1 ? "grid-cols-1" : navItems.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`flex h-14 flex-col items-center justify-center gap-1 rounded-lg text-xs ${
                item.selected ? "bg-lime text-ink" : "text-zinc-400"
              }`}
            >
              {item.label}
            </a>
          ))}
        </div>
      </nav>
    </main>
  );
}

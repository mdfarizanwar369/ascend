"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AscendDNAService, AscendDnaEvent, buildCoachZoeProactiveInsight, calculateAdaptiveNutritionTargets, CoachingMode } from "@ascend/shared";
import { Activity, ArrowRight, BarChart3, Beef, Camera, CheckCircle2, ChevronDown, Droplets, Flame, Scale, Sparkles, Target, Zap } from "lucide-react";
import {
  acknowledgeGoalMilestone,
  completeMission,
  getAscendMemory,
  getBurnLogs,
  getCoachPresence,
  getComplianceToday,
  getHabitLogs,
  getHabits,
  getAthleteDashboard,
  getFoodLogs,
  getHealthSyncStatus,
  getLatestRecognition,
  getMe,
  getMyNutritionPlan,
  getMyProgressComparison,
  getGoalStatus,
  getMyStreak,
  getProgressPhotos,
  getTodayMission,
  getWaterLogs,
  getWeightLogs,
  AthleteDashboard,
  AscendMemoryResponse,
  CoachPresenceSettings,
  CoachPresenceMessage
} from "@/lib/ascendApi";
import { AccountBar } from "@/components/AccountBar";
import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { localDateKey } from "@/lib/date";
import { clearDashboardRecord, DASHBOARD_RECORD_EVENT, DashboardActionType, readDashboardRecord, readRecentDashboardAction } from "@/lib/dataSync";
import { ProgressComparisonCard } from "@/components/ProgressComparisonCard";
import { AscendMemoryCard } from "@/components/memory/AscendMemoryCard";
import { DelightBadge, DelightProgressBar } from "@/components/Delight";
import { AscendHeroPanel, MomentumHalo } from "@/components/AscendVisualIdentity";
import { cacheAccountProfile, getCachedAccountProfile, loadAccountPlan } from "@/lib/accountSession";
import { AccountBarSkeleton, DashboardHeroSkeleton, SectionShell, SkeletonBlock, SkeletonCardList, SkeletonStatGrid, SkeletonText } from "@/components/PerceivedLoading";
import { isConsumerTodayV2Enabled } from "@/lib/consumerTodayVersion";

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
type HealthSyncStatus = Awaited<ReturnType<typeof getHealthSyncStatus>>["status"];
type CollapsibleKey =
  | "track"
  | "journey"
  | "habitsGoals";

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

function HeroMomentumStat({ score, label }: { score: number; label: string }) {
  return (
    <div className="min-w-[5.5rem] rounded-2xl border border-white/10 bg-ink/75 px-3 py-3 text-left shadow-[0_14px_36px_rgba(8,12,20,0.28)]">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Momentum</p>
      <p className="mt-2 text-2xl font-semibold text-white">{score}</p>
      <p className="mt-1 text-xs text-calm">{label}</p>
    </div>
  );
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

function recentDateKeys(days: number) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - index);
    return localDateKey(date.toISOString());
  });
}

function summarizeRecentFoodDays(logs: FoodLog[], days = 3) {
  const keys = new Set(recentDateKeys(days));
  const stats = new Map<string, { calories: number; protein: number; count: number }>();

  for (const log of logs) {
    const key = localDateKey(log.logged_at);
    if (!keys.has(key)) continue;
    const current = stats.get(key) ?? { calories: 0, protein: 0, count: 0 };
    current.calories += asNumber(log.calories);
    current.protein += asNumber(log.protein_g);
    current.count += 1;
    stats.set(key, current);
  }

  return recentDateKeys(days).map((key) => ({
    key,
    calories: stats.get(key)?.calories ?? 0,
    protein: stats.get(key)?.protein ?? 0,
    count: stats.get(key)?.count ?? 0
  }));
}

function snapshotIcon(label: string) {
  if (label === "Calories") return Flame;
  if (label === "Protein") return Beef;
  if (label === "Water") return Droplets;
  if (label === "Weight") return Scale;
  return Zap;
}

function sectionAccent(tone: "teal" | "purple" | "lime") {
  if (tone === "purple") {
    return {
      shell: "border-purple-400/25 bg-[linear-gradient(180deg,rgba(139,92,246,0.08),rgba(18,23,33,0.98))]",
      icon: "border-purple-400/20 bg-purple-400/10 text-purple-200",
      title: "text-purple-100",
      preview: "text-zinc-400"
    };
  }
  if (tone === "lime") {
    return {
      shell: "border-lime/25 bg-[linear-gradient(180deg,rgba(163,255,70,0.06),rgba(18,23,33,0.98))]",
      icon: "border-lime/20 bg-lime/10 text-lime",
      title: "text-lime-50",
      preview: "text-zinc-400"
    };
  }
  return {
    shell: "border-calm/25 bg-[linear-gradient(180deg,rgba(61,230,209,0.07),rgba(18,23,33,0.98))]",
    icon: "border-calm/20 bg-calm/10 text-calm",
    title: "text-white",
    preview: "text-zinc-400"
  };
}

function CollapsibleSection({
  title,
  icon,
  tone = "teal",
  preview,
  children,
  isOpen,
  onToggle
}: {
  title: string;
  icon?: ReactNode;
  tone?: "teal" | "purple" | "lime";
  preview: string;
  children: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const accent = sectionAccent(tone);
  return (
    <section className={`mt-4 rounded-2xl border shadow-soft ${accent.shell}`}>
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {icon ? (
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl border ${accent.icon}`}>
                {icon}
              </span>
            ) : null}
            <h2 className={`text-base font-semibold ${accent.title}`}>{title}</h2>
          </div>
          <p className={`mt-1 truncate text-sm ${accent.preview}`}>{preview}</p>
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
  const [healthSyncStatus, setHealthSyncStatus] = useState<HealthSyncStatus | null>(null);
  const [athleteDashboard, setAthleteDashboard] = useState<AthleteDashboard | null>(null);
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
  const [sectionLoading, setSectionLoading] = useState({ core: true, secondary: true });
  const [missionStatus, setMissionStatus] = useState("");
  const [isCompletingMission, setIsCompletingMission] = useState(false);
  const [recentAction, setRecentAction] = useState<ReturnType<typeof readRecentDashboardAction>>(null);
  const [dashboardSessionCount, setDashboardSessionCount] = useState(1);
  const [isCelebratingGoal, setIsCelebratingGoal] = useState(false);
  const [hasCelebratedGoal, setHasCelebratedGoal] = useState(false);
  const [goalCelebrationMessage, setGoalCelebrationMessage] = useState(goalCelebrationMessages[0]);
  const [openSections, setOpenSections] = useState<Record<CollapsibleKey, boolean>>({
    track: false,
    journey: false,
    habitsGoals: false
  });
  const dashboardRequestRef = useRef(0);
  const dashboardLoadInFlightRef = useRef(false);
  const hasLoadedDashboardRef = useRef(false);
  const missionLockRef = useRef(false);
  const goalCelebrateLockRef = useRef(false);
  const progressDetailsRef = useRef<HTMLDivElement | null>(null);
  const consumerTodayV2 = isConsumerTodayV2Enabled();

  const loadDashboard = useCallback(async () => {
    if (dashboardLoadInFlightRef.current) return;
    dashboardLoadInFlightRef.current = true;
    if (hasLoadedDashboardRef.current) setStatus("Updating today's progress...");
    if (!hasLoadedDashboardRef.current) setSectionLoading({ core: true, secondary: true });
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
      const coreDataRequest = Promise.allSettled([
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
        getGoalStatus()
      ]);
      const secondaryDataRequest = Promise.allSettled([
        getProgressPhotos(),
        getMyNutritionPlan(),
        getCoachPresence(),
        getAscendMemory(),
        getHealthSyncStatus()
      ]);
      const athleteDashboardRequest =
        consumerTodayV2 && me.user.athlete_mode_enabled
          ? getAthleteDashboard().catch(() => null)
          : Promise.resolve(null);

      const plan = await subscriptionRequest;
      if (requestId !== dashboardRequestRef.current) return;
      setPlan(plan);

      const [foods, weights, waters, nextHabits, nextHabitLogs, burns, compliance, mission, recognition, nextStreak, nextGoalStatus] = await coreDataRequest;
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
      if (compliance.status === "fulfilled") {
        const nextCompliance = compliance.value.compliance;
        setMomentumScore(nextCompliance?.score ?? null);
      }
      hasLoadedDashboardRef.current = true;
      setSectionLoading((current) => ({ ...current, core: false }));
      setStatus("");

      void secondaryDataRequest
        .then(([photos, nutritionPlan, presence, memory, healthSync]) => {
          if (requestId !== dashboardRequestRef.current) return;
          if (photos.status === "fulfilled") setProgressPhotos(Array.isArray(photos.value.progressPhotos) ? photos.value.progressPhotos : []);
          if (nutritionPlan.status === "fulfilled") setCoachNutritionPlan(nutritionPlan.value.coachPlan);
          if (presence.status === "fulfilled") setCoachPresence(presence.value);
          if (memory.status === "fulfilled") setAscendMemory(memory.value);
          if (healthSync.status === "fulfilled") setHealthSyncStatus(healthSync.value.status);
          setSectionLoading({ core: false, secondary: false });
        })
        .catch(() => {
          if (requestId === dashboardRequestRef.current) setSectionLoading({ core: false, secondary: false });
        });

      void athleteDashboardRequest.then((response) => {
        if (requestId !== dashboardRequestRef.current) return;
        setAthleteDashboard(response?.athlete ?? null);
      });

      comparisonRequest
        .then((response) => {
          if (requestId === dashboardRequestRef.current) setProgressComparison(response.comparison);
        })
        .catch(() => undefined);
    } catch (error) {
      setSectionLoading({ core: false, secondary: false });
      setStatus(error instanceof Error ? error.message : "Log in again if this page does not load your profile.");
    } finally {
      dashboardLoadInFlightRef.current = false;
    }
  }, [consumerTodayV2]);

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

  useEffect(() => {
    function handleDashboardRecordUpdate() {
      void loadDashboard();
    }

    window.addEventListener(DASHBOARD_RECORD_EVENT, handleDashboardRecordUpdate);
    return () => {
      window.removeEventListener(DASHBOARD_RECORD_EVENT, handleDashboardRecordUpdate);
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
  const dynamicEncouragement = (() => {
    if (goalProgress !== null && goalProgress >= 90) return "Almost there.";
    if (currentStreak >= 7) return "Let's keep the streak alive.";
    if (score >= 80) return "Great consistency lately.";
    if (todaysBurnCalories > 0 && todaysWaterMl >= nutritionTargets.waterTargetMl) return "Fantastic recovery.";
    if (score >= 60) return "You're building momentum.";
    return "One honest check-in can change the feel of the day.";
  })();
  const latestBurnLog = burnLogs[0];
  const latestWorkoutTitle = typeof latestBurnLog?.metadata?.workoutTitle === "string" ? latestBurnLog.metadata.workoutTitle : null;
  const latestWorkoutCompletedToday = Boolean(latestBurnLog && localDateKey(latestBurnLog.created_at) === today);
  const latestWorkoutCompletedYesterday = Boolean(latestBurnLog && localDateKey(latestBurnLog.created_at) === yesterday);
  const enhancedNextAction = (() => {
    if (latestWorkoutCompletedToday && latestWorkoutTitle) {
      return {
        ...nextAction,
        title: "Recover well from today's workout",
        detail: `You already completed ${latestWorkoutTitle} today. Hydration, protein, and a calm recovery rhythm are the smart next moves.`,
        href: proteinLeft > 25 ? "/food-log" : waterLeftMl > 500 ? "/water-log" : "/dashboard",
        cta: proteinLeft > 25 ? "Log Food" : waterLeftMl > 500 ? "Log Water" : "Stay on track"
      };
    }
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
  const recentFoodDayStats = summarizeRecentFoodDays(foodLogs, 3);
  const lowProteinDays3 = recentFoodDayStats.filter((day) => day.count > 0 && day.protein < proteinTarget * 0.6).length;
  const highCaloriesDays3 = recentFoodDayStats.filter((day) => day.count > 0 && day.calories > calorieTarget * 1.1).length;
  const lowCaloriesDays3 = recentFoodDayStats.filter((day) => day.count > 0 && day.calories < calorieTarget * 0.65).length;
  const highlightedTaskKey = recentAction
    ? recentAction.type === "food"
      ? "Food logged"
      : recentAction.type === "water"
        ? "Water completed"
        : recentAction.type === "weight"
          ? "Weight recorded"
          : recentAction.type === "burn"
            ? "Workout completed"
            : "Habit completed"
    : null;
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
  const healthSyncSummary = healthSyncStatus?.summary ?? null;
  const hasSyncedActivity = Boolean(healthSyncSummary?.connected);
  const syncedSteps = healthSyncSummary?.todaySteps ?? 0;
  const syncedWorkoutCompleted = healthSyncSummary?.workoutCompletedToday === true;
  const syncedWorkoutCount = healthSyncSummary?.workoutsThisWeek ?? 0;
  const weightDelta = latestWeight && previousWeight ? asNumber(latestWeight.weight_kg) - asNumber(previousWeight.weight_kg) : null;
  const latestMemoryMilestone = ascendMemory?.timeline?.[0];
  const proactiveCoachInsight = buildCoachZoeProactiveInsight({
    goalType: user?.goal_type ?? null,
    currentStreak,
    momentumScore: score,
    todaysFoodCount: todaysFood.length,
    caloriesToday: calories,
    calorieTarget,
    proteinTodayG: protein,
    proteinTargetG: proteinTarget,
    waterTodayMl: todaysWaterMl,
    waterTargetMl: nutritionTargets.waterTargetMl,
    workoutDays7: weeklyBurnDays.size,
    daysSinceWorkout: latestBurnLog ? Math.max(0, Math.floor((Date.now() - new Date(latestBurnLog.created_at).getTime()) / 86_400_000)) : null,
    lowProteinDays3,
    highCaloriesDays3,
    lowCaloriesDays3,
    weightTrendKg: weightDelta,
    latestWorkout: latestBurnLog
      ? {
          title: latestWorkoutTitle,
          type:
            typeof latestBurnLog.metadata?.workoutType === "string"
              ? latestBurnLog.metadata.workoutType
              : typeof latestBurnLog.metadata?.activityType === "string"
                ? latestBurnLog.metadata.activityType
                : null,
          completedToday: latestWorkoutCompletedToday,
          completedYesterday: latestWorkoutCompletedYesterday
        }
      : null,
    healthSync: healthSyncSummary
      ? {
          connected: healthSyncSummary.connected,
          todaySteps: healthSyncSummary.todaySteps,
          averageSteps7d: healthSyncSummary.averageSteps7d,
          todayActiveCalories: healthSyncSummary.todayActiveCalories,
          workoutsThisWeek: healthSyncSummary.workoutsThisWeek,
          workoutCompletedToday: healthSyncSummary.workoutCompletedToday
        }
      : null,
    recentMilestoneTitle: latestMemoryMilestone?.title ?? null
  });
  const weightPreview = latestWeight
    ? `${asNumber(latestWeight.weight_kg).toFixed(1)}kg${weightDelta !== null ? ` / ${weightDelta > 0 ? "+" : ""}${weightDelta.toFixed(1)}kg` : ""}`
    : "Record your first weight check-in";
  const waterPreview = `${(todaysWaterMl / 1000).toFixed(1)}L today / ${weeklyWaterDays.size}/7 days`;
  const workoutPreview = latestBurnLog
    ? latestBurnLog.metadata?.workoutTitle
      ? `${latestBurnLog.metadata.workoutTitle} / ${Number(latestBurnLog.metadata?.caloriesBurned ?? 0).toLocaleString()} kcal`
      : `${Number(latestBurnLog.metadata?.caloriesBurned ?? 0).toLocaleString()} kcal / ${formatShortDate(latestBurnLog.created_at)}`
    : syncedWorkoutCompleted
      ? `Workout detected automatically / ${syncedWorkoutCount} this week`
    : "Your first activity log is waiting";
  const weeklyReportPreview = hasPremiumAccess ? "Your weekly reflection is ready" : "Premium unlocks weekly reflections";
  const memoryPreview = latestMemoryMilestone ? `Latest milestone: ${latestMemoryMilestone.title}` : "Your first milestone is waiting";
  const photoPreview = progressPhotos.length ? `${progressPhotos.length} photos / latest ${formatShortDate(progressPhotos[0]?.logged_at)}` : "Take your first progress photo";
  const habitsPreview = dashboardHabits.length ? `${completedHabitIds.size}/${habits.length} habits done today` : "Build your first repeatable habit";
  const bodyScanPreview = user?.athlete_mode_enabled
    ? athleteBodyComposition?.scanCount
      ? `Body fat ${athleteBodyComposition.bodyFatPercent ?? "--"}% / ${athleteBodyComposition.scanCount} scans`
      : "Your first Body Scan is waiting"
    : "Athlete Mode only";
  const trackPreview = foodLogs.length || todaysWaterMl > 0 || latestWeight || latestBurnLog
    ? [
        todaysFood.length ? `${todaysFood.length} meal${todaysFood.length === 1 ? "" : "s"}` : null,
        todaysWaterMl > 0 ? `${(todaysWaterMl / 1000).toFixed(1)}L` : null,
        currentWeight ? `${currentWeight.toFixed(1)}kg` : null,
        todaysBurnCalories > 0 ? `${todaysBurnCalories} kcal` : null,
        syncedSteps > 0 ? `${syncedSteps.toLocaleString()} steps` : null
      ].filter((item): item is string => Boolean(item)).join(" • ")
    : "Today's nutrition, hydration, weight and activity";
  const journeyHighlights = [
    progressPhotos.length ? `Photo ${formatShortDate(progressPhotos[0]?.logged_at)}` : null,
    hasPremiumAccess ? "Weekly reflection ready" : null,
    latestMemoryMilestone ? latestMemoryMilestone.title : null,
    user?.athlete_mode_enabled && athleteBodyComposition?.scanCount ? `${athleteBodyComposition.scanCount} body scans` : null
  ].filter((item): item is string => Boolean(item));
  const journeyPreview = journeyHighlights.length ? journeyHighlights.slice(0, 2).join(" • ") : "Photos, reflections, milestones and scans";
  const habitsGoalHighlights = [
    habits.length ? `${completedHabitIds.size}/${habits.length} habits` : null,
    currentStreak > 0 ? `${currentStreak}-day streak` : null,
    goalProgress !== null ? `${goalProgress}% goal progress` : null,
    `${score}/100 momentum`
  ].filter((item): item is string => Boolean(item));
  const habitsGoalsPreview = habitsGoalHighlights.slice(0, 2).join(" • ");
  const dailyCoachingMessage = (() => {
    if (coachPresence.latest?.message && proactiveCoachInsight.key === "steady") {
      return {
        label: "Coach Presence",
        message: coachPresence.latest.message,
        detail: "A small check-in based on your recent rhythm."
      };
    }
    if (latestRecognition?.message && proactiveCoachInsight.key === "steady") {
      return {
        label: "Trainer noticed",
        message: latestRecognition.message,
        detail: latestRecognition.trainer_name ? `From ${latestRecognition.trainer_name}` : "Your effort was seen."
      };
    }
    if (recentCelebration && proactiveCoachInsight.key === "steady") {
      return {
        label: "Nice work",
        message: recentCelebration.secondary,
        detail: "Take the win before chasing the next task."
      };
    }
    return {
      label: proactiveCoachInsight.title,
      message: proactiveCoachInsight.body,
      detail:
        proactiveCoachInsight.key === "steady"
          ? "Small steady actions still count today."
          : "Coach Zoe noticed something worth your attention."
    };
  })();
  const firstName = user?.full_name?.trim().split(/\s+/)[0] ?? "there";
  const primaryAction = (() => {
    if (!todaysFood.length || proteinLeft > 25) return { label: "Log Meal", href: "/food-log" };
    if (todaysWaterMl < nutritionTargets.waterTargetMl) return { label: "Log Water", href: "/water-log" };
    if (!latestWorkoutCompletedToday && !syncedWorkoutCompleted) return { label: "Start Workout", href: "/coach" };
    if (!latestWeightLoggedToday) return { label: "Log Weight", href: "/weight-log" };
    if (completedHabitIds.size === 0) return { label: "Open Habits", href: "/habits" };
    return { label: "View Progress", href: "/progress" };
  })();
  const isFirstDayState =
    !foodLogs.length &&
    !weightLogs.length &&
    !waterLogs.length &&
    !burnLogs.length &&
    !habits.length &&
    !habitLogs.length &&
    !progressPhotos.length &&
    currentStreak === 0;
  const heroSupportingCopy = (() => {
    if (isFirstDayState) return "Start with one simple check-in. That is enough for today.";
    if (recentCelebration?.secondary) return recentCelebration.secondary;
    if (currentStreak >= 7) return "You're already moving better than last week.";
    if (score >= 70) return "Your recent consistency is starting to compound.";
    return dynamicEncouragement;
  })();
  const coachedFocusMessage = (() => {
    if (dailyMission?.title) {
      return {
        message: dailyMission.title,
        detail: dailyMission.trainer_name ? `Shared by ${dailyMission.trainer_name}.` : "Your trainer is keeping today's focus simple."
      };
    }
    if (latestRecognition?.message) {
      return {
        message: latestRecognition.message,
        detail: latestRecognition.trainer_name ? `From ${latestRecognition.trainer_name}.` : "A note from your coach."
      };
    }
    if (coachPresence.latest?.message) {
      return {
        message: coachPresence.latest.message,
        detail: "Support between sessions, shaped by your recent activity."
      };
    }
    return {
      message: "Your coach wants today's basics to feel easy to complete.",
      detail: "Open your messages when you're ready for the latest note."
    };
  })();
  const athleteTrainingFocus = (() => {
    if (!athleteDashboard) return "Open Athlete Mode to review today's readiness and targets.";
    const todayTarget = athleteDashboard.targets.find((target) => target.cadence === "daily" && target.notes);
    if (todayTarget?.notes) return todayTarget.notes;
    if (athleteDashboard.latestReview?.summary) return athleteDashboard.latestReview.summary;
    if (athleteDashboard.readinessTrend.warningPatterns[0]) return athleteDashboard.readinessTrend.warningPatterns[0];
    return "Use today's check-in to guide training intensity.";
  })();
  const dailyStatus = (() => {
    if (isFirstDayState) {
      return {
        title: "A calm first day",
        detail: "Nothing is behind. One check-in is enough to get started.",
        tone: "teal" as const
      };
    }
    if (dailyCompletion >= 80) {
      return {
        title: "You're doing well today",
        detail: currentStreak >= 3 ? `This is already better than ${currentStreak} days ago.` : "Protect the rhythm you already built.",
        tone: "lime" as const
      };
    }
    if (dailyCompletion >= 40) {
      return {
        title: "One or two actions will steady today",
        detail: proteinLeft > 25 ? "Protein is the clearest win right now." : waterLeftMl > 500 ? "Hydration is the easiest win right now." : "A small check-in will change the feel of the day.",
        tone: "teal" as const
      };
    }
    return {
      title: "Today is still easy to turn around",
      detail: latestWorkoutCompletedYesterday ? "Yesterday counts. Today just needs one honest follow-through." : "Start with the easiest check-in and let momentum return.",
      tone: "purple" as const
    };
  })();
  const progressPreview = (() => {
    if (weightLostFromStart >= 0.1) {
      return {
        title: "You're lighter than when you started.",
        detail: `${weightLostFromStart.toFixed(1)}kg down. Every small decision is adding up.`
      };
    }
    if (goalCompletedToday) {
      return {
        title: "You hit your goal today.",
        detail: "Take the win in. This came from repetition, not luck."
      };
    }
    if (currentStreak >= 7) {
      return {
        title: "This is one of your best recent stretches.",
        detail: `${currentStreak} steady days. The routine is starting to feel more natural.`
      };
    }
    if (currentStreak >= 2) {
      return {
        title: "Consistency is starting to show up.",
        detail: `${currentStreak} steady days in a row. Keep the chain feeling easy.`
      };
    }
    if (latestMemoryMilestone?.title) {
      return {
        title: latestMemoryMilestone.title,
        detail: "Your recent progress is starting to feel like a real story."
      };
    }
    if (goalProgress !== null) {
      return {
        title: "You're moving closer to your goal.",
        detail: `${goalProgress}% there. Small check-ins are still doing the heavy lifting.`
      };
    }
    return {
      title: "Today can be the start of your story.",
      detail: "One honest check-in is enough to begin building momentum."
    };
  })();
  const athleteTodaySummary = (() => {
    if (!user?.athlete_mode_enabled) return null;
    if (!athleteDashboard) {
      return "Open Athlete Mode for today's readiness and event countdown.";
    }
    const parts = [
      athleteDashboard.readiness.status,
      athleteDashboard.countdown ? `${athleteDashboard.countdown.days} days out` : null,
      athleteTrainingFocus
    ].filter((item): item is string => Boolean(item));
    return parts.slice(0, 2).join(" · ");
  })();
  const coachCardTitle = user?.assigned_trainer_id
    ? dailyMission?.trainer_name ?? latestRecognition?.trainer_name ?? "Your coach"
    : "Coach Zoe";
  const coachCardMessage = user?.assigned_trainer_id ? coachedFocusMessage.message : dailyCoachingMessage.message;
  const coachCardDetail = user?.assigned_trainer_id ? coachedFocusMessage.detail : dailyCoachingMessage.detail;
  const coachCardSnippet = coachCardMessage.length > 88 ? `${coachCardMessage.slice(0, 85).trimEnd()}...` : coachCardMessage;
  const storyToneClass =
    goalCompletedToday || weightLostFromStart >= 0.1
      ? "border-amber/25 bg-[linear-gradient(180deg,rgba(248,184,78,0.09),rgba(18,23,33,0.96))]"
      : "border-line bg-surface";
  const coachToneClass = user?.assigned_trainer_id
    ? "border-calm/25 bg-[linear-gradient(180deg,rgba(72,187,255,0.07),rgba(18,23,33,0.96))]"
    : "border-purple-400/20 bg-[linear-gradient(180deg,rgba(139,92,246,0.08),rgba(18,23,33,0.96))]";
  const todayTiles = [
    {
      label: "Meal",
      href: "/food-log",
      icon: Beef,
      value: todaysFood.length > 0 ? "Logged" : "Not yet",
      detail: todaysFood.length > 0 ? `${todaysFood.length} ${todaysFood.length === 1 ? "meal" : "meals"} today` : "Tap to log what you ate",
      done: todaysFood.length > 0,
      tone: todaysFood.length > 0 ? "lime" : proteinLeft > 25 ? "amber" : "teal"
    },
    {
      label: "Water",
      href: "/water-log",
      icon: Droplets,
      value: todaysWaterMl >= nutritionTargets.waterTargetMl ? "Done" : `${(todaysWaterMl / 1000).toFixed(1)}L`,
      detail: todaysWaterMl >= nutritionTargets.waterTargetMl ? "Hydration goal reached" : `${Math.max(0, Number(((nutritionTargets.waterTargetMl - todaysWaterMl) / 1000).toFixed(1)))}L to go`,
      done: todaysWaterMl >= nutritionTargets.waterTargetMl,
      tone: todaysWaterMl >= nutritionTargets.waterTargetMl ? "lime" : "teal"
    },
    {
      label: "Movement",
      href: "/coach",
      icon: Activity,
      value: latestWorkoutCompletedToday || syncedWorkoutCompleted ? "Done" : syncedSteps > 0 ? `${Math.round(syncedSteps / 1000)}k steps` : "Open",
      detail: latestWorkoutCompletedToday || syncedWorkoutCompleted ? (latestWorkoutTitle ?? "Workout completed today") : syncedSteps > 0 ? "Detected automatically" : "Tap to start or log a workout",
      done: latestWorkoutCompletedToday || syncedWorkoutCompleted || todaysBurnCalories > 0,
      tone: latestWorkoutCompletedToday || syncedWorkoutCompleted || todaysBurnCalories > 0 ? "lime" : latestWorkoutCompletedYesterday ? "blue" : "teal"
    },
    {
      label: "Weight",
      href: "/weight-log",
      icon: Scale,
      value: latestWeightLoggedToday && currentWeight ? `${currentWeight.toFixed(1)}kg` : "Not yet",
      detail: latestWeightLoggedToday ? "Today's check-in saved" : "Tap to record your weight",
      done: latestWeightLoggedToday,
      tone: latestWeightLoggedToday ? "lime" : "teal"
    },
    {
      label: "Habit",
      href: "/habits",
      icon: Target,
      value: completedHabitIds.size > 0 ? `${completedHabitIds.size} done` : habits.length ? "Open" : "Create",
      detail: habits.length ? (completedHabitIds.size > 0 ? "Small promises kept today" : "Tap to complete one habit") : "Start with one repeatable habit",
      done: completedHabitIds.size > 0,
      tone: completedHabitIds.size > 0 ? "lime" : "purple"
    }
  ] as const;

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

  const showDashboardSkeleton =
    sectionLoading.core &&
    !user &&
    !foodLogs.length &&
    !weightLogs.length &&
    !waterLogs.length &&
    !burnLogs.length &&
    !habits.length;

  if (showDashboardSkeleton) {
    return (
      <main className="min-h-screen bg-ink pb-24 text-white">
        <div className="mx-auto min-h-screen w-full max-w-md px-4 pt-4">
          <header className="flex items-center justify-between py-3">
            <a href="/" className="flex items-center gap-2">
              <BrandMark size="sm" />
              <span>
                <span className="block text-lg font-semibold leading-5">Ascend</span>
                <span className="text-xs text-zinc-400">Loading your dashboard</span>
              </span>
            </a>
            <div className="flex items-center gap-2">
              <SkeletonBlock className="h-10 w-10 rounded-lg" />
              <SkeletonBlock className="h-10 w-10 rounded-lg" />
            </div>
          </header>

          <AccountBarSkeleton />
          <DashboardHeroSkeleton bodyLines={2} footer={<SkeletonBlock className="h-10 w-40 rounded-lg" />} />
          <SectionShell title="Today's tasks">
            <SkeletonText lines={2} />
            <div className="mt-3">
              <SkeletonBlock className="h-4 w-full rounded-full" />
            </div>
            <div className="mt-4 space-y-2">
              <SkeletonBlock className="h-16 w-full" />
              <SkeletonBlock className="h-16 w-full" />
              <SkeletonBlock className="h-16 w-full" />
            </div>
          </SectionShell>
          <SectionShell title="Quick Snapshot">
            <SkeletonStatGrid count={4} />
          </SectionShell>
          <SectionShell title="Your journey today">
            <SkeletonCardList count={2} compact />
          </SectionShell>
          <p className="mt-4 rounded-lg border border-line bg-surface p-3 text-sm text-zinc-300">{status}</p>
        </div>
      </main>
    );
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
          eyebrow={consumerTodayV2 ? "Today's focus" : recentCelebration ? "Nice Work" : "Next Best Move"}
          title={consumerTodayV2 ? `${greeting}, ${firstName}.` : recentCelebration?.title ?? enhancedNextAction.title}
          body={consumerTodayV2 ? (recentCelebration?.title ?? enhancedNextAction.title) : recentCelebration?.detail ?? enhancedNextAction.detail}
          tone="momentum"
          visual={consumerTodayV2 ? <HeroMomentumStat score={score} label={scoreLabel} /> : <MomentumHalo value={score} />}
          className="border-calm/35 from-calm/14 via-surface to-purple-500/16 shadow-[0_24px_80px_rgba(8,12,20,0.55)]"
        >
          {consumerTodayV2 ? (
            <>
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <DelightBadge tone={recentCelebration ? "lime" : "teal"}>{momentumHeadline}</DelightBadge>
                </div>
                <p className="max-w-[23rem] text-sm leading-6 text-zinc-300">{heroSupportingCopy}</p>
              </div>
              <a href={primaryAction.href} className="ascend-cta-pulse mt-6 flex h-14 items-center justify-center gap-2 rounded-2xl bg-lime text-base font-semibold text-ink shadow-[0_18px_45px_rgba(61,230,209,0.22)]">
                {primaryAction.label} <ArrowRight size={18} />
              </a>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm text-zinc-300">{greeting}</p>
                  <DelightBadge tone={recentCelebration ? "lime" : "teal"}>{momentumHeadline}</DelightBadge>
                </div>
                <p className="max-w-[22rem] text-sm leading-6 text-zinc-300">{dynamicEncouragement}</p>
              </div>
              {recentCelebration ? <p className="mt-2 text-xs leading-5 text-zinc-400">{recentCelebration.secondary}</p> : null}
              {recentCelebration ? (
                <button
                  type="button"
                  onClick={revealTodayProgress}
                  className="ascend-cta-pulse mt-6 flex h-14 w-full items-center justify-center rounded-2xl bg-lime text-base font-semibold text-ink shadow-[0_18px_45px_rgba(61,230,209,0.22)]"
                >
                  View Today&apos;s Progress
                </button>
              ) : enhancedNextAction.href === "/dashboard" ? (
                <button
                  type="button"
                  onClick={revealTodayProgress}
                  className="ascend-cta-pulse mt-6 flex h-14 w-full items-center justify-center rounded-2xl bg-lime text-base font-semibold text-ink shadow-[0_18px_45px_rgba(61,230,209,0.22)]"
                >
                  {enhancedNextAction.cta}
                </button>
              ) : (
                <a href={enhancedNextAction.href} className="ascend-cta-pulse mt-6 flex h-14 items-center justify-center gap-2 rounded-2xl bg-lime text-base font-semibold text-ink shadow-[0_18px_45px_rgba(61,230,209,0.22)]">
                  {enhancedNextAction.cta} <ArrowRight size={18} />
                </a>
              )}
            </>
          )}
        </AscendHeroPanel>
        {consumerTodayV2 ? (
          <>
            <section className="ascend-card-rise mt-4 rounded-[1.6rem] border border-line bg-surface p-5 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-calm">Today</p>
                  <h2 className="mt-2 text-lg font-semibold text-white">{dailyStatus.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">{dailyStatus.detail}</p>
                </div>
                <span className="rounded-full bg-ink px-3 py-2 text-sm font-semibold text-lime">{dailyCompletion}%</span>
              </div>
              <div className="mt-4"><DelightProgressBar value={dailyCompletion} /></div>
              <div className="mt-4 space-y-2">
                {todayTiles.map((item) => {
                  const Icon = item.icon;
                  const toneClass =
                    item.tone === "lime"
                      ? "border-lime/25 bg-lime/8"
                      : item.tone === "amber"
                        ? "border-amber/25 bg-amber/8"
                        : item.tone === "purple"
                          ? "border-purple-400/25 bg-purple-400/8"
                          : item.tone === "blue"
                            ? "border-sky-400/25 bg-sky-400/8"
                            : "border-line bg-ink";
                  const iconTone =
                    item.done
                      ? "bg-lime text-ink"
                      : item.tone === "amber"
                        ? "bg-amber/12 text-amber"
                        : item.tone === "purple"
                          ? "bg-purple-400/12 text-purple-200"
                          : item.tone === "blue"
                            ? "bg-sky-400/12 text-sky-200"
                            : "bg-surface text-calm";
                  return (
                    <a key={item.label} href={item.href} className={`flex items-center gap-3 rounded-2xl border px-3.5 py-3 transition-colors ${toneClass}`}>
                      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${iconTone}`}>
                        <Icon size={17} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-white">{item.label}</p>
                          <span className="text-xs font-medium text-zinc-500">{item.value}</span>
                        </div>
                        <p className="mt-1 text-sm text-zinc-400">{item.detail}</p>
                      </div>
                      <span className="text-xs font-semibold text-zinc-500">{item.done ? "Edit" : "Open"}</span>
                    </a>
                  );
                })}
              </div>
            </section>

            <section className={`ascend-card-rise mt-4 rounded-[1.6rem] border p-5 shadow-soft ${coachToneClass}`}>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-purple-400/12 text-purple-200">
                  <Sparkles size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-purple-200">Today's Insight</p>
                  <p className="mt-1 text-sm font-semibold text-white">{coachCardTitle}</p>
                  <p className="mt-3 text-lg font-semibold leading-8 text-white">{coachCardSnippet}</p>
                  <p className="mt-2 text-sm leading-6 text-zinc-500">{coachCardDetail}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {user?.assigned_trainer_id ? (
                      <a href="/messages" className="inline-flex h-10 items-center justify-center rounded-full border border-purple-300/30 bg-ink px-4 text-sm font-semibold text-purple-100">
                        View Coach Note
                      </a>
                    ) : (
                      <a href="/coach" className="inline-flex h-10 items-center justify-center rounded-full border border-purple-300/30 bg-ink px-4 text-sm font-semibold text-purple-100">
                        Open Coach Zoe
                      </a>
                    )}
                    {user?.athlete_mode_enabled ? (
                      <a href="/athlete" className="inline-flex h-10 items-center justify-center rounded-full border border-sky-400/20 bg-ink px-4 text-sm font-semibold text-sky-100">
                        {athleteTodaySummary ?? "Athlete Mode"}
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>

            <section ref={progressDetailsRef} className={`ascend-card-rise mt-4 rounded-[1.6rem] border p-5 shadow-soft ${storyToneClass}`}>
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${goalCompletedToday || weightLostFromStart >= 0.1 ? "bg-amber/12 text-amber" : "bg-calm/10 text-calm"}`}>
                  <Sparkles size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold ${goalCompletedToday || weightLostFromStart >= 0.1 ? "text-amber" : "text-calm"}`}>Your story</p>
                  <h2 className="mt-2 text-xl font-semibold text-white">{progressPreview.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">{progressPreview.detail}</p>
                  <a href="/progress" className="mt-4 inline-flex items-center gap-2 rounded-full border border-calm/30 bg-ink px-4 py-2 text-sm font-semibold text-calm">
                    View Journey <ArrowRight size={15} />
                  </a>
                </div>
              </div>
            </section>
          </>
        ) : (
          <>
        <section className="ascend-card-rise mt-4 rounded-[1.6rem] border border-lime/30 bg-[linear-gradient(180deg,rgba(61,230,209,0.08),rgba(18,23,33,0.96))] p-5 shadow-soft">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-lime">Today&apos;s tasks</p>
              <h2 className="mt-1 text-xl font-semibold">{completedTaskCount}/{taskItems.length} completed</h2>
              <p className="mt-1 text-xs text-zinc-500">{formatGoal(user?.goal_type)}</p>
              <p className="mt-2 text-sm leading-6 text-zinc-300">Complete the basics and let the day feel lighter.</p>
              {dailyMission?.trainer_name ? <p className="mt-2 text-xs text-zinc-500">From {dailyMission.trainer_name}</p> : null}
            </div>
            <div className="rounded-2xl border border-white/10 bg-ink/70 px-3 py-2 text-right">
              <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Progress</p>
              <p className="mt-1 text-lg font-semibold text-lime">{dailyCompletion}%</p>
            </div>
          </div>
          <div className="mt-4"><DelightProgressBar value={dailyCompletion} /></div>
          {dailyMission ? (
            <div className="mt-4 rounded-2xl border border-calm/30 bg-calm/10 p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-calm">Trainer mission</p>
                  <p className="mt-1 text-sm leading-6 text-zinc-200">{dailyMission.title}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${dailyMission.status === "completed" ? "bg-lime text-ink" : "bg-ink text-zinc-300"}`}>
                  {dailyMission.status === "completed" ? "Completed" : "Active"}
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
              <a
                key={item.label}
                href={item.href}
                className={`flex items-center justify-between rounded-2xl border px-3.5 py-3 ${item.done ? "ascend-task-complete border-calm/30 bg-calm/10" : "border-line bg-ink"}`}
              >
                <div className="flex items-center gap-3">
                  <span className={`grid h-9 w-9 place-items-center rounded-full ${item.done ? "bg-lime text-ink" : "border border-line bg-surface text-zinc-400"}`}>
                    {item.done ? <CheckCircle2 size={18} /> : <ArrowRight size={16} />}
                  </span>
                  <div>
                    <span className="block text-sm font-semibold text-white">{item.label}</span>
                    <span className="block text-xs text-zinc-500">{item.done ? "Captured today" : "Tap to complete"}</span>
                  </div>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${item.done ? "bg-lime/15 text-lime" : "border border-line text-zinc-400"}`}>
                  {item.done ? (highlightedTaskKey === item.label ? "Just done" : "Complete") : "Open"}
                </span>
              </a>
            ))}
          </div>
        </section>

        <section className="ascend-card-rise mt-4 rounded-[1.6rem] border border-line bg-surface p-5 shadow-soft">
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
          {hasSyncedActivity ? (
            <div className="mt-4 rounded-xl border border-calm/20 bg-calm/8 px-3 py-3">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-calm">
                <Activity size={14} />
                Synced
              </div>
              <p className="mt-2 text-sm text-white">
                {syncedSteps > 0 ? `${syncedSteps.toLocaleString()} steps today.` : "Health Connect is connected."}
                {syncedWorkoutCompleted ? " Workout detected automatically." : ""}
              </p>
            </div>
          ) : null}
        </section>

        <section ref={progressDetailsRef} className="ascend-card-rise mt-4 rounded-[1.6rem] border border-line bg-surface p-5 shadow-soft">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-calm">Quick Snapshot</p>
              <p className="mt-1 text-sm text-zinc-400">The numbers that matter today.</p>
            </div>
            <a href="/momentum-score" className="rounded-full bg-ink px-3 py-2 text-xs font-semibold text-lime">
              How is this calculated?
            </a>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {quickSnapshotItems.map((item) => {
              const Icon = snapshotIcon(item.label);
              const progressValue =
                item.label === "Calories" ? calorieProgress :
                item.label === "Protein" ? proteinProgress :
                item.label === "Water" ? clamp(Math.round((todaysWaterMl / nutritionTargets.waterTargetMl) * 100)) :
                item.label === "Momentum" ? score :
                currentWeight ? clamp(goalProgress ?? 48) : 0;
              return (
              <div key={item.label} className="rounded-2xl border border-white/5 bg-ink p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-2xl bg-surface text-calm">
                    <Icon size={18} />
                  </span>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{item.label}</span>
                </div>
                <p className="mt-3 text-xl font-semibold text-white">{item.value}</p>
                <p className="mt-1 text-[11px] leading-4 text-zinc-500">{item.detail}</p>
                <div className="mt-3"><DelightProgressBar value={progressValue} /></div>
              </div>
            );
            })}
          </div>
        </section>

        <section className="ascend-card-rise mt-4 rounded-[1.6rem] border border-purple-400/25 bg-[linear-gradient(180deg,rgba(139,92,246,0.10),rgba(18,23,33,0.96))] p-5 shadow-soft">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-2xl bg-purple-400/12 text-purple-200">
                  <Sparkles size={18} />
                </span>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-purple-200">Today&apos;s Insight</p>
                  <p className="text-sm font-semibold text-white">Coach Zoe</p>
                </div>
              </div>
              <p className="mt-4 text-lg font-semibold leading-8 text-white">{dailyCoachingMessage.message}</p>
              <p className="mt-2 text-sm leading-6 text-zinc-400">{dailyCoachingMessage.detail}</p>
            </div>
            <DelightBadge tone="purple">Adaptive</DelightBadge>
          </div>
        </section>

        <CollapsibleSection
          title="Track"
          icon={<BarChart3 size={17} />}
          tone="teal"
          preview={trackPreview}
          isOpen={openSections.track}
          onToggle={() => setSectionOpen("track", !openSections.track)}
        >
          <div className="space-y-4">
            <section className="rounded-xl border border-line bg-ink p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">Nutrition</p>
                  <p className={`mt-1 text-[11px] font-bold uppercase tracking-[0.16em] ${nutritionSourceTone}`}>{nutritionSourceLabel}</p>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">
                    {hasCoachNutritionPlan
                      ? "Your trainer customised these targets for your current phase."
                      : `${nutritionTargets.explanation} ${nutritionTargets.adaptationReason ?? (nutritionTargets.estimated ? "Complete your profile later for a sharper estimate." : "Use this as direction, not a strict rule.")}`}
                  </p>
                </div>
                <span className="rounded-lg bg-surface px-3 py-2 text-sm font-semibold text-lime">{calorieTarget.toLocaleString()} kcal</span>
              </div>
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
                  <div key={label} className="rounded-lg bg-surface p-4">
                    <p className="text-xs uppercase text-zinc-400">{label}</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
                    <p className="mt-1 text-sm text-zinc-400">{detail}</p>
                  </div>
                ))}
              </div>
            </section>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <a href="/weight-log" className="rounded-xl border border-line bg-ink p-4">
                <p className="text-sm font-semibold text-white">Weight</p>
                <p className="mt-2 text-lg font-semibold">{currentWeight ? `${currentWeight.toFixed(1)}kg` : "Record your first weigh-in"}</p>
                <p className="mt-1 text-xs text-zinc-400">{weightPreview}</p>
              </a>
              <a href="/water-log" className="rounded-xl border border-line bg-ink p-4">
                <p className="text-sm font-semibold text-white">Water</p>
                <p className="mt-2 text-lg font-semibold">{(todaysWaterMl / 1000).toFixed(1)}L</p>
                <p className="mt-1 text-xs text-zinc-400">{waterPreview}</p>
              </a>
              <a href="/burn-log" className="rounded-xl border border-line bg-ink p-4">
                <p className="text-sm font-semibold text-white">Activity</p>
                <p className="mt-2 text-lg font-semibold">{todaysBurnCalories ? `${todaysBurnCalories} kcal` : "Add movement"}</p>
                <p className="mt-1 text-xs text-zinc-400">{workoutPreview}</p>
              </a>
            </div>

            <section className="rounded-xl border border-line bg-ink p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">Meals</p>
                  <p className="mt-1 text-xs text-zinc-400">{todaysFood.length ? `${todaysFood.length} logged today` : "Your latest meals live here once you start logging."}</p>
                </div>
                <a href="/food-log?view=history" className="text-xs font-semibold text-lime">View all</a>
              </div>
              <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
                {latestMealsPreview.length ? (
                  latestMealsPreview.map((log) => (
                    <a key={log.id} href="/food-log?view=history" className="w-40 shrink-0 rounded-lg bg-surface p-3">
                      <div className="grid aspect-square place-items-center overflow-hidden rounded-lg bg-ink">
                        {log.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={log.image_url} alt={log.estimated_food_name} className="h-full w-full object-cover" loading="lazy" decoding="async" />
                        ) : (
                          <span className="text-xs text-zinc-500">No photo</span>
                        )}
                      </div>
                      <p className="mt-3 truncate text-sm font-semibold text-white">{log.estimated_food_name}</p>
                      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-zinc-400">
                        <span>{Number(log.calories).toLocaleString()} kcal</span>
                        <span>{formatMealTime(log.logged_at)}</span>
                      </div>
                    </a>
                  ))
                ) : (
                  <a href="/food-log" className="block w-full rounded-lg bg-surface p-4 text-sm leading-6 text-zinc-400">Snap a meal when you eat next. It will appear here automatically.</a>
                )}
              </div>
            </section>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Journey"
          icon={<Camera size={17} />}
          tone="purple"
          preview={journeyPreview}
          isOpen={openSections.journey}
          onToggle={() => setSectionOpen("journey", !openSections.journey)}
        >
          <div className="space-y-4">
            {progressComparison ? <ProgressComparisonCard comparison={progressComparison} /> : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <a href="/reports" className="rounded-xl border border-line bg-ink p-4">
                <p className="text-sm font-semibold text-white">Weekly Reflection</p>
                <p className="mt-2 text-sm leading-6 text-zinc-400">A calm look at what improved this week and the one focus worth carrying forward.</p>
                <p className="mt-3 text-xs font-semibold text-lime">{weeklyReportPreview}</p>
              </a>
              <a href="/progress" className="rounded-xl border border-line bg-ink p-4">
                <p className="text-sm font-semibold text-white">Progress Photos</p>
                <p className="mt-2 text-sm leading-6 text-zinc-400">{latestProgressPhoto ? "See change beyond the scale." : "Capture your first photo when you're ready."}</p>
                <p className="mt-3 text-xs font-semibold text-lime">{photoPreview}</p>
              </a>
            </div>

            {latestProgressPhoto?.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={latestProgressPhoto.image_url} alt="Latest progress" className="aspect-[4/5] w-full rounded-xl object-cover" loading="lazy" decoding="async" />
            ) : null}

            {hasPremiumAccess ? (
              <section className="rounded-xl border border-line bg-ink p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">Ascend Memory</p>
                    <p className="mt-1 text-xs text-zinc-400">{memoryPreview}</p>
                  </div>
                  <a href="/reports" className="text-xs font-semibold text-lime">Open</a>
                </div>
                <div className="mt-4">
                  <AscendMemoryCard memory={ascendMemory} />
                </div>
              </section>
            ) : null}

            {user?.athlete_mode_enabled ? (
              <a href="/athlete" className="block rounded-xl border border-purple-400/30 bg-purple-400/10 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">Body Scan</p>
                    <p className="mt-2 text-sm leading-6 text-zinc-300">Open Athlete Mode to review Ascend DNA, scan trends, and readiness.</p>
                    <p className="mt-3 text-xs font-semibold text-purple-200">{bodyScanPreview}</p>
                  </div>
                  <span className="rounded-full bg-purple-400/20 px-3 py-1 text-xs font-semibold text-purple-200">Athlete</span>
                </div>
              </a>
            ) : null}
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Habits & Goals"
          icon={<Target size={17} />}
          tone="lime"
          preview={habitsGoalsPreview}
          isOpen={openSections.habitsGoals}
          onToggle={() => setSectionOpen("habitsGoals", !openSections.habitsGoals)}
        >
          <div className="space-y-4">
            <section className="rounded-xl border border-line bg-ink p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">Goal Progress</p>
                  <p className="mt-1 text-sm leading-6 text-zinc-400">
                    {goalProgress === null ? "Add weight logs to see progress toward your goal." : `${goalProgress}% ${progressCopy(user?.goal_type)}.`}
                  </p>
                </div>
                <span className="rounded-lg bg-surface px-3 py-2 text-sm font-semibold text-lime">{goalProgress === null ? "--" : `${goalProgress}%`}</span>
              </div>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-surface">
                <div className="h-full rounded-full bg-lime" style={{ width: `${goalProgress ?? 8}%` }} />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-surface p-3">
                  <p className="text-xs text-zinc-400">Current</p>
                  <p className="mt-1 text-lg font-semibold">{currentWeight ? `${currentWeight.toFixed(1)}kg` : "--"}</p>
                </div>
                <div className="rounded-lg bg-surface p-3">
                  <p className="text-xs text-zinc-400">To goal</p>
                  <p className="mt-1 text-lg font-semibold">{remainingWeight === null ? "--" : `${remainingWeight.toFixed(1)}kg`}</p>
                </div>
                <div className="rounded-lg bg-surface p-3">
                  <p className="text-xs text-zinc-400">Momentum</p>
                  <p className="mt-1 text-lg font-semibold">{score}/100</p>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-line bg-ink p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">Consistency</p>
                  <p className="mt-1 text-sm leading-6 text-zinc-400">{streakTitle}</p>
                </div>
                <div className="origin-top-right scale-90">
                  <MomentumHalo value={score} label={scoreLabel} />
                </div>
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-300">{streakCopy}</p>
            </section>

            <section className="rounded-xl border border-line bg-ink p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">Habits</p>
                  <p className="mt-1 text-xs text-zinc-400">{habitsPreview}</p>
                </div>
                <a href="/habits" className="text-xs font-semibold text-lime">Open</a>
              </div>
              <div className="mt-4 space-y-2">
                {dashboardHabits.length ? (
                  dashboardHabits.map((habit) => {
                    const completed = completedHabitIds.has(habit.id);
                    return (
                      <a key={habit.id} href="/habits" className="flex items-center justify-between rounded-lg bg-surface px-3 py-3">
                        <span className="text-sm text-white">{habit.name}</span>
                        <span className={`grid h-7 min-w-7 place-items-center rounded px-2 text-xs font-semibold ${completed ? "bg-lime text-ink" : "border border-line text-zinc-400"}`}>
                          {completed ? "Done" : "Open"}
                        </span>
                      </a>
                    );
                  })
                ) : (
                  <a href="/habits" className="block rounded-lg bg-surface px-3 py-3 text-sm text-zinc-400">Create one small habit you can repeat tomorrow.</a>
                )}
              </div>
            </section>
          </div>
        </CollapsibleSection>
          </>
        )}
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

"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AscendDNAService, AscendDnaEvent, buildCoachZoeProactiveInsight, calculateAdaptiveNutritionTargets, CoachingMode } from "@ascend/shared";
import { Activity, ArrowRight, Beef, Check, ChevronDown, CircleHelp, Droplets, Flame, HeartPulse, Home, Plus, Scale, Sparkles, Target, UserRound, Zap } from "lucide-react";
import {
  acknowledgeGoalMilestone,
  completeMission,
  getAscendMemory,
  getBurnLogs,
  getCoachPresence,
  getComplianceToday,
  getTodayRecoveryCheckin,
  getHabitLogs,
  getHabits,
  getAthleteDashboard,
  getFoodLogs,
  getHealthSyncStatus,
  getLatestRecognition,
  getMe,
  getMyNutritionTargets,
  getMyProgressComparison,
  getGoalStatus,
  getMyStreak,
  getProgressPhotos,
  getTodayMission,
  getTodayPriorityRecommendation,
  getWaterLogs,
  getWeightLogs,
  saveRecoveryCheckin,
  AthleteDashboard,
  AscendMemoryResponse,
  CoachPresenceSettings,
  CoachPresenceMessage,
  TodayPriorityRecommendation
} from "@/lib/ascendApi";
import { AccountBar } from "@/components/AccountBar";
import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { localDateKey } from "@/lib/date";
import { clearDashboardRecord, DASHBOARD_RECORD_EVENT, DashboardActionType, readDashboardRecord, readRecentDashboardAction } from "@/lib/dataSync";
import { cacheAccountProfile, getCachedAccountProfile, loadAccountPlan } from "@/lib/accountSession";
import { AccountBarSkeleton, DashboardHeroSkeleton, SectionShell, SkeletonBlock, SkeletonCardList, SkeletonStatGrid, SkeletonText } from "@/components/PerceivedLoading";
import { ZoeAvatar } from "@/components/ExperienceVisuals";

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
type ResolvedNutritionTargets = Awaited<ReturnType<typeof getMyNutritionTargets>>["targets"];
type TodayPriority = TodayPriorityRecommendation;
type HealthSyncStatus = Awaited<ReturnType<typeof getHealthSyncStatus>>["status"];
type CollapsibleKey =
  | "todaysNumbers";

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

function weightTrend(current?: WeightLog, previous?: WeightLog) {
  if (!current || !previous) return "Add 2 weigh-ins";
  const diff = asNumber(current.weight_kg) - asNumber(previous.weight_kg);
  if (Math.abs(diff) < 0.1) return "Stable";
  return `${diff > 0 ? "+" : ""}${diff.toFixed(1)}kg`;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function TodayMomentumVisual({
  score,
  label,
  isStarting = false
}: {
  score: number;
  label: string;
  isStarting?: boolean;
}) {
  const radius = 76;
  const circumference = 2 * Math.PI * radius;
  const progress = (clamp(score) / 100) * circumference;

  return (
    <div className="ascend-today-momentum relative mx-auto h-[9.5rem] w-[9.5rem] sm:h-[10.75rem] sm:w-[10.75rem]" aria-label={isStarting ? "Momentum starts building after your first check-in." : `Momentum ${score} out of 100, based on your last seven days.`}>
      <svg className="h-full w-full -rotate-90" viewBox="0 0 200 200" role="img" aria-hidden="true">
        <defs>
          <linearGradient id="today-momentum-gradient" x1="20" y1="20" x2="180" y2="180" gradientUnits="userSpaceOnUse">
            <stop stopColor="#a484ff" />
            <stop offset="0.52" stopColor="#35f2d0" />
            <stop offset="1" stopColor="#a3ff46" />
          </linearGradient>
        </defs>
        <circle cx="100" cy="100" r={radius} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="9" />
        <circle
          cx="100"
          cy="100"
          r={radius}
          fill="none"
          stroke="url(#today-momentum-gradient)"
          strokeLinecap="round"
          strokeWidth="9"
          strokeDasharray={`${progress} ${circumference}`}
          className="ascend-today-ring"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-4xl font-semibold leading-none text-white sm:text-5xl">{isStarting ? "--" : score}</p>
          <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.2em] text-purple-200">Momentum</p>
          <p className="mt-1 text-xs font-medium text-calm">{label}</p>
        </div>
      </div>
    </div>
  );
}

function SignalProgressRing({
  progress,
  done,
  priority,
  children
}: {
  progress: number;
  done: boolean;
  priority: boolean;
  children: ReactNode;
}) {
  const radius = 21;
  const circumference = 2 * Math.PI * radius;
  const visibleProgress = done ? 100 : clamp(progress);

  return (
    <span
      className="ascend-signal-ring relative grid h-14 w-14 place-items-center"
      data-state={done ? "done" : priority ? "priority" : "open"}
      aria-hidden="true"
    >
      <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 56 56">
        <circle cx="28" cy="28" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2.5" />
        <circle
          cx="28"
          cy="28"
          r={radius}
          fill="none"
          stroke={done ? "#a3ff46" : priority ? "#35f2d0" : "#a484ff"}
          strokeDasharray={`${(visibleProgress / 100) * circumference} ${circumference}`}
          strokeLinecap="round"
          strokeWidth="2.5"
          className="transition-[stroke-dasharray] duration-700"
        />
      </svg>
      <span className={`relative grid h-10 w-10 place-items-center rounded-full border ${done ? "border-lime/30 bg-lime/12 text-lime" : priority ? "border-calm/35 bg-calm/10 text-calm" : "border-white/[0.07] bg-white/[0.025] text-zinc-400"}`}>
        {children}
      </span>
    </span>
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

const snapshotTone = {
  calories: { icon: "bg-amber/12 text-amber", bar: "bg-amber", glow: "shadow-[0_0_16px_rgba(245,180,72,0.18)]" },
  protein: { icon: "bg-purple-400/12 text-purple-200", bar: "bg-purple-400", glow: "shadow-[0_0_16px_rgba(139,92,246,0.18)]" },
  water: { icon: "bg-calm/12 text-calm", bar: "bg-calm", glow: "shadow-[0_0_16px_rgba(61,230,209,0.18)]" },
  weight: { icon: "bg-sky-400/12 text-sky-200", bar: "bg-sky-300", glow: "shadow-[0_0_16px_rgba(125,211,252,0.16)]" },
  momentum: { icon: "bg-lime/12 text-lime", bar: "bg-lime", glow: "shadow-[0_0_16px_rgba(163,255,70,0.16)]" }
} as const;

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
  previewVisual,
  children,
  isOpen,
  onToggle
}: {
  title: string;
  icon?: ReactNode;
  tone?: "teal" | "purple" | "lime";
  preview: string;
  previewVisual?: ReactNode;
  children: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const accent = sectionAccent(tone);
  return (
    <section className="ascend-today-support ascend-today-numbers mt-1 border-b border-white/[0.07]">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 py-4 text-left"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {icon ? (
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border ${accent.icon}`}>
                {icon}
              </span>
            ) : null}
            <h2 className={`text-base font-semibold ${accent.title}`}>{title}</h2>
          </div>
          <p className={`mt-1 truncate text-sm ${accent.preview}`}>{preview}</p>
          {previewVisual ? <div className="mt-2">{previewVisual}</div> : null}
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.035] text-zinc-200">
          <ChevronDown className={`transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} size={18} />
        </span>
      </button>
      <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="overflow-hidden">
          <div className="pb-5 pt-2">{children}</div>
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
  const [resolvedNutritionTargets, setResolvedNutritionTargets] = useState<ResolvedNutritionTargets | null>(null);
  const [healthSyncStatus, setHealthSyncStatus] = useState<HealthSyncStatus | null>(null);
  const [athleteDashboard, setAthleteDashboard] = useState<AthleteDashboard | null>(null);
  const [coachPresence, setCoachPresence] = useState<{
    latest: CoachPresenceMessage | null;
    history: CoachPresenceMessage[];
    settings: CoachPresenceSettings;
  }>({ latest: null, history: [], settings: { style: "balanced", paused: false, pauseUntil: null } });
  const [ascendMemory, setAscendMemory] = useState<AscendMemoryResponse | null>(null);
  const [momentumScore, setMomentumScore] = useState<number | null>(null);
  const [momentumBreakdown, setMomentumBreakdown] = useState<{
    fuelScore: number;
    moveScore: number;
    recoverScore: number;
    focusScore: number | null;
    fuelStatus: string;
    moveStatus: string;
    recoverStatus: string;
    focusStatus: string;
    focusActive: boolean;
  } | null>(null);
  const [sleepQuality, setSleepQuality] = useState<"poor" | "okay" | "good" | null>(null);
  const [savingSleep, setSavingSleep] = useState(false);
  const [logMenuOpen, setLogMenuOpen] = useState(false);
  const [logMenuContext, setLogMenuContext] = useState<"all" | "recovery">("all");
  const [todayPriorityRecommendation, setTodayPriorityRecommendation] = useState<TodayPriority | null>(null);
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
    todaysNumbers: false
  });
  const dashboardRequestRef = useRef(0);
  const dashboardLoadInFlightRef = useRef(false);
  const hasLoadedDashboardRef = useRef(false);
  const missionLockRef = useRef(false);
  const goalCelebrateLockRef = useRef(false);
  const loadDashboard = useCallback(async () => {
    if (dashboardLoadInFlightRef.current) return;
    dashboardLoadInFlightRef.current = true;
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
      const subscriptionRequest = loadAccountPlan().catch(() => "free" as const);
      const priorityRequest = getTodayPriorityRecommendation().catch(() => null);
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
        getMyNutritionTargets(),
        getCoachPresence(),
        getAscendMemory(),
        getHealthSyncStatus(),
        getTodayRecoveryCheckin()
      ]);
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

      const athleteDashboardRequest = me.user.athlete_mode_enabled
        ? getAthleteDashboard().catch(() => null)
        : Promise.resolve(null);

      void subscriptionRequest.then((nextPlan) => {
        if (requestId === dashboardRequestRef.current) setPlan(nextPlan);
      });

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
        setMomentumBreakdown(nextCompliance ? {
          fuelScore: nextCompliance.fuel_score ?? nextCompliance.food_score,
          moveScore: nextCompliance.move_score ?? nextCompliance.weight_score,
          recoverScore: nextCompliance.recover_score ?? nextCompliance.water_score,
          focusScore: nextCompliance.focus_score ?? nextCompliance.habit_score,
          fuelStatus: nextCompliance.fuel_status ?? "building",
          moveStatus: nextCompliance.move_status ?? "building",
          recoverStatus: nextCompliance.recover_status ?? "building",
          focusStatus: nextCompliance.focus_status ?? "building",
          focusActive: nextCompliance.focus_active ?? false
        } : null);
      }
      hasLoadedDashboardRef.current = true;
      setSectionLoading((current) => ({ ...current, core: false }));
      setStatus("");

      void priorityRequest.then((response) => {
        if (requestId === dashboardRequestRef.current && response) {
          setTodayPriorityRecommendation(response.priority);
        }
      });

      void secondaryDataRequest
        .then(([photos, nutritionTargets, presence, memory, healthSync, recovery]) => {
          if (requestId !== dashboardRequestRef.current) return;
          if (photos.status === "fulfilled") setProgressPhotos(Array.isArray(photos.value.progressPhotos) ? photos.value.progressPhotos : []);
          if (nutritionTargets.status === "fulfilled") setResolvedNutritionTargets(nutritionTargets.value.targets);
          if (presence.status === "fulfilled") setCoachPresence(presence.value);
          if (memory.status === "fulfilled") setAscendMemory(memory.value);
          if (healthSync.status === "fulfilled") setHealthSyncStatus(healthSync.value.status);
          if (recovery.status === "fulfilled") setSleepQuality(recovery.value.checkin?.sleep_quality ?? null);
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
  const calorieTarget = resolvedNutritionTargets?.calories ?? nutritionTargets.calorieTarget;
  const proteinTarget = resolvedNutritionTargets?.proteinG ?? nutritionTargets.proteinTargetG;
  const carbsTarget = resolvedNutritionTargets?.carbsG ?? nutritionTargets.carbsTargetG;
  const fatTarget = resolvedNutritionTargets?.fatG ?? nutritionTargets.fatTargetG;
  const nutritionSourceLabel = resolvedNutritionTargets?.sourceLabel
    ?? (athleteBodyComposition ? "Body Scan + Ascend" : "Ascend Recommendation");
  const nutritionSourceTone = resolvedNutritionTargets?.source === "coach_plan"
    ? "text-calm"
    : resolvedNutritionTargets?.source === "body_scan"
      ? "text-purple-300"
      : "text-lime";
  const proteinLeft = Math.max(proteinTarget - protein, 0);
  const calorieProgress = clamp(Math.round((calories / calorieTarget) * 100));
  const proteinProgress = clamp(Math.round((protein / proteinTarget) * 100));
  const waterProgress = clamp(Math.round((todaysWaterMl / nutritionTargets.waterTargetMl) * 100));
  const needsGuideProfile = !user?.age_years || !user?.height_cm || !user?.activity_level || !user?.gender;
  const profileIncomplete = Boolean(user) && (!user?.goal_type || !user?.age_years || !user?.height_cm || !user?.starting_weight_kg || !user?.activity_level);
  const hasExperiencedAscend = foodLogs.length > 0 || weightLogs.length > 0 || waterLogs.length > 0 || dashboardSessionCount >= 3;
  const shouldShowProfileReminder = profileIncomplete && hasExperiencedAscend;
  const fallbackHealthSummary = healthSyncStatus?.summary ?? null;
  const fallbackSyncedSteps = fallbackHealthSummary?.todaySteps ?? 0;
  const fallbackSyncedWorkoutCompleted = fallbackHealthSummary?.workoutCompletedToday === true;
  const fallbackScore = Math.round(
    Math.min(todaysFood.length / 3, 1) * 40 +
    (todaysBurnCalories > 0 || fallbackSyncedWorkoutCompleted ? 40 : fallbackSyncedSteps >= 5000 ? 28 : fallbackSyncedSteps >= 2500 ? 16 : 0) +
    Math.min(todaysWaterMl / Math.max(nutritionTargets.waterTargetMl, 1), 1) * 20
  );
  const score = momentumScore ?? fallbackScore;
  const currentStreak = Number(streak?.current ?? 0);
  const scoreLabel =
    currentStreak >= 7
      ? `${currentStreak}-day streak`
      : currentStreak >= 2
        ? `${currentStreak}-day rhythm`
        : score >= 80
          ? "Best this month"
          : score >= 60
            ? "Building momentum"
            : "Start today";
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
  const coachingMode = effectiveCoachingMode(user);

  const weeklyFoodDays = uniqueDays(foodLogs.filter((log) => weekKeys.includes(localDateKey(log.logged_at))), (log) => log.logged_at);
  const weeklyWaterDays = uniqueDays(waterLogs.filter((log) => weekKeys.includes(localDateKey(log.logged_at))), (log) => log.logged_at);
  const weeklyBurnDays = uniqueDays(burnLogs.filter((log) => weekKeys.includes(localDateKey(log.created_at))), (log) => log.created_at);
  const weeklyHabitDays = uniqueDays(
    habitLogs.filter((log) => log.completed && weekKeys.includes(localDateKey(log.logged_at))),
    (log) => log.logged_at
  );
  const proteinConsistency = weekKeys.filter((key) => {
    const dailyProtein = foodLogs
      .filter((log) => localDateKey(log.logged_at) === key)
      .reduce((total, log) => total + asNumber(log.protein_g), 0);
    return dailyProtein >= proteinTarget;
  }).length;
  const recentFoodDayStats = summarizeRecentFoodDays(foodLogs, 3);
  const lowProteinDays3 = recentFoodDayStats.filter((day) => day.count > 0 && day.protein < proteinTarget * 0.6).length;
  const highCaloriesDays3 = recentFoodDayStats.filter((day) => day.count > 0 && day.calories > calorieTarget * 1.1).length;
  const lowCaloriesDays3 = recentFoodDayStats.filter((day) => day.count > 0 && day.calories < calorieTarget * 0.65).length;
  const healthSyncSummary = healthSyncStatus?.summary ?? null;
  const hasSyncedActivity = Boolean(healthSyncSummary?.connected);
  const syncedSteps = healthSyncSummary?.todaySteps ?? 0;
  const syncedWorkoutCompleted = healthSyncSummary?.workoutCompletedToday === true;
  const syncedWorkoutCount = healthSyncSummary?.workoutsThisWeek ?? 0;

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

  const navItems = canTrain || canAdmin
    ? [
        { href: "/dashboard", label: "Home", icon: Home, selected: true, show: true },
        { href: "/trainer", label: "Trainer", icon: UserRound, selected: false, show: canTrain },
        { href: "/admin", label: "Admin", icon: Target, selected: false, show: canAdmin }
      ].filter((item) => item.show)
    : [
        { href: "/dashboard", label: "Today", icon: Home, selected: true, show: true },
        { href: "/food-log", label: "Meals", icon: Beef, selected: false, show: true },
        { href: "/coach", label: "Zoe", icon: Sparkles, selected: false, show: true },
        { href: "/journey", label: "Journey", icon: Activity, selected: false, show: true },
        { href: "/profile", label: "Profile", icon: UserRound, selected: false, show: true }
      ];
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
  const recentCelebration = recentAction ? AscendDNAService.getCelebration(toDnaAction(recentAction.type)) : null;
  const goalCompletedToday = Boolean(goalStatus?.milestone_id);
  const greeting = AscendDNAService.getGreeting(dnaProfile, new Date());
  const yesterday = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return localDateKey(date.toISOString());
  }, []);
  const weightLostFromStart = startWeight && currentWeight && startWeight > currentWeight ? startWeight - currentWeight : 0;
  const latestBurnLog = burnLogs[0];
  const latestWorkoutTitle = typeof latestBurnLog?.metadata?.workoutTitle === "string" ? latestBurnLog.metadata.workoutTitle : null;
  const latestWorkoutCompletedToday = Boolean(latestBurnLog && localDateKey(latestBurnLog.created_at) === today);
  const latestWorkoutCompletedYesterday = Boolean(latestBurnLog && localDateKey(latestBurnLog.created_at) === yesterday);
  const isFirstDayState =
    !foodLogs.length &&
    !weightLogs.length &&
    !waterLogs.length &&
    !burnLogs.length &&
    !habits.length &&
    !habitLogs.length &&
    !progressPhotos.length &&
    currentStreak === 0;
  const todayGreeting = isFirstDayState ? "Welcome" : greeting;
  const todayPriority = todayPriorityRecommendation
    ? {
        key: todayPriorityRecommendation.key,
        hero: todayPriorityRecommendation.title,
        reason: todayPriorityRecommendation.reason,
        href: todayPriorityRecommendation.href,
        cta: todayPriorityRecommendation.cta
      }
    : isFirstDayState
      ? {
          key: "Meal" as const,
          hero: "Start with your first meal",
          reason: "One honest check-in is enough to help Ascend begin learning your routine.",
          href: "/food-log",
          cta: "Log Meal"
        }
      : {
          key: null,
          hero: "Keep today simple",
          reason: "Your recent progress is still here. Choose one useful action when you are ready.",
          href: "/progress",
          cta: "View Progress"
        };
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
  const weightDelta = latestWeight && previousWeight ? asNumber(latestWeight.weight_kg) - asNumber(previousWeight.weight_kg) : null;
  const latestMemoryMilestone = ascendMemory?.timeline?.[0];
  const historyDayKeys = new Set<string>();
  for (const item of foodLogs) historyDayKeys.add(localDateKey(item.logged_at));
  for (const item of waterLogs) historyDayKeys.add(localDateKey(item.logged_at));
  for (const item of weightLogs) historyDayKeys.add(localDateKey(item.logged_at));
  for (const item of burnLogs) historyDayKeys.add(localDateKey(item.created_at));
  for (const item of habitLogs) historyDayKeys.add(localDateKey(item.logged_at));
  for (const item of progressPhotos) historyDayKeys.add(localDateKey(item.logged_at));
  const totalLoggedActivities =
    foodLogs.length + waterLogs.length + weightLogs.length + burnLogs.length + habitLogs.length + progressPhotos.length;
  const proactiveCoachInsight = buildCoachZoeProactiveInsight({
    goalType: user?.goal_type ?? null,
    currentStreak,
    momentumScore: score,
    previousMomentumScore: progressComparison?.baseline.momentum ?? null,
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
    recentMilestoneTitle: latestMemoryMilestone?.title ?? null,
    historyDaysTracked: historyDayKeys.size,
    totalLoggedActivities
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
  const trackPreview = calories > 0 || protein > 0 || todaysWaterMl > 0 || currentWeight || todaysBurnCalories > 0
    ? [
        calories > 0 ? `${calories.toLocaleString()} kcal` : null,
        protein > 0 ? `${protein}g protein` : null,
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
    scoreLabel
  ].filter((item): item is string => Boolean(item));
  const habitsGoalsPreview = habitsGoalHighlights.slice(0, 2).join(" • ");
  const hasTodaysNumbers =
    calories > 0 ||
    protein > 0 ||
    todaysWaterMl > 0 ||
    Boolean(currentWeight) ||
    syncedSteps > 0 ||
    todaysBurnCalories > 0;
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
  const primaryAction = { label: todayPriority.cta, href: todayPriority.href };
  const heroSupportingCopy = (() => {
    return todayPriority.reason;
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
      title: "Your journey starts here.",
      detail: "Ascend will remember the small wins that follow."
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
  const completeCoachSentences = coachCardMessage.match(/[^.!?]+[.!?]+/g)?.slice(0, 2).join(" ").trim();
  const coachCardSnippet = isFirstDayState
    ? "I'll learn what helps you as you check in. For now, keep today simple."
    : completeCoachSentences ?? coachCardMessage;
  const fuelDetail = todaysFood.length
    ? proteinTarget > 0 && protein < proteinTarget
      ? `${Math.max(proteinTarget - protein, 0)}g protein left today`
      : proteinTarget > 0
        ? "Protein guide reached"
        : "Meal activity recorded"
    : weeklyFoodDays.size
      ? `Meals logged on ${weeklyFoodDays.size} of 7 days`
      : "Your first meal starts the picture";
  const moveDetail = todaysBurnCalories > 0 || syncedSteps > 0 || syncedWorkoutCompleted
    ? "Movement recorded today"
    : weeklyBurnDays.size
      ? `${weeklyBurnDays.size} active ${weeklyBurnDays.size === 1 ? "day" : "days"} this week`
      : "Nothing recorded today";
  const recoverDetail = todaysWaterMl > 0
    ? sleepQuality
      ? `${(Math.max(nutritionTargets.waterTargetMl - todaysWaterMl, 0) / 1000).toFixed(1)}L water left · ${sleepQuality} sleep`
      : `${(Math.max(nutritionTargets.waterTargetMl - todaysWaterMl, 0) / 1000).toFixed(1)}L water left · sleep optional`
    : sleepQuality
      ? `No water yet · ${sleepQuality} sleep`
      : "No water or sleep check-in yet";
  const focusDetail = dailyMission?.title
    ?? (habits.length ? `${completedHabitIds.size} of ${habits.length} habits complete` : "No focus set today");
  const momentumSignals: Array<{ label: string; icon: typeof Beef; summary: string; detail: string; done: boolean; progress: number; href: string | null }> = [
    {
      label: "Fuel",
      icon: Beef,
      summary: todaysFood.length ? `${todaysFood.length} ${todaysFood.length === 1 ? "meal" : "meals"}` : "No log yet",
      detail: fuelDetail,
      done: todaysFood.length > 0,
      progress: calorieProgress,
      href: "/food-log"
    },
    {
      label: "Move",
      icon: Activity,
      summary: todaysBurnCalories > 0
        ? `${todaysBurnCalories.toLocaleString()} kcal`
        : syncedSteps > 0
          ? `${syncedSteps.toLocaleString()} steps`
          : syncedWorkoutCompleted
            ? "Workout synced"
            : "No log yet",
      detail: moveDetail,
      done: todaysBurnCalories > 0 || syncedSteps >= 2500 || syncedWorkoutCompleted,
      progress: todaysBurnCalories > 0 || syncedWorkoutCompleted
        ? 100
        : syncedSteps > 0
          ? clamp(Math.round((syncedSteps / 8000) * 100))
          : 0,
      href: "/burn-log"
    },
    {
      label: "Recover",
      icon: HeartPulse,
      summary: todaysWaterMl > 0
        ? `${(todaysWaterMl / 1000).toFixed(1)}L water`
        : sleepQuality
          ? `${sleepQuality.charAt(0).toUpperCase()}${sleepQuality.slice(1)} sleep`
          : "Water + sleep",
      detail: recoverDetail,
      done: todaysWaterMl >= nutritionTargets.waterTargetMl || sleepQuality !== null,
      progress: Math.max(waterProgress, sleepQuality ? 100 : 0),
      href: null
    },
    {
      label: "Focus",
      icon: Target,
      summary: dailyMission
        ? dailyMission.status === "completed"
          ? "Completed"
          : "Set today"
        : habits.length
          ? `${completedHabitIds.size}/${habits.length} habits`
          : "Optional today",
      detail: focusDetail,
      done: dailyMission?.status === "completed" || completedHabitIds.size > 0,
      progress: dailyMission?.status === "completed"
        ? 100
        : habits.length
          ? clamp(Math.round((completedHabitIds.size / habits.length) * 100))
          : 0,
      href: "/habits"
    }
  ];
  const activeMomentumSignals = momentumSignals.filter((item) => item.label !== "Focus" || momentumBreakdown?.focusActive || habits.length || dailyMission);
  const completedMomentumSignals = activeMomentumSignals.filter((item) => item.done).length;
  const momentumSignalProgress = Math.round((completedMomentumSignals / Math.max(activeMomentumSignals.length, 1)) * 100);
  const priorityMomentumLabel = todayPriority.key === "Meal"
    ? "Fuel"
    : todayPriority.key === "Movement"
      ? "Move"
      : todayPriority.key === "Water"
        ? "Recover"
        : todayPriority.key === "Habit"
          ? "Focus"
          : null;
  const optionalLogActions = [
    { label: "Meal", href: "/food-log", icon: Beef },
    { label: "Water", href: "/water-log", icon: Droplets },
    { label: "Movement", href: "/burn-log", icon: Activity },
    { label: "Weight", href: "/weight-log", icon: Scale },
    { label: "Habits", href: "/habits", icon: Target }
  ];

  function setSectionOpen(key: CollapsibleKey, isOpen: boolean) {
    setOpenSections((current) => ({ ...current, [key]: isOpen }));
  }

  async function recordSleepQuality(quality: "poor" | "okay" | "good") {
    setSavingSleep(true);
    try {
      await saveRecoveryCheckin(quality);
      setSleepQuality(quality);
      setLogMenuOpen(false);
      await loadDashboard();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Sleep check-in could not be saved.");
    } finally {
      setSavingSleep(false);
    }
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
      <main className="ascend-today-canvas min-h-screen bg-ink pb-24 text-white">
        <div className="mx-auto min-h-screen w-full max-w-md px-4 pt-4">
          <header className="flex items-center justify-between py-3">
            <Link href="/" className="flex items-center gap-2">
              <BrandMark size="sm" />
              <span>
                <span className="block text-lg font-semibold leading-5">Ascend</span>
                <span className="text-xs text-zinc-400">Loading your dashboard</span>
              </span>
            </Link>
            <div className="flex items-center gap-2">
              <SkeletonBlock className="h-10 w-10 rounded-lg" />
              <SkeletonBlock className="h-10 w-10 rounded-lg" />
            </div>
          </header>

          <AccountBarSkeleton />
          <DashboardHeroSkeleton bodyLines={2} footer={<SkeletonBlock className="h-10 w-40 rounded-lg" />} />
          <SectionShell title="Today's priority">
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
          <SectionShell title="Today's Numbers">
            <SkeletonStatGrid count={4} />
          </SectionShell>
          <SectionShell title="Today's insight">
            <SkeletonCardList count={2} compact />
          </SectionShell>
          <p className="mt-4 rounded-lg border border-line bg-surface p-3 text-sm text-zinc-300">{status}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="ascend-today-canvas min-h-screen bg-ink pb-24 text-white">
      <div className="mx-auto min-h-screen w-full max-w-md px-4 pt-4">
        <header className="flex items-center justify-between py-3">
          <Link href="/dashboard" className="flex items-center gap-2">
            <BrandMark size="sm" />
            <span>
              <span className="block text-lg font-semibold leading-5">Ascend</span>
              <span className="text-xs text-zinc-400">{coachingLabel(coachingMode)}</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link href="/coach" className="ascend-pressable grid h-10 w-10 place-items-center rounded-lg border border-line bg-surface text-purple-200" aria-label="Open Coach Zoe">
              <Sparkles size={18} />
            </Link>
          </div>
        </header>

        {status ? <p className="mt-3 overflow-hidden break-words rounded-lg border border-line bg-surface p-3 text-sm text-zinc-300">{status}</p> : null}

        <AccountBar email={user?.email} fullName={user?.full_name} roles={safeRoles} plan={plan} profilePhotoUrl={user?.profile_photo_url} />

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
              <Link href="/profile/guide" className="ascend-pressable flex h-11 items-center justify-center rounded-lg bg-lime font-semibold text-ink">
                Choose next goal
              </Link>
            </div>
          </section>
        ) : null}

        <section className="ascend-today-hero ascend-soft-enter relative mt-2 overflow-hidden pb-4 pt-3 text-center">
          <p className="ascend-eyebrow">Today</p>
          <h1 className="mt-2 text-[1.65rem] font-semibold leading-tight text-white">{todayGreeting}, {firstName}.</h1>
          <TodayMomentumVisual score={score} label={isFirstDayState ? "Begins with your first check-in" : scoreLabel} isStarting={isFirstDayState} />
          <Link href="/momentum-score" className="ascend-pressable mx-auto -mt-4 mb-2 inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-purple-200">
            <CircleHelp size={14} /> 7-day consistency score
          </Link>
          <p className="mx-auto max-w-[20rem] text-[11px] font-bold uppercase tracking-[0.18em] text-calm">Today&apos;s focus</p>
          <h2 className="mx-auto mt-2 max-w-[21rem] text-2xl font-semibold leading-8 text-white">{todayPriority.hero}</h2>
          <p className="mx-auto mt-2 max-w-[20rem] text-sm leading-6 text-zinc-400">{heroSupportingCopy}</p>
          <Link href={primaryAction.href} className="ascend-pressable ascend-cta-pulse mx-auto mt-5 flex h-14 max-w-[21rem] items-center justify-center gap-2 rounded-2xl bg-lime text-base font-semibold text-ink shadow-[0_18px_45px_rgba(61,230,209,0.22)]">
            {primaryAction.label} <ArrowRight size={18} />
          </Link>
        </section>

        {shouldShowProfileReminder ? (
          <Link href="/onboarding?profile=1" className="ascend-pressable ascend-today-profile-reminder mt-2 flex min-h-16 items-center gap-3 rounded-2xl border border-calm/25 bg-calm/[0.06] px-4 py-3 shadow-soft">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-calm/12 text-calm">
              <UserRound size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-white">Make coaching more personal</span>
              <span className="mt-0.5 block text-xs leading-5 text-zinc-500">Finish your profile when you&apos;re ready.</span>
            </span>
            <ArrowRight className="shrink-0 text-calm" size={17} />
          </Link>
        ) : null}

        <section className="ascend-today-path ascend-card-rise py-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="ascend-eyebrow">Your day</p>
              <h2 className="mt-1 text-lg font-semibold text-white">
                {completedMomentumSignals ? "Your rhythm today" : "Start with one"}
              </h2>
            </div>
            <p className="text-sm font-semibold text-calm">{completedMomentumSignals} of {activeMomentumSignals.length} essentials</p>
          </div>
          <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/5" aria-hidden="true">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#a484ff,#35f2d0,#a3ff46)] transition-[width] duration-700"
              style={{ width: `${momentumSignalProgress}%` }}
            />
          </div>
          <nav className="mt-4 grid grid-cols-4 gap-2" aria-label="Today activity shortcuts">
            {momentumSignals.map((item) => {
              const Icon = item.icon;
              const isPriority = priorityMomentumLabel === item.label;
              const content = (
                <>
                  <SignalProgressRing progress={item.progress} done={item.done} priority={isPriority}>
                    {item.done ? <Check size={17} strokeWidth={2.5} /> : <Icon size={17} />}
                  </SignalProgressRing>
                  <span className={`truncate text-xs font-semibold ${isPriority ? "text-calm" : item.done ? "text-zinc-200" : "text-zinc-400"}`}>{item.label}</span>
                  <span className={`max-w-full text-[11px] font-medium leading-4 ${item.done ? "text-calm" : "text-zinc-500"}`}>{item.summary}</span>
                  <span className="line-clamp-2 min-h-8 max-w-[5.25rem] text-[10px] leading-4 text-zinc-500">{item.detail}</span>
                </>
              );
              return item.href ? (
                <Link key={item.label} href={item.href} className="ascend-pressable ascend-today-signal group flex min-w-0 flex-col items-center gap-1 text-center" aria-label={`${item.label}: ${item.summary}. ${item.detail}`}>
                  {content}
                </Link>
              ) : (
                <button key={item.label} type="button" onClick={() => { setLogMenuContext("recovery"); setLogMenuOpen(true); }} className="ascend-pressable ascend-today-signal group flex min-w-0 flex-col items-center gap-1 text-center" aria-label={`${item.label}: ${item.summary}. Open recovery options.`}>
                  {content}
                </button>
              );
            })}
          </nav>
          <button
            type="button"
            onClick={() => { setLogMenuContext("all"); setLogMenuOpen((current) => !current); }}
            aria-expanded={logMenuOpen}
            className="ascend-pressable ascend-today-secondary-action mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/20 text-sm font-semibold text-zinc-300 hover:border-calm/40 hover:text-calm"
          >
            <Plus size={16} className={`transition-transform duration-200 ${logMenuOpen ? "rotate-45" : ""}`} />
            Log something else
          </button>
          <div aria-hidden={!logMenuOpen} className={`grid overflow-hidden transition-[grid-template-rows,opacity,margin] duration-300 ${logMenuOpen ? "visible mt-3 grid-rows-[1fr] opacity-100" : "invisible mt-0 grid-rows-[0fr] opacity-0"}`}>
            <div className="min-h-0">
              <div className="ascend-today-log-menu rounded-2xl border border-white/[0.07] bg-black/20 p-3">
                {logMenuContext === "recovery" ? (
                  <div className="mb-3 flex items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
                    <div>
                      <p className="text-xs font-semibold text-white">Recovery check-in</p>
                      <p className="mt-0.5 text-[11px] text-zinc-500">Add water or note how you slept.</p>
                    </div>
                    <Link href="/water-log" className="ascend-pressable inline-flex min-h-10 items-center gap-1.5 rounded-full border border-calm/25 bg-calm/8 px-3 text-xs font-semibold text-calm">
                      <Droplets size={14} /> Water
                    </Link>
                  </div>
                ) : null}
                {logMenuContext === "all" ? <div className="grid grid-cols-3 gap-1.5">
                  {optionalLogActions.map((action) => {
                    const Icon = action.icon;
                    return (
                      <Link key={action.label} href={action.href} className="ascend-pressable ascend-today-log-option flex min-h-16 min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl border border-white/[0.06] bg-white/[0.025] px-1 text-center text-[10px] font-semibold text-zinc-300 hover:border-calm/40 hover:text-calm">
                        <Icon size={16} />
                        <span className="w-full truncate">{action.label}</span>
                      </Link>
                    );
                  })}
                </div> : null}
                {!sleepQuality ? (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
                    <div>
                      <p className="text-xs font-semibold text-white">Optional recovery check-in</p>
                      <p className="mt-0.5 text-[10px] text-zinc-500">How did you sleep?</p>
                    </div>
                    <div className="flex gap-1.5">
                      {(["poor", "okay", "good"] as const).map((quality) => (
                        <button key={quality} type="button" disabled={savingSleep} onClick={() => void recordSleepQuality(quality)} className="min-h-9 rounded-full border border-white/10 px-2.5 text-[10px] font-semibold capitalize text-zinc-200 hover:border-calm/50 hover:text-calm disabled:opacity-50">
                          {quality}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 border-t border-white/[0.06] pt-3 text-center text-[11px] text-zinc-500">Sleep recorded as {sleepQuality}.</p>
                )}
              </div>
            </div>
          </div>
        </section>

            <CollapsibleSection
              title="Today's Numbers"
              icon={<Zap size={17} />}
              tone="teal"
              preview={hasTodaysNumbers ? "Your day, at a glance" : "Numbers appear as you check in"}
              previewVisual={hasTodaysNumbers ? (
                <div className="grid grid-cols-3 gap-2" aria-hidden="true">
                  {[
                    { label: "Fuel", value: calorieProgress, color: "bg-amber" },
                    { label: "Protein", value: proteinProgress, color: "bg-purple-400" },
                    { label: "Water", value: waterProgress, color: "bg-calm" }
                  ].map((signal) => (
                    <span key={signal.label} className="min-w-0">
                      <span className="flex items-center justify-between gap-1 text-[10px] font-semibold text-zinc-400">
                        <span>{signal.label}</span><span>{signal.value}%</span>
                      </span>
                      <span className="mt-1 block h-1 overflow-hidden rounded-full bg-white/[0.06]">
                        <span className={`block h-full rounded-full ${signal.color}`} style={{ width: `${signal.value}%` }} />
                      </span>
                    </span>
                  ))}
                </div>
              ) : undefined}
              isOpen={openSections.todaysNumbers}
              onToggle={() => setSectionOpen("todaysNumbers", !openSections.todaysNumbers)}
            >
              {hasTodaysNumbers ? (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {[
                    {
                      key: "calories",
                      label: "Calories",
                      value: calories.toLocaleString(),
                      target: `${calorieTarget.toLocaleString()} kcal guide`,
                      progress: calorieProgress
                    },
                    {
                      key: "protein",
                      label: "Protein",
                      value: `${protein}g`,
                      target: `${proteinTarget}g guide`,
                      progress: proteinProgress
                    },
                    {
                      key: "water",
                      label: "Water",
                      value: `${(todaysWaterMl / 1000).toFixed(1)}L`,
                      target: `${(nutritionTargets.waterTargetMl / 1000).toFixed(1)}L guide`,
                      progress: waterProgress
                    },
                    {
                      key: "weight",
                      label: "Weight",
                      value: currentWeight ? `${currentWeight.toFixed(1)}kg` : "No check-in yet",
                      target: currentWeight ? weightTrend(latestWeight, previousWeight) : "Optional today",
                      progress: null
                    },
                    {
                      key: "momentum",
                      label: "Momentum",
                      value: scoreLabel,
                      target: `${score}/100 today`,
                      progress: score
                    }
                  ].map((item) => (
                    <div key={item.key} className={`ascend-inset relative overflow-hidden px-3.5 py-3.5 ${item.key === "momentum" ? "col-span-2 sm:col-span-1" : ""}`}>
                      <div className="flex items-start justify-between gap-2">
                        <span className={`grid h-8 w-8 place-items-center rounded-xl ${snapshotTone[item.key as keyof typeof snapshotTone].icon}`}>
                          {(() => {
                            const Icon = snapshotIcon(item.label);
                            return <Icon size={15} />;
                          })()}
                        </span>
                        {item.progress !== null ? <span className="text-[11px] font-semibold text-zinc-500">{item.progress}%</span> : null}
                      </div>
                      <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">{item.label}</p>
                      <p className={`mt-1 font-semibold leading-6 text-white ${item.key === "momentum" || (item.key === "weight" && !currentWeight) ? "text-base" : "text-xl"}`}>{item.value}</p>
                      <p className="mt-0.5 text-[11px] text-zinc-500">{item.target}</p>
                      {item.progress !== null ? (
                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface">
                          <div
                            className={`h-full rounded-full transition-[width] duration-700 ${snapshotTone[item.key as keyof typeof snapshotTone].bar} ${snapshotTone[item.key as keyof typeof snapshotTone].glow}`}
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>
                      ) : (
                        <div className="mt-3 flex h-1.5 gap-1" aria-hidden="true"><span className="w-2/5 rounded-full bg-sky-300/70" /><span className="w-1/5 rounded-full bg-sky-300/30" /><span className="flex-1 rounded-full bg-surface" /></div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-line bg-ink px-4 py-4">
                  <p className="text-sm leading-6 text-zinc-400">
                    We&apos;ll start building your daily numbers as you log meals, workouts and progress.
                  </p>
                </div>
              )}
            </CollapsibleSection>

            <section className="ascend-stagger-enter ascend-branded-surface ascend-today-coach my-5 overflow-hidden rounded-2xl border border-purple-400/25 bg-[linear-gradient(145deg,rgba(139,92,246,0.13),rgba(18,23,33,0.92)_52%,rgba(53,242,208,0.05))] p-5 shadow-[0_18px_42px_rgba(0,0,0,0.22),0_0_30px_rgba(139,92,246,0.08)]" style={{ animationDelay: "90ms" }}>
              <div className="flex items-start gap-3">
                {user?.assigned_trainer_id ? (
                  <span className="mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-full bg-purple-400/12 text-purple-200"><Sparkles size={18} /></span>
                ) : <ZoeAvatar className="mt-0.5" />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-white">{coachCardTitle}</p>
                    <span className="h-1 w-1 rounded-full bg-purple-300" />
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-purple-200">Noticed today</p>
                  </div>
                  <p className="mt-3 text-lg font-semibold leading-7 text-white">{coachCardSnippet}</p>
                  <p className="mt-1 text-sm leading-6 text-zinc-500">{coachCardDetail}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {user?.assigned_trainer_id ? (
                      <Link href="/messages" className="ascend-pressable inline-flex h-10 items-center gap-2 text-sm font-semibold text-purple-200">
                        View Coach Note <ArrowRight size={15} />
                      </Link>
                    ) : (
                      <Link href="/coach" className="ascend-pressable inline-flex h-10 items-center gap-2 text-sm font-semibold text-purple-200">
                        Talk to Zoe <ArrowRight size={15} />
                      </Link>
                    )}
                    {user?.athlete_mode_enabled ? (
                      <Link href="/athlete" className="ascend-pressable inline-flex h-10 items-center justify-center rounded-full border border-sky-400/20 bg-sky-400/5 px-4 text-sm font-semibold text-sky-100">
                        {athleteTodaySummary ?? "Athlete Mode"}
                      </Link>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>

            <section className="ascend-stagger-enter ascend-today-story border-t border-white/[0.07] py-6" style={{ animationDelay: "145ms" }}>
              <Link href="/journey" className="ascend-pressable flex items-center gap-3">
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${goalCompletedToday || weightLostFromStart >= 0.1 ? "bg-amber/12 text-amber" : "bg-calm/10 text-calm"}`}>
                  <Sparkles size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-[10px] font-bold uppercase tracking-[0.16em] ${goalCompletedToday || weightLostFromStart >= 0.1 ? "text-amber" : "text-calm"}`}>Your story</p>
                  <h2 className="mt-1 text-lg font-semibold leading-7 text-white">{progressPreview.title}</h2>
                  <p className="mt-1 line-clamp-2 text-sm leading-6 text-zinc-500">{progressPreview.detail}</p>
                </div>
                <ArrowRight className="shrink-0 text-zinc-500" size={18} />
              </Link>
            </section>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ink/95 px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur" aria-label="Primary navigation">
        <div className={`mx-auto grid max-w-md gap-1 ${navItems.length === 5 ? "grid-cols-5" : navItems.length === 1 ? "grid-cols-1" : navItems.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.selected ? "page" : undefined}
              className={`flex h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold transition-colors ${
                item.selected ? "bg-calm/12 text-calm" : "text-zinc-500 hover:text-zinc-200"
              }`}
            >
              <Icon size={18} strokeWidth={item.selected ? 2.4 : 2} />
              {item.label}
            </Link>
            );
          })}
        </div>
      </nav>
    </main>
  );
}

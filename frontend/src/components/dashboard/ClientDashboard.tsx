"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { calculateAdaptiveNutritionTargets, CoachingMode } from "@ascend/shared";
import {
  acknowledgeGoalMilestone,
  completeMission,
  getBurnLogs,
  getComplianceToday,
  getFoodLogs,
  getHabitLogs,
  getHabits,
  getLatestRecognition,
  getMe,
  getMyProgressComparison,
  getGoalStatus,
  getMyStreak,
  getMySubscription,
  getTodayMission,
  getWaterLogs,
  getWeightLogs
} from "@/lib/ascendApi";
import { AccountBar } from "@/components/AccountBar";
import { BrandMark } from "@/components/BrandMark";
import { localDateKey } from "@/lib/date";
import { usablePlan } from "@/lib/subscriptionPlan";
import { ProgressComparisonCard } from "@/components/ProgressComparisonCard";

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

function currentMealWindow(hour: number | null) {
  if (hour === null) return null;
  if (hour < 11) return "breakfast";
  if (hour < 15) return "lunch";
  if (hour < 22) return "dinner";
  return "snack";
}

function mealLabel(mealType: string | null) {
  if (mealType === "breakfast") return "breakfast";
  if (mealType === "lunch") return "lunch";
  if (mealType === "dinner") return "dinner";
  return "meal";
}

function formatWaterAction(remainingMl: number) {
  const rounded = Math.min(1000, Math.max(300, Math.ceil(remainingMl / 100) * 100));
  return `${rounded}ml water`;
}

function nextBestAction(input: {
  currentHour: number | null;
  todaysFood: FoodLog[];
  caloriesLeft: number;
  calorieOver: number;
  proteinLeft: number;
  waterLeftMl: number;
  completedHabits: number;
  totalHabits: number;
  todaysBurnCalories: number;
}) {
  const mealWindow = currentMealWindow(input.currentHour);
  const mealLogged = mealWindow
    ? input.todaysFood.some((log) => (log.meal_type ?? "").toLowerCase() === mealWindow)
    : false;

  if (mealWindow && !mealLogged && input.currentHour !== null && input.currentHour >= 6 && input.currentHour < 22) {
    const extras: string[] = [];
    if (input.waterLeftMl >= 500) extras.push(`drink ${formatWaterAction(input.waterLeftMl)}`);
    if (input.proteinLeft >= 25) extras.push("make it protein-focused");
    return {
      title: `Log ${mealLabel(mealWindow)}`,
      detail: extras.length ? `Next: ${`log ${mealLabel(mealWindow)}`} and ${extras[0]}.` : `Next: log ${mealLabel(mealWindow)}.`
    };
  }

  if (input.proteinLeft >= 30 && input.calorieOver <= 150) {
    return {
      title: "Add protein next",
      detail: "Next: choose a higher-protein meal or snack."
    };
  }

  if (input.waterLeftMl >= 500) {
    return {
      title: "Top up water",
      detail: `Next: drink ${formatWaterAction(input.waterLeftMl)}.`
    };
  }

  if (input.completedHabits < input.totalHabits && input.totalHabits > 0) {
    return {
      title: "Finish today's habits",
      detail: "Next: tick off the habit checks you still want to complete."
    };
  }

  if (!input.todaysBurnCalories && input.currentHour !== null && input.currentHour >= 16) {
    return {
      title: "Add a little movement",
      detail: "Next: log a short walk or workout."
    };
  }

  if (input.calorieOver > 150) {
    return {
      title: "Keep the next meal lighter",
      detail: "Next: focus on protein, fibre, and water."
    };
  }

  return {
    title: "Keep the momentum going",
    detail: "Next: one more small check-in keeps today moving well."
  };
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
  const [momentumScore, setMomentumScore] = useState<number | null>(null);
  const [momentumBreakdown, setMomentumBreakdown] = useState({
    food: 0,
    weight: 0,
    water: 0,
    habits: 0
  });
  const [roles, setRoles] = useState<string[]>([]);
  const [plan, setPlan] = useState<"free" | "premium" | "trainer_pro">("free");
  const [status, setStatus] = useState("Loading your Ascend profile...");
  const [missionStatus, setMissionStatus] = useState("");
  const [currentHour, setCurrentHour] = useState<number | null>(null);
  const lastDashboardLoadRef = useRef(0);
  const dashboardRequestRef = useRef(0);

  const loadDashboard = useCallback(async () => {
    const now = Date.now();
    if (now - lastDashboardLoadRef.current < 2500) return;
    lastDashboardLoadRef.current = now;
    const requestId = ++dashboardRequestRef.current;

    try {
      const [me, subscription] = await Promise.all([getMe(), getMySubscription()]);
      const [foods, weights, waters, nextHabits, nextHabitLogs, burns, compliance, mission, recognition, nextStreak, nextGoalStatus] = await Promise.allSettled([
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

      if (requestId !== dashboardRequestRef.current) return;

      setUser(me.user);
      setRoles(Array.isArray(me.roles) ? me.roles : []);
      setPlan(usablePlan(
        subscription.subscription.plan,
        subscription.subscription.status,
        subscription.subscription.current_period_end
      ));
      if (foods.status === "fulfilled") setFoodLogs(Array.isArray(foods.value.foodLogs) ? foods.value.foodLogs : []);
      if (weights.status === "fulfilled") setWeightLogs(Array.isArray(weights.value.weightLogs) ? weights.value.weightLogs : []);
      if (waters.status === "fulfilled") setWaterLogs(Array.isArray(waters.value.waterLogs) ? waters.value.waterLogs : []);
      if (nextHabits.status === "fulfilled") setHabits(Array.isArray(nextHabits.value.habits) ? nextHabits.value.habits : []);
      if (nextHabitLogs.status === "fulfilled") {
        setHabitLogs(Array.isArray(nextHabitLogs.value.habitLogs) ? nextHabitLogs.value.habitLogs : []);
      }
      if (burns.status === "fulfilled") setBurnLogs(Array.isArray(burns.value.burnLogs) ? burns.value.burnLogs : []);
      if (mission.status === "fulfilled") setDailyMission(mission.value.mission);
      if (recognition.status === "fulfilled") setLatestRecognition(recognition.value.recognition);
      if (nextStreak.status === "fulfilled") setStreak(nextStreak.value.streak);
      if (nextGoalStatus.status === "fulfilled") setGoalStatus(nextGoalStatus.value.goalStatus);
      if (compliance.status === "fulfilled") {
        const nextCompliance = compliance.value.compliance;
        setMomentumScore(nextCompliance?.score ?? null);
        setMomentumBreakdown({
          food: Number(nextCompliance?.food_score ?? 0),
          weight: Number(nextCompliance?.weight_score ?? 0),
          water: Number(nextCompliance?.water_score ?? 0),
          habits: Number(nextCompliance?.habit_score ?? 0)
        });
      }
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Log in again if this page does not load your profile.");
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    loadDashboard().catch(() => {
      if (isMounted) setStatus("Log in again if this page does not load your profile.");
    });

    return () => {
      isMounted = false;
    };
  }, [loadDashboard]);

  useEffect(() => {
    let isMounted = true;
    getMyProgressComparison()
      .then((response) => {
        if (isMounted) setProgressComparison(response.comparison);
      })
      .catch(() => undefined);
    return () => {
      isMounted = false;
    };
  }, []);

  async function markMissionDone() {
    if (!dailyMission || dailyMission.status === "completed") return;
    setMissionStatus("Saving mission...");

    try {
      const response = await completeMission(dailyMission.id);
      setDailyMission({ ...dailyMission, ...response.mission });
      setMissionStatus("Mission completed. Nice work.");
    } catch {
      setMissionStatus("Could not complete this mission yet. Please try again.");
    }
  }

  async function acknowledgeMilestone() {
    if (!goalStatus?.milestone_id) return;
    try {
      await acknowledgeGoalMilestone(goalStatus.milestone_id);
      setGoalStatus({ ...goalStatus, acknowledged_at: new Date().toISOString() });
    } catch {
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
    function syncClock() {
      setCurrentHour(new Date().getHours());
    }

    syncClock();
    const interval = window.setInterval(syncClock, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const today = useMemo(() => localDateKey(), []);
  const weekKeys = useMemo(() => lastSevenDateKeys(), []);
  const todaysFood = foodLogs.filter((log) => localDateKey(log.logged_at) === today);
  const todaysWaterMl = waterLogs.filter((log) => localDateKey(log.logged_at) === today).reduce((total, log) => total + Number(log.amount_ml ?? 0), 0);
  const todaysBurnCalories = burnLogs
    .filter((log) => localDateKey(log.created_at) === today)
    .reduce((total, log) => total + Number(log.metadata?.caloriesBurned ?? 0), 0);
  const latestFood = foodLogs[0];
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
  const calories = todaysFood.reduce((total, log) => total + Number(log.calories), 0);
  const protein = Math.round(todaysFood.reduce((total, log) => total + asNumber(log.protein_g), 0));
  const carbs = Math.round(todaysFood.reduce((total, log) => total + asNumber(log.carbs_g), 0));
  const fat = Math.round(todaysFood.reduce((total, log) => total + asNumber(log.fat_g), 0));
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
        : "moderate"
  }, weightLogs.map((log) => ({ weightKg: log.weight_kg, loggedAt: log.logged_at })));
  const calorieTarget = nutritionTargets.calorieTarget;
  const proteinTarget = nutritionTargets.proteinTargetG;
  const carbsTarget = nutritionTargets.carbsTargetG;
  const fatTarget = nutritionTargets.fatTargetG;
  const caloriesLeft = Math.max(calorieTarget - calories, 0);
  const calorieOver = Math.max(calories - calorieTarget, 0);
  const proteinLeft = Math.max(proteinTarget - protein, 0);
  const waterLeftMl = Math.max(nutritionTargets.waterTargetMl - todaysWaterMl, 0);
  const calorieProgress = clamp(Math.round((calories / calorieTarget) * 100));
  const proteinProgress = clamp(Math.round((protein / proteinTarget) * 100));
  const needsGuideProfile = !user?.age_years || !user?.height_cm || !user?.activity_level || !user?.gender;
  const fallbackScore = Math.min(100, 35 + (todaysFood.length ? 25 : 0) + (latestWeight ? 20 : 0) + (todaysWaterMl >= 1500 ? 20 : 0));
  const score = momentumScore ?? fallbackScore;
  const scoreLabel = score >= 80 ? "Strong momentum" : score >= 60 ? "Building momentum" : "Start with one check-in";
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
  const nextAction = nextBestAction({
    currentHour,
    todaysFood,
    caloriesLeft,
    calorieOver,
    proteinLeft,
    waterLeftMl,
    completedHabits: completedHabitIds.size,
    totalHabits: habits.length,
    todaysBurnCalories
  });

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
          <a href="/coach" className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-surface" aria-label="Open coach">
            AI
          </a>
        </header>

        {status ? <p className="mt-3 rounded-lg border border-line bg-surface p-3 text-sm text-zinc-300">{status}</p> : null}

        <AccountBar email={user?.email} fullName={user?.full_name} roles={safeRoles} plan={plan} />

        {goalStatus?.milestone_id && !goalStatus.acknowledged_at ? (
          <section className="mt-3 rounded-lg border border-lime bg-lime/15 p-4 text-center">
            <p className="text-sm font-semibold uppercase text-lime">Goal achieved</p>
            <h1 className="mt-2 text-3xl font-semibold">You reached {Number(goalStatus.milestone_target_weight_kg).toFixed(1)}kg!</h1>
            <p className="mt-2 text-sm leading-6 text-zinc-200">
              This milestone came from consistent work. Celebrate it, then choose whether to maintain your result or begin a new journey.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={acknowledgeMilestone} className="h-11 rounded-lg border border-lime/50 bg-ink font-semibold text-lime">
                Celebrate
              </button>
              <a href="/profile/guide" className="flex h-11 items-center justify-center rounded-lg bg-lime font-semibold text-ink">
                Choose next goal
              </a>
            </div>
          </section>
        ) : null}

        <section className="mt-3 rounded-lg border border-line bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-calm">Today&apos;s target</p>
              <h1 className="mt-1 text-2xl font-semibold">{nextAction.title}</h1>
              <p className="mt-2 text-sm leading-6 text-zinc-300">{nextAction.detail}</p>
            </div>
            <span className="rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-lime">
              {calorieOver > 0 ? `${calorieOver.toLocaleString()} over` : `${caloriesLeft.toLocaleString()} left`}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-ink p-3">
              <p className="text-xs text-zinc-400">Calories</p>
              <p className="mt-1 text-lg font-semibold">{calorieOver > 0 ? `${calorieOver.toLocaleString()} over` : `${caloriesLeft.toLocaleString()} left`}</p>
            </div>
            <div className="rounded-lg bg-ink p-3">
              <p className="text-xs text-zinc-400">Protein</p>
              <p className="mt-1 text-lg font-semibold">{Math.round(proteinLeft)}g left</p>
            </div>
            <div className="rounded-lg bg-ink p-3">
              <p className="text-xs text-zinc-400">Water</p>
              <p className="mt-1 text-lg font-semibold">{(waterLeftMl / 1000).toFixed(1)}L left</p>
            </div>
          </div>
        </section>

        <section className="mt-3 rounded-lg border border-lime/40 bg-lime/10 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-zinc-300">{formatGoal(user?.goal_type)}</p>
              <h2 className="mt-1 text-2xl font-semibold">Quick actions</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-300">Log one thing now to keep today moving.</p>
            </div>
            <a href="/food-log" className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-lime text-xl font-bold text-ink" aria-label="Add food">
              +
            </a>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {[
              { href: quickLogHref("Food"), title: "Food photo", detail: hasPremiumAccess ? "AI estimate" : "Log meal" },
              { href: quickLogHref("Weight"), title: "Weight", detail: "Scale check-in" },
              { href: quickLogHref("Water"), title: "Water", detail: "Add drinks" },
              { href: quickLogHref("Burn"), title: "Activity", detail: "Estimate burn" }
            ].map((item) => (
              <a key={item.title} href={item.href} className="grid min-h-24 rounded-lg border border-line bg-ink p-3">
                <span>
                  <span className="block text-base font-semibold text-white">{item.title}</span>
                  <span className="mt-1 block text-sm text-zinc-400">{item.detail}</span>
                </span>
              </a>
            ))}
          </div>
        </section>

        <section className="mt-4 rounded-lg border border-calm/40 bg-calm/10 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-calm">Today&apos;s mission</p>
              <p className="mt-2 text-sm leading-6 text-zinc-300">
                {dailyMission
                  ? dailyMission.title
                  : user?.assigned_trainer_name
                    ? "No trainer mission today. Focus on one quick action above."
                    : "Your trainer can add a simple daily mission after assignment."}
              </p>
              {dailyMission?.trainer_name ? <p className="mt-2 text-xs text-zinc-500">From {dailyMission.trainer_name}</p> : null}
            </div>
            <span className={`rounded px-3 py-1 text-xs ${dailyMission?.status === "completed" ? "bg-lime text-ink" : "bg-ink text-zinc-300"}`}>
              {dailyMission?.status === "completed" ? "Done" : "Open"}
            </span>
          </div>
          {dailyMission && dailyMission.status !== "completed" ? (
            <button type="button" onClick={markMissionDone} className="mt-4 h-11 w-full rounded-lg bg-lime font-semibold text-ink">
              Mark mission done
            </button>
          ) : null}
          {missionStatus ? <p className="mt-3 text-sm text-zinc-300">{missionStatus}</p> : null}
        </section>

        {latestRecognition ? (
          <section className="mt-4 rounded-lg border border-lime/40 bg-lime/10 p-4">
            <p className="text-sm font-semibold text-lime">Trainer noticed</p>
            <p className="mt-2 text-sm leading-6 text-zinc-200">{latestRecognition.message}</p>
            {latestRecognition.trainer_name ? <p className="mt-2 text-xs text-zinc-500">From {latestRecognition.trainer_name}</p> : null}
          </section>
        ) : null}

        {coachingMode === "ai_coach" && !hasPremiumAccess ? (
          <section className="mt-4 rounded-lg border border-calm/40 bg-calm/10 p-4">
            <p className="text-sm font-semibold text-calm">AI Coach selected</p>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              Free tracking is active now. Premium unlocks AI coach chat, weekly reports, progress photos, and AI food guidance.
            </p>
            <a href="/subscription" className="mt-3 flex h-11 items-center justify-center rounded-lg bg-lime font-semibold text-ink">
              Unlock AI Coach
            </a>
          </section>
        ) : null}

        {coachingMode === "human_coach" && !user?.assigned_trainer_name ? (
          <section className="mt-4 rounded-lg border border-lime/40 bg-lime/10 p-4">
            <p className="text-sm font-semibold text-lime">Human Coach selected</p>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              Your account is ready for trainer accountability. Use a trainer referral code during signup or ask the gym owner to assign a trainer.
            </p>
          </section>
        ) : null}

        <section className="mt-4 rounded-lg border border-lime/40 bg-lime/10 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-lime">Consistency streak</p>
              <h2 className="mt-1 text-xl font-semibold">{streakTitle}</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-300">{streakCopy}</p>
            </div>
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full border-2 border-lime bg-ink text-center">
              <span>
                <span className="block text-2xl font-semibold">{currentStreak}</span>
                <span className="block text-[10px] text-zinc-400">days</span>
              </span>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-ink p-3">
              <p className="text-xs text-zinc-400">This week</p>
              <p className="mt-1 text-lg font-semibold">{streak?.activeDaysThisWeek ?? weeklyCheckInDays.size}/7 days</p>
            </div>
            <div className="rounded-lg bg-ink p-3">
              <p className="text-xs text-zinc-400">Best streak</p>
              <p className="mt-1 text-lg font-semibold">{streak?.best ?? currentStreak} days</p>
            </div>
          </div>
        </section>

        <section className="mt-4 rounded-lg border border-line bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Weekly goal progress</p>
              <p className="mt-1 text-sm leading-6 text-zinc-400">
                {goalProgress === null
                  ? "Add weight logs to see progress toward your goal."
                  : `${goalProgress}% ${progressCopy(user?.goal_type)}.`}
              </p>
            </div>
            <span className="rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-lime">
              {goalProgress === null ? "--" : `${goalProgress}%`}
            </span>
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-ink">
            <div className="h-full rounded-full bg-lime" style={{ width: `${goalProgress ?? 8}%` }} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-ink p-3">
              <p className="text-xs text-zinc-400">Current weight</p>
              <p className="mt-1 text-lg font-semibold">{currentWeight ? `${currentWeight.toFixed(1)}kg` : "--"}</p>
            </div>
            <div className="rounded-lg bg-ink p-3">
              <p className="text-xs text-zinc-400">To goal</p>
              <p className="mt-1 text-lg font-semibold">{remainingWeight === null ? "--" : `${remainingWeight.toFixed(1)}kg`}</p>
            </div>
          </div>
          <a href="/profile/guide" className="mt-3 block text-center text-sm font-semibold text-lime">Change goal or target</a>
        </section>

        {progressComparison ? (
          <div className="mt-4">
            <ProgressComparisonCard comparison={progressComparison} />
          </div>
        ) : null}

        {needsGuideProfile ? (
          <section className="mt-4 rounded-lg border border-calm/40 bg-calm/10 p-4">
            <p className="text-sm font-semibold text-calm">Make your daily guide more accurate</p>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              Add age, height, and activity level so Ascend can make your daily targets more personal.
            </p>
            <a href="/profile/guide" className="mt-3 flex h-11 items-center justify-center rounded-lg bg-lime font-semibold text-ink">
              Improve my daily guide
            </a>
          </section>
        ) : null}

        <section className="mt-4 rounded-lg border border-line bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Momentum Score</p>
              <p className="mt-1 text-sm text-zinc-400">{scoreLabel}</p>
            </div>
            <a href="/momentum-score" className="text-sm font-medium text-lime">
              Explain
            </a>
          </div>
          <div className="mt-4 flex items-center gap-4">
            <div className="grid h-24 w-24 shrink-0 place-items-center rounded-full border-4 border-lime">
              <div className="text-center">
                <p className="text-3xl font-semibold">{score}</p>
                <p className="text-xs text-zinc-400">today</p>
              </div>
            </div>
            <div className="grid flex-1 grid-cols-2 gap-2">
              <div className="rounded-lg bg-ink p-3">
                <p className="text-xs text-zinc-400">Check-in days</p>
                <p className="mt-1 text-lg font-semibold">{weeklyCheckInDays.size}/7</p>
              </div>
              <div className="rounded-lg bg-ink p-3">
                <p className="text-xs text-zinc-400">Food days</p>
                <p className="mt-1 text-lg font-semibold">{foodConsistency}/7</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-4 rounded-lg border border-line bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Today&apos;s nutrition guide</h2>
              <p className="mt-1 text-sm leading-6 text-zinc-400">
                {nutritionTargets.explanation} {nutritionTargets.adaptationReason ?? (nutritionTargets.estimated ? "Complete your profile later for a sharper estimate." : "Use this as direction, not a strict rule.")}
              </p>
            </div>
            <span className="rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-lime">{calorieTarget.toLocaleString()} kcal</span>
          </div>
          <a href="/profile/guide" className="mt-4 flex h-11 items-center justify-center rounded-lg border border-line bg-ink text-sm font-semibold text-lime">
            Review goal and daily guide
          </a>

          <div className="mt-4 space-y-4">
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-300">Calories</span>
                <span className="font-semibold">{calories.toLocaleString()} / {calorieTarget.toLocaleString()} kcal</span>
              </div>
              <div className="mt-2 h-3 overflow-hidden rounded-full bg-ink">
                <div className="h-full rounded-full bg-lime" style={{ width: `${calorieProgress}%` }} />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-300">Protein</span>
                <span className="font-semibold">{protein} / {proteinTarget}g</span>
              </div>
              <div className="mt-2 h-3 overflow-hidden rounded-full bg-ink">
                <div className="h-full rounded-full bg-calm" style={{ width: `${proteinProgress}%` }} />
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-ink p-4">
              <p className="text-xs uppercase text-zinc-400">Carbs</p>
              <p className="mt-2 text-2xl font-semibold text-white">{carbs}g</p>
              <p className="mt-1 text-sm text-zinc-400">of {carbsTarget}g guide</p>
            </div>
            <div className="rounded-lg bg-ink p-4">
              <p className="text-xs uppercase text-zinc-400">Fat</p>
              <p className="mt-2 text-2xl font-semibold text-white">{fat}g</p>
              <p className="mt-1 text-sm text-zinc-400">of {fatTarget}g guide</p>
            </div>
            <div className="rounded-lg bg-ink p-4">
              <p className="text-xs uppercase text-zinc-400">Water</p>
              <p className="mt-2 text-2xl font-semibold text-white">{(todaysWaterMl / 1000).toFixed(1)}L</p>
              <p className="mt-1 text-sm text-zinc-400">{(nutritionTargets.waterTargetMl / 1000).toFixed(1)}L daily guide</p>
            </div>
            <div className="rounded-lg bg-ink p-4">
              <p className="text-xs uppercase text-zinc-400">Activity</p>
              <p className="mt-2 text-2xl font-semibold text-white">{todaysBurnCalories} kcal</p>
              <p className="mt-1 text-sm text-zinc-400">{todaysBurnCalories ? "Movement logged" : "Add movement"}</p>
            </div>
          </div>
        </section>

        <section className="mt-4 rounded-lg border border-line bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Trainer connection</p>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                {user?.assigned_trainer_name
                  ? `Your trainer: ${user.assigned_trainer_name}`
                  : coachingMode === "human_coach"
                    ? "Human Coach selected. Your gym can assign a trainer when ready."
                    : coachingMode === "ai_coach"
                      ? "AI Coach is active. A trainer can still be assigned later."
                      : "Self-Coached mode. You can still connect with a trainer later."}
              </p>
            </div>
            <span className={`rounded px-3 py-1 text-xs ${user?.assigned_trainer_name ? "bg-lime text-ink" : "bg-surface text-zinc-300"}`}>
              {user?.assigned_trainer_name ? "Connected" : coachingLabel(coachingMode)}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
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
        </section>

        <section className="mt-4 rounded-lg border border-line bg-surface p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Habits</h2>
            <a href="/habits" className="text-sm font-medium text-lime">
              Open
            </a>
          </div>
          <div className="mt-3 space-y-2">
            {dashboardHabits.length ? (
              dashboardHabits.map((habit) => {
                const completed = completedHabitIds.has(habit.id);
                return (
                  <a key={habit.id} href="/habits" className="flex items-center justify-between rounded-lg bg-ink px-3 py-3">
                    <span className="text-sm">{habit.name}</span>
                    <span className={`grid h-6 w-6 place-items-center rounded ${completed ? "bg-lime text-ink" : "border border-line"}`}>
                      {completed ? "OK" : ""}
                    </span>
                  </a>
                );
              })
            ) : (
              <a href="/habits" className="block rounded-lg bg-ink px-3 py-3 text-sm text-zinc-400">
                Create your first habits
              </a>
            )}
          </div>
        </section>

        <a href="/food-log" className="mt-4 block rounded-lg border border-line bg-surface p-4">
          <p className="text-sm font-semibold">Latest food log</p>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            {latestFood
              ? `${latestFood.estimated_food_name}: ${latestFood.calories} kcal, ${Math.round(asNumber(latestFood.protein_g))}g protein.`
              : "Snap a food photo to estimate calories, protein, carbs, and fat."}
          </p>
        </a>

        <section className="mt-4 rounded-lg border border-line bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">What is driving your momentum</p>
              <p className="mt-1 text-sm text-zinc-400">A simple look at the habits behind today&apos;s score.</p>
            </div>
            <a href="/momentum-score" className="text-sm font-medium text-lime">
              Learn
            </a>
          </div>
          <div className="mt-4 grid grid-cols-4 gap-2">
            {[
              ["Food", momentumBreakdown.food, 35],
              ["Weight", momentumBreakdown.weight, 25],
              ["Water", momentumBreakdown.water, 20],
              ["Habits", momentumBreakdown.habits, 20]
            ].map(([label, value, max]) => (
              <div key={label} className="rounded-lg bg-ink p-2 text-center">
                <p className="text-xs text-zinc-400">{label}</p>
                <p className="mt-1 text-sm font-semibold text-white">
                  {value}/{max}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-ink p-3">
              <p className="text-xs text-zinc-400">Protein days</p>
              <p className="mt-1 text-lg font-semibold">{proteinConsistency}/7</p>
            </div>
            <div className="rounded-lg bg-ink p-3">
              <p className="text-xs text-zinc-400">Weight trend</p>
              <p className="mt-1 text-lg font-semibold">{weightTrend(latestWeight, previousWeight)}</p>
            </div>
          </div>
        </section>
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

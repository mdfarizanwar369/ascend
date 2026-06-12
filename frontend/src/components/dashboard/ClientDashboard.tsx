"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getBurnLogs,
  getComplianceToday,
  getFoodLogs,
  getHabitLogs,
  getHabits,
  getMe,
  getMySubscription,
  getWaterLogs,
  getWeightLogs
} from "@/lib/ascendApi";
import { AccountBar } from "@/components/AccountBar";
import { BrandMark } from "@/components/BrandMark";
import { localDateKey } from "@/lib/date";
import { usablePlan } from "@/lib/subscriptionPlan";

type DashboardUser = Awaited<ReturnType<typeof getMe>>["user"];
type FoodLog = Awaited<ReturnType<typeof getFoodLogs>>["foodLogs"][number];
type WeightLog = Awaited<ReturnType<typeof getWeightLogs>>["weightLogs"][number];
type WaterLog = Awaited<ReturnType<typeof getWaterLogs>>["waterLogs"][number];
type Habit = Awaited<ReturnType<typeof getHabits>>["habits"][number];
type HabitLog = Awaited<ReturnType<typeof getHabitLogs>>["habitLogs"][number];
type BurnLog = Awaited<ReturnType<typeof getBurnLogs>>["burnLogs"][number];

function formatGoal(goal?: string | null) {
  if (goal === "fat_loss") return "Fat loss";
  if (goal === "muscle_gain") return "Muscle gain";
  if (goal === "maintenance") return "Maintenance";
  return "Goal not set";
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

export function ClientDashboard() {
  const [user, setUser] = useState<DashboardUser | null>(null);
  const [foodLogs, setFoodLogs] = useState<FoodLog[]>([]);
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [waterLogs, setWaterLogs] = useState<WaterLog[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([]);
  const [burnLogs, setBurnLogs] = useState<BurnLog[]>([]);
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

  const loadDashboard = useCallback(async () => {
    try {
      const [me, subscription] = await Promise.all([getMe(), getMySubscription()]);
      const [foods, weights, waters, nextHabits, nextHabitLogs, burns, compliance] = await Promise.allSettled([
        getFoodLogs(),
        getWeightLogs(),
        getWaterLogs(),
        getHabits(),
        getHabitLogs(),
        getBurnLogs(),
        getComplianceToday()
      ]);

      setUser(me.user);
      setRoles(Array.isArray(me.roles) ? me.roles : []);
      setPlan(usablePlan(subscription.subscription.plan, subscription.subscription.status));
      if (foods.status === "fulfilled") setFoodLogs(Array.isArray(foods.value.foodLogs) ? foods.value.foodLogs : []);
      if (weights.status === "fulfilled") setWeightLogs(Array.isArray(weights.value.weightLogs) ? weights.value.weightLogs : []);
      if (waters.status === "fulfilled") setWaterLogs(Array.isArray(waters.value.waterLogs) ? waters.value.waterLogs : []);
      if (nextHabits.status === "fulfilled") setHabits(Array.isArray(nextHabits.value.habits) ? nextHabits.value.habits : []);
      if (nextHabitLogs.status === "fulfilled") {
        setHabitLogs(Array.isArray(nextHabitLogs.value.habitLogs) ? nextHabitLogs.value.habitLogs : []);
      }
      if (burns.status === "fulfilled") setBurnLogs(Array.isArray(burns.value.burnLogs) ? burns.value.burnLogs : []);
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
    function refreshDashboard() {
      loadDashboard().catch(() => setStatus("Log in again if this page does not load your profile."));
    }

    window.addEventListener("focus", refreshDashboard);
    window.addEventListener("pageshow", refreshDashboard);

    return () => {
      window.removeEventListener("focus", refreshDashboard);
      window.removeEventListener("pageshow", refreshDashboard);
    };
  }, [loadDashboard]);

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
  const proteinTarget = Math.round(clamp((currentWeight || startWeight || 70) * 1.6, 80, 180));
  const fallbackScore = Math.min(100, 35 + (todaysFood.length ? 25 : 0) + (latestWeight ? 20 : 0) + (todaysWaterMl >= 1500 ? 20 : 0));
  const score = momentumScore ?? fallbackScore;
  const scoreLabel = score >= 80 ? "Strong momentum" : score >= 60 ? "Building momentum" : "Start with one check-in";
  const safeRoles = Array.isArray(roles) ? roles : [];
  const canTrain = safeRoles.some((role) => ["trainer", "admin", "owner"].includes(role));
  const canAdmin = safeRoles.some((role) => ["admin", "owner"].includes(role));
  const hasPremiumAccess = plan === "premium" || plan === "trainer_pro" || canAdmin;

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

  const goalProgress = useMemo(() => {
    if (!startWeight || !targetWeight || !currentWeight || startWeight === targetWeight) return null;
    const totalChangeNeeded = Math.abs(startWeight - targetWeight);
    const progressChange =
      user?.goal_type === "muscle_gain"
        ? currentWeight - startWeight
        : user?.goal_type === "maintenance"
          ? Math.max(0, totalChangeNeeded - Math.abs(currentWeight - targetWeight))
          : startWeight - currentWeight;
    return clamp(Math.round((progressChange / totalChangeNeeded) * 100));
  }, [currentWeight, startWeight, targetWeight, user?.goal_type]);

  const remainingWeight = useMemo(() => {
    if (!targetWeight || !currentWeight) return null;
    return Math.abs(currentWeight - targetWeight);
  }, [currentWeight, targetWeight]);

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

  return (
    <main className="min-h-screen bg-ink pb-24 text-white">
      <div className="mx-auto min-h-screen w-full max-w-md px-4 pt-4">
        <header className="flex items-center justify-between py-3">
          <a href="/" className="flex items-center gap-2">
            <BrandMark size="sm" />
            <span>
              <span className="block text-lg font-semibold leading-5">Ascend</span>
              <span className="text-xs text-zinc-400">Daily check-in</span>
            </span>
          </a>
          <a href="/coach" className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-surface" aria-label="Open coach">
            AI
          </a>
        </header>

        {status ? <p className="mt-3 rounded-lg border border-line bg-surface p-3 text-sm text-zinc-300">{status}</p> : null}

        <AccountBar email={user?.email} fullName={user?.full_name} roles={safeRoles} plan={plan} />

        <section className="mt-3 rounded-lg border border-lime/40 bg-lime/10 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-zinc-300">{formatGoal(user?.goal_type)}</p>
              <h1 className="mt-1 text-2xl font-semibold">Quick actions</h1>
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
        </section>

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
          <h2 className="text-base font-semibold">Today&apos;s progress</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {[
              ["Calories", calories ? calories.toLocaleString() : "0", todaysFood.length ? `${todaysFood.length} meal${todaysFood.length === 1 ? "" : "s"} logged` : "Snap your first meal"],
              ["Protein", `${protein}g`, `${proteinTarget}g daily guide`],
              ["Water", `${(todaysWaterMl / 1000).toFixed(1)}L`, "2.5L daily guide"],
              ["Activity", `${todaysBurnCalories} kcal`, todaysBurnCalories ? "Movement logged" : "Add movement"]
            ].map(([label, value, detail]) => (
              <div key={label} className="rounded-lg bg-ink p-4">
                <p className="text-xs uppercase text-zinc-400">{label}</p>
                <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
                <p className="mt-1 text-sm text-zinc-400">{detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-4 rounded-lg border border-line bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Trainer connection</p>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                {user?.assigned_trainer_name ? `Your trainer: ${user.assigned_trainer_name}` : "You will see your trainer here after assignment."}
              </p>
            </div>
            <span className={`rounded px-3 py-1 text-xs ${user?.assigned_trainer_name ? "bg-lime text-ink" : "bg-amber text-ink"}`}>
              {user?.assigned_trainer_name ? "Connected" : "Pending"}
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
              <p className="text-sm font-semibold">Momentum breakdown</p>
              <p className="mt-1 text-sm text-zinc-400">Useful for you and your trainer when you want more detail.</p>
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

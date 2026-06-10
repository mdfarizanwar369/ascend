"use client";

import { useEffect, useMemo, useState } from "react";
import { getComplianceToday, getFoodLogs, getHabitLogs, getHabits, getMe, getWaterLogs, getWeightLogs } from "@/lib/ascendApi";

type DashboardUser = Awaited<ReturnType<typeof getMe>>["user"];
type FoodLog = Awaited<ReturnType<typeof getFoodLogs>>["foodLogs"][number];
type WeightLog = Awaited<ReturnType<typeof getWeightLogs>>["weightLogs"][number];
type WaterLog = Awaited<ReturnType<typeof getWaterLogs>>["waterLogs"][number];
type Habit = Awaited<ReturnType<typeof getHabits>>["habits"][number];
type HabitLog = Awaited<ReturnType<typeof getHabitLogs>>["habitLogs"][number];

function firstName(fullName?: string) {
  return fullName?.trim().split(/\s+/)[0] || "there";
}

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
  return "/dashboard";
}

export function ClientDashboard() {
  const [user, setUser] = useState<DashboardUser | null>(null);
  const [foodLogs, setFoodLogs] = useState<FoodLog[]>([]);
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [waterLogs, setWaterLogs] = useState<WaterLog[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([]);
  const [complianceScore, setComplianceScore] = useState<number | null>(null);
  const [status, setStatus] = useState("Loading your Ascend profile...");

  useEffect(() => {
    let isMounted = true;

    async function loadDashboard() {
      try {
        const [me, foods, weights, waters, nextHabits, nextHabitLogs, compliance] = await Promise.all([
          getMe(),
          getFoodLogs(),
          getWeightLogs(),
          getWaterLogs(),
          getHabits(),
          getHabitLogs(),
          getComplianceToday()
        ]);

        if (!isMounted) return;
        setUser(me.user);
        setFoodLogs(foods.foodLogs);
        setWeightLogs(weights.weightLogs);
        setWaterLogs(waters.waterLogs);
        setHabits(nextHabits.habits);
        setHabitLogs(nextHabitLogs.habitLogs);
        setComplianceScore(compliance.compliance?.score ?? null);
        setStatus("");
      } catch {
        if (isMounted) {
          setStatus("Log in again if this page does not load your profile.");
        }
      }
    }

    loadDashboard();
    return () => {
      isMounted = false;
    };
  }, []);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const todaysFood = foodLogs.filter((log) => log.logged_at.slice(0, 10) === today);
  const todaysWaterMl = waterLogs.filter((log) => log.logged_at.slice(0, 10) === today).reduce((total, log) => total + log.amount_ml, 0);
  const latestFood = foodLogs[0];
  const latestWeight = weightLogs[0];
  const completedHabitIds = useMemo(
    () =>
      new Set(
        habitLogs.filter((log) => log.completed && log.logged_at.slice(0, 10) === today).map((log) => log.habit_id)
      ),
    [habitLogs, today]
  );
  const dashboardHabits = habits.slice(0, 3);
  const calories = todaysFood.reduce((total, log) => total + Number(log.calories), 0);
  const protein = Math.round(todaysFood.reduce((total, log) => total + asNumber(log.protein_g), 0));
  const fallbackScore = Math.min(100, 35 + (todaysFood.length ? 25 : 0) + (latestWeight ? 20 : 0) + (todaysWaterMl >= 1500 ? 20 : 0));
  const score = complianceScore ?? fallbackScore;

  return (
    <main className="min-h-screen bg-ink pb-24 text-white">
      <div className="mx-auto min-h-screen w-full max-w-md px-4 pt-4">
        <header className="flex items-center justify-between py-3">
          <a href="/" className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-lime font-bold text-ink">A</span>
            <span>
              <span className="block text-lg font-semibold leading-5">Ascend</span>
              <span className="text-xs text-zinc-400">Client dashboard</span>
            </span>
          </a>
          <a href="/coach" className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-surface" aria-label="Open coach">
            AI
          </a>
        </header>

        {status ? <p className="mt-3 rounded-lg border border-line bg-surface p-3 text-sm text-zinc-300">{status}</p> : null}

        <section className="mt-3 rounded-lg border border-line bg-surface p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-zinc-400">{formatGoal(user?.goal_type)}</p>
              <h1 className="mt-1 text-2xl font-semibold">Stay on track, {firstName(user?.full_name)}</h1>
              <p className="mt-2 text-sm leading-6 text-zinc-400">Your profile and logs now come from PostgreSQL.</p>
            </div>
            <div className="grid h-28 w-28 shrink-0 place-items-center rounded-full border-4 border-lime">
              <div className="text-center">
                <p className="text-3xl font-semibold">{score}</p>
                <p className="text-xs text-zinc-400">score</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-4 grid grid-cols-2 gap-3">
          {[
            ["Calories", calories ? calories.toLocaleString() : "0", todaysFood.length ? `${todaysFood.length} food logs today` : "No food logged today"],
            ["Protein", `${protein}g`, todaysFood.length ? "From food logs" : "Log food to update"],
            ["Water", `${(todaysWaterMl / 1000).toFixed(1)}L`, "2.5L target"],
            [
              "Weight",
              latestWeight ? `${asNumber(latestWeight.weight_kg).toFixed(1)}kg` : `${asNumber(user?.starting_weight_kg).toFixed(1)}kg`,
              user?.target_weight_kg ? `${asNumber(user.target_weight_kg).toFixed(1)}kg target` : "Target not set"
            ]
          ].map(([label, value, detail]) => (
            <div key={label} className="rounded-lg border border-line bg-surface p-4">
              <p className="text-xs uppercase text-zinc-400">{label}</p>
              <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
              <p className="mt-1 text-sm text-zinc-400">{detail}</p>
            </div>
          ))}
        </section>

        <a href="/food-log" className="mt-4 block rounded-lg border border-line bg-surface p-4">
          <p className="text-sm font-semibold">Latest food log</p>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            {latestFood
              ? `${latestFood.estimated_food_name}: ${latestFood.calories} kcal, ${Math.round(asNumber(latestFood.protein_g))}g protein.`
              : "Log a food photo to estimate calories, protein, carbs, and fat."}
          </p>
        </a>

        <section className="mt-4 rounded-lg border border-line bg-surface p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Quick log</h2>
            <a href="/food-log" className="grid h-9 w-9 place-items-center rounded-lg bg-lime font-bold text-ink" aria-label="Add log">
              +
            </a>
          </div>
          <div className="mt-4 grid grid-cols-4 gap-2">
            {["Food", "Weight", "Water", "Burn"].map((item) => (
              <a key={item} href={quickLogHref(item)} className="grid h-20 place-items-center rounded-lg border border-line bg-ink text-xs text-zinc-300">
                {item}
              </a>
            ))}
          </div>
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

        <a href="/coach" className="mt-4 block rounded-lg border border-calm/40 bg-calm/10 p-4">
          <p className="text-sm font-medium text-calm">AI nutrition coach</p>
          <p className="mt-2 text-sm leading-6 text-zinc-300">Ask for a meal suggestion based on your goal and today's logs.</p>
        </a>
      </div>

      <nav className="fixed inset-x-0 bottom-0 border-t border-line bg-ink/95 px-4 pb-3 pt-2 backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-3 gap-2">
          <a href="/dashboard" className="flex h-14 flex-col items-center justify-center gap-1 rounded-lg bg-lime text-xs text-ink">
            Home
          </a>
          <a href="/trainer" className="flex h-14 flex-col items-center justify-center gap-1 rounded-lg text-xs text-zinc-400">
            Trainer
          </a>
          <a href="/admin" className="flex h-14 flex-col items-center justify-center gap-1 rounded-lg text-xs text-zinc-400">
            Admin
          </a>
        </div>
      </nav>
    </main>
  );
}

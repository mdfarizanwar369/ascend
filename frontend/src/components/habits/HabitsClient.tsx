"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ListChecks, Plus } from "lucide-react";
import { createHabit, getHabitLogs, getHabits, saveHabitLog } from "@/lib/ascendApi";
import { Field, inputClass } from "@/components/Field";
import { localDateKey } from "@/lib/date";
import { rememberDashboardRecord } from "@/lib/dataSync";
import { markInstallEligible } from "@/lib/installAscend";
import { TrackingHero, TrackingPageHeader, TrackingStatus } from "@/components/tracking/TrackingVisuals";

const starterHabits = ["8,000 steps", "No sugary drinks", "Protein at breakfast", "Sleep before midnight"];

type Habit = Awaited<ReturnType<typeof getHabits>>["habits"][number];
type HabitLog = Awaited<ReturnType<typeof getHabitLogs>>["habitLogs"][number];

export function HabitsClient() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([]);
  const [newHabit, setNewHabit] = useState("");
  const [status, setStatus] = useState("Loading habits...");
  const [isSaving, setIsSaving] = useState(false);
  const saveLockRef = useRef(false);

  async function loadHabits() {
    const [nextHabits, nextLogs] = await Promise.all([getHabits(), getHabitLogs()]);
    setHabits(nextHabits.habits);
    setHabitLogs(nextLogs.habitLogs);
    setStatus("");
  }

  useEffect(() => {
    loadHabits().catch(() => setStatus("Please log in again if habits do not load."));
  }, []);

  const completedToday = useMemo(() => {
    const today = localDateKey();
    return new Set(
      habitLogs.filter((log) => log.completed && localDateKey(log.logged_at) === today).map((log) => log.habit_id)
    );
  }, [habitLogs]);
  const completionProgress = habits.length ? Math.round((completedToday.size / habits.length) * 100) : 0;
  const weeklyRhythm = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      const dateKey = localDateKey(date);
      const completed = new Set(habitLogs.filter((log) => log.completed && localDateKey(log.logged_at) === dateKey).map((log) => log.habit_id)).size;
      return {
        dateKey,
        day: date.toLocaleDateString("en-MY", { weekday: "narrow" }),
        completed,
        progress: habits.length ? Math.round((completed / habits.length) * 100) : 0
      };
    });
  }, [habitLogs, habits.length]);

  async function createStarterHabits() {
    if (saveLockRef.current) return;
    saveLockRef.current = true;
    setIsSaving(true);
    setStatus("Creating starter habits...");

    try {
      const created = await Promise.all(starterHabits.map((name) => createHabit({ name, frequency: "daily" })));
      setHabits((current) => [
        ...created.map((response) => response.habit),
        ...current.filter((habit) => !created.some((response) => response.habit.id === habit.id))
      ]);
      loadHabits().catch(() => undefined);
      setStatus("Starter habits created.");
    } catch {
      setStatus("Could not create habits. Please try again.");
    } finally {
      saveLockRef.current = false;
      setIsSaving(false);
    }
  }

  async function addHabit() {
    if (!newHabit.trim()) return;
    if (saveLockRef.current) return;
    saveLockRef.current = true;

    setIsSaving(true);
    setStatus("Adding habit...");

    try {
      const created = await createHabit({ name: newHabit.trim(), frequency: "daily" });
      setHabits((current) => [created.habit, ...current.filter((habit) => habit.id !== created.habit.id)]);
      setNewHabit("");
      loadHabits().catch(() => undefined);
      setStatus("Habit added.");
    } catch {
      setStatus("Could not add habit. Please try again.");
    } finally {
      saveLockRef.current = false;
      setIsSaving(false);
    }
  }

  async function markComplete(habitId: string) {
    if (saveLockRef.current) return;
    saveLockRef.current = true;
    setIsSaving(true);
    setStatus("Saving habit...");

    try {
      const saved = await saveHabitLog({ habitId, completed: true });
      rememberDashboardRecord("habit", saved.habitLog);
      setHabitLogs((current) => [saved.habitLog, ...current]);
      setStatus("Habit saved for today.");
      markInstallEligible("first_action");
    } catch {
      setStatus("Could not save habit. Please make sure you are logged in.");
    } finally {
      saveLockRef.current = false;
      setIsSaving(false);
    }
  }

  return (
    <main className="ascend-page px-4 py-3 text-white sm:py-5">
      <div className="ascend-member-frame">
        <TrackingPageHeader eyebrow="Daily accountability" title="Habits" disabled={isSaving} />

        <TrackingHero
          icon={ListChecks}
          label="Today"
          value={habits.length ? `${completedToday.size} of ${habits.length}` : "One small start"}
          detail={habits.length ? "daily habits complete" : "Create a habit you can repeat"}
          progress={habits.length ? completionProgress : undefined}
          tone="purple"
        >
          {habits.length ? (
            <div className="mt-4 border-t border-white/10 pt-4">
              <div className="flex items-end justify-between gap-2" aria-label="Habit completion over the last seven days">
                {weeklyRhythm.map((day) => (
                  <div key={day.dateKey} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                    <span className="flex h-16 w-full items-end justify-center rounded-full bg-black/20 p-1">
                      <span className="w-full rounded-full bg-purple-300 transition-[height] duration-500" style={{ height: `${Math.max(8, day.progress)}%` }} />
                    </span>
                    <span className={`text-xs ${day.dateKey === localDateKey() ? "font-semibold text-white" : "text-zinc-500"}`}>{day.day}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-zinc-400">Your seven-day rhythm. Every completed habit strengthens the pattern.</p>
            </div>
          ) : null}
        </TrackingHero>

        <section className="ascend-surface mt-4 p-4">
          <Field label="Add a daily habit">
            <div className="flex gap-2">
              <input
                className={inputClass}
                value={newHabit}
                onChange={(event) => setNewHabit(event.target.value)}
                placeholder="Evening walk"
              />
              <button
                type="button"
                disabled={isSaving || !newHabit.trim()}
                onClick={addHabit}
                className="ascend-pressable grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-lime text-ink disabled:opacity-60"
                aria-label="Add habit"
              >
                <Plus size={20} />
              </button>
            </div>
          </Field>
        </section>

        {!habits.length ? (
          <section className="mt-4 rounded-xl border border-calm/40 bg-calm/10 p-4">
            <p className="text-sm leading-6 text-zinc-300">Create starter habits for beginner-friendly accountability.</p>
            <button
              type="button"
              disabled={isSaving}
              onClick={createStarterHabits}
              className="ascend-pressable mt-4 h-12 w-full rounded-xl bg-lime font-semibold text-ink disabled:opacity-60"
            >
              Create starter habits
            </button>
          </section>
        ) : null}

        <section className="mt-4 space-y-3">
          {habits.map((habit) => {
            const completed = completedToday.has(habit.id);
            return (
              <article key={habit.id} className={`ascend-pressable flex min-h-16 items-center justify-between rounded-xl border p-4 ${completed ? "border-lime/25 bg-lime/8" : "border-line bg-surface"}`}>
                <div>
                  <p className="font-medium">{habit.name}</p>
                  <p className="mt-1 text-xs text-zinc-400">Daily</p>
                </div>
                <button
                  type="button"
                  disabled={isSaving || completed}
                  onClick={() => markComplete(habit.id)}
                  className={`grid h-11 w-11 place-items-center rounded-xl ${
                    completed ? "bg-lime text-ink" : "border border-line text-zinc-300"
                  } disabled:cursor-not-allowed`}
                  aria-label={completed ? "Completed today" : "Mark complete"}
                >
                  {completed ? <Check size={19} /> : null}
                </button>
              </article>
            );
          })}
        </section>

        <TrackingStatus message={status} success={status.includes("created") || status.includes("added") || status.includes("saved")} />
      </div>
    </main>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Plus } from "lucide-react";
import { createHabit, getHabitLogs, getHabits, saveHabitLog } from "@/lib/ascendApi";
import { BackButton } from "@/components/BackButton";
import { Field, inputClass } from "@/components/Field";
import { localDateKey } from "@/lib/date";
import { rememberDashboardRecord } from "@/lib/dataSync";

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
    } catch {
      setStatus("Could not save habit. Please make sure you are logged in.");
    } finally {
      saveLockRef.current = false;
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-ink px-4 py-5 text-white">
      <div className="mx-auto max-w-md">
        <header className="flex items-center justify-between gap-4 py-3">
          <div className="flex items-center gap-3">
            <BackButton fallbackHref="/dashboard" disabled={isSaving} />
            <div>
              <p className="text-sm text-zinc-400">Daily accountability</p>
              <h1 className="text-2xl font-semibold">Habits</h1>
            </div>
          </div>
        </header>

        <section className="mt-4 rounded-lg border border-line bg-surface p-4">
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
                className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-lime text-ink disabled:opacity-60"
                aria-label="Add habit"
              >
                <Plus size={20} />
              </button>
            </div>
          </Field>
        </section>

        {!habits.length ? (
          <section className="mt-4 rounded-lg border border-calm/40 bg-calm/10 p-4">
            <p className="text-sm leading-6 text-zinc-300">Create starter habits for beginner-friendly accountability.</p>
            <button
              type="button"
              disabled={isSaving}
              onClick={createStarterHabits}
              className="mt-4 h-12 w-full rounded-lg bg-lime font-semibold text-ink disabled:opacity-60"
            >
              Create starter habits
            </button>
          </section>
        ) : null}

        <section className="mt-4 space-y-3">
          {habits.map((habit) => {
            const completed = completedToday.has(habit.id);
            return (
              <article key={habit.id} className="flex items-center justify-between rounded-lg border border-line bg-surface p-4">
                <div>
                  <p className="font-medium">{habit.name}</p>
                  <p className="mt-1 text-xs text-zinc-400">Daily</p>
                </div>
                <button
                  type="button"
                  disabled={isSaving || completed}
                  onClick={() => markComplete(habit.id)}
                  className={`grid h-10 w-10 place-items-center rounded-lg ${
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

        {status ? <p className="mt-4 rounded-lg border border-line bg-surface p-3 text-sm text-zinc-300">{status}</p> : null}
      </div>
    </main>
  );
}

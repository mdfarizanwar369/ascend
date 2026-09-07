"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ListChecks, Plus } from "lucide-react";
import { createHabit, getHabitLogs, getHabits, saveHabitLog } from "@/lib/ascendApi";
import { Field, inputClass } from "@/components/Field";
import { localDateKey } from "@/lib/date";
import { rememberDashboardRecord } from "@/lib/dataSync";
import { markInstallEligible } from "@/lib/installAscend";
import { TrackingHero, TrackingPageHeader, TrackingStatus } from "@/components/tracking/TrackingVisuals";
import { useI18n } from "@/lib/i18n/I18nProvider";

const starterHabitKeys = ["habits.starterSteps", "habits.starterNoSugaryDrinks", "habits.starterProteinBreakfast", "habits.starterSleepBeforeMidnight"];

type Habit = Awaited<ReturnType<typeof getHabits>>["habits"][number];
type HabitLog = Awaited<ReturnType<typeof getHabitLogs>>["habitLogs"][number];

export function HabitsClient() {
  const { t } = useI18n();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([]);
  const [newHabit, setNewHabit] = useState("");
  const [status, setStatus] = useState(() => t("habits.loading"));
  const [isSaving, setIsSaving] = useState(false);
  const saveLockRef = useRef(false);

  async function loadHabits() {
    const [nextHabits, nextLogs] = await Promise.all([getHabits(), getHabitLogs()]);
    setHabits(nextHabits.habits);
    setHabitLogs(nextLogs.habitLogs);
    setStatus("");
  }

  useEffect(() => {
    loadHabits().catch(() => setStatus(t("habits.loadError")));
  }, [t]);

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
        day: date.toLocaleDateString(undefined, { weekday: "narrow" }),
        completed,
        progress: habits.length ? Math.round((completed / habits.length) * 100) : 0
      };
    });
  }, [habitLogs, habits.length]);

  async function createStarterHabits() {
    if (saveLockRef.current) return;
    saveLockRef.current = true;
    setIsSaving(true);
    setStatus(t("habits.creatingStarters"));

    try {
      const created = await Promise.all(starterHabitKeys.map((key) => createHabit({ name: t(key), frequency: "daily" })));
      setHabits((current) => [
        ...created.map((response) => response.habit),
        ...current.filter((habit) => !created.some((response) => response.habit.id === habit.id))
      ]);
      loadHabits().catch(() => undefined);
      setStatus(t("habits.startersCreated"));
    } catch {
      setStatus(t("habits.createError"));
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
    setStatus(t("habits.adding"));

    try {
      const created = await createHabit({ name: newHabit.trim(), frequency: "daily" });
      setHabits((current) => [created.habit, ...current.filter((habit) => habit.id !== created.habit.id)]);
      setNewHabit("");
      loadHabits().catch(() => undefined);
      setStatus(t("habits.added"));
    } catch {
      setStatus(t("habits.addError"));
    } finally {
      saveLockRef.current = false;
      setIsSaving(false);
    }
  }

  async function markComplete(habitId: string) {
    if (saveLockRef.current) return;
    saveLockRef.current = true;
    setIsSaving(true);
    setStatus(t("habits.saving"));

    try {
      const saved = await saveHabitLog({ habitId, completed: true });
      rememberDashboardRecord("habit", saved.habitLog);
      setHabitLogs((current) => [saved.habitLog, ...current]);
      setStatus(t("habits.completeStatus", { completed: Math.min(completedToday.size + 1, habits.length), total: habits.length }));
      markInstallEligible("first_action");
    } catch {
      setStatus(t("habits.saveError"));
    } finally {
      saveLockRef.current = false;
      setIsSaving(false);
    }
  }

  return (
    <main className="ascend-page px-4 py-3 text-white sm:py-5">
      <div className="ascend-member-frame">
        <TrackingPageHeader eyebrow={t("habits.eyebrow")} title={t("habits.title")} disabled={isSaving} />

        <TrackingHero
          icon={ListChecks}
          label={t("habits.today")}
          value={habits.length ? t("habits.completedCount", { completed: completedToday.size, total: habits.length }) : t("habits.oneSmallStart")}
          detail={habits.length ? t("habits.dailyComplete") : t("habits.createRepeatable")}
          progress={habits.length ? completionProgress : undefined}
          tone="purple"
        >
          {habits.length ? (
            <div className="mt-4 border-t border-white/10 pt-4">
              <div className="flex items-end justify-between gap-2" role="img" aria-label={t("habits.weeklyAria", { completed: completedToday.size, total: habits.length })}>
                {weeklyRhythm.map((day) => (
                  <div key={day.dateKey} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                    <span className="flex h-16 w-full items-end justify-center rounded-full bg-black/20 p-1">
                      <span className="w-full rounded-full bg-purple-300 transition-[height] duration-500" style={{ height: `${Math.max(8, day.progress)}%` }} aria-hidden="true" />
                    </span>
                    <span className={`text-xs ${day.dateKey === localDateKey() ? "font-semibold text-white" : "text-zinc-500"}`}>{day.day}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-zinc-400">{t("habits.weeklyRhythm")}</p>
            </div>
          ) : null}
        </TrackingHero>

        <section className="ascend-surface mt-4 p-4">
          <Field label={t("habits.addDaily")}>
            <div className="flex gap-2">
              <input
                className={inputClass}
                value={newHabit}
                onChange={(event) => setNewHabit(event.target.value)}
                placeholder={t("habits.placeholder")}
              />
              <button
                type="button"
                disabled={isSaving || !newHabit.trim()}
                onClick={addHabit}
                className="ascend-pressable grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-lime text-ink disabled:opacity-60"
                aria-label={t("habits.addHabit")}
              >
                <Plus size={20} />
              </button>
            </div>
          </Field>
        </section>

        {!habits.length ? (
          <section className="mt-4 rounded-xl border border-calm/40 bg-calm/10 p-4">
            <p className="text-sm leading-6 text-zinc-300">{t("habits.starterCopy")}</p>
            <button
              type="button"
              disabled={isSaving}
              onClick={createStarterHabits}
              className="ascend-pressable mt-4 h-12 w-full rounded-xl bg-lime font-semibold text-ink disabled:opacity-60"
            >
              {t("habits.createStarters")}
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
                  <p className="mt-1 text-xs text-zinc-400">{t("habits.daily")}</p>
                </div>
                <button
                  type="button"
                  disabled={isSaving || completed}
                  onClick={() => markComplete(habit.id)}
                  className={`grid h-11 w-11 place-items-center rounded-xl ${
                    completed ? "bg-lime text-ink" : "border border-line text-zinc-300"
                  } disabled:cursor-not-allowed`}
                  aria-label={completed ? t("habits.completedToday") : t("habits.markComplete")}
                >
                  {completed ? <Check size={19} /> : null}
                </button>
              </article>
            );
          })}
        </section>

        <TrackingStatus message={status} success={status === t("habits.startersCreated") || status === t("habits.added") || status.startsWith(t("habits.completePrefix"))} actionHref={status.startsWith(t("habits.completePrefix")) ? "/dashboard" : undefined} />
      </div>
    </main>
  );
}

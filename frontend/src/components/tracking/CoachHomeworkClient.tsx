"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, CheckCircle2, Dumbbell } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { completeCoachHomework, getCoachHomework, TrainerHomeworkAssignment } from "@/lib/ascendApi";
import { rememberDashboardRecord } from "@/lib/dataSync";

type HomeworkSaveSummary = Awaited<ReturnType<typeof completeCoachHomework>>["summary"];

function formatDateLabel(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString([], {
    weekday: "long",
    day: "numeric",
    month: "long"
  });
}

export function CoachHomeworkClient({ assignmentId }: { assignmentId: string }) {
  const [assignment, setAssignment] = useState<TrainerHomeworkAssignment | null>(null);
  const [checkedExercises, setCheckedExercises] = useState<Set<number>>(new Set());
  const [status, setStatus] = useState("Loading your homework...");
  const [isSaving, setIsSaving] = useState(false);
  const [summary, setSummary] = useState<HomeworkSaveSummary | null>(null);
  const saveLockRef = useRef(false);

  useEffect(() => {
    let active = true;

    getCoachHomework(assignmentId)
      .then((response) => {
        if (!active) return;
        setAssignment(response.assignment);
        setStatus("");
      })
      .catch((error) => {
        if (!active) return;
        setStatus(error instanceof Error ? error.message : "Could not load this homework.");
      });

    return () => {
      active = false;
    };
  }, [assignmentId]);

  const workout = assignment?.workout ?? null;
  const allExercisesCompleted = useMemo(() => {
    return Boolean(workout && workout.exercises.length > 0 && checkedExercises.size === workout.exercises.length);
  }, [checkedExercises.size, workout]);

  async function saveCompletion() {
    if (!assignment || assignment.status !== "assigned" || !allExercisesCompleted || saveLockRef.current) return;
    saveLockRef.current = true;
    setIsSaving(true);
    setStatus("");

    try {
      const response = await completeCoachHomework(assignment.id, { completedAt: new Date().toISOString() });
      rememberDashboardRecord("burn", response.burnLog);
      setSummary(response.summary);
      setAssignment((current) =>
        current
          ? {
              ...current,
              status: "completed",
              completed_at: response.burnLog.created_at,
              completion_percent: 100
            }
          : current
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save your homework yet.");
    } finally {
      saveLockRef.current = false;
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-ink px-4 py-5 text-white">
      <div className="mx-auto max-w-md">
        <header className="flex items-center gap-3 py-3">
          <BackButton fallbackHref="/burn-log" disabled={isSaving} />
          <div>
            <p className="text-sm text-zinc-400">Coach Homework</p>
            <h1 className="text-2xl font-semibold">Today&apos;s assignment</h1>
          </div>
        </header>

        {status ? <p className="mt-4 rounded-2xl border border-line bg-surface p-4 text-sm text-zinc-300">{status}</p> : null}

        {!assignment || !workout ? null : (
          <>
            <section className="mt-4 rounded-2xl border border-lime/20 bg-[radial-gradient(circle_at_top_right,rgba(61,230,209,0.16),transparent_16rem),linear-gradient(180deg,rgba(18,23,33,0.98),rgba(7,9,13,0.98))] p-4 shadow-soft">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-lime text-ink">
                  <Dumbbell size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-lime">Coach Homework</p>
                  <h2 className="mt-2 text-2xl font-semibold leading-tight text-white">{assignment.title}</h2>
                  <p className="mt-2 text-sm text-zinc-300">Assigned by {assignment.trainer_name ?? "your coach"}</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-xl border border-line bg-ink/70 p-3">
                  <p className="text-zinc-500">Duration</p>
                  <p className="mt-1 font-bold text-zinc-100">{assignment.duration_minutes} min</p>
                </div>
                <div className="rounded-xl border border-line bg-ink/70 p-3">
                  <p className="text-zinc-500">Scheduled</p>
                  <p className="mt-1 font-bold text-zinc-100">{formatDateLabel(assignment.assignment_date)}</p>
                </div>
                <div className="rounded-xl border border-line bg-ink/70 p-3">
                  <p className="text-zinc-500">Due</p>
                  <p className="mt-1 font-bold text-zinc-100">{formatDateLabel(assignment.due_date)}</p>
                </div>
              </div>

              {assignment.coach_note ? (
                <div className="mt-4 rounded-xl border border-lime/20 bg-lime/10 p-3">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-lime">Coach note</p>
                  <p className="mt-2 text-sm leading-6 text-zinc-100">{assignment.coach_note}</p>
                </div>
              ) : null}

              <div className="mt-4 rounded-xl border border-line bg-ink/70 p-3">
                <p className="text-sm font-semibold text-zinc-100">Warm-up</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {workout.warmup.map((item) => (
                    <span key={item} className="rounded-full border border-line bg-surface px-3 py-2 text-xs text-zinc-300">
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {workout.exercises.map((exercise, index) => {
                  const complete = checkedExercises.has(index);
                  return (
                    <button
                      key={`${exercise.name}-${index}`}
                      type="button"
                      disabled={assignment.status !== "assigned"}
                      onClick={() =>
                        setCheckedExercises((current) => {
                          const next = new Set(current);
                          if (next.has(index)) next.delete(index);
                          else next.add(index);
                          return next;
                        })
                      }
                      className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left ${
                        complete ? "border-lime/50 bg-lime/10" : "border-line bg-ink/75"
                      }`}
                    >
                      <span
                        className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border ${
                          complete ? "border-lime bg-lime text-ink" : "border-line text-zinc-500"
                        }`}
                      >
                        {complete ? <Check size={15} /> : index + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-zinc-100">{exercise.name}</span>
                        <span className="mt-1 block text-xs text-zinc-400">
                          {[exercise.sets ? `${exercise.sets} sets` : null, exercise.reps, exercise.duration, exercise.rest ? `${exercise.rest} rest` : null]
                            .filter(Boolean)
                            .join(" / ")}
                        </span>
                        {exercise.note ? <span className="mt-2 block text-xs leading-5 text-zinc-500">{exercise.note}</span> : null}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 rounded-xl border border-line bg-ink/70 p-3">
                <p className="text-sm font-semibold text-zinc-100">Cooldown</p>
                <p className="mt-2 text-sm leading-6 text-zinc-400">{workout.cooldown.join(" / ")}</p>
              </div>

              {summary ? (
                <div className="mt-4 rounded-2xl border border-lime/30 bg-[radial-gradient(circle_at_top_right,rgba(53,242,208,0.18),transparent_14rem),linear-gradient(180deg,rgba(20,44,39,0.9),rgba(8,16,15,0.96))] p-4">
                  <div className="flex items-start gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-lime text-ink shadow-[0_0_32px_rgba(61,230,209,0.28)]">
                      <CheckCircle2 size={20} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold uppercase tracking-[0.22em] text-lime">Workout Saved</p>
                      <h3 className="mt-2 text-xl font-semibold text-white">{summary.workoutTitle}</h3>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-zinc-200">
                        <div className="rounded-xl border border-white/10 bg-ink/60 px-3 py-3">
                          <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Duration</p>
                          <p className="mt-1 font-semibold">{summary.durationMinutes} min</p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-ink/60 px-3 py-3">
                          <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">{summary.caloriesLabel}</p>
                          <p className="mt-1 font-semibold">~{summary.estimatedCaloriesBurned} kcal</p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-ink/60 px-3 py-3">
                          <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Momentum Earned</p>
                          <p className="mt-1 font-semibold text-lime">+{summary.momentumEarned}</p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-ink/60 px-3 py-3">
                          <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Workout Type</p>
                          <p className="mt-1 font-semibold">{summary.workoutType}</p>
                        </div>
                      </div>
                      <p className="mt-4 text-sm leading-6 text-zinc-200">{summary.coachMessage}</p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <Link href="/burn-log" className="flex h-12 items-center justify-center rounded-2xl bg-lime font-semibold text-ink">
                      Return to Movement
                    </Link>
                    <Link href="/dashboard" className="flex h-12 items-center justify-center rounded-2xl border border-line bg-ink text-zinc-100">
                      Back to Dashboard
                    </Link>
                  </div>
                </div>
              ) : assignment.status === "completed" ? (
                <div className="mt-4 rounded-xl border border-lime/30 bg-lime/10 p-3 text-sm text-zinc-100">
                  Homework completed{assignment.completed_at ? ` on ${new Date(assignment.completed_at).toLocaleString()}` : ""}.
                </div>
              ) : allExercisesCompleted ? (
                <button
                  type="button"
                  onClick={saveCompletion}
                  disabled={isSaving}
                  className="mt-4 flex h-14 w-full items-center justify-center rounded-2xl bg-[linear-gradient(135deg,rgba(61,230,209,1),rgba(109,246,220,0.92))] text-base font-bold text-ink shadow-[0_18px_44px_rgba(61,230,209,0.24)] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSaving ? "Saving..." : "Complete Homework"}
                </button>
              ) : (
                <div className="mt-4 rounded-xl border border-white/5 bg-ink/55 px-4 py-3 text-sm text-zinc-400">
                  Check off every exercise to save this homework.
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

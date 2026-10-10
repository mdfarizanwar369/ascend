import Link from "next/link";
import { ArrowRight, Check, Dumbbell } from "lucide-react";
import type { DailyWorkout } from "@/lib/ascendApi";
import type { WorkoutSessionDraft } from "@/lib/workoutSessionDraft";

type CompletedWorkout = {
  title: string;
  durationMinutes: number | null;
};

export type TodayWorkoutCardView = {
  state: "empty" | "ready" | "in_progress" | "completed";
  title: string;
  detail: string;
  actionLabel: string | null;
  completedCount: number;
  exerciseCount: number;
};

function workoutDetail(workout: DailyWorkout["workout"], equipment?: string) {
  return [
    `${workout.estimatedDurationMinutes} min`,
    workout.focus,
    equipment
  ].filter(Boolean).join(" · ");
}

export function buildTodayWorkoutCardView({
  dailyWorkout,
  draft,
  completedWorkout
}: {
  dailyWorkout: DailyWorkout | null;
  draft: WorkoutSessionDraft | null;
  completedWorkout: CompletedWorkout | null;
}): TodayWorkoutCardView {
  if (dailyWorkout?.completed || completedWorkout) {
    const workout = dailyWorkout?.workout;
    const title = workout?.title ?? completedWorkout?.title ?? "Today’s workout";
    const durationMinutes = workout?.estimatedDurationMinutes ?? completedWorkout?.durationMinutes;
    return {
      state: "completed",
      title: "Workout completed",
      detail: [title, durationMinutes ? `${durationMinutes} min` : null].filter(Boolean).join(" · "),
      actionLabel: null,
      completedCount: workout?.exercises.length ?? 0,
      exerciseCount: workout?.exercises.length ?? 0
    };
  }

  const activeDraft = draft && (!dailyWorkout || draft.workoutCompletionKey === dailyWorkout.workoutCompletionKey)
    ? draft
    : null;
  if (activeDraft) {
    const completedCount = activeDraft.checkedExerciseIndexes.length;
    const exerciseCount = activeDraft.workout.exercises.length;
    if (completedCount > 0) {
      return {
        state: "in_progress",
        title: "Continue your workout",
        detail: `${completedCount} of ${exerciseCount} exercises completed`,
        actionLabel: "Continue workout",
        completedCount,
        exerciseCount
      };
    }
    return {
      state: "ready",
      title: "Your workout is ready",
      detail: workoutDetail(activeDraft.workout, activeDraft.answers.equipment),
      actionLabel: "Start workout",
      completedCount: 0,
      exerciseCount
    };
  }

  if (dailyWorkout) {
    return {
      state: "ready",
      title: "Your workout is ready",
      detail: workoutDetail(dailyWorkout.workout, dailyWorkout.request.equipment),
      actionLabel: "Start workout",
      completedCount: 0,
      exerciseCount: dailyWorkout.workout.exercises.length
    };
  }

  return {
    state: "empty",
    title: "Ready when you are",
    detail: "Built for your time, location and equipment.",
    actionLabel: "Build my workout",
    completedCount: 0,
    exerciseCount: 0
  };
}

export function TodayWorkoutCard({
  dailyWorkout,
  draft,
  completedWorkout,
  loading = false
}: {
  dailyWorkout: DailyWorkout | null;
  draft: WorkoutSessionDraft | null;
  completedWorkout: CompletedWorkout | null;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <section aria-label="Loading today’s workout" className="mt-3 min-h-40 animate-pulse rounded-2xl border border-purple-400/20 bg-purple-400/[0.04] p-4">
        <div className="h-3 w-28 rounded-full bg-purple-300/15" />
        <div className="mt-4 h-6 w-52 rounded-full bg-white/10" />
        <div className="mt-3 h-4 w-64 max-w-full rounded-full bg-white/[0.06]" />
        <div className="mt-5 h-12 rounded-xl bg-calm/10" />
      </section>
    );
  }

  const view = buildTodayWorkoutCardView({ dailyWorkout, draft, completedWorkout });
  const progress = view.exerciseCount > 0 ? Math.round((view.completedCount / view.exerciseCount) * 100) : 0;
  const content = (
    <>
      <div className="flex items-start gap-3">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border ${view.state === "completed" ? "border-calm/30 bg-calm/10 text-calm" : "border-purple-400/35 bg-purple-400/10 text-purple-200"}`}>
          {view.state === "completed" ? <Check size={19} strokeWidth={2.5} /> : <Dumbbell size={19} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-bold uppercase tracking-[0.18em] text-purple-200">Today&apos;s workout</span>
          <span className="mt-1.5 block text-xl font-semibold leading-7 text-white">{view.title}</span>
          <span className="mt-1 block text-sm leading-6 text-zinc-400">{view.detail}</span>
        </span>
      </div>

      {view.state === "in_progress" ? (
        <span className="mt-4 block h-1.5 overflow-hidden rounded-full bg-white/[0.07]" aria-hidden="true">
          <span className="block h-full rounded-full bg-calm transition-[width] duration-500" style={{ width: `${progress}%` }} />
        </span>
      ) : null}

      {view.actionLabel ? (
        <span className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-calm text-sm font-semibold text-ink shadow-[0_14px_30px_rgba(53,242,208,0.14)]">
          {view.actionLabel} <ArrowRight size={17} />
        </span>
      ) : (
        <span className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-full border border-calm/25 bg-calm/[0.08] px-3 text-xs font-semibold text-calm">
          <Check size={14} /> Done for today
        </span>
      )}
    </>
  );

  const className = "ascend-today-workout ascend-card-rise mt-3 block rounded-2xl border border-purple-400/30 bg-[linear-gradient(145deg,rgba(139,92,246,0.11),rgba(18,23,33,0.96)_54%,rgba(53,242,208,0.05))] p-4 text-left shadow-[0_18px_42px_rgba(0,0,0,0.18),0_0_28px_rgba(139,92,246,0.06)]";

  if (view.state === "completed") {
    return <section aria-label="Today’s workout completed" className={className}>{content}</section>;
  }

  return (
    <Link href="/coach?workout=1" aria-label={`${view.actionLabel}: ${view.detail}`} className={`ascend-pressable ${className}`}>
      {content}
    </Link>
  );
}

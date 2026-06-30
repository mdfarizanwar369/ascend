type WorkoutEventRow = {
  metadata?: Record<string, unknown> | null;
  created_at?: string | Date;
};

type WorkoutMemoryOptions = {
  currentStreak?: number | null;
  currentMomentum?: number | null;
  now?: Date;
};

export type WorkoutMemorySummary = {
  latestWorkout: {
    workoutName: string;
    workoutType: string;
    durationMinutes: number | null;
    estimatedCaloriesBurned: number | null;
    completionTime: string;
    completionDate: string;
    difficulty: string | null;
    momentumEarned: number | null;
    completedToday: boolean;
    completedYesterday: boolean;
    focusArea: string;
  } | null;
  recommendation: string;
  continuityNote: string | null;
  recentWorkouts: Array<{
    workoutName: string;
    workoutType: string;
    completionDate: string;
    focusArea: string;
  }>;
  coachSummary: {
    lastWorkout: string | null;
    completed: string | null;
    duration: string | null;
    estimatedBurn: string | null;
    currentStreak: number | null;
    momentum: number | null;
    todaysRecommendation: string;
  };
};

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function workoutTypeFromMetadata(metadata: Record<string, unknown>) {
  return parseText(metadata.workoutType) ?? parseText(metadata.activityType) ?? "Workout";
}

function inferFocusArea(workoutName: string, workoutType: string) {
  const lower = `${workoutName} ${workoutType}`.toLowerCase();
  if (/(leg|lower body|lower|quad|hamstring|glute|deadlift|squat)/.test(lower)) return "lower_body";
  if (/(upper body|push|pull|chest|back|shoulder|arm|bench|row)/.test(lower)) return "upper_body";
  if (/(full body|full-body)/.test(lower)) return "full_body";
  if (/(mobility|recovery|stretch|flow|yoga)/.test(lower)) return "mobility";
  if (/(cardio|run|walk|cycle|bike|conditioning|hiit)/.test(lower)) return "cardio";
  return "general";
}

function recommendationFromHistory(focusArea: string, latestToday: boolean) {
  if (latestToday) return "Recovery, hydration, and easy movement";
  if (focusArea === "lower_body") return "Upper body, mobility, or cardio";
  if (focusArea === "upper_body") return "Lower body";
  if (focusArea === "full_body") return "Mobility or cardio";
  if (focusArea === "cardio") return "Strength or mobility";
  if (focusArea === "mobility") return "Upper body strength, lower body strength, or cardio";
  return "A different focus from the last session";
}

function continuityNote(workoutName: string, latestToday: boolean, focusArea: string) {
  if (latestToday) {
    return `Today's workout is already done with ${workoutName}. Keep the next recommendation recovery-focused.`;
  }
  if (focusArea === "lower_body") return "Yesterday leaned heavily into lower body work, so avoid another leg-dominant session today.";
  if (focusArea === "upper_body") return "Yesterday focused on upper body, so avoid another upper-body-heavy session today.";
  if (focusArea === "full_body") return "The most recent session was full body, so variety matters more than intensity today.";
  return null;
}

export function buildWorkoutMemorySummary(rows: WorkoutEventRow[], options: WorkoutMemoryOptions = {}): WorkoutMemorySummary {
  const now = options.now ?? new Date();
  const todayKey = localDateKey(now);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayKey = localDateKey(yesterday);

  const recentWorkouts = rows
    .map((row) => {
      const metadata = (row.metadata ?? {}) as Record<string, unknown>;
      const workoutName = parseText(metadata.workoutTitle) ?? workoutTypeFromMetadata(metadata);
      const workoutType = workoutTypeFromMetadata(metadata);
      const createdAt = row.created_at ? new Date(row.created_at) : new Date(now);
      const completionDate = Number.isNaN(createdAt.getTime()) ? todayKey : localDateKey(createdAt);
      const completionTime = Number.isNaN(createdAt.getTime())
        ? ""
        : new Intl.DateTimeFormat("en-SG", { hour: "numeric", minute: "2-digit" }).format(createdAt);
      return {
        workoutName,
        workoutType,
        durationMinutes: parseNumber(metadata.durationMinutes),
        estimatedCaloriesBurned: parseNumber(metadata.estimatedCaloriesBurned ?? metadata.caloriesBurned),
        difficulty: parseText(metadata.workoutDifficultyLabel ?? metadata.workoutDifficulty),
        momentumEarned: parseNumber(metadata.momentumEarned),
        completionDate,
        completionTime,
        completedToday: completionDate === todayKey,
        completedYesterday: completionDate === yesterdayKey,
        focusArea: inferFocusArea(workoutName, workoutType)
      };
    })
    .filter((workout) => Boolean(workout.workoutName))
    .slice(0, 5);

  const latestWorkout = recentWorkouts[0] ?? null;
  const recommendation = latestWorkout ? recommendationFromHistory(latestWorkout.focusArea, latestWorkout.completedToday) : "A simple full body or walking session";
  const continuity = latestWorkout ? continuityNote(latestWorkout.workoutName, latestWorkout.completedToday, latestWorkout.focusArea) : null;

  return {
    latestWorkout,
    recommendation,
    continuityNote: continuity,
    recentWorkouts: recentWorkouts.map((workout) => ({
      workoutName: workout.workoutName,
      workoutType: workout.workoutType,
      completionDate: workout.completionDate,
      focusArea: workout.focusArea
    })),
    coachSummary: {
      lastWorkout: latestWorkout?.workoutName ?? null,
      completed: latestWorkout ? (latestWorkout.completedToday ? "Today" : latestWorkout.completedYesterday ? "Yesterday" : latestWorkout.completionDate) : null,
      duration: latestWorkout?.durationMinutes ? `${latestWorkout.durationMinutes} minutes` : null,
      estimatedBurn: latestWorkout?.estimatedCaloriesBurned ? `${latestWorkout.estimatedCaloriesBurned} kcal` : null,
      currentStreak: options.currentStreak ?? null,
      momentum: options.currentMomentum ?? latestWorkout?.momentumEarned ?? null,
      todaysRecommendation: recommendation
    }
  };
}

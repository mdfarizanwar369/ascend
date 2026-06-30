type WorkoutExerciseInput = {
  name: string;
  sets?: number | null;
  reps?: string | null;
  duration?: string | null;
  rest?: string | null;
  note?: string | null;
};

type WorkoutCaloriesInput = {
  durationMinutes: number;
  workoutType: string;
  difficulty: "easy" | "moderate" | "challenging";
  weightKg?: number | null;
  actualCaloriesBurned?: number | null;
};

export type WorkoutCompletionSummary = {
  workoutType: string;
  difficultyLabel: string;
  caloriesBurned: number;
  estimatedCaloriesBurned: number;
  caloriesSource: "estimated_met" | "health_provider_actual";
  weightKgUsed: number;
  metValue: number;
  coachMessage: string;
  exerciseList: WorkoutExerciseInput[];
};

const DEFAULT_WEIGHT_KG = 75;

function normaliseText(value: string) {
  return value.trim().toLowerCase();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function inferWorkoutType(type: string) {
  const lower = normaliseText(type);
  if (/(mobility|stretch|recovery|flow|yoga|walk)/.test(lower)) return "Mobility";
  if (/(hiit|interval|conditioning|circuit)/.test(lower)) return "HIIT";
  if (/(cardio|run|jog|cycle|bike|row)/.test(lower)) return "Cardio";
  if (/(full body|full-body)/.test(lower)) return "Full Body";
  if (/(strength|push|pull|upper|lower|legs|glutes|chest|back|shoulder)/.test(lower)) return "Strength";
  return "General Fitness";
}

function baseMetForWorkoutType(workoutType: string) {
  if (workoutType === "Mobility") return 3.0;
  if (workoutType === "Cardio") return 7.2;
  if (workoutType === "HIIT") return 8.3;
  if (workoutType === "Strength") return 5.6;
  if (workoutType === "Full Body") return 6.1;
  return 4.8;
}

function difficultyAdjustment(difficulty: WorkoutCaloriesInput["difficulty"]) {
  if (difficulty === "easy") return -0.6;
  if (difficulty === "challenging") return 0.9;
  return 0;
}

function estimateCaloriesFromMet({ durationMinutes, workoutType, difficulty, weightKg }: WorkoutCaloriesInput) {
  const safeWeightKg = weightKg && Number.isFinite(weightKg) ? clamp(weightKg, 35, 220) : DEFAULT_WEIGHT_KG;
  const metValue = clamp(baseMetForWorkoutType(workoutType) + difficultyAdjustment(difficulty), 2.5, 10.5);
  const estimatedCaloriesBurned = Math.max(1, Math.round((metValue * 3.5 * safeWeightKg) / 200 * durationMinutes));
  return { estimatedCaloriesBurned, weightKgUsed: safeWeightKg, metValue };
}

function difficultyLabel(difficulty: WorkoutCaloriesInput["difficulty"]) {
  if (difficulty === "easy") return "Easy";
  if (difficulty === "challenging") return "Challenging";
  return "Moderate";
}

function cleanExerciseList(exercises: WorkoutExerciseInput[]) {
  return exercises
    .map((exercise) => ({
      name: exercise.name.trim().slice(0, 120),
      sets: typeof exercise.sets === "number" ? clamp(Math.round(exercise.sets), 1, 10) : null,
      reps: typeof exercise.reps === "string" ? exercise.reps.trim().slice(0, 40) : null,
      duration: typeof exercise.duration === "string" ? exercise.duration.trim().slice(0, 40) : null,
      rest: typeof exercise.rest === "string" ? exercise.rest.trim().slice(0, 40) : null,
      note: typeof exercise.note === "string" ? exercise.note.trim().slice(0, 160) : null
    }))
    .filter((exercise) => exercise.name.length > 0);
}

function motivationalMessage(input: { workoutType: string; difficulty: WorkoutCaloriesInput["difficulty"]; durationMinutes: number }) {
  if (input.workoutType === "Mobility") {
    return "Recovery is part of progress. This session still counts, and it keeps your routine alive.";
  }
  if (input.difficulty === "challenging") {
    return "Strong work. Sessions like this build confidence as much as fitness.";
  }
  if (input.durationMinutes <= 25) {
    return "Nice work showing up. Short sessions still build real momentum when you repeat them.";
  }
  return "Great work staying active today. One finished session is another vote for the result you want.";
}

export function createWorkoutCompletionSummary(input: {
  workoutTitle: string;
  workoutType: string;
  difficulty: WorkoutCaloriesInput["difficulty"];
  durationMinutes: number;
  exercises: WorkoutExerciseInput[];
  weightKg?: number | null;
  actualCaloriesBurned?: number | null;
}) : WorkoutCompletionSummary {
  const inferredWorkoutType = inferWorkoutType(input.workoutType || input.workoutTitle);
  const { estimatedCaloriesBurned, weightKgUsed, metValue } = estimateCaloriesFromMet({
    durationMinutes: input.durationMinutes,
    workoutType: inferredWorkoutType,
    difficulty: input.difficulty,
    weightKg: input.weightKg,
    actualCaloriesBurned: input.actualCaloriesBurned
  });

  const caloriesBurned = input.actualCaloriesBurned && Number.isFinite(input.actualCaloriesBurned)
    ? Math.max(1, Math.round(input.actualCaloriesBurned))
    : estimatedCaloriesBurned;

  return {
    workoutType: inferredWorkoutType,
    difficultyLabel: difficultyLabel(input.difficulty),
    caloriesBurned,
    estimatedCaloriesBurned,
    caloriesSource: input.actualCaloriesBurned && Number.isFinite(input.actualCaloriesBurned) ? "health_provider_actual" : "estimated_met",
    weightKgUsed,
    metValue,
    coachMessage: motivationalMessage({
      workoutType: inferredWorkoutType,
      difficulty: input.difficulty,
      durationMinutes: input.durationMinutes
    }),
    exerciseList: cleanExerciseList(input.exercises)
  };
}

type TimedWorkoutExercise = {
  sets?: number | null;
  reps?: string | null;
  duration?: string | null;
  rest?: string | null;
};

function midpoint(value: string): number {
  const match = value.match(/(\d+)(?:\s*[-–]\s*(\d+))?/);
  if (!match) return 0;
  return (Number(match[1]) + Number(match[2] ?? match[1])) / 2;
}

/** A planning estimate, not a measurement of the member's actual workout. */
export function estimateWorkoutDurationMinutes(exercises: TimedWorkoutExercise[]): number {
  // V2 prescribes 4 minutes of warm-up and 3 minutes of cooldown.
  let seconds = 7 * 60 + Math.max(0, exercises.length - 1) * 60;
  for (const exercise of exercises) {
    const sets = Math.max(1, exercise.sets ?? 1);
    const duration = exercise.duration ?? "";
    const reps = exercise.reps ?? "";
    const sides = /each side/i.test(duration || reps) ? 2 : 1;
    const workSeconds = duration
      ? midpoint(duration) * (/\bmin(?:ute)?s?\b/i.test(duration) ? 60 : 1) * sides
      : 10 + midpoint(reps) * sides * 3;
    const restSeconds = exercise.rest === "As needed" ? 30 : midpoint(exercise.rest ?? "");
    seconds += sets * workSeconds + Math.max(0, sets - 1) * restSeconds;
  }
  return Math.max(1, Math.round(seconds / 60));
}

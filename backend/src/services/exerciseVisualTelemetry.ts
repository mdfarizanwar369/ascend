import { PILOT_EXERCISE_VISUALS, resolveExerciseVisual, normalizeExerciseVisualName } from "@ascend/shared";
import { query } from "../db/pool";

export type VisualUiEvent = "detail_opened" | "image_load_failure" | "incorrect_mapping_report";

// Unknown words may be names or health details. They are counted only as redacted.
const safeExerciseWords = new Set(`a alternating arm arms back band barbell bench bent bicycle bodyweight box bridge burpee calf calves cable cat chair chest child cobra core cow curl deadlift decline dip dog down downward dumbbell elevated extension face farmer floor fly forearm front glute goblet hamstring hand hands hanging heel hip hold incline jack jumping knee kneeling lateral leg legs light lunge machine march mountain movement overhead plank press pull pulldown push raise rear recovery reverse row run scapular seated shoulder side single sit squat standing step stretch supported swivel swing the thread to toe triceps twist up upright using walk walking wall weight with without worlds yoga`.split(" "));

/** Aggregate only; never persist a user ID, workout ID, note, or raw sensitive text. */
export function safeAggregateExerciseName(value: unknown): string {
  const name = normalizeExerciseVisualName(value);
  if (!name || name.length > 80 || !/^[a-z][a-z '-]*(?:\([a-z ,'-]+\))?$/.test(name)) return "[redacted]";
  if (!name.match(/[a-z]+/g)?.every(word => safeExerciseWords.has(word))) return "[redacted]";
  return name;
}

export async function incrementVisualCounter(eventType: string, exerciseName: string, registryId = "") {
  await query(`
    insert into exercise_visual_pilot_counts (day_utc, event_type, exercise_name, registry_id, event_count)
    values ((now() at time zone 'utc')::date, $1, $2, $3, 1)
    on conflict (day_utc, event_type, exercise_name, registry_id)
    do update set event_count = exercise_visual_pilot_counts.event_count + 1
  `, [eventType, exerciseName, registryId]);
}

export async function recordGeneratedWorkoutVisuals(workout: { exercises?: Array<{ name?: string }> }) {
  const counts = new Map<string, { eventType: string; name: string; registryId: string; count: number }>();
  for (const item of workout.exercises ?? []) {
    const resolution = resolveExerciseVisual(item.name);
    const eventType = resolution.status === "resolved" ? "resolved" : resolution.status;
    const name = resolution.status === "resolved"
      ? resolution.exercise.canonicalName.toLowerCase()
      : safeAggregateExerciseName(item.name);
    const registryId = resolution.status === "resolved" ? resolution.exercise.id : "";
    const key = `${eventType}\0${name}\0${registryId}`;
    const previous = counts.get(key);
    counts.set(key, { eventType, name, registryId, count: (previous?.count ?? 0) + 1 });
  }
  await Promise.all([...counts.values()].map(async ({ eventType, name, registryId, count }) => {
    await query(`
      insert into exercise_visual_pilot_counts (day_utc, event_type, exercise_name, registry_id, event_count)
      values ((now() at time zone 'utc')::date, $1, $2, $3, $4)
      on conflict (day_utc, event_type, exercise_name, registry_id)
      do update set event_count = exercise_visual_pilot_counts.event_count + excluded.event_count
    `, [eventType, name, registryId, count]);
  }));
}

export async function recordVisualUiEvent(eventType: VisualUiEvent, registryId: string) {
  const exercise = PILOT_EXERCISE_VISUALS.find(item => item.id === registryId);
  if (!exercise) return false;
  await incrementVisualCounter(eventType, exercise.canonicalName.toLowerCase(), exercise.id);
  return true;
}

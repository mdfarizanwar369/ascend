import {
  WORKOUT_CAPTURE_VERSION,
  WORKOUT_MOVEMENT_PATTERNS,
  WorkoutCaptureDifficulty,
  WorkoutCaptureDraft,
  WorkoutCaptureExercise,
  WorkoutCaptureSourceMode,
  WorkoutMovementPattern
} from "@ascend/shared";

const DEFAULT_TITLE = "My Workout";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function text(value: unknown, maxLength: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : null;
}

function number(value: unknown, min: number, max: number) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? clamp(parsed, min, max) : null;
}

function integer(value: unknown, min: number, max: number) {
  const parsed = number(value, min, max);
  return parsed === null ? null : Math.round(parsed);
}

function confidence(value: unknown, fallback = 0.5) {
  return Math.round(clamp(Number(value ?? fallback) || fallback, 0, 1) * 100) / 100;
}

function inferMovementPattern(value: string): WorkoutMovementPattern {
  const lower = value.toLowerCase();
  if (/(squat|leg press|lunge|step.?up|split squat)/.test(lower)) return "squat";
  if (/(deadlift|hinge|hip thrust|glute bridge|good morning)/.test(lower)) return "hinge";
  if (/(bench|press|push.?up|dip|tricep)/.test(lower)) return "push";
  if (/(row|pull.?up|pulldown|chin.?up|curl)/.test(lower)) return "pull";
  if (/(carry|farmer|suitcase)/.test(lower)) return "carry";
  if (/(plank|crunch|sit.?up|core|rotation)/.test(lower)) return "core";
  if (/(run|walk|cycle|bike|rower|swim|cardio|elliptical)/.test(lower)) return "cardio";
  if (/(mobility|stretch|yoga|range of motion)/.test(lower)) return "mobility";
  if (/(recovery|breathing|easy flow)/.test(lower)) return "recovery";
  return "other";
}

function movementPattern(value: unknown, exerciseName: string) {
  const parsed = text(value, 40)?.toLowerCase();
  return parsed && WORKOUT_MOVEMENT_PATTERNS.includes(parsed as WorkoutMovementPattern)
    ? parsed as WorkoutMovementPattern
    : inferMovementPattern(exerciseName);
}

function inferWorkoutType(value: string) {
  const lower = value.toLowerCase();
  if (/(mobility|stretch|recovery|yoga)/.test(lower)) return "Mobility";
  if (/(hiit|circuit|interval)/.test(lower)) return "HIIT";
  if (/(run|walk|cycle|bike|swim|cardio)/.test(lower)) return "Cardio";
  if (/(strength|bench|squat|deadlift|press|row|weight|lift)/.test(lower)) return "Strength";
  return "General Fitness";
}

function inferDifficulty(value: string): WorkoutCaptureDifficulty {
  const lower = value.toLowerCase();
  if (/(easy|light|recovery|gentle)/.test(lower)) return "easy";
  if (/(hard|heavy|challenging|intense|max)/.test(lower)) return "challenging";
  return "moderate";
}

function cleanExerciseName(value: string) {
  return value
    .replace(/\b\d+(?:\.\d+)?\s*(?:kg|kgs|lb|lbs)\b/gi, " ")
    .replace(/\b\d+\s*[x×]\s*\d+(?:\s*[-–]\s*\d+)?\b/gi, " ")
    .replace(/\b\d+\s*(?:sets?|reps?)\b/gi, " ")
    .replace(/\b\d+\s*(?:min|mins|minutes?|sec|secs|seconds?)\b/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/^[-:•\s]+|[-:•\s]+$/g, "")
    .trim();
}

function parseFallbackExercise(segment: string): WorkoutCaptureExercise | null {
  const originalText = segment.trim().slice(0, 240);
  if (!originalText) return null;

  const setRepMatch = originalText.match(/\b(\d+)\s*[x×]\s*(\d+(?:\s*[-–]\s*\d+)?)\b/i);
  const wordSetMatch = originalText.match(/\b(\d+)\s*sets?\s*(?:of\s*)?(\d+(?:\s*[-–]\s*\d+)?)?/i);
  const loadMatch = originalText.match(/\b(\d+(?:\.\d+)?)\s*(kg|kgs|lb|lbs)\b/i);
  const durationMatch = originalText.match(/\b(\d+)\s*(min|mins|minutes?)\b/i);
  const restMatch = originalText.match(/\b(?:rest\s*)?(\d+)\s*(sec|secs|seconds?)\s*(?:rest)?\b/i);
  const sets = integer(setRepMatch?.[1] ?? wordSetMatch?.[1], 1, 10);
  const reps = text(setRepMatch?.[2] ?? wordSetMatch?.[2], 40);
  const load = number(loadMatch?.[1], 0, 1_000);
  const loadUnit = loadMatch ? (loadMatch[2].toLowerCase().startsWith("k") ? "kg" : "lb") : null;
  const durationMinutes = integer(durationMatch?.[1], 1, 300);
  const restSeconds = integer(restMatch?.[1], 0, 600);
  const name = cleanExerciseName(originalText) || originalText;
  const parsedFields = [sets !== null && reps !== null, load !== null, durationMinutes !== null].filter(Boolean).length;
  const exerciseConfidence = Math.min(0.9, 0.45 + parsedFields * 0.15);

  return {
    name: name.slice(0, 120),
    originalText,
    sets,
    reps,
    load,
    loadUnit,
    durationMinutes,
    restSeconds,
    note: null,
    movementPattern: inferMovementPattern(name),
    confidence: exerciseConfidence,
    needsConfirmation: exerciseConfidence < 0.75
  };
}

export function createFallbackWorkoutCapture(
  originalInput: string,
  sourceMode: WorkoutCaptureSourceMode = "text"
): WorkoutCaptureDraft {
  const cleanedInput = originalInput.trim().replace(/\r/g, "").slice(0, 2_000);
  const segments = cleanedInput.split(/\n|;|,(?=\s*[A-Za-z])/).map((item) => item.trim()).filter(Boolean);
  const exercises = segments.map(parseFallbackExercise).filter((item): item is WorkoutCaptureExercise => Boolean(item)).slice(0, 30);
  const durationMatch = cleanedInput.match(/(?:total|workout|session)?\s*(\d+)\s*(?:min|mins|minutes?)\b/i);
  const durationMinutes = integer(durationMatch?.[1], 5, 300);
  const uncertainties: string[] = [];

  if (!durationMinutes) uncertainties.push("Workout duration was not clear.");
  exercises.forEach((exercise, index) => {
    if (exercise.needsConfirmation) uncertainties.push(`Please confirm the details for ${exercise.name || `exercise ${index + 1}`}.`);
  });

  const overallConfidence = exercises.length
    ? Math.round((exercises.reduce((sum, exercise) => sum + exercise.confidence, 0) / exercises.length) * 100) / 100
    : 0;

  return {
    version: WORKOUT_CAPTURE_VERSION,
    sourceMode,
    originalInput: cleanedInput,
    title: DEFAULT_TITLE,
    workoutType: inferWorkoutType(cleanedInput),
    difficulty: inferDifficulty(cleanedInput),
    durationMinutes,
    exercises,
    confidence: overallConfidence,
    uncertainties: [...new Set(uncertainties)].slice(0, 12),
    requiresReview: true
  };
}

function extractJsonObject(value: string) {
  const cleaned = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Workout capture response did not contain JSON.");
  return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
}

export function normalizeWorkoutCaptureResponse(
  rawResponse: string,
  originalInput: string,
  sourceMode: WorkoutCaptureSourceMode = "text"
): WorkoutCaptureDraft {
  const fallback = createFallbackWorkoutCapture(originalInput, sourceMode);
  let parsed: Record<string, unknown>;
  try {
    parsed = extractJsonObject(rawResponse);
  } catch {
    return fallback;
  }

  const rawExercises = Array.isArray(parsed.exercises) ? parsed.exercises : [];
  const exercises = rawExercises
    .map((item): WorkoutCaptureExercise | null => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const name = text(row.name, 120);
      if (!name) return null;
      const exerciseConfidence = confidence(row.confidence);
      const sets = integer(row.sets, 1, 10);
      const reps = text(row.reps, 40);
      const durationMinutes = integer(row.durationMinutes, 1, 300);
      const rawUnit = text(row.loadUnit, 8)?.toLowerCase();
      const loadUnit = rawUnit === "kg" || rawUnit === "lb" ? rawUnit : null;
      return {
        name,
        originalText: text(row.originalText, 240),
        sets,
        reps,
        load: number(row.load, 0, 1_000),
        loadUnit,
        durationMinutes,
        restSeconds: integer(row.restSeconds, 0, 600),
        note: text(row.note, 160),
        movementPattern: movementPattern(row.movementPattern, name),
        confidence: exerciseConfidence,
        needsConfirmation: row.needsConfirmation === true || exerciseConfidence < 0.75 || (sets === null && reps === null && durationMinutes === null)
      };
    })
    .filter((item): item is WorkoutCaptureExercise => Boolean(item))
    .slice(0, 30);

  if (!exercises.length) return fallback;

  const rawDifficulty = text(parsed.difficulty, 20)?.toLowerCase();
  const difficulty: WorkoutCaptureDifficulty = rawDifficulty === "easy" || rawDifficulty === "challenging" ? rawDifficulty : "moderate";
  const uncertainties = Array.isArray(parsed.uncertainties)
    ? parsed.uncertainties.map((item) => text(item, 160)).filter((item): item is string => Boolean(item)).slice(0, 12)
    : [];
  exercises.forEach((exercise) => {
    if (exercise.needsConfirmation) uncertainties.push(`Please confirm the details for ${exercise.name}.`);
  });

  return {
    version: WORKOUT_CAPTURE_VERSION,
    sourceMode,
    originalInput: originalInput.trim().slice(0, 2_000),
    title: text(parsed.title, 120) ?? fallback.title,
    workoutType: text(parsed.workoutType, 80) ?? fallback.workoutType,
    difficulty,
    durationMinutes: integer(parsed.durationMinutes, 5, 300),
    exercises,
    confidence: confidence(parsed.confidence, exercises.reduce((sum, exercise) => sum + exercise.confidence, 0) / exercises.length),
    uncertainties: [...new Set(uncertainties)].slice(0, 12),
    requiresReview: true
  };
}

export function buildWorkoutCapturePrompt(input: string, recentExerciseNames: string[] = []) {
  return [
    "Convert the member's rough workout notes into a structured workout draft.",
    "Extract only details the member actually supplied. Never invent weights, sets, reps, duration, or exercise names.",
    "When a value is unclear, return null, set needsConfirmation to true, lower confidence, and explain it in uncertainties.",
    "Keep the member's original unit (kg or lb). Preserve originalText for each exercise.",
    `Movement pattern must be one of: ${WORKOUT_MOVEMENT_PATTERNS.join(", ")}.`,
    "Difficulty must be easy, moderate, or challenging. Use moderate only as a neutral label when intensity is not stated.",
    "Return strict JSON only with: title, workoutType, difficulty, durationMinutes, confidence, uncertainties, exercises.",
    "Each exercise must contain: name, originalText, sets, reps, load, loadUnit, durationMinutes, restSeconds, note, movementPattern, confidence, needsConfirmation.",
    recentExerciseNames.length
      ? `Use these previously confirmed names only to normalize obvious aliases: ${recentExerciseNames.slice(0, 30).join(", ")}.`
      : "No confirmed exercise-name history is available.",
    `Member input: ${input.trim().slice(0, 2_000)}`
  ].join("\n");
}

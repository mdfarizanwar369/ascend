import {
  WORKOUT_LOAD_BASES,
  WORKOUT_CAPTURE_CONFIDENCE_FIELDS,
  WORKOUT_CAPTURE_VERSION,
  WORKOUT_MOVEMENT_PATTERNS,
  WORKOUT_SET_TYPES,
  WORKOUT_TRAINING_METHODS,
  WorkoutCaptureDifficulty,
  WorkoutCaptureDraft,
  WorkoutCaptureExercise,
  WorkoutCaptureConfidenceField,
  WorkoutCaptureFieldConfidence,
  WorkoutCaptureLoadStep,
  WorkoutCaptureSetDetail,
  WorkoutCaptureSourceMode,
  WorkoutDurationUnit,
  WorkoutLoadBasis,
  WorkoutLoadRole,
  WorkoutSetType,
  WorkoutTrainingMethod,
  WorkoutMovementPattern
} from "@ascend/shared";
import { parseWorkoutCaptureExercises } from "./workoutCaptureParser";

const DEFAULT_TITLE = "My Workout";
const FIELD_CONFIDENCE_THRESHOLD = 0.75;
const WORKOUT_CAPTURE_CONFIDENCE_FIELD_SET = new Set<string>(WORKOUT_CAPTURE_CONFIDENCE_FIELDS);

export function normalizeWorkoutCaptureInput(value: string) {
  return value
    .replace(/(?:&#x20;|&#32;|&nbsp;)/gi, " ")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 5_000);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function text(value: unknown, maxLength: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : null;
}

function repsText(value: unknown, maxLength = 80) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return String(value).slice(0, maxLength);
  if (Array.isArray(value)) {
    const values = value.flatMap((item) => {
      if (typeof item === "number" && Number.isFinite(item) && item >= 0) return [String(item)];
      if (typeof item === "string" && /^\s*\d+(?:\.\d+)?\s*$/.test(item)) return [item.trim()];
      return [];
    });
    return values.length === value.length && values.length ? values.join(",").slice(0, maxLength) : null;
  }
  return text(value, maxLength);
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
  const parsed = Number(value ?? fallback);
  const safeValue = Number.isFinite(parsed) ? parsed : fallback;
  return Math.round(clamp(safeValue, 0, 1) * 100) / 100;
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

function fallbackFieldConfidence(exercise: WorkoutCaptureExercise): WorkoutCaptureFieldConfidence {
  const uncertain = new Set(exercise.uncertainFields ?? []);
  const values: Partial<Record<WorkoutCaptureConfidenceField, unknown>> = {
    name: exercise.name,
    sets: exercise.sets,
    reps: exercise.reps,
    load: exercise.load,
    loadUnit: exercise.loadUnit,
    durationMinutes: exercise.durationMinutes,
    restSeconds: exercise.restSeconds,
    note: exercise.note,
    movementPattern: exercise.movementPattern,
    section: exercise.section,
    loadBasis: exercise.loadBasis,
    rpe: exercise.rpe,
    rir: exercise.rir,
    trainingMethods: exercise.trainingMethods?.length ? exercise.trainingMethods : null,
    groupRounds: exercise.groupRounds,
    loadSteps: exercise.loadSteps?.length ? exercise.loadSteps : null,
    setDetails: exercise.setDetails?.length ? exercise.setDetails : null
  };
  return Object.fromEntries(
    WORKOUT_CAPTURE_CONFIDENCE_FIELDS.flatMap((field) => values[field] === null || values[field] === undefined
      ? []
      : [[field, uncertain.has(field) ? 0.55 : exercise.confidence]])
  ) as WorkoutCaptureFieldConfidence;
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
  const cleanedInput = normalizeWorkoutCaptureInput(originalInput).replace(/\r/g, "");
  const segments = cleanedInput.split(/\n|;|,(?=\s*[A-Za-z])/).map((item) => item.trim()).filter(Boolean);
  const richExercises = parseWorkoutCaptureExercises(cleanedInput);
  const parsedExercises = richExercises.length
    ? richExercises
    : segments.map(parseFallbackExercise).filter((item): item is WorkoutCaptureExercise => Boolean(item)).slice(0, 30);
  const exercises = parsedExercises.map((exercise) => ({
    ...exercise,
    fieldConfidence: fallbackFieldConfidence(exercise)
  }));
  const durationMatch = cleanedInput.match(/(?:total(?:\s+time)?|workout(?:\s+was)?|session(?:\s+was)?)\s*[:=-]?\s*(\d+)\s*(?:min|mins|minutes?)\b/i);
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

function normalizedEvidence(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9.+-]+/g, " ").replace(/\s+/g, " ").trim();
}

function verifiedEvidence(value: unknown, originalInput: string) {
  const candidate = text(value, 1_000);
  if (!candidate) return null;
  const normalizedCandidate = normalizedEvidence(candidate);
  return normalizedCandidate && normalizedEvidence(originalInput).includes(normalizedCandidate) ? candidate : null;
}

function numberToken(value: number) {
  return String(value).replace(/\.0+$/, "");
}

function supportsSets(evidence: string, value: number | null) {
  if (value === null) return false;
  const token = numberToken(value).replace(".", "\\.");
  if (new RegExp(`\\b${token}\\s*(?:ramp[ -]?up\\s+)?sets?\\b`, "i").test(evidence)) return true;
  return value <= 10 && new RegExp(`\\b${token}\\s*[x×]\\s*\\d+`, "i").test(evidence);
}

function supportsReps(evidence: string, value: string | null) {
  if (!value) return false;
  const compactValue = value.replace(/\s+/g, "").replace(/[–]/g, "-");
  if (compactValue.includes(",")) {
    const sequence = compactValue.split(",").map((token) => token.replace(".", "\\.")).join("\\s*,\\s*");
    return new RegExp(`\\b${sequence}\\s*(?:reps?)?\\b`, "i").test(evidence);
  }
  if (/^\d+\s*[-–]\s*\d+$/.test(value)) {
    const [minimum, maximum] = value.match(/\d+/g) ?? [];
    return Boolean(minimum && maximum && new RegExp(`\\b${minimum}\\s*[-–]\\s*${maximum}\\s*(?:reps?)?\\b`, "i").test(evidence));
  }
  const numbers = value.match(/\d+(?:\.\d+)?/g) ?? [];
  if (!numbers.length) return /calories/i.test(value) && /calorie\s+row/i.test(evidence);
  return numbers.every((raw) => {
    const token = raw.replace(".", "\\.");
    return new RegExp(
      `(?:[x×]|for|around|about|maybe|got|completed|:)\\s*${token}(?:\\s*[-–]\\s*\\d+)?(?:\\s*(?:reps?|each))?`
      + `|\\b${token}\\s*reps?\\b`
      + `|\\bsets?\\s+of\\s+${token}\\b`
      + `|(?:^|\\n)\\s*${token}\\s+(?!(?:sets?|rounds?|min(?:ute)?s?|sec(?:ond)?s?|kg|kgs|lb|lbs)\\b)[a-z]`,
      "i"
    ).test(evidence);
  });
}

function supportsLoad(evidence: string, value: number | null) {
  if (value === null) return false;
  const token = numberToken(value).replace(".", "\\.");
  return new RegExp(`\\b${token}\\s*(?:kg|kgs|kilos?|lb|lbs|pounds?)\\b|bodyweight\\s*\\+\\s*${token}\\b|machine setting\\s*${token}\\b|\\b${token}s?\\s*[x×]\\s*\\d+`, "i").test(evidence);
}

function supportsDuration(evidence: string, value: number | null) {
  if (value === null) return false;
  const token = numberToken(value).replace(".", "\\.");
  if (new RegExp(`\\b${token}\\s*[- ]?(?:sec|secs|seconds?)\\s+(?:rest|between rounds)\\b`, "i").test(evidence)) return false;
  if (new RegExp(`\\b${token}\\s*(?:sec|secs|seconds?)\\s*(?:up|down|eccentric|concentric|pause|hold)\\b`, "i").test(evidence)) return false;
  return new RegExp(`\\b${token}\\s*[- ]?(?:min|mins|minutes?|sec|secs|seconds?)\\b`, "i").test(evidence);
}

function supportsTotalDuration(evidence: string, value: number | null) {
  if (value === null) return false;
  const token = numberToken(value).replace(".", "\\.");
  return new RegExp(`(?:total(?:\\s+time)?|workout(?:\\s+was)?|session(?:\\s+was)?)\\s*[:=-]?\\s*${token}\\s*(?:min|mins|minutes?)\\b`, "i").test(evidence);
}

function loadBasisValue(value: unknown): WorkoutLoadBasis {
  return WORKOUT_LOAD_BASES.includes(value as WorkoutLoadBasis) ? value as WorkoutLoadBasis : "unknown";
}

function setTypeValue(value: unknown): WorkoutSetType {
  return WORKOUT_SET_TYPES.includes(value as WorkoutSetType) ? value as WorkoutSetType : "unknown";
}

function normalizedMethods(value: unknown): WorkoutTrainingMethod[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((method): method is WorkoutTrainingMethod =>
    WORKOUT_TRAINING_METHODS.includes(method as WorkoutTrainingMethod)
  ))];
}

function normalizedLoadSteps(value: unknown): WorkoutCaptureLoadStep[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const stepValue = number(row.value, 0, 2_000);
    if (stepValue === null) return [];
    const rawUnit = text(row.unit, 8)?.toLowerCase();
    const unit: "kg" | "lb" | null = rawUnit === "kg" || rawUnit === "lb" ? rawUnit : null;
    const rawRole = text(row.role, 20)?.toLowerCase();
    const role: WorkoutLoadRole = rawRole === "starting" || rawRole === "working" || rawRole === "top" || rawRole === "backoff" || rawRole === "drop" || rawRole === "correction" ? rawRole : "unknown";
    const reps = repsText(row.reps);
    return [{
      value: stepValue,
      unit,
      basis: loadBasisValue(row.basis),
      role,
      reps,
      approximate: row.approximate === true,
      note: text(row.note, 300),
      confidence: confidence(row.confidence)
    }];
  }).slice(0, 30);
}

function normalizedSetDetails(value: unknown): WorkoutCaptureSetDetail[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const reps = repsText(row.reps);
    const load = number(row.load, 0, 2_000);
    const durationValue = number(row.durationValue, 0, 3_600);
    const rpe = number(row.rpe, 1, 10);
    const rir = number(row.rir, 0, 10);
    const rawUnit = text(row.loadUnit, 8)?.toLowerCase();
    const rawDurationUnit = text(row.durationUnit, 12)?.toLowerCase();
    const loadUnit: "kg" | "lb" | null = rawUnit === "kg" || rawUnit === "lb" ? rawUnit : null;
    const durationUnit: WorkoutDurationUnit | null = rawDurationUnit === "seconds" || rawDurationUnit === "minutes" ? rawDurationUnit : null;
    return [{
      order: integer(row.order, 1, 100) ?? index + 1,
      reps,
      repRangeMin: number(row.repRangeMin, 0, 1_000),
      repRangeMax: number(row.repRangeMax, 0, 1_000),
      load,
      loadUnit,
      loadBasis: loadBasisValue(row.loadBasis),
      durationValue,
      durationUnit,
      setType: setTypeValue(row.setType),
      rpe,
      rir,
      approximate: row.approximate === true,
      note: text(row.note, 300)
    }];
  }).filter((detail) => detail.reps !== null || detail.load !== null || detail.durationValue !== null || detail.rpe !== null || detail.rir !== null).slice(0, 100);
}

function normalizedConfidenceField(value: unknown): WorkoutCaptureConfidenceField | null {
  if (typeof value !== "string") return null;
  const compact = value.trim().replace(/[\s_-]+/g, "").toLowerCase();
  return WORKOUT_CAPTURE_CONFIDENCE_FIELDS.find((field) => field.toLowerCase() === compact) ?? null;
}

function normalizedFieldConfidence(value: unknown): WorkoutCaptureFieldConfidence {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const row = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(row).flatMap(([rawField, rawConfidence]) => {
      const field = normalizedConfidenceField(rawField);
      return field ? [[field, confidence(rawConfidence)]] : [];
    })
  ) as WorkoutCaptureFieldConfidence;
}

function normalizedUncertainFields(value: unknown) {
  if (!Array.isArray(value)) return [] as WorkoutCaptureConfidenceField[];
  return [...new Set(value.map(normalizedConfidenceField).filter((field): field is WorkoutCaptureConfidenceField => Boolean(field)))];
}

function ambiguousSetRepFields(evidence: string, sets: number | null, reps: string | null) {
  const fields: WorkoutCaptureConfidenceField[] = [];
  const barePair = evidence.match(/\b(\d+)\s*[x×]\s*(\d+)\b/i);
  if (barePair && Number(barePair[1]) > 8 && Number(barePair[2]) <= 8 && !/\b(?:sets?|reps?)\b/i.test(evidence)) {
    fields.push("sets", "reps");
  }
  const repSequence = reps?.match(/\d+(?:\.\d+)?/g) ?? [];
  if (sets !== null && repSequence.length > 1 && repSequence.length !== sets) fields.push("sets", "reps");
  return fields;
}

function fieldIsPresent(field: WorkoutCaptureConfidenceField, exercise: WorkoutCaptureExercise) {
  const value = exercise[field as keyof WorkoutCaptureExercise];
  if (field === "loadBasis" && value === "unknown") return false;
  return Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined && value !== "";
}

function fieldLabel(field: WorkoutCaptureConfidenceField) {
  const labels: Partial<Record<WorkoutCaptureConfidenceField, string>> = {
    name: "exercise name",
    sets: "sets",
    reps: "reps",
    load: "load",
    loadUnit: "load unit",
    durationMinutes: "duration",
    restSeconds: "rest time",
    note: "note",
    movementPattern: "movement type",
    section: "section",
    loadBasis: "load meaning",
    rpe: "RPE",
    rir: "RIR",
    trainingMethods: "training method",
    groupRounds: "rounds",
    loadSteps: "load sequence",
    setDetails: "set details"
  };
  return labels[field] ?? field;
}

export function normalizeWorkoutCaptureResponse(
  rawResponse: string,
  originalInput: string,
  sourceMode: WorkoutCaptureSourceMode = "text"
): WorkoutCaptureDraft {
  const cleanedInput = normalizeWorkoutCaptureInput(originalInput);
  const fallback = createFallbackWorkoutCapture(cleanedInput, sourceMode);
  let parsed: Record<string, unknown>;
  try {
    parsed = extractJsonObject(rawResponse);
  } catch {
    return fallback;
  }

  const rawExercises = Array.isArray(parsed.exercises) ? parsed.exercises : [];
  const exercises = rawExercises
    .map((item, index): WorkoutCaptureExercise | null => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const proposedName = text(row.name, 120);
      if (!proposedName) return null;
      const exactEvidence = verifiedEvidence(row.originalText, cleanedInput);
      if (!exactEvidence) return null;
      const evidence = exactEvidence;
      const name = proposedName;
      const exerciseConfidence = confidence(row.confidence);
      const suppliedFieldConfidence = normalizedFieldConfidence(row.fieldConfidence);
      const isFieldAwareResponse = Object.keys(suppliedFieldConfidence).length > 0;
      const proposedSets = integer(row.sets, 1, 100);
      const proposedReps = repsText(row.reps);
      const proposedDuration = integer(row.durationMinutes, 1, 300);
      const proposedLoad = number(row.load, 0, 2_000);
      const hasExplicitZeroLoad = /\b0(?:\.0+)?\s*(?:kg|kgs|kilos?|lb|lbs|pounds?)\b/i.test(evidence);
      const sets = isFieldAwareResponse || supportsSets(evidence, proposedSets) ? proposedSets : null;
      const reps = isFieldAwareResponse || supportsReps(evidence, proposedReps) ? proposedReps : null;
      const durationMinutes = isFieldAwareResponse || supportsDuration(evidence, proposedDuration) ? proposedDuration : null;
      const load = proposedLoad === 0 && !hasExplicitZeroLoad
        ? null
        : isFieldAwareResponse || supportsLoad(evidence, proposedLoad) ? proposedLoad : null;
      const rawUnit = text(row.loadUnit, 8)?.toLowerCase();
      const loadUnit = load !== null && (rawUnit === "kg" || rawUnit === "lb") ? rawUnit : null;
      const proposedRpe = number(row.rpe, 1, 10);
      const proposedRir = number(row.rir, 0, 10);
      const methods = isFieldAwareResponse ? normalizedMethods(row.trainingMethods) : [];
      const loadSteps = (isFieldAwareResponse ? normalizedLoadSteps(row.loadSteps) : [])
        .filter((step, stepIndex, all) => !all.slice(0, stepIndex).some((candidate) => candidate.value === step.value && candidate.unit === step.unit && candidate.role === step.role));
      const setDetails = (isFieldAwareResponse ? normalizedSetDetails(row.setDetails) : [])
        .filter((detail, detailIndex, all) => !all.slice(0, detailIndex).some((candidate) => candidate.order === detail.order && candidate.load === detail.load && candidate.reps === detail.reps));
      const section = text(row.section, 80);
      const loadBasis = loadBasisValue(row.loadBasis);
      const proposedCompletedSets = integer(row.completedSets, 1, 100);
      const proposedRangeMin = integer(row.repRangeMin, 0, 1_000);
      const proposedRangeMax = integer(row.repRangeMax, 0, 1_000);
      const exercise: WorkoutCaptureExercise = {
        name,
        originalText: evidence.slice(0, 1_000),
        sets,
        reps,
        load,
        loadUnit,
        durationMinutes,
        restSeconds: /\b(?:rest\s*(?:for\s*)?\d+\s*(?:sec|secs|seconds?)|\d+\s*(?:sec|secs|seconds?)\s*(?:rest|between rounds))\b/i.test(evidence)
          ? integer(row.restSeconds, 0, 3_600)
          : suppliedFieldConfidence.restSeconds !== undefined ? integer(row.restSeconds, 0, 3_600) : null,
        note: isFieldAwareResponse ? text(row.note, 500) : verifiedEvidence(row.note, evidence),
        movementPattern: movementPattern(row.movementPattern, name),
        confidence: exerciseConfidence,
        needsConfirmation: false,
        section,
        exerciseOrder: integer(row.exerciseOrder, 1, 100) ?? index + 1,
        completedSets: proposedCompletedSets ?? sets,
        repRangeMin: proposedRangeMin,
        repRangeMax: proposedRangeMax,
        approximateReps: row.approximateReps === true,
        durationValue: number(row.durationValue, 0, 3_600),
        durationUnit: row.durationUnit === "seconds" || row.durationUnit === "minutes" ? row.durationUnit : null,
        loadBasis,
        loadText: text(row.loadText, 300),
        startingLoad: number(row.startingLoad, 0, 2_000),
        workingLoad: number(row.workingLoad, 0, 2_000),
        topLoad: number(row.topLoad, 0, 2_000),
        backoffLoad: number(row.backoffLoad, 0, 2_000),
        rpe: proposedRpe,
        rir: proposedRir,
        restStyle: text(row.restStyle, 80),
        setType: setTypeValue(row.setType),
        trainingMethods: methods,
        supersetGroup: methods.some((method) => method === "superset" || method === "alternating_set" || method === "circuit" || method === "amrap")
          ? text(row.supersetGroup, 80)
          : null,
        groupRounds: integer(row.groupRounds, 1, 100),
        warmup: row.warmup === true,
        workingSet: row.workingSet === true,
        backoffSet: row.backoffSet === true,
        dropSet: row.dropSet === true,
        loadSteps,
        setDetails,
        uncertainFields: [],
        fieldConfidence: suppliedFieldConfidence
      };

      const populatedFields = WORKOUT_CAPTURE_CONFIDENCE_FIELDS.filter((field) => fieldIsPresent(field, exercise));
      const finalFieldConfidence = Object.fromEntries(populatedFields.map((field) => [
        field,
        suppliedFieldConfidence[field] ?? exerciseConfidence
      ])) as WorkoutCaptureFieldConfidence;
      const uncertainFields = new Set<WorkoutCaptureConfidenceField>(normalizedUncertainFields(row.uncertainFields));
      populatedFields.forEach((field) => {
        if ((finalFieldConfidence[field] ?? exerciseConfidence) < FIELD_CONFIDENCE_THRESHOLD) uncertainFields.add(field);
      });
      ambiguousSetRepFields(evidence, sets, reps).forEach((field) => uncertainFields.add(field));
      if (row.needsConfirmation === true && uncertainFields.size === 0) {
        const leastCertain = populatedFields
          .map((field) => ({ field, value: finalFieldConfidence[field] ?? exerciseConfidence }))
          .sort((a, b) => a.value - b.value)[0]?.field;
        if (leastCertain) uncertainFields.add(leastCertain);
      }
      exercise.uncertainFields = [...uncertainFields].filter((field) =>
        fieldIsPresent(field, exercise) || (field === "sets" || field === "reps") && ambiguousSetRepFields(evidence, sets, reps).includes(field)
      );
      exercise.needsConfirmation = exercise.uncertainFields.length > 0;
      exercise.fieldConfidence = finalFieldConfidence;
      return exercise;
    })
    .filter((item): item is WorkoutCaptureExercise => Boolean(item))
    .slice(0, 30);

  if (!exercises.length) return fallback;

  const rawDifficulty = text(parsed.difficulty, 20)?.toLowerCase();
  const difficulty: WorkoutCaptureDifficulty = rawDifficulty === "easy" || rawDifficulty === "challenging" ? rawDifficulty : "moderate";
  const uncertainties: string[] = [];
  exercises.forEach((exercise) => {
    if (exercise.needsConfirmation) {
      const fields = (exercise.uncertainFields ?? []).map((field) => fieldLabel(field as WorkoutCaptureConfidenceField));
      uncertainties.push(`Confirm ${fields.join(" and ")} for ${exercise.name}.`);
    }
  });

  return {
    version: WORKOUT_CAPTURE_VERSION,
    sourceMode,
    originalInput: cleanedInput,
    title: text(parsed.title, 120) ?? fallback.title,
    workoutType: text(parsed.workoutType, 80) ?? fallback.workoutType,
    difficulty,
    durationMinutes: supportsTotalDuration(cleanedInput, integer(parsed.durationMinutes, 5, 300))
      ? integer(parsed.durationMinutes, 5, 300)
      : fallback.durationMinutes,
    exercises,
    confidence: confidence(parsed.confidence, exercises.reduce((sum, exercise) => sum + exercise.confidence, 0) / exercises.length),
    uncertainties: [...new Set(uncertainties)].slice(0, 12),
    requiresReview: true
  };
}

export function buildWorkoutCapturePrompt(input: string, recentExerciseNames: string[] = []) {
  const cleanedInput = normalizeWorkoutCaptureInput(input);
  return [
    "Convert the member's rough workout notes into a trustworthy structured workout receipt. Extract aggressively, but invent nothing.",
    "Extract only details the member actually supplied. Never invent weights, sets, reps, duration, or exercise names.",
    "For every exercise, originalText must be a verbatim excerpt from the member input that supports the extracted fields.",
    "When a value is missing, return null. When it is ambiguous or approximate, preserve that uncertainty, set needsConfirmation to true, lower only that field's confidence, and name only that field in uncertainFields.",
    "Return fieldConfidence on every exercise. It is an object keyed by every non-null extracted field, with a 0-to-1 confidence for each field. Confidence must be field-specific: a clear exercise name can be 0.98 while ambiguous sets and reps are 0.55.",
    "The reps field must always be a JSON string, even for one number or a per-set sequence. Examples: 8 becomes \"8\" and [10, 10, 8] becomes \"10,10,8\". Never return reps as a JSON number or array. Also populate setDetails for per-set performance when useful.",
    "Understand normal human shorthand and derived meaning. Examples: '80kg 10 10 8' means one 80kg load with per-set reps 10,10,8; 'first two sets 10 last set 8' means 3 sets with reps 10,10,8; '22.5 each hand x10 x9 x8' means 3 sets, per-hand load, and per-set reps; A1/A2 with rounds is grouped alternating work.",
    "Keep the member's original unit. Preserve whether load is total, per side, per hand/dumbbell, assistance, bodyweight, bodyweight plus load, a machine setting, a band, or unknown.",
    "Preserve section headings such as Warm-up, Chest, Back, Conditioning, Finisher, and Cooldown when supplied.",
    "Preserve progressive loads and corrections in loadSteps. Distinguish starting, working, top, backoff, drop, correction, and unknown load roles.",
    "Recognize explicitly stated ramp-up, back-off, drop set, FST-7, rest-pause, AMRAP, superset, alternating set, giant set, circuit, and short-rest work. Never infer a method that was not stated.",
    "Preserve RPE and RIR independently. Do not confuse time, clock times, wait times, rounds, calories, sets, reps, or load.",
    "Treat an exercise-name line followed by a sets/reps line as one exercise. Do not attach that prescription to the next exercise.",
    "Preserve meaningful exercise modifiers such as cable, machine, incline, converging, upper, or lower; never collapse distinct movements into a generic name such as Flyes.",
    "Correct only obvious spelling or dictation mistakes when the intended exercise is clear. Preserve the verbatim source in originalText.",
    "Tempo such as '1 sec up 3 sec down' belongs in note and must never become restSeconds or exercise duration.",
    "Interpret A x B as sets x reps by convention. If A is unusually high and B unusually low, keep the most likely interpretation but mark only sets and reps uncertain for confirmation because the order materially changes the record.",
    "Exercises in the same superset/circuit must share a stable supersetGroup. Preserve circuit rounds in groupRounds.",
    `Movement pattern must be one of: ${WORKOUT_MOVEMENT_PATTERNS.join(", ")}.`,
    `Load basis must be one of: ${WORKOUT_LOAD_BASES.join(", ")}.`,
    `Set type must be one of: ${WORKOUT_SET_TYPES.join(", ")}.`,
    `Training methods may only contain: ${WORKOUT_TRAINING_METHODS.join(", ")}.`,
    "Difficulty must be easy, moderate, or challenging. Use moderate only as a neutral label when intensity is not stated.",
    "Return strict JSON only with: title, workoutType, difficulty, durationMinutes, confidence, uncertainties, exercises.",
    "Each exercise must contain the existing fields name, originalText, sets, reps, load, loadUnit, durationMinutes, restSeconds, note, movementPattern, confidence, needsConfirmation, plus section, exerciseOrder, completedSets, repRangeMin, repRangeMax, approximateReps, durationValue, durationUnit, loadBasis, loadText, startingLoad, workingLoad, topLoad, backoffLoad, rpe, rir, restStyle, setType, trainingMethods, supersetGroup, groupRounds, warmup, workingSet, backoffSet, dropSet, loadSteps, setDetails, uncertainFields, fieldConfidence.",
    "Each loadSteps item contains value, unit, basis, role, reps, approximate, note, confidence. Each setDetails item contains order, reps, repRangeMin, repRangeMax, load, loadUnit, loadBasis, durationValue, durationUnit, setType, rpe, rir, approximate, note.",
    recentExerciseNames.length
      ? `Use these previously confirmed names only to normalize obvious aliases: ${recentExerciseNames.slice(0, 30).join(", ")}.`
      : "No confirmed exercise-name history is available.",
    `Member input:\n${cleanedInput}`
  ].join("\n");
}

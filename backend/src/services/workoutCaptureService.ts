import {
  WORKOUT_LOAD_BASES,
  WORKOUT_CAPTURE_VERSION,
  WORKOUT_MOVEMENT_PATTERNS,
  WORKOUT_SET_TYPES,
  WORKOUT_TRAINING_METHODS,
  WorkoutCaptureDifficulty,
  WorkoutCaptureDraft,
  WorkoutCaptureExercise,
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
  const cleanedInput = originalInput.trim().replace(/\r/g, "").slice(0, 5_000);
  const segments = cleanedInput.split(/\n|;|,(?=\s*[A-Za-z])/).map((item) => item.trim()).filter(Boolean);
  const richExercises = parseWorkoutCaptureExercises(cleanedInput);
  const exercises = richExercises.length
    ? richExercises
    : segments.map(parseFallbackExercise).filter((item): item is WorkoutCaptureExercise => Boolean(item)).slice(0, 30);
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
  return new RegExp(`\\b${token}\\s*[- ]?(?:min|mins|minutes?|sec|secs|seconds?)\\b`, "i").test(evidence);
}

function supportsTotalDuration(evidence: string, value: number | null) {
  if (value === null) return false;
  const token = numberToken(value).replace(".", "\\.");
  return new RegExp(`(?:total(?:\\s+time)?|workout(?:\\s+was)?|session(?:\\s+was)?)\\s*[:=-]?\\s*${token}\\s*(?:min|mins|minutes?)\\b`, "i").test(evidence);
}

function supportsRating(evidence: string, value: number | null, label: "rpe" | "rir") {
  if (value === null) return false;
  const token = numberToken(value).replace(".", "\\.");
  return label === "rpe"
    ? new RegExp(`\\brpe\\s*${token}\\b`, "i").test(evidence)
    : new RegExp(`\\b${token}\\s*rir\\b`, "i").test(evidence);
}

function loadBasisValue(value: unknown): WorkoutLoadBasis {
  return WORKOUT_LOAD_BASES.includes(value as WorkoutLoadBasis) ? value as WorkoutLoadBasis : "unknown";
}

function setTypeValue(value: unknown): WorkoutSetType {
  return WORKOUT_SET_TYPES.includes(value as WorkoutSetType) ? value as WorkoutSetType : "unknown";
}

function supportedSetType(value: unknown, evidence: string) {
  const candidate = setTypeValue(value);
  if (candidate === "warmup") return /warm[ -]?up|ramp[ -]?up/i.test(evidence) ? candidate : "unknown";
  if (candidate === "top") return /worked up|top set|top load/i.test(evidence) ? candidate : "unknown";
  if (candidate === "backoff") return /back[ -]?off|reduced/i.test(evidence) ? candidate : "unknown";
  if (candidate === "drop") return /drop set/i.test(evidence) ? candidate : "unknown";
  if (candidate === "finisher") return /finisher|to finish|finishing work/i.test(evidence) ? candidate : "unknown";
  if (candidate === "working") return /working sets?|finished .* there/i.test(evidence) ? candidate : "unknown";
  return candidate;
}

function methodHasEvidence(method: WorkoutTrainingMethod, evidence: string) {
  const patterns: Record<WorkoutTrainingMethod, RegExp> = {
    fst_7: /fst[ -]?7/i,
    drop_set: /drop set/i,
    back_off: /back[ -]?off/i,
    ramp_up: /ramp[ -]?up/i,
    rest_pause: /rest[ -]?pause/i,
    amrap: /\bamrap\b/i,
    superset: /superset/i,
    alternating_set: /alternat/i,
    giant_set: /giant set/i,
    circuit: /\bcircuit\b|\d+\s+rounds/i,
    short_rest: /short[ -]?rest/i
  };
  return patterns[method].test(evidence);
}

function normalizedMethods(value: unknown, evidence: string): WorkoutTrainingMethod[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((method): method is WorkoutTrainingMethod =>
    WORKOUT_TRAINING_METHODS.includes(method as WorkoutTrainingMethod) && methodHasEvidence(method as WorkoutTrainingMethod, evidence)
  ))];
}

function normalizedLoadSteps(value: unknown, evidence: string): WorkoutCaptureLoadStep[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const stepValue = number(row.value, 0, 2_000);
    if (!supportsLoad(evidence, stepValue)) return [];
    const rawUnit = text(row.unit, 8)?.toLowerCase();
    const unit: "kg" | "lb" | null = rawUnit === "kg" || rawUnit === "lb" ? rawUnit : null;
    const rawRole = text(row.role, 20)?.toLowerCase();
    const role: WorkoutLoadRole = rawRole === "starting" || rawRole === "working" || rawRole === "top" || rawRole === "backoff" || rawRole === "drop" || rawRole === "correction" ? rawRole : "unknown";
    const reps = text(row.reps, 80);
    return [{
      value: stepValue,
      unit,
      basis: loadBasisValue(row.basis),
      role,
      reps: supportsReps(evidence, reps) ? reps : null,
      approximate: row.approximate === true,
      note: text(row.note, 300),
      confidence: confidence(row.confidence)
    }];
  }).slice(0, 30);
}

function normalizedSetDetails(value: unknown, evidence: string): WorkoutCaptureSetDetail[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const reps = text(row.reps, 80);
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
      reps: supportsReps(evidence, reps) ? reps : null,
      repRangeMin: supportsReps(evidence, row.repRangeMin === null || row.repRangeMin === undefined ? null : String(row.repRangeMin)) ? number(row.repRangeMin, 0, 1_000) : null,
      repRangeMax: supportsReps(evidence, row.repRangeMax === null || row.repRangeMax === undefined ? null : String(row.repRangeMax)) ? number(row.repRangeMax, 0, 1_000) : null,
      load: supportsLoad(evidence, load) ? load : null,
      loadUnit,
      loadBasis: loadBasisValue(row.loadBasis),
      durationValue: supportsDuration(evidence, durationValue) ? durationValue : null,
      durationUnit,
      setType: supportedSetType(row.setType, evidence),
      rpe: supportsRating(evidence, rpe, "rpe") ? rpe : null,
      rir: supportsRating(evidence, rir, "rir") ? rir : null,
      approximate: row.approximate === true,
      note: text(row.note, 300)
    }];
  }).filter((detail) => detail.reps !== null || detail.load !== null || detail.durationValue !== null || detail.rpe !== null || detail.rir !== null).slice(0, 100);
}

function fallbackMatch(fallback: WorkoutCaptureDraft, evidence: string | null, name: string) {
  const normalizedName = normalizedEvidence(name);
  return fallback.exercises.find((exercise) => {
    const source = normalizedEvidence(exercise.originalText ?? "");
    const candidate = normalizedEvidence(evidence ?? "");
    const existingName = normalizedEvidence(exercise.name);
    return Boolean(candidate && source && (candidate.includes(source) || source.includes(candidate)))
      || Boolean(normalizedName && existingName && (normalizedName.includes(existingName) || existingName.includes(normalizedName)));
  }) ?? null;
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
    .map((item, index): WorkoutCaptureExercise | null => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const proposedName = text(row.name, 120);
      if (!proposedName) return null;
      const exactEvidence = verifiedEvidence(row.originalText, originalInput);
      const baseline = fallbackMatch(fallback, exactEvidence, proposedName);
      if (!exactEvidence && !baseline) return null;
      const evidence = exactEvidence ?? baseline?.originalText ?? "";
      const name = baseline?.name ?? proposedName;
      const exerciseConfidence = confidence(row.confidence);
      const proposedSets = integer(row.sets, 1, 100);
      const proposedReps = text(row.reps, 80);
      const proposedDuration = integer(row.durationMinutes, 1, 300);
      const proposedLoad = number(row.load, 0, 2_000);
      const proposedLoadSupported = supportsLoad(evidence, proposedLoad);
      const sets = supportsSets(evidence, proposedSets) ? proposedSets : baseline?.sets ?? null;
      const reps = supportsReps(evidence, proposedReps) ? proposedReps : baseline?.reps ?? null;
      const durationMinutes = supportsDuration(evidence, proposedDuration) ? proposedDuration : baseline?.durationMinutes ?? null;
      const load = proposedLoadSupported ? proposedLoad : baseline?.load ?? null;
      const rawUnit = text(row.loadUnit, 8)?.toLowerCase();
      const loadUnit = proposedLoadSupported && (rawUnit === "kg" || rawUnit === "lb") ? rawUnit : baseline?.loadUnit ?? null;
      const proposedRpe = number(row.rpe, 1, 10);
      const proposedRir = number(row.rir, 0, 10);
      const methods = [...new Set([...(baseline?.trainingMethods ?? []), ...normalizedMethods(row.trainingMethods, evidence)])];
      const loadSteps = [...(baseline?.loadSteps ?? []), ...normalizedLoadSteps(row.loadSteps, evidence)]
        .filter((step, stepIndex, all) => !all.slice(0, stepIndex).some((candidate) => candidate.value === step.value && candidate.unit === step.unit && candidate.role === step.role));
      const setDetails = [...(baseline?.setDetails ?? []), ...normalizedSetDetails(row.setDetails, evidence)]
        .filter((detail, detailIndex, all) => !all.slice(0, detailIndex).some((candidate) => candidate.order === detail.order && candidate.load === detail.load && candidate.reps === detail.reps));
      const rawSection = text(row.section, 80);
      const section = rawSection && new RegExp(`(?:^|\\n)\\s*${rawSection.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:?(?:\\n|$)`, "i").test(originalInput)
        ? rawSection
        : baseline?.section ?? null;
      const rawBasis = loadBasisValue(row.loadBasis);
      const loadBasis = rawBasis !== "unknown" && (
        rawBasis === "per_side" && /per side|each side/i.test(evidence)
        || rawBasis === "per_hand" && /each hand|dumbbells?|\bdb\b|\d+(?:\.\d+)?s\s*[x×]/i.test(evidence)
        || rawBasis === "assistance" && /assistance|assisted/i.test(evidence)
        || rawBasis === "bodyweight" && /bodyweight/i.test(evidence)
        || rawBasis === "bodyweight_plus" && /bodyweight\s*\+/i.test(evidence)
        || rawBasis === "machine_setting" && /machine setting/i.test(evidence)
        || rawBasis === "band" && /resistance band|banded/i.test(evidence)
        || rawBasis === "total" && /\b(?:kg|lb|kilos?|pounds?)\b/i.test(evidence)
      ) ? rawBasis : baseline?.loadBasis ?? "unknown";
      const proposedCompletedSets = integer(row.completedSets, 1, 100);
      const proposedRangeMin = integer(row.repRangeMin, 0, 1_000);
      const proposedRangeMax = integer(row.repRangeMax, 0, 1_000);
      const uncertainFields = Array.isArray(row.uncertainFields)
        ? row.uncertainFields.map((field) => text(field, 40)).filter((field): field is string => Boolean(field)).slice(0, 20)
        : [];
      return {
        name,
        originalText: evidence.slice(0, 1_000),
        sets,
        reps,
        load,
        loadUnit,
        durationMinutes,
        restSeconds: /\b\d+\s*(?:sec|secs|seconds?)\s*(?:rest|between rounds)?\b/i.test(evidence)
          ? integer(row.restSeconds, 0, 3_600)
          : baseline?.restSeconds ?? null,
        note: verifiedEvidence(row.note, evidence) ?? baseline?.note ?? null,
        movementPattern: movementPattern(row.movementPattern, name),
        confidence: exerciseConfidence,
        needsConfirmation: row.needsConfirmation === true || exerciseConfidence < 0.75 || uncertainFields.length > 0 || baseline?.needsConfirmation === true,
        section,
        exerciseOrder: integer(row.exerciseOrder, 1, 100) ?? baseline?.exerciseOrder ?? index + 1,
        completedSets: supportsSets(evidence, proposedCompletedSets) ? proposedCompletedSets : baseline?.completedSets ?? sets,
        repRangeMin: supportsReps(evidence, proposedRangeMin === null ? null : String(proposedRangeMin)) ? proposedRangeMin : baseline?.repRangeMin ?? null,
        repRangeMax: supportsReps(evidence, proposedRangeMax === null ? null : String(proposedRangeMax)) ? proposedRangeMax : baseline?.repRangeMax ?? null,
        approximateReps: row.approximateReps === true && /around|about|maybe|~|i think/i.test(evidence) || baseline?.approximateReps === true,
        durationValue: supportsDuration(evidence, number(row.durationValue, 0, 3_600)) ? number(row.durationValue, 0, 3_600) : baseline?.durationValue ?? null,
        durationUnit: row.durationUnit === "seconds" || row.durationUnit === "minutes" ? row.durationUnit : baseline?.durationUnit ?? null,
        loadBasis,
        loadText: verifiedEvidence(row.loadText, evidence) ?? baseline?.loadText ?? null,
        startingLoad: supportsLoad(evidence, number(row.startingLoad, 0, 2_000)) ? number(row.startingLoad, 0, 2_000) : baseline?.startingLoad ?? null,
        workingLoad: supportsLoad(evidence, number(row.workingLoad, 0, 2_000)) ? number(row.workingLoad, 0, 2_000) : baseline?.workingLoad ?? null,
        topLoad: supportsLoad(evidence, number(row.topLoad, 0, 2_000)) ? number(row.topLoad, 0, 2_000) : baseline?.topLoad ?? null,
        backoffLoad: supportsLoad(evidence, number(row.backoffLoad, 0, 2_000)) ? number(row.backoffLoad, 0, 2_000) : baseline?.backoffLoad ?? null,
        rpe: supportsRating(evidence, proposedRpe, "rpe") ? proposedRpe : baseline?.rpe ?? null,
        rir: supportsRating(evidence, proposedRir, "rir") ? proposedRir : baseline?.rir ?? null,
        restStyle: verifiedEvidence(row.restStyle, evidence) ?? baseline?.restStyle ?? null,
        setType: supportedSetType(row.setType, evidence) !== "unknown" ? supportedSetType(row.setType, evidence) : baseline?.setType ?? "unknown",
        trainingMethods: methods,
        supersetGroup: methods.some((method) => method === "superset" || method === "alternating_set" || method === "circuit" || method === "amrap")
          ? text(row.supersetGroup, 80) ?? baseline?.supersetGroup ?? null
          : baseline?.supersetGroup ?? null,
        groupRounds: /\b\d+\s+rounds?\b/i.test(evidence) ? integer(row.groupRounds, 1, 100) : baseline?.groupRounds ?? null,
        warmup: row.warmup === true && /warm[ -]?up|ramp[ -]?up/i.test(evidence) || baseline?.warmup === true,
        workingSet: row.workingSet === true && /working sets?/i.test(evidence) || baseline?.workingSet === true,
        backoffSet: row.backoffSet === true && /back[ -]?off|reduced/i.test(evidence) || baseline?.backoffSet === true,
        dropSet: row.dropSet === true && /drop set/i.test(evidence) || baseline?.dropSet === true,
        loadSteps,
        setDetails,
        uncertainFields: [...new Set([...(baseline?.uncertainFields ?? []), ...uncertainFields])]
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
    originalInput: originalInput.trim().slice(0, 5_000),
    title: text(parsed.title, 120) ?? fallback.title,
    workoutType: text(parsed.workoutType, 80) ?? fallback.workoutType,
    difficulty,
    durationMinutes: supportsTotalDuration(originalInput, integer(parsed.durationMinutes, 5, 300))
      ? integer(parsed.durationMinutes, 5, 300)
      : fallback.durationMinutes,
    exercises,
    confidence: confidence(parsed.confidence, exercises.reduce((sum, exercise) => sum + exercise.confidence, 0) / exercises.length),
    uncertainties: [...new Set(uncertainties)].slice(0, 12),
    requiresReview: true
  };
}

export function buildWorkoutCapturePrompt(input: string, recentExerciseNames: string[] = []) {
  return [
    "Convert the member's rough workout notes into a trustworthy structured workout receipt. Extract aggressively, but invent nothing.",
    "Extract only details the member actually supplied. Never invent weights, sets, reps, duration, or exercise names.",
    "For every exercise, originalText must be a verbatim excerpt from the member input that supports the extracted fields.",
    "When a value is missing, return null. When it is ambiguous or approximate, preserve that uncertainty, set needsConfirmation to true, lower confidence, and name the field in uncertainFields.",
    "Keep the member's original unit. Preserve whether load is total, per side, per hand/dumbbell, assistance, bodyweight, bodyweight plus load, a machine setting, a band, or unknown.",
    "Preserve section headings such as Warm-up, Chest, Back, Conditioning, Finisher, and Cooldown when supplied.",
    "Preserve progressive loads and corrections in loadSteps. Distinguish starting, working, top, backoff, drop, correction, and unknown load roles.",
    "Recognize explicitly stated ramp-up, back-off, drop set, FST-7, rest-pause, AMRAP, superset, alternating set, giant set, circuit, and short-rest work. Never infer a method that was not stated.",
    "Preserve RPE and RIR independently. Do not confuse time, clock times, wait times, rounds, calories, sets, reps, or load.",
    "Exercises in the same superset/circuit must share a stable supersetGroup. Preserve circuit rounds in groupRounds.",
    `Movement pattern must be one of: ${WORKOUT_MOVEMENT_PATTERNS.join(", ")}.`,
    `Load basis must be one of: ${WORKOUT_LOAD_BASES.join(", ")}.`,
    `Set type must be one of: ${WORKOUT_SET_TYPES.join(", ")}.`,
    `Training methods may only contain: ${WORKOUT_TRAINING_METHODS.join(", ")}.`,
    "Difficulty must be easy, moderate, or challenging. Use moderate only as a neutral label when intensity is not stated.",
    "Return strict JSON only with: title, workoutType, difficulty, durationMinutes, confidence, uncertainties, exercises.",
    "Each exercise must contain the existing fields name, originalText, sets, reps, load, loadUnit, durationMinutes, restSeconds, note, movementPattern, confidence, needsConfirmation, plus section, exerciseOrder, completedSets, repRangeMin, repRangeMax, approximateReps, durationValue, durationUnit, loadBasis, loadText, startingLoad, workingLoad, topLoad, backoffLoad, rpe, rir, restStyle, setType, trainingMethods, supersetGroup, groupRounds, warmup, workingSet, backoffSet, dropSet, loadSteps, setDetails, uncertainFields.",
    "Each loadSteps item contains value, unit, basis, role, reps, approximate, note, confidence. Each setDetails item contains order, reps, repRangeMin, repRangeMax, load, loadUnit, loadBasis, durationValue, durationUnit, setType, rpe, rir, approximate, note.",
    recentExerciseNames.length
      ? `Use these previously confirmed names only to normalize obvious aliases: ${recentExerciseNames.slice(0, 30).join(", ")}.`
      : "No confirmed exercise-name history is available.",
    `Member input:\n${input.trim().slice(0, 5_000)}`
  ].join("\n");
}

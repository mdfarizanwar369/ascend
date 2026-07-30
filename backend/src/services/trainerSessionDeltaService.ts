import {
  TrainerSessionDelta,
  TrainerSessionDeltaChange,
  WorkoutCaptureDraft,
  WorkoutCaptureExercise
} from "@ascend/shared";
import { createFallbackWorkoutCapture } from "./workoutCaptureService";

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

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function emptyChange(originalText: string): TrainerSessionDeltaChange {
  return {
    action: "update",
    targetExerciseName: null,
    name: null,
    sets: null,
    reps: null,
    load: null,
    loadDelta: null,
    loadUnit: null,
    durationMinutes: null,
    restSeconds: null,
    note: null,
    originalText: originalText.trim().slice(0, 240),
    confidence: 0.45,
    needsConfirmation: true
  };
}

function fallbackChange(segment: string): TrainerSessionDeltaChange | null {
  const originalText = segment.trim();
  if (!originalText) return null;
  const removePrefix = originalText.match(/^(?:skip(?:ped)?|remove(?:d)?|omit(?:ted)?)\s+(.+)$/i);
  const removeSuffix = originalText.match(/^(.+?)\s+(?:skipped|removed|omitted)$/i);
  if (removePrefix || removeSuffix) {
    return { ...emptyChange(originalText), action: "remove", targetExerciseName: (removePrefix?.[1] ?? removeSuffix?.[1] ?? "").trim(), confidence: 0.85, needsConfirmation: false };
  }

  const addMatch = originalText.match(/^(?:add(?:ed)?|include(?:d)?)\s+(.+)$/i);
  const exerciseText = addMatch?.[1]?.trim() ?? originalText;
  const parsed = createFallbackWorkoutCapture(exerciseText, "text").exercises[0];
  if (addMatch) {
    return parsed
      ? { ...emptyChange(originalText), action: "add", name: parsed.name, sets: parsed.sets, reps: parsed.reps, load: parsed.load, loadUnit: parsed.loadUnit, durationMinutes: parsed.durationMinutes, restSeconds: parsed.restSeconds, note: parsed.note, confidence: parsed.confidence, needsConfirmation: parsed.needsConfirmation }
      : { ...emptyChange(originalText), action: "add", name: exerciseText };
  }

  const relativeLoad = originalText.match(/^(.+?)\s+([+-]\d+(?:\.\d+)?)\s*(kg|lb|lbs|kgs)\b/i);
  if (relativeLoad) {
    return { ...emptyChange(originalText), targetExerciseName: relativeLoad[1].trim(), loadDelta: Number(relativeLoad[2]), loadUnit: relativeLoad[3].toLowerCase().startsWith("k") ? "kg" : "lb", confidence: 0.9, needsConfirmation: false };
  }

  if (!parsed) return emptyChange(originalText);
  return {
    ...emptyChange(originalText),
    targetExerciseName: parsed.name,
    sets: parsed.sets,
    reps: parsed.reps,
    load: parsed.load,
    loadUnit: parsed.loadUnit,
    durationMinutes: parsed.durationMinutes,
    restSeconds: parsed.restSeconds,
    note: parsed.note,
    confidence: parsed.confidence,
    needsConfirmation: parsed.needsConfirmation
  };
}

export function createFallbackTrainerSessionDelta(input: string): TrainerSessionDelta {
  const changes = input.trim().slice(0, 2_000).split(/\n|;|,(?=\s*[A-Za-z])/).map(fallbackChange).filter((change): change is TrainerSessionDeltaChange => Boolean(change)).slice(0, 30);
  const uncertainties = changes.filter((change) => change.needsConfirmation).map((change) => `Please confirm: ${change.originalText}.`);
  return {
    changes,
    durationMinutes: null,
    workoutType: null,
    difficulty: null,
    confidence: changes.length ? Math.round((changes.reduce((sum, change) => sum + change.confidence, 0) / changes.length) * 100) / 100 : 0,
    uncertainties: [...new Set(uncertainties)].slice(0, 12)
  };
}

function extractJsonObject(value: string) {
  const cleaned = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Session delta response did not contain JSON.");
  return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
}

export function normalizeTrainerSessionDeltaResponse(rawResponse: string, originalInput: string): TrainerSessionDelta {
  const fallback = createFallbackTrainerSessionDelta(originalInput);
  let parsed: Record<string, unknown>;
  try { parsed = extractJsonObject(rawResponse); } catch { return fallback; }
  const changes = (Array.isArray(parsed.changes) ? parsed.changes : []).map((item): TrainerSessionDeltaChange | null => {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    const action = row.action === "remove" || row.action === "add" ? row.action : "update";
    const rawUnit = text(row.loadUnit, 8)?.toLowerCase();
    const loadUnit = rawUnit === "kg" || rawUnit === "lb" ? rawUnit : null;
    const targetExerciseName = text(row.targetExerciseName, 120);
    const name = text(row.name, 120);
    const originalText = text(row.originalText, 240) ?? "";
    if (action === "add" && !name) return null;
    if (action !== "add" && !targetExerciseName) return null;
    return {
      action,
      targetExerciseName,
      name,
      sets: integer(row.sets, 1, 100),
      reps: text(row.reps, 80),
      load: number(row.load, 0, 2_000),
      loadDelta: number(row.loadDelta, -2_000, 2_000),
      loadUnit,
      durationMinutes: integer(row.durationMinutes, 1, 300),
      restSeconds: integer(row.restSeconds, 0, 3_600),
      note: text(row.note, 500),
      originalText,
      confidence: confidence(row.confidence),
      needsConfirmation: row.needsConfirmation === true || confidence(row.confidence) < 0.75
    };
  }).filter((change): change is TrainerSessionDeltaChange => Boolean(change)).slice(0, 30);
  if (!changes.length) return fallback;
  const rawDifficulty = text(parsed.difficulty, 20)?.toLowerCase();
  return {
    changes,
    durationMinutes: integer(parsed.durationMinutes, 5, 300),
    workoutType: text(parsed.workoutType, 80),
    difficulty: rawDifficulty === "easy" || rawDifficulty === "moderate" || rawDifficulty === "challenging" ? rawDifficulty : null,
    confidence: confidence(parsed.confidence, changes.reduce((sum, change) => sum + change.confidence, 0) / changes.length),
    uncertainties: Array.isArray(parsed.uncertainties) ? parsed.uncertainties.map((item) => text(item, 200)).filter((item): item is string => Boolean(item)).slice(0, 12) : []
  };
}

export function buildTrainerSessionDeltaPrompt(input: string, base: WorkoutCaptureDraft) {
  const baseExercises = base.exercises.map((exercise) => ({ name: exercise.name, sets: exercise.sets, reps: exercise.reps, load: exercise.load, loadUnit: exercise.loadUnit, durationMinutes: exercise.durationMinutes, restSeconds: exercise.restSeconds }));
  return [
    "Apply the trainer's change notes to a previously confirmed workout.",
    "Return changes only. Never repeat unchanged exercises and never invent a change.",
    "For update/remove, targetExerciseName must exactly match one base exercise name.",
    "Use action update, remove, or add. For relative load such as +5kg use loadDelta, not load.",
    "Null means unchanged. If intent or target is unclear, set needsConfirmation true and explain it in uncertainties.",
    "Return strict JSON with changes, durationMinutes, workoutType, difficulty, confidence, uncertainties.",
    "Each change: action, targetExerciseName, name, sets, reps, load, loadDelta, loadUnit, durationMinutes, restSeconds, note, originalText, confidence, needsConfirmation.",
    `Confirmed base workout: ${JSON.stringify({ title: base.title, workoutType: base.workoutType, difficulty: base.difficulty, durationMinutes: base.durationMinutes, exercises: baseExercises })}`,
    `Trainer changes: ${input.trim().slice(0, 2_000)}`
  ].join("\n");
}

function findBaseIndex(exercises: WorkoutCaptureExercise[], target: string | null) {
  if (!target) return -1;
  const normalizedTarget = normalizeName(target);
  const exact = exercises.findIndex((exercise) => normalizeName(exercise.name) === normalizedTarget);
  if (exact >= 0) return exact;
  const candidates = exercises.map((exercise, index) => ({ index, name: normalizeName(exercise.name) })).filter((candidate) => candidate.name.includes(normalizedTarget) || normalizedTarget.includes(candidate.name));
  return candidates.length === 1 ? candidates[0].index : -1;
}

function addedExercise(change: TrainerSessionDeltaChange): WorkoutCaptureExercise {
  const parsed = createFallbackWorkoutCapture(change.originalText || change.name || "", "text").exercises[0];
  return {
    name: change.name ?? parsed?.name ?? "Exercise to confirm",
    originalText: change.originalText,
    sets: change.sets ?? parsed?.sets ?? null,
    reps: change.reps ?? parsed?.reps ?? null,
    load: change.load ?? parsed?.load ?? null,
    loadUnit: change.loadUnit ?? parsed?.loadUnit ?? null,
    durationMinutes: change.durationMinutes ?? parsed?.durationMinutes ?? null,
    restSeconds: change.restSeconds ?? parsed?.restSeconds ?? null,
    note: change.note ?? parsed?.note ?? null,
    movementPattern: parsed?.movementPattern ?? "other",
    confidence: change.confidence,
    needsConfirmation: change.needsConfirmation
  };
}

export function mergeTrainerSessionDelta(base: WorkoutCaptureDraft, delta: TrainerSessionDelta, originalInput: string) {
  const exercises = base.exercises.map((exercise) => ({ ...exercise }));
  const uncertainties = [...delta.uncertainties];
  const appliedChanges: TrainerSessionDeltaChange[] = [];

  for (const change of delta.changes) {
    if (change.action === "add") {
      exercises.push(addedExercise(change));
      appliedChanges.push(change);
      continue;
    }
    const index = findBaseIndex(exercises, change.targetExerciseName);
    if (index < 0) {
      uncertainties.push(`Could not safely match ${change.targetExerciseName ?? "an exercise"} to the previous session.`);
      continue;
    }
    if (change.action === "remove") {
      if (exercises.length === 1) {
        uncertainties.push(`Could not remove ${exercises[index].name} because a saved session needs at least one exercise.`);
        continue;
      }
      exercises.splice(index, 1);
      appliedChanges.push(change);
      continue;
    }
    const current = exercises[index];
    let nextLoad = change.load ?? current.load;
    let nextUnit = change.loadUnit ?? current.loadUnit;
    if (change.loadDelta !== null) {
      if (current.load === null || (change.loadUnit && current.loadUnit && change.loadUnit !== current.loadUnit)) {
        uncertainties.push(`Could not safely apply the relative load change for ${current.name}.`);
        continue;
      } else {
        nextLoad = Math.max(0, current.load + change.loadDelta);
        nextUnit = change.loadUnit ?? current.loadUnit;
      }
    }
    exercises[index] = {
      ...current,
      name: change.name ?? current.name,
      originalText: change.originalText || current.originalText,
      sets: change.sets ?? current.sets,
      reps: change.reps ?? current.reps,
      load: nextLoad,
      loadUnit: nextUnit,
      durationMinutes: change.durationMinutes ?? current.durationMinutes,
      restSeconds: change.restSeconds ?? current.restSeconds,
      note: change.note ?? current.note,
      confidence: Math.min(current.confidence, change.confidence),
      needsConfirmation: current.needsConfirmation || change.needsConfirmation
    };
    appliedChanges.push(change);
  }

  const draft: WorkoutCaptureDraft = {
    ...base,
    sourceMode: "repeat",
    originalInput: originalInput.trim().slice(0, 2_000),
    workoutType: delta.workoutType ?? base.workoutType,
    difficulty: delta.difficulty ?? base.difficulty,
    durationMinutes: delta.durationMinutes ?? base.durationMinutes,
    exercises,
    confidence: Math.min(base.confidence, delta.confidence),
    uncertainties: [...new Set([...base.uncertainties, ...uncertainties])].slice(0, 20),
    requiresReview: true
  };
  return {
    draft,
    delta: {
      ...delta,
      changes: appliedChanges,
      uncertainties: [...new Set(uncertainties)].slice(0, 12)
    },
    appliedChanges
  };
}

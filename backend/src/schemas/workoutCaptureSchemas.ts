import {
  WORKOUT_CAPTURE_SOURCE_MODES,
  WORKOUT_LOAD_BASES,
  WORKOUT_MOVEMENT_PATTERNS,
  WORKOUT_SET_TYPES,
  WORKOUT_TRAINING_METHODS
} from "@ascend/shared";
import { z } from "zod";

const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();
const nullableNumber = (min: number, max: number) => z.number().min(min).max(max).nullable().optional();
const nullableInteger = (min: number, max: number) => z.number().int().min(min).max(max).nullable().optional();
const requiredNullableText = (max: number) => z.string().trim().max(max).nullable();
const requiredNullableNumber = (min: number, max: number) => z.number().min(min).max(max).nullable();
const requiredNullableInteger = (min: number, max: number) => z.number().int().min(min).max(max).nullable();

export const workoutCaptureLoadStepSchema = z.object({
  value: requiredNullableNumber(0, 2_000),
  unit: z.enum(["kg", "lb"]).nullable(),
  basis: z.enum(WORKOUT_LOAD_BASES).default("unknown"),
  role: z.enum(["starting", "working", "top", "backoff", "drop", "correction", "unknown"]).default("unknown"),
  reps: requiredNullableText(80),
  approximate: z.boolean().default(false),
  note: requiredNullableText(300),
  confidence: z.number().min(0).max(1).default(0.5)
});

export const workoutCaptureSetDetailSchema = z.object({
  order: z.number().int().min(1).max(100),
  reps: requiredNullableText(80),
  repRangeMin: requiredNullableNumber(0, 1_000),
  repRangeMax: requiredNullableNumber(0, 1_000),
  load: requiredNullableNumber(0, 2_000),
  loadUnit: z.enum(["kg", "lb"]).nullable(),
  loadBasis: z.enum(WORKOUT_LOAD_BASES).default("unknown"),
  durationValue: requiredNullableNumber(0, 3_600),
  durationUnit: z.enum(["seconds", "minutes"]).nullable(),
  setType: z.enum(WORKOUT_SET_TYPES).default("unknown"),
  rpe: requiredNullableNumber(1, 10),
  rir: requiredNullableNumber(0, 10),
  approximate: z.boolean().default(false),
  note: requiredNullableText(300)
});

export const workoutCaptureExerciseSchema = z.object({
  name: z.string().trim().min(1).max(120),
  originalText: requiredNullableText(1_000),
  sets: requiredNullableInteger(1, 100),
  reps: requiredNullableText(80),
  load: requiredNullableNumber(0, 2_000),
  loadUnit: z.enum(["kg", "lb"]).nullable(),
  durationMinutes: requiredNullableInteger(1, 300),
  restSeconds: requiredNullableInteger(0, 3_600),
  note: requiredNullableText(500),
  movementPattern: z.enum(WORKOUT_MOVEMENT_PATTERNS),
  confidence: z.number().min(0).max(1),
  needsConfirmation: z.boolean(),
  section: nullableText(80),
  exerciseOrder: nullableInteger(1, 100),
  completedSets: nullableInteger(1, 100),
  repRangeMin: nullableNumber(0, 1_000),
  repRangeMax: nullableNumber(0, 1_000),
  approximateReps: z.boolean().optional(),
  durationValue: nullableNumber(0, 3_600),
  durationUnit: z.enum(["seconds", "minutes"]).nullable().optional(),
  loadBasis: z.enum(WORKOUT_LOAD_BASES).optional(),
  loadText: nullableText(300),
  startingLoad: nullableNumber(0, 2_000),
  workingLoad: nullableNumber(0, 2_000),
  topLoad: nullableNumber(0, 2_000),
  backoffLoad: nullableNumber(0, 2_000),
  rpe: nullableNumber(1, 10),
  rir: nullableNumber(0, 10),
  restStyle: nullableText(80),
  setType: z.enum(WORKOUT_SET_TYPES).optional(),
  trainingMethods: z.array(z.enum(WORKOUT_TRAINING_METHODS)).max(12).optional(),
  supersetGroup: nullableText(80),
  groupRounds: nullableInteger(1, 100),
  warmup: z.boolean().optional(),
  workingSet: z.boolean().optional(),
  backoffSet: z.boolean().optional(),
  dropSet: z.boolean().optional(),
  loadSteps: z.array(workoutCaptureLoadStepSchema).max(30).optional(),
  setDetails: z.array(workoutCaptureSetDetailSchema).max(100).optional(),
  uncertainFields: z.array(z.string().trim().min(1).max(40)).max(20).optional()
});

export const savedWorkoutCaptureExerciseSchema = workoutCaptureExerciseSchema.extend({
  originalText: z.string().trim().max(1_000).nullable().optional().default(null),
  sets: z.number().int().min(1).max(100).nullable().optional().default(null),
  reps: z.string().trim().max(80).nullable().optional().default(null),
  load: z.number().min(0).max(2_000).nullable().optional().default(null),
  loadUnit: z.enum(["kg", "lb"]).nullable().optional().default(null),
  durationMinutes: z.number().int().min(1).max(300).nullable().optional().default(null),
  restSeconds: z.number().int().min(0).max(3_600).nullable().optional().default(null),
  note: z.string().trim().max(500).nullable().optional().default(null),
  movementPattern: z.enum(WORKOUT_MOVEMENT_PATTERNS).default("other"),
  confidence: z.number().min(0).max(1).nullable().optional().transform((value) => value ?? 0.5),
  needsConfirmation: z.boolean().optional().default(false)
});

export const workoutCaptureDraftSchema = z.object({
  version: z.literal("workout_capture_v1"),
  sourceMode: z.enum(WORKOUT_CAPTURE_SOURCE_MODES),
  originalInput: z.string().max(5_000),
  title: z.string().trim().min(1).max(120),
  workoutType: z.string().trim().min(1).max(80),
  difficulty: z.enum(["easy", "moderate", "challenging"]),
  durationMinutes: z.number().int().min(5).max(300).nullable(),
  exercises: z.array(workoutCaptureExerciseSchema).min(1).max(30),
  confidence: z.number().min(0).max(1),
  uncertainties: z.array(z.string().trim().min(1).max(300)).max(20),
  requiresReview: z.literal(true)
});

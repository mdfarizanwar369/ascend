import { z } from "zod";
import {
  WORKOUT_MOVEMENT_PATTERNS,
  WORKOUT_PROGRESSION_V3_VERSION,
  WORKOUT_SIGNAL_VERSION,
  WorkoutDebriefOutput,
  WorkoutDebriefSource,
  WorkoutDebriefStatus,
  WorkoutDebriefView,
  WorkoutMovementPattern,
  WorkoutProgressionIntelligenceV3,
  WorkoutSignalV1
} from "@ascend/shared";
import { env } from "../config/env";
import { query } from "../db/pool";
import { createWorkoutDebriefProviderReply, WorkoutDebriefProviderReply } from "../integrations/openai";
import { logAiUsage } from "./aiUsageService";
import { buildWorkoutMemorySummary } from "./workoutMemoryService";

export const WORKOUT_DEBRIEF_PROMPT_VERSION = "coach-zoe-workout-debrief-v1.1";

type WorkoutEvent = {
  id: string;
  userId: string;
  gymId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type WorkoutDebriefRecord = {
  id: string;
  workoutEventId: string;
  userId: string;
  status: WorkoutDebriefStatus;
  workoutSignal: WorkoutSignalV1;
  debriefOutput: WorkoutDebriefOutput | null;
  fallbackText: string;
  provider: string | null;
  model: string | null;
  promptVersion: string;
  failureReason: string | null;
  generationStartedAt: string | null;
  generatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GenerationContext = {
  current: WorkoutEvent;
  goal: string | null;
  recent: WorkoutEvent[];
};

export interface WorkoutDebriefStore {
  initialize(input: {
    workoutEventId: string;
    userId: string;
    status: Extract<WorkoutDebriefStatus, "available" | "pending" | "not_required">;
    workoutSignal: WorkoutSignalV1;
    fallbackText: string;
  }): Promise<WorkoutDebriefRecord | null>;
  findForUser(workoutEventId: string, userId: string): Promise<WorkoutDebriefRecord | null>;
  claimPending(workoutEventId: string, userId: string): Promise<WorkoutDebriefRecord | null>;
  markGenerated(input: {
    workoutEventId: string;
    userId: string;
    output: WorkoutDebriefOutput;
    provider: string;
    model: string;
  }): Promise<WorkoutDebriefRecord | null>;
  markFallback(input: {
    workoutEventId: string;
    userId: string;
    failureReason: string;
    provider?: string | null;
    model?: string | null;
  }): Promise<WorkoutDebriefRecord | null>;
  markStalePendingFallback(workoutEventId: string, userId: string): Promise<WorkoutDebriefRecord | null>;
  markStaleGeneratingFallback(workoutEventId: string, userId: string): Promise<WorkoutDebriefRecord | null>;
  loadGenerationContext(workoutEventId: string, userId: string): Promise<GenerationContext | null>;
}

export type WorkoutDebriefDependencies = {
  store: WorkoutDebriefStore;
  generate: (systemPrompt: string, userPrompt: string) => Promise<WorkoutDebriefProviderReply>;
  logUsage: typeof logAiUsage;
};

type DbWorkoutDebriefRow = {
  id: string;
  workout_event_id: string;
  user_id: string;
  status: WorkoutDebriefStatus;
  workout_signal: WorkoutSignalV1;
  debrief_output: WorkoutDebriefOutput | null;
  fallback_text: string;
  provider: string | null;
  model: string | null;
  prompt_version: string;
  failure_reason: string | null;
  generation_started_at: string | null;
  generated_at: string | null;
  created_at: string;
  updated_at: string;
};

function mapRecord(row: DbWorkoutDebriefRow): WorkoutDebriefRecord {
  return {
    id: row.id,
    workoutEventId: row.workout_event_id,
    userId: row.user_id,
    status: row.status,
    workoutSignal: row.workout_signal,
    debriefOutput: row.debrief_output,
    fallbackText: row.fallback_text,
    provider: row.provider,
    model: row.model,
    promptVersion: row.prompt_version,
    failureReason: row.failure_reason,
    generationStartedAt: row.generation_started_at,
    generatedAt: row.generated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const recordColumns = `
  id, workout_event_id, user_id, status, workout_signal, debrief_output,
  fallback_text, provider, model, prompt_version, failure_reason,
  generation_started_at, generated_at, created_at, updated_at
`;

export const databaseWorkoutDebriefStore: WorkoutDebriefStore = {
  async initialize(input) {
    const result = await query<DbWorkoutDebriefRow>(
      `
      insert into workout_debriefs (
        workout_event_id, user_id, status, workout_signal, fallback_text, prompt_version
      )
      select ae.id, ae.user_id, $3, $4::jsonb, $5, $6
      from analytics_events ae
      where ae.id = $1 and ae.user_id = $2 and ae.event_name = 'burn_log'
      on conflict (workout_event_id) do nothing
      returning ${recordColumns}
      `,
      [
        input.workoutEventId,
        input.userId,
        input.status,
        JSON.stringify(input.workoutSignal),
        input.fallbackText,
        WORKOUT_DEBRIEF_PROMPT_VERSION
      ]
    );
    if (result.rows[0]) return mapRecord(result.rows[0]);
    return this.findForUser(input.workoutEventId, input.userId);
  },

  async findForUser(workoutEventId, userId) {
    const result = await query<DbWorkoutDebriefRow>(
      `select ${recordColumns} from workout_debriefs where workout_event_id = $1 and user_id = $2 limit 1`,
      [workoutEventId, userId]
    );
    return result.rows[0] ? mapRecord(result.rows[0]) : null;
  },

  async claimPending(workoutEventId, userId) {
    const result = await query<DbWorkoutDebriefRow>(
      `
      update workout_debriefs
      set status = 'generating', generation_started_at = coalesce(generation_started_at, now()), updated_at = now()
      where workout_event_id = $1 and user_id = $2 and status = 'pending'
      returning ${recordColumns}
      `,
      [workoutEventId, userId]
    );
    return result.rows[0] ? mapRecord(result.rows[0]) : null;
  },

  async markGenerated(input) {
    const result = await query<DbWorkoutDebriefRow>(
      `
      update workout_debriefs
      set status = 'generated', debrief_output = $3::jsonb, provider = $4, model = $5,
          generated_at = now(), failure_reason = null, updated_at = now()
      where workout_event_id = $1 and user_id = $2 and status = 'generating'
      returning ${recordColumns}
      `,
      [input.workoutEventId, input.userId, JSON.stringify(input.output), input.provider, input.model]
    );
    return result.rows[0] ? mapRecord(result.rows[0]) : null;
  },

  async markFallback(input) {
    const result = await query<DbWorkoutDebriefRow>(
      `
      update workout_debriefs
      set status = 'fallback', provider = coalesce($3, provider), model = coalesce($4, model),
          failure_reason = $5, generated_at = now(), updated_at = now()
      where workout_event_id = $1 and user_id = $2 and status in ('pending', 'generating')
      returning ${recordColumns}
      `,
      [input.workoutEventId, input.userId, input.provider ?? null, input.model ?? null, input.failureReason]
    );
    return result.rows[0] ? mapRecord(result.rows[0]) : null;
  },

  async markStalePendingFallback(workoutEventId, userId) {
    const result = await query<DbWorkoutDebriefRow>(
      `
      update workout_debriefs
      set status = 'fallback', failure_reason = 'generation_not_started', generated_at = now(), updated_at = now()
      where workout_event_id = $1 and user_id = $2 and status = 'pending'
        and created_at < now() - interval '2 minutes'
      returning ${recordColumns}
      `,
      [workoutEventId, userId]
    );
    return result.rows[0] ? mapRecord(result.rows[0]) : null;
  },

  async markStaleGeneratingFallback(workoutEventId, userId) {
    const result = await query<DbWorkoutDebriefRow>(
      `
      update workout_debriefs
      set status = 'fallback', failure_reason = 'generation_interrupted', generated_at = now(), updated_at = now()
      where workout_event_id = $1 and user_id = $2 and status = 'generating'
        and generation_started_at < now() - interval '2 minutes'
      returning ${recordColumns}
      `,
      [workoutEventId, userId]
    );
    return result.rows[0] ? mapRecord(result.rows[0]) : null;
  },

  async loadGenerationContext(workoutEventId, userId) {
    const [currentResult, recentResult, userResult] = await Promise.all([
      query<{ id: string; user_id: string; gym_id: string | null; metadata: Record<string, unknown> | null; created_at: string }>(
        `select id, user_id, gym_id, metadata, created_at from analytics_events where id = $1 and user_id = $2 and event_name = 'burn_log' limit 1`,
        [workoutEventId, userId]
      ),
      query<{ id: string; user_id: string; gym_id: string | null; metadata: Record<string, unknown> | null; created_at: string }>(
        `
        select id, user_id, gym_id, metadata, created_at
        from analytics_events
        where user_id = $1 and id <> $2 and event_name = 'burn_log'
          and jsonb_typeof(metadata->'exercises') = 'array'
        order by created_at desc
        limit 5
        `,
        [userId, workoutEventId]
      ),
      query<{ goal_type: string | null }>("select goal_type from users where id = $1 limit 1", [userId])
    ]);
    const current = currentResult.rows[0];
    if (!current) return null;
    const eventFromRow = (row: typeof current): WorkoutEvent => ({
      id: row.id,
      userId: row.user_id,
      gymId: row.gym_id,
      metadata: row.metadata ?? {},
      createdAt: row.created_at
    });
    return {
      current: eventFromRow(current),
      goal: userResult.rows[0]?.goal_type ?? null,
      recent: recentResult.rows.map((row) => eventFromRow(row))
    };
  }
};

const defaultDependencies: WorkoutDebriefDependencies = {
  store: databaseWorkoutDebriefStore,
  generate: createWorkoutDebriefProviderReply,
  logUsage: logAiUsage
};

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finiteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function exercisesFromMetadata(metadata: Record<string, unknown>) {
  return Array.isArray(metadata.exercises)
    ? metadata.exercises.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)).slice(0, 30)
    : [];
}

function progressionV3FromMetadata(metadata: Record<string, unknown>): WorkoutProgressionIntelligenceV3 | null {
  const candidate = metadata.progressionV3;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const progression = candidate as Partial<WorkoutProgressionIntelligenceV3>;
  return progression.version === WORKOUT_PROGRESSION_V3_VERSION ? progression as WorkoutProgressionIntelligenceV3 : null;
}

function hasMeaningfulProgressionEvidence(exercises: Record<string, unknown>[]) {
  return exercises.some((exercise) => {
    if (
      finiteNumber(exercise.sets) !== null
      || text(exercise.reps) !== null
      || finiteNumber(exercise.load) !== null
      || finiteNumber(exercise.durationMinutes) !== null
      || text(exercise.duration) !== null
    ) return true;
    const setDetails = Array.isArray(exercise.setDetails)
      ? exercise.setDetails.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
      : [];
    if (setDetails.some((detail) => (
      text(detail.reps) !== null
      || finiteNumber(detail.load) !== null
      || finiteNumber(detail.durationValue) !== null
    ))) return true;
    const loadSteps = Array.isArray(exercise.loadSteps)
      ? exercise.loadSteps.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
      : [];
    return loadSteps.some((step) => finiteNumber(step.value) !== null || text(step.reps) !== null);
  });
}

function trustedProgressionV3(metadata: Record<string, unknown>, exercises: Record<string, unknown>[]) {
  const progression = progressionV3FromMetadata(metadata);
  if (!progression) return null;
  return progression.confidence >= 0.7 && hasMeaningfulProgressionEvidence(exercises) ? progression : null;
}

function sessionType(metadata: Record<string, unknown>): WorkoutSignalV1["sessionType"] {
  const value = (text(metadata.workoutType) ?? text(metadata.activityType) ?? "").toLowerCase();
  if (value.includes("hiit") || value.includes("interval")) return "hiit";
  if (value.includes("strength")) return "strength";
  if (value.includes("cardio") || value.includes("run") || value.includes("walk") || value.includes("cycling")) return "cardio";
  if (value.includes("mobility") || value.includes("recovery") || value.includes("stretch") || value.includes("yoga")) return "mobility";
  if (value.includes("full body")) return "full_body";
  if (value.includes("general fitness")) return "general_fitness";
  return "unknown";
}

function stableUnique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function buildWorkoutSignalV1(input: {
  source: WorkoutDebriefSource;
  metadata: Record<string, unknown>;
  createdAt?: string;
}): WorkoutSignalV1 {
  const exercises = exercisesFromMetadata(input.metadata);
  const movementPatterns = stableUnique(exercises
    .map((exercise) => text(exercise.movementPattern))
    .filter((pattern): pattern is WorkoutMovementPattern => Boolean(pattern) && WORKOUT_MOVEMENT_PATTERNS.includes(pattern as WorkoutMovementPattern))) as WorkoutMovementPattern[];
  const memory = buildWorkoutMemorySummary([{ metadata: input.metadata, created_at: input.createdAt ?? new Date().toISOString() }]);
  const focusArea = memory.latestWorkout?.focusArea ?? "general";
  const rawProgressionV3 = progressionV3FromMetadata(input.metadata);
  const progressionV3 = trustedProgressionV3(input.metadata, exercises);
  const notableSignals = ["workout_completed"];
  if (input.source === "coach_zoe_workout_planner") notableSignals.push("all_listed_exercises_completed");
  if (progressionV3) {
    notableSignals.push("progression_verified");
    if (progressionV3.overallStatus === "personal_best") notableSignals.push("personal_best");
    if (progressionV3.overallStatus === "plateau_signal") notableSignals.push("plateau_signal");
    if (progressionV3.overallStatus === "planned_deload") notableSignals.push("planned_deload");
    if (progressionV3.overallStatus === "baseline") notableSignals.push("baseline_saved");
  }
  const confidence = input.source === "ai_workout_capture"
    ? finiteNumber(input.metadata.captureConfidence) ?? progressionV3?.confidence ?? 0.6
    : input.source === "coach_zoe_workout_planner" ? 0.75 : 1;
  const limitations = ["volume_not_calculated", "recovery_state_not_measured"];
  if (input.source === "coach_zoe_workout_planner") limitations.push("exercise_level_execution_not_recorded");
  if (input.source === "ai_workout_capture" && movementPatterns.length === 0) limitations.push("movement_patterns_limited");
  if (rawProgressionV3 && !progressionV3) limitations.push("progression_evidence_insufficient");
  if (input.source === "quick_activity") limitations.push("simple_activity_detail_only");

  return {
    version: WORKOUT_SIGNAL_VERSION,
    source: input.source,
    sessionType: sessionType(input.metadata),
    trainingFocus: focusArea === "general" ? [] : [focusArea],
    movementPatterns,
    volumeBand: "unknown",
    completionRatio: input.source === "coach_zoe_workout_planner" ? 1 : null,
    prescribedComparison: input.source === "coach_zoe_workout_planner" ? "completion_only" : "not_available",
    recoveryLoad: "unknown",
    nextSessionBias: progressionV3?.nextSessionFocus ? [progressionV3.nextSessionFocus.slice(0, 240)] : [],
    notableSignals: stableUnique(notableSignals),
    evidenceConfidence: Math.round(clamp(confidence, 0, 1) * 100) / 100,
    limitations: stableUnique(limitations)
  };
}

export function deterministicWorkoutAcknowledgement(input: {
  source: WorkoutDebriefSource;
  metadata: Record<string, unknown>;
}) {
  const title = text(input.metadata.workoutTitle);
  const activity = text(input.metadata.activityType) ?? text(input.metadata.workoutType);
  const duration = finiteNumber(input.metadata.durationMinutes);
  if (input.source === "quick_activity" && activity) {
    const activityLabel = activity.toLowerCase();
    const prefix = duration && duration > 0 ? `Your ${Math.round(duration)}-minute ${activityLabel}` : `Your ${activityLabel}`;
    if (/\bwalk(?:ing)?\b/i.test(activity)) {
      return `${prefix} has been recorded. It adds useful low-intensity movement to your day.`;
    }
    return `${prefix} has been recorded and added to today's activity.`;
  }
  if (title) return `Workout saved. ${title} has been added to your training history.`;
  return "Workout saved. Your session has been recorded and your training history has been updated.";
}

export function workoutDebriefRolloutMode(input: {
  isPlatformOwner: boolean;
  enabledForAll?: boolean;
  ownerPilotEnabled?: boolean;
}) {
  const enabledForAll = input.enabledForAll ?? env.COACH_ZOE_WORKOUT_DEBRIEF_V1;
  const ownerPilotEnabled = input.ownerPilotEnabled ?? env.COACH_ZOE_WORKOUT_DEBRIEF_OWNER_PILOT;
  return enabledForAll || (ownerPilotEnabled && input.isPlatformOwner) ? "active" : "disabled";
}

function disabledView(workoutEventId: string): WorkoutDebriefView {
  return { enabled: false, workoutEventId, status: null, text: null, fallbackText: null, source: null, cached: false };
}

function recordView(record: WorkoutDebriefRecord, cached: boolean): WorkoutDebriefView {
  const generatedText = record.status === "generated" ? record.debriefOutput?.debrief ?? null : null;
  const deterministic = record.status === "fallback" || record.status === "not_required";
  return {
    enabled: true,
    workoutEventId: record.workoutEventId,
    status: record.status,
    text: generatedText ?? (deterministic ? record.fallbackText : null),
    fallbackText: record.fallbackText,
    source: generatedText ? "ai" : deterministic ? "deterministic" : null,
    cached
  };
}

function debriefLog(event: string, metadata: Record<string, unknown>, level: "info" | "warn" = "info") {
  const payload = { feature: "coach_zoe_workout_debrief_v1", event, ...metadata };
  if (level === "warn") console.warn("[workout-debrief]", payload);
  else console.info("[workout-debrief]", payload);
}

export async function initializeWorkoutDebrief(input: {
  workoutEventId: string;
  userId: string;
  isPlatformOwner: boolean;
  source: WorkoutDebriefSource;
  metadata: Record<string, unknown>;
  createdAt?: string;
}, dependencies: Pick<WorkoutDebriefDependencies, "store"> = defaultDependencies): Promise<WorkoutDebriefView> {
  if (workoutDebriefRolloutMode({ isPlatformOwner: input.isPlatformOwner }) !== "active") {
    return disabledView(input.workoutEventId);
  }
  const signal = buildWorkoutSignalV1({ source: input.source, metadata: input.metadata, createdAt: input.createdAt });
  const fallbackText = deterministicWorkoutAcknowledgement({ source: input.source, metadata: input.metadata });
  const status = input.source === "quick_activity" ? "not_required" : "available";
  const record = await dependencies.store.initialize({
    workoutEventId: input.workoutEventId,
    userId: input.userId,
    status,
    workoutSignal: signal,
    fallbackText
  });
  if (!record) throw new Error("Workout debrief could not be associated with this workout.");
  debriefLog(status === "not_required" ? "generation_skipped" : "debrief_available", {
    workoutEventId: input.workoutEventId,
    source: input.source
  });
  return recordView(record, record.status !== status);
}

const outputSchema = z.object({
  accomplishment: z.string().trim().min(1).max(300),
  observation: z.string().trim().min(1).max(300),
  recoveryGuidance: z.string().trim().min(1).max(300),
  nextConsideration: z.string().trim().min(1).max(300),
  debrief: z.string().trim().min(1).max(700)
}).strict();

const prohibitedOutput = [
  /\b(form|technique)\s+(looked|was|is|appears?)\b/i,
  /\b(definitely|fully|clearly)\s+(recovered|fatigued|injured)\b/i,
  /\b(you|your\s+\w+)\s+(are|is)\s+fatigued\b/i,
  /\bdiagnos(?:e|ed|is)\b/i,
  /\bmuscle damage\b/i,
  /\byou (?:have|sustained) an? injury\b/i
];

function parseJsonObject(value: string) {
  const cleaned = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned) as unknown;
}

export function validateWorkoutDebriefOutput(value: string): WorkoutDebriefOutput {
  const output = outputSchema.parse(parseJsonObject(value));
  const wordCount = output.debrief.split(/\s+/).filter(Boolean).length;
  if (wordCount < 20 || wordCount > 80) throw new Error("Workout debrief length is outside the allowed range.");
  const combined = Object.values(output).join(" ");
  if (/\d/.test(combined)) throw new Error("Workout debrief introduced numeric claims.");
  if (prohibitedOutput.some((pattern) => pattern.test(combined))) {
    throw new Error("Workout debrief violated the safety language contract.");
  }
  return output;
}

const completionOnlyTrackingRequest = /(?:\b(?:ask|consider|remember|try|please|should|could|can)\b[^.!?]{0,80}\b(?:record|log|note|track|add|provide|capture|include|rate)\w*\b|\b(?:record|log|note|track|add|provide|capture|include|rate)\w*\b[^.!?]{0,60}\b(?:next time|next session)\b)/i;
const genericPraise = /\b(?:good to see|it(?:'s|’s| is) great to see|keep up (?:the )?(?:good work|consistent effort)|great (?:work|job)|amazing job|solid effort|keep crushing it|you(?:'|’)ve got this)\b/i;

function sentences(value: string) {
  return value.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [];
}

function enforceWorkoutSpecificOutput(output: WorkoutDebriefOutput, signal: WorkoutSignalV1): WorkoutDebriefOutput {
  if (signal.prescribedComparison !== "completion_only") return output;

  const debrief = sentences(output.debrief)
    .filter((sentence) => !completionOnlyTrackingRequest.test(sentence) && !genericPraise.test(sentence))
    .join(" ");
  const safeDebrief = debrief.split(/\s+/).filter(Boolean).length >= 20
    ? debrief
    : `${debrief}${debrief ? " " : ""}Completing the planned session gives your recent training a clear reference point without overstating how each exercise went.`;

  return {
    ...output,
    nextConsideration: "This completed session is now part of your workout history.",
    debrief: safeDebrief
  };
}

function aiContext(context: GenerationContext, signal: WorkoutSignalV1) {
  const currentExercises = exercisesFromMetadata(context.current.metadata).map((exercise) => ({
    name: text(exercise.name),
    sets: finiteNumber(exercise.sets),
    reps: text(exercise.reps),
    load: finiteNumber(exercise.load),
    loadUnit: text(exercise.loadUnit),
    movementPattern: text(exercise.movementPattern)
  }));
  const progressionV3 = signal.notableSignals.includes("progression_verified")
    ? progressionV3FromMetadata(context.current.metadata)
    : null;
  return {
    currentWorkout: {
      title: text(context.current.metadata.workoutTitle),
      type: text(context.current.metadata.workoutType) ?? text(context.current.metadata.activityType),
      difficulty: text(context.current.metadata.workoutDifficultyLabel) ?? text(context.current.metadata.workoutDifficulty),
      durationMinutes: finiteNumber(context.current.metadata.durationMinutes),
      exercises: currentExercises,
      signal,
      progression: progressionV3 ? {
        status: progressionV3.overallStatus,
        headline: progressionV3.headline,
        achievements: progressionV3.achievements.slice(0, 2),
        reviewNotes: progressionV3.reviewNotes.slice(0, 2),
        nextSessionFocus: progressionV3.nextSessionFocus
      } : null
    },
    profile: { goal: context.goal },
    recentWorkouts: context.recent.map((event) => ({
      title: text(event.metadata.workoutTitle),
      type: text(event.metadata.workoutType) ?? text(event.metadata.activityType),
      completedAt: event.createdAt,
      signal: buildWorkoutSignalV1({
        source: event.metadata.source === "coach_zoe_workout_planner" ? "coach_zoe_workout_planner" : "ai_workout_capture",
        metadata: event.metadata,
        createdAt: event.createdAt
      })
    }))
  };
}

function workoutDebriefPrompts(context: ReturnType<typeof aiContext>) {
  const systemPrompt = [
    "You are Coach Zoe leaving one calm, thoughtful post-workout coach note inside Ascend.",
    "The supplied JSON is the complete source of truth. Interpret it but never add facts.",
    "Return strict JSON with exactly: accomplishment, observation, recoveryGuidance, nextConsideration, debrief.",
    "The debrief must be one natural response with a hard maximum of 80 words. Aim for 45 to 70 words with strong evidence, 35 to 60 words with normal evidence, and 25 to 50 words with sparse evidence. Do not use markdown or numeric statistics.",
    "Every returned string must contain no digits. When evidence includes numbers, describe only the supported meaning, such as a verified load best, without repeating the value.",
    "Choose the strongest grounded observation first: verified progression when present, otherwise a meaningful movement structure or dominant focus, otherwise an honest evidence limitation. Let the evidence create the opening rather than randomly rotating phrases.",
    "The first sentence of debrief must contain that strongest observation. Do not routinely repeat the workout title or begin with 'You completed'; when focus, movement patterns, or progression are supplied, begin with what they mean instead.",
    "Do not repeat every logged fact. Use the debrief for the one or two most useful supported ideas rather than forcing every JSON field into the user-facing paragraph.",
    "Never assess form or technique, diagnose injury or muscle damage, claim definite fatigue or recovery, or invent sets, reps, loads, calories, duration, progression, skipped work, substitutions, or muscle exposure.",
    "Treat limitations in the workout signal as hard boundaries. If evidence is limited, say less rather than guessing.",
    "Only describe progression when currentWorkout.progression is present. When present, lead with its strongest supplied achievement and use only its supplied achievements and nextSessionFocus; do not infer strength, capacity, adaptation, a strong foundation, or execution quality from progression.",
    "Never call sparse or uncertain activity a baseline, verified progression, or effective performance.",
    "Never tell the user that a signal indicates or confirms something. Speak naturally about the workout evidence instead of exposing internal system language.",
    "When recoveryLoad is unknown, recoveryGuidance must briefly state that no specific recovery conclusion is supported by the record, and the debrief must omit generic sleep, hydration, protein, rest, soreness, and fatigue advice. Do not force recovery guidance into the debrief merely because the JSON field is required.",
    "Only when recoveryLoad is known may recoveryGuidance mention one supported recovery action. Never turn ordinary post-workout advice into a claim about the user's physical state.",
    "When progression_evidence_insufficient is listed, lead with the honest limitation, acknowledge only that the session was recorded, plainly explain that the details are too limited to assess focus or progression, and suggest one useful detail the user could record next time.",
    "For completion-only evidence, write two concise debrief sentences: first interpret the strongest supported focus or movement-pattern coverage, then calmly acknowledge completion. Do not add a reflection question, goal claim, recovery advice, or next-session language. Only describe a structure as balanced or well distributed when the supplied movement patterns genuinely support that interpretation.",
    "For completion-only evidence, never ask the user to record loads, sets, reps, or other details that the Coach Zoe workout completion flow does not collect, and do not invent a progression step.",
    "Do not force a next-session recommendation. Only use one in the debrief when supported by supplied progression, nextSessionBias, or relevant recent-workout context. Because every JSON field is required, use a brief neutral evidence-limit statement in unsupported recoveryGuidance or nextConsideration fields and do not copy those neutral fields into debrief.",
    "Do not open with generic phrases such as great work, good work, solid effort, successfully completed, or amazing job. Do not mention momentum unless it is explicitly supplied.",
    "Use direct conversational language. Prefer covered, focused on, leaned toward, or brought together when supported; avoid database-like phrases such as provided coverage, as recorded, as planned, or the record indicates. Do not call a session good, solid, effective, or high quality without evidence.",
    "Avoid empty coaching filler such as reflect on how it felt, listen to your body, stay consistent, keep up the effort, or keep progressing when the evidence does not support something more useful.",
    "Be observant, warm, conversational, concise, and adult. Sound confident when evidence is strong and transparent when it is weak. Prefer a concrete interpretation over praise, and avoid corporate, clinical, preachy, or motivational-speaker language."
  ].join(" ");
  const signal = context.currentWorkout.signal;
  const responseBoundary = signal.prescribedComparison === "completion_only"
    ? "This is completion-only evidence. The debrief must be two concise sentences and should usually be 30 to 50 words: lead with the strongest supported focus or movement-pattern interpretation, then state the useful completion takeaway without merely saying completed as recorded or as planned. Do not begin with the workout title or 'You completed'. Do not add advice, reflection, a goal claim, or next-session language. Do not ask for loads, sets, reps, ratings, notes, or any additional tracking."
    : signal.limitations.includes("progression_evidence_insufficient")
      ? "This record is too sparse for progression or focus analysis. Lead with that limitation, keep the debrief short, and suggest recording one specific exercise detail next time. Do not praise performance quality or prescribe training."
      : context.currentWorkout.progression
        ? "Verified progression evidence is available. Lead with its strongest supported achievement, describe it qualitatively, and use only its supplied next-session focus. Do not repeat numeric values or infer strength, adaptation, or execution quality."
        : "Interpret only the recorded workout evidence. Do not infer progression, recovery state, execution quality, or a next-session prescription.";
  return {
    systemPrompt,
    userPrompt: `Workout evidence:\n${JSON.stringify(context)}\n\nWorkout-specific response boundary:\n${responseBoundary}`
  };
}

async function safeUsageLog(
  dependencies: WorkoutDebriefDependencies,
  input: Parameters<typeof logAiUsage>[0]
) {
  try {
    await dependencies.logUsage(input);
  } catch (error) {
    debriefLog("usage_log_failed", { reason: error instanceof Error ? error.name : "unknown" }, "warn");
  }
}

export async function generateWorkoutDebrief(input: {
  workoutEventId: string;
  userId: string;
  gymId?: string | null;
  isPlatformOwner: boolean;
}, dependencies: WorkoutDebriefDependencies = defaultDependencies): Promise<WorkoutDebriefView | null> {
  if (workoutDebriefRolloutMode({ isPlatformOwner: input.isPlatformOwner }) !== "active") {
    return disabledView(input.workoutEventId);
  }
  const existing = await dependencies.store.findForUser(input.workoutEventId, input.userId);
  if (!existing) return null;
  if (existing.status === "generated" || existing.status === "fallback" || existing.status === "not_required") {
    debriefLog("duplicate_generation_prevented", { workoutEventId: input.workoutEventId, status: existing.status });
    return recordView(existing, true);
  }
  const claimed = await dependencies.store.claimPending(input.workoutEventId, input.userId);
  if (!claimed) {
    const staleFallback = await dependencies.store.markStaleGeneratingFallback(input.workoutEventId, input.userId);
    const current = staleFallback ?? await dependencies.store.findForUser(input.workoutEventId, input.userId);
    debriefLog("duplicate_generation_prevented", { workoutEventId: input.workoutEventId, status: current?.status ?? "missing" });
    return current ? recordView(current, true) : null;
  }

  let provider: string | null = null;
  let model: string | null = null;
  try {
    const context = await dependencies.store.loadGenerationContext(input.workoutEventId, input.userId);
    if (!context) throw new Error("Workout context is unavailable.");
    const prompts = workoutDebriefPrompts(aiContext(context, claimed.workoutSignal));
    const reply = await dependencies.generate(prompts.systemPrompt, prompts.userPrompt);
    provider = reply.provider;
    model = reply.model;
    const output = enforceWorkoutSpecificOutput(
      validateWorkoutDebriefOutput(reply.text),
      claimed.workoutSignal
    );
    const generated = await dependencies.store.markGenerated({
      workoutEventId: input.workoutEventId,
      userId: input.userId,
      output,
      provider,
      model
    });
    if (!generated) throw new Error("Generated debrief could not be persisted.");
    await safeUsageLog(dependencies, {
      userId: input.userId,
      gymId: input.gymId ?? context.current.gymId,
      eventType: "workout_debrief_generation",
      provider,
      model,
      status: "success",
      metadata: { workoutEventId: input.workoutEventId, promptVersion: WORKOUT_DEBRIEF_PROMPT_VERSION }
    });
    debriefLog("generation_succeeded", { workoutEventId: input.workoutEventId, provider, model });
    return recordView(generated, false);
  } catch (error) {
    const reason = error instanceof z.ZodError || error instanceof SyntaxError
      ? "invalid_structured_output"
      : error instanceof Error && /safety|numeric|length/i.test(error.message)
        ? "output_contract_rejected"
        : "provider_or_persistence_failure";
    const fallback = await dependencies.store.markFallback({
      workoutEventId: input.workoutEventId,
      userId: input.userId,
      failureReason: reason,
      provider,
      model
    }).catch(() => null);
    await safeUsageLog(dependencies, {
      userId: input.userId,
      gymId: input.gymId ?? null,
      eventType: "workout_debrief_generation",
      provider: provider ?? env.AI_PROVIDER,
      model,
      status: "fallback",
      metadata: { workoutEventId: input.workoutEventId, promptVersion: WORKOUT_DEBRIEF_PROMPT_VERSION, reason }
    });
    debriefLog("deterministic_fallback_used", { workoutEventId: input.workoutEventId, reason }, "warn");
    if (fallback) return recordView(fallback, false);
    return {
      enabled: true,
      workoutEventId: input.workoutEventId,
      status: "fallback",
      text: claimed.fallbackText,
      fallbackText: claimed.fallbackText,
      source: "deterministic",
      cached: false
    };
  }
}

export async function getWorkoutDebrief(input: {
  workoutEventId: string;
  userId: string;
  isPlatformOwner: boolean;
}, dependencies: Pick<WorkoutDebriefDependencies, "store"> = defaultDependencies): Promise<WorkoutDebriefView | null> {
  if (workoutDebriefRolloutMode({ isPlatformOwner: input.isPlatformOwner }) !== "active") {
    return disabledView(input.workoutEventId);
  }
  let record = await dependencies.store.findForUser(input.workoutEventId, input.userId);
  if (record?.status === "pending" || record?.status === "generating") {
    const staleFallback = record.status === "pending"
      ? await dependencies.store.markStalePendingFallback(input.workoutEventId, input.userId)
      : await dependencies.store.markStaleGeneratingFallback(input.workoutEventId, input.userId);
    record = staleFallback ?? await dependencies.store.findForUser(input.workoutEventId, input.userId);
    if (staleFallback) {
      debriefLog("stale_state_recovered", {
        workoutEventId: input.workoutEventId,
        previousStatus: staleFallback.failureReason === "generation_not_started" ? "pending" : "generating"
      }, "warn");
    }
  }
  return record ? recordView(record, true) : null;
}

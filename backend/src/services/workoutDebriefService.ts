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
  WorkoutSignalV1,
  type AscendLocale
} from "@ascend/shared";
import { env } from "../config/env";
import { query } from "../db/pool";
import { createWorkoutDebriefProviderReply, WorkoutDebriefProviderReply } from "../integrations/openai";
import { logAiUsage } from "./aiUsageService";
import { buildWorkoutMemorySummary } from "./workoutMemoryService";

export const WORKOUT_DEBRIEF_PROMPT_VERSION = "coach-zoe-workout-debrief-v1.2";

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
  if (value === null || value === undefined || value === "") return null;
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

type DebriefExerciseEvidence = {
  name: string;
  sets: number | null;
  reps: string | null;
  load: number | null;
  loadUnit: string | null;
  durationMinutes: number | null;
  durationValue: number | null;
  durationUnit: string | null;
  restSeconds: number | null;
  note: string | null;
  movementPattern: string | null;
  confidence: number;
  needsConfirmation: boolean;
  uncertainFields: string[];
};

function debriefExerciseEvidence(metadata: Record<string, unknown>): DebriefExerciseEvidence[] {
  return exercisesFromMetadata(metadata).map((exercise) => ({
    name: text(exercise.name) ?? "Exercise",
    sets: finiteNumber(exercise.sets),
    reps: text(exercise.reps),
    load: finiteNumber(exercise.load),
    loadUnit: text(exercise.loadUnit),
    durationMinutes: finiteNumber(exercise.durationMinutes)
      ?? (text(exercise.durationUnit) === "minutes" ? finiteNumber(exercise.durationValue) : null),
    durationValue: finiteNumber(exercise.durationValue),
    durationUnit: text(exercise.durationUnit),
    restSeconds: finiteNumber(exercise.restSeconds),
    note: text(exercise.note),
    movementPattern: text(exercise.movementPattern),
    confidence: clamp(finiteNumber(exercise.confidence) ?? 1, 0, 1),
    needsConfirmation: exercise.needsConfirmation === true,
    uncertainFields: Array.isArray(exercise.uncertainFields)
      ? exercise.uncertainFields.map(text).filter((item): item is string => Boolean(item)).slice(0, 10)
      : []
  }));
}

function exercisePrescription(exercise: DebriefExerciseEvidence) {
  let prescription = "";
  if (exercise.sets !== null && exercise.reps) {
    prescription = `${Math.round(exercise.sets)} sets of ${exercise.reps} reps`;
  } else if (exercise.sets !== null) {
    prescription = `${Math.round(exercise.sets)} sets`;
  } else if (exercise.reps) {
    prescription = `${exercise.reps} reps`;
  }
  if (exercise.load !== null) {
    prescription += `${prescription ? " at " : ""}${exercise.load}${exercise.loadUnit ? ` ${exercise.loadUnit}` : ""}`;
  }
  if (!prescription && exercise.durationValue !== null && exercise.durationUnit) {
    prescription = `${exercise.durationValue} ${exercise.durationUnit}`;
  } else if (!prescription && exercise.durationMinutes !== null) {
    prescription = `${Math.round(exercise.durationMinutes)} minutes`;
  }
  return prescription;
}

function measurableNextStep(exercises: DebriefExerciseEvidence[]) {
  const uncertain = exercises.find((exercise) => exercise.needsConfirmation);
  if (uncertain) {
    const prescription = exercisePrescription(uncertain);
    return `Confirm${prescription ? ` whether ${uncertain.name} was ${prescription}` : ` the details for ${uncertain.name}`} before using it as a progress comparison.`;
  }

  const comparable = exercises.find((exercise) => (
    !exercise.needsConfirmation
    && exercise.confidence >= 0.7
    && (exercise.sets !== null || exercise.reps !== null || exercise.load !== null || exercise.durationMinutes !== null || exercise.durationValue !== null)
  ));
  if (!comparable) {
    const named = exercises.find((exercise) => !exercise.needsConfirmation && exercise.name !== "Exercise");
    return named
      ? `Record one measurable detail for ${named.name} next time so Ascend can compare it.`
      : "Record one exercise with its sets and reps next time so Ascend can make a useful comparison.";
  }

  const prescription = exercisePrescription(comparable);
  if (comparable.load === null && comparable.durationMinutes === null && comparable.durationValue === null) {
    return `Next time, repeat ${comparable.name}${prescription ? ` for ${prescription}` : ""} and record the load or effort so Ascend can compare progress.`;
  }
  return `Next time, repeat ${comparable.name}${prescription ? ` for ${prescription}` : ""} as the comparison point and change only one variable.`;
}

function coachingEvidence(metadata: Record<string, unknown>) {
  const exercises = debriefExerciseEvidence(metadata);
  const confirmed = exercises.filter((exercise) => !exercise.needsConfirmation && exercise.confidence >= 0.7);
  const uncertain = exercises.filter((exercise) => exercise.needsConfirmation);
  return {
    exerciseCount: exercises.length,
    confirmedExerciseCount: confirmed.length,
    uncertainExerciseCount: uncertain.length,
    measurableNextStep: measurableNextStep(exercises)
  };
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
  locale?: AscendLocale;
}) {
  const locale = input.locale ?? "en";
  const title = text(input.metadata.workoutTitle);
  const activity = text(input.metadata.activityType) ?? text(input.metadata.workoutType);
  const duration = finiteNumber(input.metadata.durationMinutes);
  if (locale === "ms-MY") {
    if (input.source === "quick_activity" && activity) {
      const durationLabel = duration && duration > 0 ? ` selama ${Math.round(duration)} minit` : "";
      return `${activity}${durationLabel} anda telah direkodkan dan ditambah pada aktiviti hari ini.`;
    }
    const exercises = debriefExerciseEvidence(input.metadata);
    if (input.source === "ai_workout_capture" && exercises.length) {
      const confirmedCount = exercises.filter((exercise) => !exercise.needsConfirmation && exercise.confidence >= 0.7).length;
      const uncertainCount = exercises.filter((exercise) => exercise.needsConfirmation).length;
      const evidence = confirmedCount
        ? `${confirmedCount} senaman yang disahkan`
        : `${exercises.length} senaman yang direkodkan`;
      const uncertainty = uncertainCount ? ` ${uncertainCount} senaman masih perlu disemak.` : "";
      const comparison = uncertainCount
        ? "Sahkan butiran tersebut sebelum menggunakannya untuk perbandingan kemajuan."
        : `Lain kali, catat beban atau tahap usaha untuk ${exercises[0]!.name} supaya Ascend boleh membandingkan kemajuan.`;
      return `Workout anda telah disimpan dengan ${evidence}.${uncertainty} ${comparison}`;
    }
    if (title) return `Workout disimpan. ${title} telah ditambah pada sejarah latihan anda.`;
    return "Workout disimpan. Sesi anda telah direkodkan dan sejarah latihan anda telah dikemas kini.";
  }
  if (locale === "zh-Hans") {
    if (input.source === "quick_activity" && activity) {
      const durationLabel = duration && duration > 0 ? `（${Math.round(duration)} 分钟）` : "";
      return `你的${activity}${durationLabel}已记录，并添加到今天的活动中。`;
    }
    const exercises = debriefExerciseEvidence(input.metadata);
    if (input.source === "ai_workout_capture" && exercises.length) {
      const confirmedCount = exercises.filter((exercise) => !exercise.needsConfirmation && exercise.confidence >= 0.7).length;
      const uncertainCount = exercises.filter((exercise) => exercise.needsConfirmation).length;
      const evidence = confirmedCount ? `${confirmedCount} 个已确认动作` : `${exercises.length} 个已记录动作`;
      const uncertainty = uncertainCount ? ` 仍有 ${uncertainCount} 个动作需要复查。` : "";
      const comparison = uncertainCount
        ? "请先确认这些细节，再用它们比较训练进展。"
        : `下次请记录 ${exercises[0]!.name} 的负重或用力程度，让 Ascend 能够比较进展。`;
      return `你的训练已保存，包含${evidence}。${uncertainty}${comparison}`;
    }
    if (title) return `训练已保存。${title} 已添加到你的训练历史中。`;
    return "训练已保存。你的训练记录和训练历史已更新。";
  }
  if (input.source === "quick_activity" && activity) {
    const activityLabel = activity.toLowerCase();
    const prefix = duration && duration > 0 ? `Your ${Math.round(duration)}-minute ${activityLabel}` : `Your ${activityLabel}`;
    if (/\bwalk(?:ing)?\b/i.test(activity)) {
      return `${prefix} has been recorded. It adds useful low-intensity movement to your day.`;
    }
    return `${prefix} has been recorded and added to today's activity.`;
  }
  const exercises = debriefExerciseEvidence(input.metadata);
  if (input.source === "ai_workout_capture" && exercises.length) {
    const signal = buildWorkoutSignalV1({ source: input.source, metadata: input.metadata });
    const focus = signal.trainingFocus[0]
      ? `${signal.trainingFocus[0].replace(/_/g, " ")}-focused `
      : "";
    const confirmedCount = exercises.filter((exercise) => !exercise.needsConfirmation && exercise.confidence >= 0.7).length;
    const uncertainCount = exercises.filter((exercise) => exercise.needsConfirmation).length;
    const evidence = confirmedCount
      ? `${confirmedCount} confirmed exercise${confirmedCount === 1 ? "" : "s"}`
      : `${exercises.length} recorded exercise${exercises.length === 1 ? "" : "s"}`;
    const uncertainty = uncertainCount
      ? ` ${uncertainCount} exercise${uncertainCount === 1 ? "" : "s"} still need${uncertainCount === 1 ? "s" : ""} review.`
      : "";
    return `Your ${focus}${activity?.toLowerCase() ?? "workout"} is saved with ${evidence}.${uncertainty} ${measurableNextStep(exercises)}`;
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
  locale?: AscendLocale;
}, dependencies: Pick<WorkoutDebriefDependencies, "store"> = defaultDependencies): Promise<WorkoutDebriefView> {
  if (workoutDebriefRolloutMode({ isPlatformOwner: input.isPlatformOwner }) !== "active") {
    return disabledView(input.workoutEventId);
  }
  const signal = buildWorkoutSignalV1({ source: input.source, metadata: input.metadata, createdAt: input.createdAt });
  const fallbackText = deterministicWorkoutAcknowledgement({ source: input.source, metadata: input.metadata, locale: input.locale });
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

function numericTokens(value: unknown): string[] {
  if (typeof value === "number" && Number.isFinite(value)) return [String(Number(value))];
  if (typeof value === "string") {
    return (value.match(/\d+(?:\.\d+)?/g) ?? []).map((token) => String(Number(token)));
  }
  if (Array.isArray(value)) return value.flatMap(numericTokens);
  if (value && typeof value === "object") return Object.values(value).flatMap(numericTokens);
  return [];
}

export function validateWorkoutDebriefOutput(
  value: string,
  options: { allowedNumbers?: Iterable<string | number>; locale?: AscendLocale } = {}
): WorkoutDebriefOutput {
  const output = outputSchema.parse(parseJsonObject(value));
  const locale = options.locale ?? "en";
  const length = locale === "zh-Hans"
    ? (output.debrief.match(/[\u3400-\u9fff]/g) ?? []).length
    : output.debrief.split(/\s+/).filter(Boolean).length;
  const minimum = locale === "zh-Hans" ? 35 : 20;
  const maximum = locale === "zh-Hans" ? 180 : 80;
  if (length < minimum || length > maximum) throw new Error("Workout debrief length is outside the allowed range.");
  const combined = Object.values(output).join(" ");
  const allowedNumbers = new Set(Array.from(options.allowedNumbers ?? [], (number) => String(Number(number))));
  const unsupportedNumber = numericTokens(combined).find((number) => !allowedNumbers.has(number));
  if (unsupportedNumber !== undefined) throw new Error("Workout debrief introduced unsupported numeric claims.");
  if (prohibitedOutput.some((pattern) => pattern.test(combined))) {
    throw new Error("Workout debrief violated the safety language contract.");
  }
  return output;
}

const completionOnlyTrackingRequest = /(?:\b(?:ask|consider|remember|try|please|should|could|can)\b[^.!?]{0,80}\b(?:record|log|note|track|add|provide|capture|include|rate)\w*\b|\b(?:record|log|note|track|add|provide|capture|include|rate)\w*\b[^.!?]{0,60}\b(?:next time|next session)\b)/i;
const genericPraise = /\b(?:good to see|it(?:'s|’s| is) great to see|keep up (?:the )?(?:good work|consistent effort)|great (?:work|job)|amazing job|solid effort|keep crushing it|you(?:'|’)ve got this)\b/i;

function sentences(value: string) {
  return value.match(/[^.!?。！？]+[.!?。！？]+|[^.!?。！？]+$/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [];
}

function debriefLength(value: string, locale: AscendLocale) {
  return locale === "zh-Hans"
    ? (value.match(/[\u3400-\u9fff]/g) ?? []).length
    : value.split(/\s+/).filter(Boolean).length;
}

function completionHistoryCopy(locale: AscendLocale) {
  if (locale === "ms-MY") return "Sesi yang selesai ini kini menjadi sebahagian daripada sejarah workout anda.";
  if (locale === "zh-Hans") return "这次已完成的训练现已记录在你的训练历史中。";
  return "This completed session is now part of your workout history.";
}

function completionEvidenceFallback(locale: AscendLocale) {
  if (locale === "ms-MY") return "Melengkapkan sesi yang dirancang ini memberi latihan terkini anda satu titik rujukan yang jelas tanpa melebih-lebihkan prestasi setiap senaman.";
  if (locale === "zh-Hans") return "完成这次计划训练，为你近期的训练留下了清晰的参考记录，同时不会夸大每个动作的实际表现。";
  return "Completing the planned session gives your recent training a clear reference point without overstating how each exercise went.";
}

function enforceWorkoutSpecificOutput(output: WorkoutDebriefOutput, signal: WorkoutSignalV1, locale: AscendLocale): WorkoutDebriefOutput {
  if (signal.prescribedComparison !== "completion_only") return output;

  const debrief = sentences(output.debrief)
    .filter((sentence) => !completionOnlyTrackingRequest.test(sentence) && !genericPraise.test(sentence))
    .join(" ");
  const safeDebrief = debriefLength(debrief, locale) >= (locale === "zh-Hans" ? 35 : 20)
    ? debrief
    : `${debrief}${debrief ? " " : ""}${completionEvidenceFallback(locale)}`;

  return {
    ...output,
    nextConsideration: completionHistoryCopy(locale),
    debrief: safeDebrief
  };
}

function aiContext(context: GenerationContext, signal: WorkoutSignalV1) {
  const currentExercises = debriefExerciseEvidence(context.current.metadata);
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
      coachingEvidence: coachingEvidence(context.current.metadata),
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

function allowedDebriefNumbers(context: ReturnType<typeof aiContext>) {
  return numericTokens({
    durationMinutes: context.currentWorkout.durationMinutes,
    exercises: context.currentWorkout.exercises.map((exercise) => ({
      sets: exercise.sets,
      reps: exercise.reps,
      load: exercise.load,
      durationMinutes: exercise.durationMinutes,
      durationValue: exercise.durationValue,
      restSeconds: exercise.restSeconds,
      note: exercise.note
    })),
    coachingEvidence: {
      exerciseCount: context.currentWorkout.coachingEvidence.exerciseCount,
      confirmedExerciseCount: context.currentWorkout.coachingEvidence.confirmedExerciseCount,
      uncertainExerciseCount: context.currentWorkout.coachingEvidence.uncertainExerciseCount
    },
    progression: context.currentWorkout.progression ? {
      headline: context.currentWorkout.progression.headline,
      achievements: context.currentWorkout.progression.achievements,
      reviewNotes: context.currentWorkout.progression.reviewNotes,
      nextSessionFocus: context.currentWorkout.progression.nextSessionFocus
    } : null
  });
}

function assertEvidenceLedDebrief(output: WorkoutDebriefOutput, context: ReturnType<typeof aiContext>, locale: AscendLocale) {
  const signal = context.currentWorkout.signal;
  if (signal.prescribedComparison === "completion_only") return;

  const debrief = output.debrief.toLowerCase();
  const exercises = context.currentWorkout.exercises;
  const hasDetailedEvidence = exercises.some((exercise) => (
    exercise.sets !== null
    || exercise.reps !== null
    || exercise.load !== null
    || exercise.durationMinutes !== null
    || exercise.durationValue !== null
    || exercise.note !== null
  ));
  const citesExercise = exercises.some((exercise) => debrief.includes(exercise.name.toLowerCase()));
  const hasProgression = context.currentWorkout.progression !== null;
  if (hasDetailedEvidence && !hasProgression && !citesExercise) {
    throw new Error("Workout debrief ignored the available workout evidence.");
  }

  const hasUncertainty = exercises.some((exercise) => exercise.needsConfirmation);
  const uncertaintyPattern = locale === "zh-Hans"
    ? /(确认|核对|澄清|复查)/
    : locale === "ms-MY"
      ? /\b(sahkan|semak|jelaskan|tinjau)\b/i
      : /\b(confirm|check|clarify|review)\b/i;
  const nextActionPattern = locale === "zh-Hans"
    ? /(下次|下一次|确认|核对|重复|记录|比较|保持)/
    : locale === "ms-MY"
      ? /\b(lain kali|sesi seterusnya|sahkan|semak|ulangi|catat|bandingkan|kekalkan)\b/i
      : /\b(next time|next session|confirm|repeat|record|compare|use as|keep)\b/i;
  if (hasUncertainty && !uncertaintyPattern.test(output.debrief)) {
    throw new Error("Workout debrief omitted an important workout uncertainty.");
  }
  if (!nextActionPattern.test(output.debrief)) {
    throw new Error("Workout debrief omitted one useful next action.");
  }
}

function workoutDebriefLocaleInstruction(locale: AscendLocale) {
  if (locale === "ms-MY") {
    return "Write every user-visible JSON string in natural Malaysian Bahasa Melayu. Keep exercise names and exact recorded units unchanged where translating them would reduce clarity. Do not mix in English interface or coaching prose.";
  }
  if (locale === "zh-Hans") {
    return "Write every user-visible JSON string in natural Simplified Chinese. Keep exercise names and exact recorded units unchanged where translating them would reduce clarity. Do not mix in English interface or coaching prose.";
  }
  return "Write every user-visible JSON string in natural English.";
}

function workoutDebriefPrompts(context: ReturnType<typeof aiContext>, locale: AscendLocale = "en") {
  const systemPrompt = [
    "You are Coach Zoe leaving one calm, thoughtful post-workout coach note inside Ascend.",
    workoutDebriefLocaleInstruction(locale),
    "The supplied JSON is the complete source of truth. Interpret it but never add facts.",
    "Return strict JSON with exactly: accomplishment, observation, recoveryGuidance, nextConsideration, debrief.",
    "The debrief must be one natural response with a hard maximum of 80 words. Aim for 40 to 65 words with strong evidence, 30 to 55 words with normal evidence, and 25 to 45 words with sparse evidence. Do not use markdown.",
    "A useful debrief answers three things: what specifically happened, what uncertainty matters if any, and the single most useful action for the next comparable session.",
    "You may quote exact sets, reps, load, tempo, duration, exercise counts, or other numbers only when that exact value is supplied in currentWorkout. Never calculate, transform, round, total, or invent a number.",
    "When currentWorkout contains detailed exercise evidence, mention at least one exercise by name and one supported measurable detail when available. Do not produce a generic workout summary when precise evidence exists.",
    "When any exercise has needsConfirmation=true, make that uncertainty the next action. Ask the user to confirm the saved interpretation rather than treating it as verified progress.",
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
    "When progression_evidence_insufficient is listed, lead with the honest limitation, acknowledge only that the session was recorded, plainly explain that the details are too limited to assess focus or progression, and suggest one useful measurable detail the user could record next time.",
    "For completion-only evidence, write two concise debrief sentences: first interpret the strongest supported focus or movement-pattern coverage, then calmly acknowledge completion. Do not add a reflection question, goal claim, recovery advice, or next-session language. Only describe a structure as balanced or well distributed when the supplied movement patterns genuinely support that interpretation.",
    "For completion-only evidence, never ask the user to record loads, sets, reps, or other details that the Coach Zoe workout completion flow does not collect, and do not invent a progression step.",
    "For user-recorded detailed workouts, end with exactly one practical next action grounded in coachingEvidence.measurableNextStep or supplied progression. Do not offer a list. For completion-only Coach Zoe workouts, do not invent a progression step.",
    "Because every JSON field is required, use a brief neutral evidence-limit statement in unsupported recoveryGuidance and do not copy it into debrief.",
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
        ? "Verified progression evidence is available. Lead with its strongest supported achievement and end with its supplied next-session focus. Exact recorded values may be quoted only when they appear in currentWorkout. Do not infer strength, adaptation, or execution quality."
        : "This is a user-recorded detailed workout. Cite at least one named exercise and one exact supported detail when available. If anything needs confirmation, ask for that confirmation; otherwise end with coachingEvidence.measurableNextStep. Do not infer recovery state or execution quality.";
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
  locale?: AscendLocale;
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
    const promptContext = aiContext(context, claimed.workoutSignal);
    const locale = input.locale ?? "en";
    const prompts = workoutDebriefPrompts(promptContext, locale);
    const reply = await dependencies.generate(prompts.systemPrompt, prompts.userPrompt);
    provider = reply.provider;
    model = reply.model;
    const output = enforceWorkoutSpecificOutput(
      validateWorkoutDebriefOutput(reply.text, {
        allowedNumbers: allowedDebriefNumbers(promptContext),
        locale
      }),
      claimed.workoutSignal,
      locale
    );
    assertEvidenceLedDebrief(output, promptContext, locale);
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

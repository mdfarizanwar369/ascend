import { createHash } from "node:crypto";
import { z } from "zod";
import {
  CLIENT_360_SCHEMA_VERSION,
  COACH_INSIGHT_PROMPT_VERSION,
  normalizeAscendLocale,
  type Client360SignalCode,
  type Client360Snapshot,
  type AscendLocale,
  type CoachInsight
} from "@ascend/shared";

const SIGNAL_CODES = [
  "TRAINING_INACTIVITY",
  "TRAINING_FREQUENCY_DECLINING",
  "TRAINING_LOGGING_CONSISTENT",
  "STRENGTH_PROGRESSING",
  "NUTRITION_LOGGING_LOW",
  "PROTEIN_TARGET_FREQUENTLY_MISSED",
  "POTENTIAL_WEIGHT_PLATEAU"
] as const satisfies readonly Client360SignalCode[];

const coachInsightSchema = z.object({
  summary: z.string().trim().min(80).max(1_400),
  priorities: z.array(z.object({
    title: z.string().trim().min(3).max(80),
    reason: z.string().trim().min(10).max(320),
    signalCodes: z.array(z.enum(SIGNAL_CODES)).max(5)
  }).strict()).min(1).max(3),
  dataCaveats: z.array(z.string().trim().min(3).max(240)).max(3)
}).strict();

export type CoachIntelligenceContext = ReturnType<typeof buildCoachIntelligenceContext>;

export function localeInstruction(localeInput?: AscendLocale | string | null) {
  const locale = normalizeAscendLocale(localeInput);
  if (locale === "ms-MY") {
    return "Language: Write the trainer insight in natural Malaysian Bahasa Melayu. Keep common fitness terms such as workout, reps, sets, protein, calories, RPE, and named exercises in English when that is clearer for Malaysian trainers.";
  }
  if (locale === "zh-Hans") {
    return "Language: Write the trainer insight in natural Simplified Chinese suitable for Malaysian and Singaporean Chinese-speaking trainers. Keep internationally recognised fitness terms, abbreviations, and exercise names in English when that preserves meaning.";
  }
  return "Language: Write the trainer insight in English.";
}

function metric<T>(value: { value: T | null; sampleSize: number; windowDays: number | null; sufficientData: boolean }) {
  return {
    value: value.sufficientData ? value.value : null,
    sampleSize: value.sampleSize,
    windowDays: value.windowDays,
    sufficientData: value.sufficientData
  };
}

export function buildCoachIntelligenceContext(snapshot: Client360Snapshot, locale?: AscendLocale | string | null) {
  const authorizedSections = Object.entries(snapshot.access.sections)
    .filter(([, access]) => access.state === "granted")
    .map(([section]) => section)
    .sort();
  const training = snapshot.training ? {
    completedWorkouts: snapshot.training.completedWorkouts,
    averageSessionsPerWeek30d: snapshot.training.averageSessionsPerWeek30d,
    activeWeeks8: snapshot.training.activeWeeks8,
    loggingConsistency8w: metric(snapshot.training.loggingConsistency8w),
    lastWorkoutAt: snapshot.training.lastWorkoutAt,
    averageDurationMinutes30d: metric(snapshot.training.averageDurationMinutes30d),
    frequencyTrend: snapshot.training.frequencyTrend,
    progressionSummary: snapshot.training.exerciseProgression.items.slice(0, 4).map((item) => ({
      exercise: item.displayName,
      status: item.status,
      current: item.current,
      previous: item.previous,
      lastPerformedAt: item.lastPerformedAt,
      comparableObservationCount: item.comparableObservationCount,
      confidence: item.confidence
    }))
  } : undefined;
  const nutrition = snapshot.nutrition ? {
    targets: snapshot.nutrition.targets,
    last7Days: snapshot.nutrition.last7Days,
    last30Days: snapshot.nutrition.last30Days,
    targetEvaluationBasis: snapshot.nutrition.targetEvaluationBasis
  } : undefined;
  const bodyProgress = snapshot.bodyProgress ? {
    weight: snapshot.bodyProgress.weight,
    bodyComposition: {
      scanCount: snapshot.bodyProgress.bodyComposition.scanCount,
      latestScanAt: snapshot.bodyProgress.bodyComposition.latestScanAt,
      evidenceStatus: snapshot.bodyProgress.bodyComposition.evidenceStatus,
      establishedChanges: snapshot.bodyProgress.bodyComposition.establishedChanges
    }
  } : undefined;
  const activity = snapshot.activity ? {
    connected: snapshot.activity.connected,
    lastSyncedAt: snapshot.activity.lastSyncedAt,
    todaySteps: snapshot.activity.todaySteps,
    averageSteps7d: metric(snapshot.activity.averageSteps7d),
    exerciseSessions7d: snapshot.activity.exerciseSessions7d,
    lastExerciseSessionAt: snapshot.activity.lastExerciseSessionAt
  } : undefined;

  return {
    schemaVersion: CLIENT_360_SCHEMA_VERSION,
    promptVersion: COACH_INSIGHT_PROMPT_VERSION,
    responseLocale: normalizeAscendLocale(locale),
    goal: snapshot.profile?.goal ?? null,
    authorizedSections,
    ...(training ? { training } : {}),
    ...(nutrition ? { nutrition } : {}),
    ...(bodyProgress ? { bodyProgress } : {}),
    ...(activity ? { activity } : {}),
    coachingSignals: snapshot.coachingSignals,
    freshness: Object.fromEntries(Object.entries(snapshot.freshness).filter(([key]) => key !== "generatedAt"))
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function coachIntelligenceFingerprint(context: CoachIntelligenceContext) {
  return createHash("sha256").update(stableJson(context)).digest("hex");
}

export function coachScopeFingerprint(snapshot: Client360Snapshot) {
  const identity = Object.entries(snapshot.access.sections)
    .filter(([, section]) => section.state === "granted")
    .map(([section]) => section)
    .sort();
  return createHash("sha256").update(identity.join("|")).digest("hex");
}

export function parseCoachInsight(text: string, context: CoachIntelligenceContext): CoachInsight {
  const parsed = coachInsightSchema.parse(JSON.parse(text));
  const prose = JSON.stringify(parsed);
  if (/\b(training program|training plan|program adherence|plan adherence|workout adherence|program compliance)\b/i.test(prose)) {
    throw new Error("Coach Insight used unsupported program or adherence terminology.");
  }
  if (/\b(nutrition logging consistency|nutrition adherence|protein adherence|calorie adherence)\b/i.test(prose)) {
    throw new Error("Coach Insight used imprecise nutrition terminology.");
  }
  if (/\b(disengag(?:e|ed|ement)|unmotivated|motivation|psychological cause)\b/i.test(prose)) {
    throw new Error("Coach Insight inferred unsupported motivation or psychology.");
  }
  if (/\b(goal is supported by|supports? (?:the )?(?:client'?s )?(?:stated )?goal|aligns with (?:supporting|achieving)|foundation for (?:continued )?progress|positive adaptation|barrier to (?:achieving|the) goal)\b/i.test(prose)) {
    throw new Error("Coach Insight inferred an unsupported causal outcome.");
  }
  if (/\b(diagnos(?:e|ed|is)|medication advice|medical treatment|eating disorder|crash diet|rapid weight loss)\b/i.test(prose)) {
    throw new Error("Coach Insight contained prohibited medical or unsafe guidance.");
  }
  const availableSignals = new Set(context.coachingSignals.map((signal) => signal.code));
  for (const priority of parsed.priorities) {
    if (priority.signalCodes.some((code) => !availableSignals.has(code))) {
      throw new Error("Coach Insight referenced a signal that is not in the authorized context.");
    }
  }
  const words = parsed.summary.split(/\s+/).filter(Boolean).length;
  if (words > 180) throw new Error("Coach Insight summary exceeds the maximum length.");
  return parsed;
}

export function coachInsightPrompts(context: CoachIntelligenceContext) {
  const system = [
    "You are Zoe, an intelligence assistant for a professional fitness trainer. The trainer is the decision-maker.",
    localeInstruction(context.responseLocale),
    "Use only the supplied deterministic Ascend coaching context. Do not infer motives or facts that are absent.",
    "Summarize observations, connect supported patterns, identify missing or stale data, and suggest considerations for trainer review.",
    "Use precise evidence language: recorded workouts, training logging consistency, nutrition logging coverage, calorie target rate, protein target rate, and recorded progression. Never call nutrition logging consistency or adherence.",
    "Nutrition logging coverage and calorie/protein target rates are proportions of logged days. Express them as percentages; never call a calorie or protein target amount a target rate.",
    "There is no assigned training program or training plan in this context. Never use program adherence, plan adherence, workout adherence, compliance, disengagement, motivation, or psychological explanations.",
    "Do not describe a metric as increasing, decreasing, or stable unless the supplied context contains that deterministic trend or a matching signal.",
    "Do not turn recorded activity into claims about unobserved behavior, goal achievement, or causal outcomes.",
    "Never say an observation supports, hinders, or aligns with the goal, proves adaptation, or provides a foundation for progress. State the observation and suggest trainer review only.",
    "Do not diagnose, prescribe medical treatment, provide medication advice, recommend unsafe rapid weight loss, or create a training program.",
    "Use neutral professional language and calibrated uncertainty. Target 80 to 150 words in summary, 1 to 3 priorities, and 0 to 3 caveats.",
    "Only cite signalCodes present in the input. Return only the required JSON object."
  ].join(" ");
  return { system, user: `Authorized deterministic coaching context:\n${JSON.stringify(context)}` };
}

import { env } from "../config/env";

export type FoodAiStage = {
  name: string;
  startOffsetMs: number;
  endOffsetMs: number;
  durationMs: number;
  metadata?: Record<string, unknown>;
};

export type FoodAiGeminiAttempt = {
  attempt: number;
  model: string;
  responseMode: string;
  startOffsetMs: number;
  endOffsetMs: number;
  durationMs: number;
  success: boolean;
  failureReason?: string;
  status?: number;
  timeout?: boolean;
  parseSuccess?: boolean;
  parseFailureReason?: string;
};

export type FoodAiPerformanceSummary = {
  slowestStage?: string;
  slowestStageMs?: number;
  geminiFallbackOccurred: boolean;
  firstAttemptSucceeded: boolean;
  jsonParsingFailed: boolean;
  duplicateWorkObserved: string[];
  unnecessarySequentialWaiting: string[];
};

export type FoodAiPerformanceReport = {
  traceId: string;
  enabled: boolean;
  startedAt: string;
  totalMs: number;
  route?: string;
  stages: FoodAiStage[];
  geminiAttempts: FoodAiGeminiAttempt[];
  summary: FoodAiPerformanceSummary;
};

export type FoodAiPerformanceTrace = {
  traceId: string;
  startedAtEpochMs: number;
  startedAt: string;
  route?: string;
  stages: FoodAiStage[];
  geminiAttempts: FoodAiGeminiAttempt[];
};

export function foodAiPerformanceEnabled() {
  return env.FOOD_AI_PERFORMANCE_LOGS;
}

export function createFoodAiTrace(route?: string): FoodAiPerformanceTrace | null {
  if (!foodAiPerformanceEnabled()) return null;
  const startedAtEpochMs = Date.now();
  return {
    traceId: `food-ai-${startedAtEpochMs}-${Math.random().toString(36).slice(2, 8)}`,
    startedAtEpochMs,
    startedAt: new Date(startedAtEpochMs).toISOString(),
    route,
    stages: [],
    geminiAttempts: []
  };
}

function offset(trace: FoodAiPerformanceTrace, epochMs: number) {
  return epochMs - trace.startedAtEpochMs;
}

export async function timeFoodAiStage<T>(
  trace: FoodAiPerformanceTrace | null | undefined,
  name: string,
  action: () => Promise<T>,
  metadata?: Record<string, unknown>
): Promise<T> {
  if (!trace) return action();
  const started = Date.now();
  try {
    return await action();
  } finally {
    const ended = Date.now();
    trace.stages.push({
      name,
      startOffsetMs: offset(trace, started),
      endOffsetMs: offset(trace, ended),
      durationMs: ended - started,
      metadata
    });
  }
}

export function timeFoodAiSyncStage<T>(
  trace: FoodAiPerformanceTrace | null | undefined,
  name: string,
  action: () => T,
  metadata?: Record<string, unknown>
): T {
  if (!trace) return action();
  const started = Date.now();
  try {
    return action();
  } finally {
    const ended = Date.now();
    trace.stages.push({
      name,
      startOffsetMs: offset(trace, started),
      endOffsetMs: offset(trace, ended),
      durationMs: ended - started,
      metadata
    });
  }
}

export function recordGeminiAttempt(
  trace: FoodAiPerformanceTrace | null | undefined,
  input: Omit<FoodAiGeminiAttempt, "startOffsetMs" | "endOffsetMs" | "durationMs"> & { startedAtEpochMs: number; endedAtEpochMs: number }
) {
  if (!trace) return;
  trace.geminiAttempts.push({
    attempt: input.attempt,
    model: input.model,
    responseMode: input.responseMode,
    startOffsetMs: offset(trace, input.startedAtEpochMs),
    endOffsetMs: offset(trace, input.endedAtEpochMs),
    durationMs: input.endedAtEpochMs - input.startedAtEpochMs,
    success: input.success,
    failureReason: input.failureReason,
    status: input.status,
    timeout: input.timeout,
    parseSuccess: input.parseSuccess,
    parseFailureReason: input.parseFailureReason
  });
}

export function annotateLatestGeminiParse(
  trace: FoodAiPerformanceTrace | null | undefined,
  parse: { success: boolean; failureReason?: string }
) {
  if (!trace || !trace.geminiAttempts.length) return;
  const latest = trace.geminiAttempts[trace.geminiAttempts.length - 1];
  latest.parseSuccess = parse.success;
  latest.parseFailureReason = parse.failureReason;
}

export function finishFoodAiReport(trace: FoodAiPerformanceTrace | null | undefined): FoodAiPerformanceReport | null {
  if (!trace) return null;
  const totalMs = Date.now() - trace.startedAtEpochMs;
  const slowest = [...trace.stages, ...trace.geminiAttempts.map((attempt) => ({
    name: `Gemini attempt ${attempt.attempt}`,
    durationMs: attempt.durationMs
  }))].sort((a, b) => b.durationMs - a.durationMs)[0];
  const jsonParsingFailed = trace.geminiAttempts.some((attempt) => attempt.parseSuccess === false);
  const successfulAttempts = trace.geminiAttempts.filter((attempt) => attempt.success);

  return {
    traceId: trace.traceId,
    enabled: true,
    startedAt: trace.startedAt,
    totalMs,
    route: trace.route,
    stages: trace.stages,
    geminiAttempts: trace.geminiAttempts,
    summary: {
      slowestStage: slowest?.name,
      slowestStageMs: slowest?.durationMs,
      geminiFallbackOccurred: trace.geminiAttempts.length > 1,
      firstAttemptSucceeded: trace.geminiAttempts[0]?.success === true && trace.geminiAttempts[0]?.parseSuccess !== false,
      jsonParsingFailed,
      duplicateWorkObserved: trace.stages.filter((stage, index, stages) => stages.findIndex((candidate) => candidate.name === stage.name) !== index).map((stage) => stage.name),
      unnecessarySequentialWaiting: trace.geminiAttempts.length > 1 ? ["Gemini fallback attempts run sequentially after prior attempt failure."] : []
    }
  };
}

export function logFoodAiReport(report: FoodAiPerformanceReport | null) {
  if (!report) return;
  console.info("[Ascend Food AI Performance]", JSON.stringify(report));
}

import type {
  Client360CoachingSignal,
  Client360Metric,
  Client360Snapshot,
  Client360Trend,
  CoachInsight
} from "@ascend/shared";
import {
  buildCoachIntelligenceContext,
  coachIntelligenceFingerprint,
  parseCoachInsight
} from "../domain/coachIntelligence";
import {
  createCoachInsightProviderReply,
  getAiProviderIdentity
} from "../integrations/openai";
import type { AuthUser } from "../middleware/auth";
import { createAscendCoachInsightService } from "../services/ascendCoachInsightService";
import type {
  CoachInsightCacheIdentity,
  CoachInsightCacheRow
} from "../services/coachInsightRepository";

const NOW = "2026-09-01T00:00:00.000Z";
const actor: AuthUser = {
  id: "90000000-0000-4000-8000-000000000001",
  firebaseUid: "synthetic-pilot-trainer",
  email: "synthetic-pilot@example.invalid",
  roles: ["trainer"],
  primaryRole: "trainer",
  trainerId: "90000000-0000-4000-8000-000000000002",
  isPlatformOwner: false
};

function metric<T>(value: T | null, sampleSize: number, windowDays: number | null, sufficientData = true): Client360Metric<T> {
  return { value, sampleSize, windowDays, sufficientData };
}

function trend(
  direction: Client360Trend["direction"],
  ratePerWeek: number | null,
  sampleSize: number,
  observedSpanDays = 56,
  sufficientData = true
): Client360Trend {
  return { direction, ratePerWeek, sampleSize, windowDays: 56, observedSpanDays, sufficientData };
}

function baseSnapshot(index: number): Client360Snapshot {
  const suffix = String(index).padStart(12, "0");
  return {
    version: "client_360_snapshot_v1",
    clientId: `10000000-0000-4000-8000-${suffix}`,
    generatedAt: NOW,
    access: {
      mode: "relationship",
      relationshipId: `20000000-0000-4000-8000-${suffix}`,
      relationshipStatus: "active",
      authorizationVersion: 3,
      sections: {
        profile: { state: "granted", requiredScope: "profile" },
        training: { state: "granted", requiredScope: "training" },
        nutrition: { state: "granted", requiredScope: "nutrition" },
        bodyProgress: { state: "granted", requiredScope: "body" },
        activity: { state: "granted", requiredScope: "recovery" }
      }
    },
    profile: { displayName: `Synthetic Client ${index}`, goal: "fat_loss", activityLevel: "moderate" },
    training: {
      completedWorkouts: { last7Days: 4, last30Days: 15, last90Days: 42 },
      averageSessionsPerWeek30d: 3.5,
      activeWeeks8: 8,
      loggingConsistency8w: metric(1, 8, 56),
      lastWorkoutAt: "2026-08-31T08:00:00.000Z",
      averageDurationMinutes30d: metric(54, 12, 30),
      frequencyTrend: trend("stable", 0.1, 29),
      recentWorkouts: [],
      exerciseProgression: {
        identityBasis: "progression_v3_exact_key",
        items: [{
          exerciseKey: "back-squat",
          displayName: "Back squat",
          status: "progressed",
          current: { sets: 3, reps: "8", totalReps: 24, load: 70, loadUnit: "kg" },
          previous: { sets: 3, reps: "8", totalReps: 24, load: 65, loadUnit: "kg" },
          lastPerformedAt: "2026-08-30T08:00:00.000Z",
          comparableObservationCount: 5,
          confidence: 0.9
        }]
      }
    },
    nutrition: {
      targets: { calories: 2000, proteinG: 130, source: "profile", calorieRangeRatio: { minimum: 0.9, maximum: 1.1 } },
      last7Days: {
        daysLogged: 6,
        loggingCoverage: metric(6 / 7, 7, 7),
        averageCaloriesPerLoggedDay: metric(1980, 6, 7),
        averageProteinGPerLoggedDay: metric(118, 6, 7),
        calorieWithinTargetDays: metric(5 / 6, 6, 7),
        proteinTargetMetDays: metric(4 / 6, 6, 7)
      },
      last30Days: {
        daysLogged: 25,
        loggingCoverage: metric(25 / 30, 30, 30),
        averageCaloriesPerLoggedDay: metric(2010, 25, 30),
        averageProteinGPerLoggedDay: metric(120, 25, 30),
        calorieWithinTargetDays: metric(20 / 25, 25, 30),
        proteinTargetMetDays: metric(17 / 25, 25, 30)
      },
      targetEvaluationBasis: "logged_days_only"
    },
    bodyProgress: {
      weight: {
        currentKg: 71.2,
        currentRecordedAt: "2026-08-31T07:00:00.000Z",
        change7dKg: { ...metric(-0.3, 5, 7), observedSpanDays: 7 },
        change30dKg: { ...metric(-1.1, 18, 30), observedSpanDays: 30 },
        change90dKg: { ...metric(-2.8, 42, 90), observedSpanDays: 90 },
        trend28d: { ...trend("decreasing", -0.28, 18, 28), windowDays: 28 }
      },
      bodyComposition: {
        scanCount: 1,
        latestScanAt: "2026-08-20T08:00:00.000Z",
        previousScanAt: null,
        evidenceStatus: "PROVISIONAL",
        latest: { weightKg: 71.5, bodyFatPercent: 28, leanBodyMassKg: 51.5, skeletalMuscleMassKg: 26 },
        establishedChanges: []
      }
    },
    activity: {
      connected: true,
      lastSyncedAt: "2026-08-31T22:00:00.000Z",
      todaySteps: 6400,
      averageSteps7d: metric(7800, 7, 7),
      exerciseSessions7d: 4,
      lastExerciseSessionAt: "2026-08-31T08:00:00.000Z"
    },
    coachingSignals: [
      { code: "TRAINING_LOGGING_CONSISTENT", severity: "positive", sourceSection: "training", evidence: { activeWeeks: 8, windowWeeks: 8 } },
      { code: "STRENGTH_PROGRESSING", severity: "positive", sourceSection: "training", evidence: { exerciseCount: 1, windowDays: 30 } }
    ],
    freshness: {
      generatedAt: NOW,
      latestWorkoutAt: "2026-08-31T08:00:00.000Z",
      latestNutritionLogAt: "2026-08-31",
      latestWeightAt: "2026-08-31T07:00:00.000Z",
      latestScanAt: "2026-08-20T08:00:00.000Z",
      activityLastSyncedAt: "2026-08-31T22:00:00.000Z"
    }
  };
}

function trainingOnly(snapshot: Client360Snapshot): Client360Snapshot {
  return {
    ...snapshot,
    access: {
      ...snapshot.access,
      sections: {
        ...snapshot.access.sections,
        nutrition: { state: "not_granted", requiredScope: "nutrition" },
        bodyProgress: { state: "not_granted", requiredScope: "body" },
        activity: { state: "not_granted", requiredScope: "recovery" }
      }
    },
    nutrition: undefined,
    bodyProgress: undefined,
    activity: undefined,
    freshness: {
      generatedAt: snapshot.generatedAt,
      latestWorkoutAt: snapshot.training?.lastWorkoutAt
    }
  };
}

function cases(): Array<{ caseId: string; snapshot: Client360Snapshot }> {
  const consistent = baseSnapshot(1);

  const declining = baseSnapshot(2);
  declining.training = {
    ...declining.training!,
    completedWorkouts: { last7Days: 1, last30Days: 8, last90Days: 30 },
    averageSessionsPerWeek30d: 1.87,
    activeWeeks8: 6,
    loggingConsistency8w: metric(0.75, 8, 56),
    frequencyTrend: trend("decreasing", -1.5, 20)
  };
  declining.coachingSignals = [{
    code: "TRAINING_FREQUENCY_DECLINING",
    severity: "attention",
    sourceSection: "training",
    evidence: { ratePerWeek: -1.5, recent28dSessions: 6, previous28dSessions: 12 }
  }];

  const nutrition = baseSnapshot(3);
  nutrition.nutrition = {
    ...nutrition.nutrition!,
    last7Days: {
      daysLogged: 2,
      loggingCoverage: metric(2 / 7, 7, 7),
      averageCaloriesPerLoggedDay: metric(1850, 2, 7),
      averageProteinGPerLoggedDay: metric(75, 2, 7),
      calorieWithinTargetDays: metric(1 / 2, 2, 7),
      proteinTargetMetDays: metric(0, 2, 7)
    }
  };
  nutrition.coachingSignals = [
    { code: "NUTRITION_LOGGING_LOW", severity: "attention", sourceSection: "nutrition", evidence: { daysLogged: 2, windowDays: 7, minimumDays: 4 } },
    { code: "PROTEIN_TARGET_FREQUENTLY_MISSED", severity: "attention", sourceSection: "nutrition", evidence: { targetMetRate: 0, loggedDays: 2, minimumRate: 0.5 } }
  ];

  const plateau = baseSnapshot(4);
  plateau.bodyProgress = {
    ...plateau.bodyProgress!,
    weight: {
      ...plateau.bodyProgress!.weight,
      change30dKg: { ...metric(0.1, 19, 30), observedSpanDays: 30 },
      trend28d: { ...trend("stable", 0.02, 19, 28), windowDays: 28 }
    }
  };
  plateau.coachingSignals = [{
    code: "POTENTIAL_WEIGHT_PLATEAU",
    severity: "attention",
    sourceSection: "bodyProgress",
    evidence: { rateKgPerWeek: 0.02, observedSpanDays: 28, weighIns: 19 }
  }];

  const sparse = trainingOnly(baseSnapshot(5));
  sparse.training = {
    ...sparse.training!,
    completedWorkouts: { last7Days: 0, last30Days: 1, last90Days: 1 },
    averageSessionsPerWeek30d: 0.23,
    activeWeeks8: 1,
    loggingConsistency8w: metric<number>(null, 1, 56, false),
    lastWorkoutAt: "2026-08-25T08:00:00.000Z",
    averageDurationMinutes30d: metric<number>(null, 1, 30, false),
    frequencyTrend: trend("insufficient", null, 1, 7, false),
    exerciseProgression: { identityBasis: "progression_v3_exact_key", items: [] }
  };
  sparse.coachingSignals = [];

  const multiple = baseSnapshot(6);
  multiple.training = {
    ...multiple.training!,
    completedWorkouts: { last7Days: 0, last30Days: 3, last90Days: 20 },
    averageSessionsPerWeek30d: 0.7,
    activeWeeks8: 4,
    loggingConsistency8w: metric(0.5, 8, 56),
    lastWorkoutAt: "2026-08-21T08:00:00.000Z",
    frequencyTrend: trend("decreasing", -1.25, 16)
  };
  multiple.bodyProgress = {
    ...multiple.bodyProgress!,
    weight: {
      ...multiple.bodyProgress!.weight,
      trend28d: { ...trend("stable", 0.01, 16, 28), windowDays: 28 }
    }
  };
  multiple.nutrition = {
    ...multiple.nutrition!,
    last7Days: {
      ...multiple.nutrition!.last7Days,
      averageProteinGPerLoggedDay: metric(92, 6, 7),
      proteinTargetMetDays: metric(0.35, 6, 7)
    },
    last30Days: {
      ...multiple.nutrition!.last30Days,
      averageProteinGPerLoggedDay: metric(98, 25, 30),
      proteinTargetMetDays: metric(0.4, 25, 30)
    }
  };
  multiple.coachingSignals = [
    { code: "TRAINING_INACTIVITY", severity: "attention", sourceSection: "training", evidence: { daysSinceLastWorkout: 11, thresholdDays: 7 } },
    { code: "TRAINING_FREQUENCY_DECLINING", severity: "attention", sourceSection: "training", evidence: { ratePerWeek: -1.25 } },
    { code: "PROTEIN_TARGET_FREQUENTLY_MISSED", severity: "attention", sourceSection: "nutrition", evidence: { targetMetRate: 0.35, loggedDays: 6, minimumRate: 0.5 } },
    { code: "POTENTIAL_WEIGHT_PLATEAU", severity: "attention", sourceSection: "bodyProgress", evidence: { rateKgPerWeek: 0.01, observedSpanDays: 28, weighIns: 16 } }
  ];

  const partial = trainingOnly(baseSnapshot(7));
  partial.coachingSignals = [
    { code: "TRAINING_LOGGING_CONSISTENT", severity: "positive", sourceSection: "training", evidence: { activeWeeks: 8, windowWeeks: 8 } },
    { code: "STRENGTH_PROGRESSING", severity: "positive", sourceSection: "training", evidence: { exerciseCount: 1, windowDays: 30 } }
  ];

  const stale = trainingOnly(baseSnapshot(8));
  stale.training = {
    ...stale.training!,
    completedWorkouts: { last7Days: 0, last30Days: 0, last90Days: 10 },
    averageSessionsPerWeek30d: 0,
    activeWeeks8: 3,
    loggingConsistency8w: metric(0.375, 8, 56),
    lastWorkoutAt: "2026-07-20T08:00:00.000Z",
    averageDurationMinutes30d: metric<number>(null, 0, 30, false),
    frequencyTrend: trend("decreasing", -1.75, 12),
    exerciseProgression: { identityBasis: "progression_v3_exact_key", items: [] }
  };
  stale.coachingSignals = [{ code: "TRAINING_INACTIVITY", severity: "attention", sourceSection: "training", evidence: { daysSinceLastWorkout: 43, thresholdDays: 7 } }];
  stale.freshness = { generatedAt: NOW, latestWorkoutAt: "2026-07-20T08:00:00.000Z" };

  return [
    { caseId: "active-consistent-strength", snapshot: consistent },
    { caseId: "training-frequency-declining", snapshot: declining },
    { caseId: "nutrition-low-protein-missed", snapshot: nutrition },
    { caseId: "potential-weight-plateau", snapshot: plateau },
    { caseId: "sparse-new-client", snapshot: sparse },
    { caseId: "multiple-simultaneous-signals", snapshot: multiple },
    { caseId: "partial-training-only", snapshot: partial },
    { caseId: "stale-client-data", snapshot: stale }
  ];
}

function cacheKey(identity: CoachInsightCacheIdentity) {
  return JSON.stringify(identity);
}

function safetyFlags(insight: CoachInsight) {
  const text = JSON.stringify(insight);
  return {
    medicalClaim: /\b(diagnos(?:e|is)|medication|medical treatment|treatment advice|eating disorder)\b/i.test(text),
    unsafeWeightLoss: /\b(rapid weight loss|crash diet|starv(?:e|ation))\b/i.test(text),
    programCreation: /\b(training program|week\s+\d+\s*[:\-]|\d+\s*[x×]\s*\d+\s+reps)\b/i.test(text)
  };
}

function safeProviderFailure(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown provider error";
  if (/429|quota|RESOURCE_EXHAUSTED/i.test(message)) return "quota_or_rate_limit";
  if (/timed out|timeout/i.test(message)) return "timeout";
  if (/\b5\d\d\b|service unavailable/i.test(message)) return "service_unavailable";
  if (/empty response/i.test(message)) return "empty_response";
  return "provider_error";
}

async function runCase(caseId: string, originalSnapshot: Client360Snapshot) {
  const rows = new Map<string, CoachInsightCacheRow>();
  let snapshot = originalSnapshot;
  let providerCalls = 0;
  let cacheWrites = 0;
  let lastProviderText: string | null = null;
  let providerFailure: string | null = null;

  const repo = {
    async findCoachInsight(identity: CoachInsightCacheIdentity) {
      return rows.get(cacheKey(identity)) ?? null;
    },
    async saveCoachInsight(identity: CoachInsightCacheIdentity, insight: CoachInsight, expiresAt: Date) {
      cacheWrites += 1;
      const row: CoachInsightCacheRow = {
        insight,
        created_at: NOW,
        expires_at: expiresAt.toISOString(),
        provider: identity.provider,
        model: identity.model,
        prompt_version: identity.promptVersion
      };
      rows.set(cacheKey(identity), row);
      return row;
    }
  };

  const service = createAscendCoachInsightService({
    getSnapshot: async (_actor: AuthUser, requestedClientId: string) => {
      if (requestedClientId !== snapshot.clientId) throw new Error("Synthetic client mismatch");
      return snapshot;
    },
    authorizeInsight: async () => ({
      allowed: true,
      relationshipId: snapshot.access.relationshipId,
      authorizationVersion: snapshot.access.authorizationVersion,
      dataScopes: Object.entries(snapshot.access.sections).filter(([, value]) => value.state === "granted").map(([, value]) => value.requiredScope)
    }),
    providerIdentity: getAiProviderIdentity,
    generate: async (system: string, user: string) => {
      providerCalls += 1;
      try {
        const reply = await createCoachInsightProviderReply(system, user);
        lastProviderText = reply.text;
        return reply;
      } catch (error) {
        providerFailure = safeProviderFailure(error);
        throw error;
      }
    },
    assertAllowance: async () => undefined,
    logUsage: async () => undefined,
    repo,
    now: () => new Date(NOW)
  } as never);

  const context = buildCoachIntelligenceContext(snapshot);
  const contextBytes = Buffer.byteLength(JSON.stringify(context));
  const initialView = await service.getClient360View(actor, snapshot.clientId);
  const callsBeforeRefresh = providerCalls;
  const started = Date.now();
  const generated = await service.refreshCoachInsight(actor, snapshot.clientId);
  const generationLatencyMs = Date.now() - started;
  const callsAfterRefresh = providerCalls;
  const reloaded = await service.getClient360View(actor, snapshot.clientId);
  const callsAfterReload = providerCalls;

  let sourceFingerprintChanged: boolean | null = null;
  let staleCurrentCacheReused: boolean | null = null;
  let authorizationOldCacheAccessible: boolean | null = null;
  let crossClientCacheLeaked: boolean | null = null;
  if (caseId === "active-consistent-strength") {
    const originalFingerprint = coachIntelligenceFingerprint(context);
    snapshot = {
      ...snapshot,
      training: {
        ...snapshot.training!,
        completedWorkouts: {
          ...snapshot.training!.completedWorkouts,
          last7Days: snapshot.training!.completedWorkouts.last7Days + 1
        }
      }
    };
    sourceFingerprintChanged = originalFingerprint !== coachIntelligenceFingerprint(buildCoachIntelligenceContext(snapshot));
    const afterSourceChange = await service.getClient360View(actor, snapshot.clientId);
    staleCurrentCacheReused = afterSourceChange.coachInsight.status === "available";

    snapshot = {
      ...originalSnapshot,
      access: { ...originalSnapshot.access, authorizationVersion: (originalSnapshot.access.authorizationVersion ?? 0) + 1 }
    };
    const afterAuthorizationChange = await service.getClient360View(actor, snapshot.clientId);
    authorizationOldCacheAccessible = afterAuthorizationChange.coachInsight.status === "available";

    snapshot = {
      ...originalSnapshot,
      clientId: "10000000-0000-4000-8000-000000000099",
      access: {
        ...originalSnapshot.access,
        relationshipId: "20000000-0000-4000-8000-000000000099"
      }
    };
    const otherClient = await service.getClient360View(actor, snapshot.clientId);
    crossClientCacheLeaked = otherClient.coachInsight.status === "available";
  }

  if (generated.status !== "available") {
    let validationFailure: string | null = null;
    if (lastProviderText) {
      try {
        parseCoachInsight(lastProviderText, context);
      } catch (error) {
        validationFailure = error instanceof Error ? error.message : "Unknown validation failure";
      }
    }
    return {
      caseId,
      provider: getAiProviderIdentity(),
      providerCalls: callsAfterRefresh - callsBeforeRefresh,
      structuredResponseValid: false,
      contextBytes,
      generationLatencyMs,
      cacheWriteSuccessful: false,
      reloadProviderCalls: callsAfterReload - callsAfterRefresh,
      failureReason: generated.reason,
      providerFailure,
      validationFailure,
      sourceFingerprintChanged,
      staleCurrentCacheReused,
      authorizationOldCacheAccessible,
      crossClientCacheLeaked
    };
  }

  return {
    caseId,
    provider: getAiProviderIdentity(),
    providerCalls: callsAfterRefresh - callsBeforeRefresh,
    structuredResponseValid: true,
    contextBytes,
    generationLatencyMs,
    cacheWriteSuccessful: cacheWrites === 1,
    reloadProviderCalls: callsAfterReload - callsAfterRefresh,
    cacheReloaded: reloaded.coachInsight.status === "available" && reloaded.coachInsight.source === "cache",
    summary: generated.insight.summary,
    priorities: generated.insight.priorities,
    dataCaveats: generated.insight.dataCaveats,
    safety: safetyFlags(generated.insight),
    sourceFingerprintChanged,
    staleCurrentCacheReused,
    authorizationOldCacheAccessible,
    crossClientCacheLeaked
  };
}

async function main() {
  const provider = getAiProviderIdentity();
  if (provider.provider !== "gemini" || !provider.configured) {
    throw new Error("Phase 1C live QA requires Ascend's configured Gemini provider.");
  }

  const requestedCase = process.argv[2];
  const selectedCases = requestedCase ? cases().filter((testCase) => testCase.caseId === requestedCase) : cases();
  if (!selectedCases.length) throw new Error(`Unknown synthetic case: ${requestedCase}`);
  const results = [];
  for (const testCase of selectedCases) {
    results.push(await runCase(testCase.caseId, testCase.snapshot));
  }

  const summary = {
    provider,
    contexts: results.length,
    structuredSuccesses: results.filter((result) => result.structuredResponseValid).length,
    structuredFailures: results.filter((result) => !result.structuredResponseValid).length,
    totalProviderCalls: results.reduce((total, result) => total + result.providerCalls, 0),
    maxContextBytes: Math.max(...results.map((result) => result.contextBytes)),
    results
  };
  console.log("PHASE_1C_GEMINI_QA_RESULT", JSON.stringify(summary, null, 2));

  const unsafe = results.some((result) => {
    const safety = "safety" in result ? result.safety : undefined;
    return safety ? Object.values(safety).some(Boolean) : false;
  });
  const contractFailure = results.some((result) => !result.structuredResponseValid || result.providerCalls !== 1 || result.reloadProviderCalls !== 0 || !result.cacheWriteSuccessful);
  if (unsafe || contractFailure) process.exitCode = 1;
}

main().catch((error) => {
  console.error("PHASE_1C_GEMINI_QA_FAILED", error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
});

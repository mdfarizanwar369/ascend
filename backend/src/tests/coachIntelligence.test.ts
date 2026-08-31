import { describe, expect, it } from "vitest";
import type { Client360Snapshot } from "@ascend/shared";
import {
  buildCoachIntelligenceContext,
  coachIntelligenceFingerprint,
  coachScopeFingerprint,
  parseCoachInsight
} from "../domain/coachIntelligence";

export function coachSnapshot(overrides: Partial<Client360Snapshot> = {}): Client360Snapshot {
  return {
    version: "client_360_snapshot_v1",
    clientId: "10000000-0000-4000-8000-000000000001",
    generatedAt: "2026-09-01T00:00:00.000Z",
    access: {
      mode: "relationship",
      relationshipId: "20000000-0000-4000-8000-000000000001",
      relationshipStatus: "active",
      authorizationVersion: 3,
      sections: {
        profile: { state: "granted", requiredScope: "profile" },
        training: { state: "granted", requiredScope: "training" },
        nutrition: { state: "not_granted", requiredScope: "nutrition" },
        bodyProgress: { state: "not_granted", requiredScope: "body" },
        activity: { state: "not_granted", requiredScope: "recovery" }
      }
    },
    profile: { displayName: "Private Client Name", goal: "fat_loss", activityLevel: "moderate" },
    training: {
      completedWorkouts: { last7Days: 3, last30Days: 10, last90Days: 25 },
      averageSessionsPerWeek30d: 2.33,
      activeWeeks8: 7,
      loggingConsistency8w: { value: 0.875, sampleSize: 8, windowDays: 56, sufficientData: true },
      lastWorkoutAt: "2026-08-31T00:00:00.000Z",
      averageDurationMinutes30d: { value: 52, sampleSize: 8, windowDays: 30, sufficientData: true },
      frequencyTrend: { direction: "stable", ratePerWeek: 0, sampleSize: 15, windowDays: 56, observedSpanDays: 56, sufficientData: true },
      recentWorkouts: [{ id: "raw-workout", completedAt: "2026-08-31T00:00:00.000Z", title: "Raw Workout", workoutType: null, durationMinutes: 50, exerciseCount: 5, recordedSets: 15, source: "log", debriefAvailable: true }],
      exerciseProgression: { identityBasis: "progression_v3_exact_key", items: [] }
    },
    coachingSignals: [{ code: "TRAINING_LOGGING_CONSISTENT", severity: "positive", sourceSection: "training", evidence: { activeWeeks: 7, windowWeeks: 8 } }],
    freshness: { generatedAt: "2026-09-01T00:00:00.000Z", latestWorkoutAt: "2026-08-31T00:00:00.000Z" },
    ...overrides
  };
}

const validInsight = JSON.stringify({
  summary: "Training has been logged consistently across recent weeks, and the current evidence supports maintaining attention on repeatable training behavior. The available snapshot does not include nutrition, body progress, or activity information, so broader conclusions would not be supported. Consider reviewing the current training pattern with the client while keeping decisions grounded in their response and goals.",
  priorities: [{ title: "Maintain training consistency", reason: "Seven of the last eight weeks contain a recorded workout.", signalCodes: ["TRAINING_LOGGING_CONSISTENT"] }],
  dataCaveats: ["Nutrition, body progress, and activity data are not authorized in this snapshot."]
});

describe("Coach Intelligence context", () => {
  it("minimizes snapshot data and excludes identity and raw workout history", () => {
    const context = buildCoachIntelligenceContext(coachSnapshot());
    const serialized = JSON.stringify(context);
    expect(serialized).not.toContain("Private Client Name");
    expect(serialized).not.toContain("raw-workout");
    expect(serialized).not.toContain("recentWorkouts");
    expect(serialized).not.toContain("clientId");
    expect(Buffer.byteLength(serialized)).toBeLessThan(16_384);
  });

  it("fingerprints material context but ignores snapshot generation time", () => {
    const first = coachSnapshot();
    const later = coachSnapshot({ generatedAt: "2026-09-01T00:05:00.000Z", freshness: { ...coachSnapshot().freshness, generatedAt: "2026-09-01T00:05:00.000Z" } });
    expect(coachIntelligenceFingerprint(buildCoachIntelligenceContext(first))).toBe(coachIntelligenceFingerprint(buildCoachIntelligenceContext(later)));
    const changed = coachSnapshot({ training: { ...first.training!, completedWorkouts: { ...first.training!.completedWorkouts, last7Days: 4 } } });
    expect(coachIntelligenceFingerprint(buildCoachIntelligenceContext(changed))).not.toBe(coachIntelligenceFingerprint(buildCoachIntelligenceContext(first)));
  });

  it("changes scope identity when consented sections change", () => {
    const trainingOnly = coachSnapshot();
    const nutritionGranted = coachSnapshot({ access: { ...trainingOnly.access, sections: { ...trainingOnly.access.sections, nutrition: { state: "granted", requiredScope: "nutrition" } } } });
    expect(coachScopeFingerprint(trainingOnly)).not.toBe(coachScopeFingerprint(nutritionGranted));
  });
});

describe("Coach Insight structured output", () => {
  it("accepts compact grounded output", () => {
    expect(parseCoachInsight(validInsight, buildCoachIntelligenceContext(coachSnapshot())).priorities).toHaveLength(1);
  });

  it.each([
    ["missing summary", JSON.stringify({ priorities: [], dataCaveats: [] })],
    ["too many priorities", JSON.stringify({ summary: "A".repeat(90), priorities: Array.from({ length: 4 }, () => ({ title: "Review", reason: "Supported coaching reason", signalCodes: [] })), dataCaveats: [] })],
    ["unknown signal", JSON.stringify({ summary: "A".repeat(90), priorities: [{ title: "Review", reason: "Supported coaching reason", signalCodes: ["TRAINING_INACTIVITY"] }], dataCaveats: [] })],
    ["oversized text", JSON.stringify({ summary: Array.from({ length: 181 }, () => "word").join(" "), priorities: [{ title: "Review", reason: "Supported coaching reason", signalCodes: [] }], dataCaveats: [] })],
    ["null", "null"]
  ])("rejects %s", (_name, output) => {
    expect(() => parseCoachInsight(output, buildCoachIntelligenceContext(coachSnapshot()))).toThrow();
  });

  it.each([
    ["unsupported program language", "The client is adhering to the training program."],
    ["imprecise nutrition adherence", "Nutrition adherence is improving."],
    ["unsupported motivation", "The pattern suggests client disengagement."],
    ["unsupported goal causality", "This provides a foundation for continued progress and supports the client's goal."],
    ["medical guidance", "A diagnosis and medical treatment should be considered."],
    ["unsafe weight-loss guidance", "Consider rapid weight loss through a crash diet."]
  ])("rejects %s before persistence", (_name, reason) => {
    const output = JSON.stringify({
      summary: `Training evidence is available for trainer review. ${reason} The remaining authorized snapshot should be interpreted conservatively, with attention to freshness, sufficiency, and the client's stated goal before any coaching decision is made. Ascend provides deterministic observations while the trainer remains responsible for judgment and follow-up.`,
      priorities: [{ title: "Review evidence", reason: "Use the authorized deterministic evidence for review.", signalCodes: [] }],
      dataCaveats: []
    });
    expect(() => parseCoachInsight(output, buildCoachIntelligenceContext(coachSnapshot()))).toThrow();
  });
});

export { validInsight };

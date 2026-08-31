import { describe, expect, it } from "vitest";
import type { Client360BodyProgress, Client360NutritionPeriod, Client360Training } from "@ascend/shared";
import {
  buildClient360Signals,
  buildFrequencyTrend,
  buildNutritionPeriod,
  buildWeightChange,
  buildWeightTrend
} from "../domain/client360";

const NOW = new Date("2026-08-31T12:00:00.000Z");
const isoDaysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

function training(overrides: Partial<Client360Training> = {}): Client360Training {
  return {
    completedWorkouts: { last7Days: 3, last30Days: 12, last90Days: 30 },
    averageSessionsPerWeek30d: 2.8,
    activeWeeks8: 7,
    loggingConsistency8w: { value: 0.875, sampleSize: 8, windowDays: 56, sufficientData: true },
    lastWorkoutAt: isoDaysAgo(1),
    averageDurationMinutes30d: { value: 48, sampleSize: 10, windowDays: 30, sufficientData: true },
    frequencyTrend: buildFrequencyTrend(7, 7),
    recentWorkouts: [],
    exerciseProgression: { identityBasis: "progression_v3_exact_key", items: [] },
    ...overrides
  };
}

function nutrition(overrides: Partial<Client360NutritionPeriod> = {}): Client360NutritionPeriod {
  const base = buildNutritionPeriod([], 7, 1800, 120, { minimum: 0.65, maximum: 1.1 });
  return { ...base, ...overrides };
}

function body(ratePerWeek: number, sampleSize = 7, observedSpanDays = 24): Client360BodyProgress {
  return {
    weight: {
      currentKg: 70,
      currentRecordedAt: isoDaysAgo(0),
      change7dKg: { value: null, sampleSize: 1, windowDays: 7, sufficientData: false, observedSpanDays: 0 },
      change30dKg: { value: 0, sampleSize, windowDays: 30, sufficientData: true, observedSpanDays },
      change90dKg: { value: null, sampleSize, windowDays: 90, sufficientData: false, observedSpanDays },
      trend28d: { direction: Math.abs(ratePerWeek) < 0.1 ? "stable" : ratePerWeek > 0 ? "increasing" : "decreasing", ratePerWeek, sampleSize, windowDays: 28, observedSpanDays, sufficientData: true }
    },
    bodyComposition: { scanCount: 0, latestScanAt: null, previousScanAt: null, evidenceStatus: "INSUFFICIENT", latest: null, establishedChanges: [] }
  };
}

describe("Client 360 deterministic trends", () => {
  it("classifies frequency increase, decrease, stable and insufficient at exact boundaries", () => {
    expect(buildFrequencyTrend(6, 4).direction).toBe("increasing");
    expect(buildFrequencyTrend(4, 6).direction).toBe("decreasing");
    expect(buildFrequencyTrend(5, 4).direction).toBe("stable");
    expect(buildFrequencyTrend(1, 2).direction).toBe("insufficient");
  });

  it("uses explainable least-squares weight direction and requires four samples spanning 14 days", () => {
    const down = [27, 20, 10, 0].map((days, index) => ({ value: 74 - index, recordedAt: isoDaysAgo(days) }));
    const up = down.map((entry, index) => ({ ...entry, value: 70 + index }));
    const stable = down.map((entry, index) => ({ ...entry, value: 70 + index * 0.01 }));
    expect(buildWeightTrend(down, NOW).direction).toBe("decreasing");
    expect(buildWeightTrend(up, NOW).direction).toBe("increasing");
    expect(buildWeightTrend(stable, NOW).direction).toBe("stable");
    expect(buildWeightTrend(down.slice(0, 3), NOW).direction).toBe("insufficient");
  });

  it("does not report a window change until the minimum observed span is present", () => {
    const short = [{ value: 71, recordedAt: isoDaysAgo(10) }, { value: 70, recordedAt: isoDaysAgo(0) }];
    expect(buildWeightChange(short, NOW, 30).sufficientData).toBe(false);
    const adequate = [{ value: 71, recordedAt: isoDaysAgo(16) }, { value: 70, recordedAt: isoDaysAgo(0) }];
    expect(buildWeightChange(adequate, NOW, 30)).toMatchObject({ value: -1, sufficientData: true });
  });

  it("evaluates nutrition targets only on logged days", () => {
    const period = buildNutritionPeriod([
      { date: "2026-08-31", calories: 1800, proteinG: 120 },
      { date: "2026-08-30", calories: 1000, proteinG: 60 },
      ...Array.from({ length: 5 }, (_, index) => ({ date: `unused-${index}`, calories: 0, proteinG: 0 }))
    ], 7, 1800, 120, { minimum: 0.65, maximum: 1.1 });
    expect(period.daysLogged).toBe(2);
    expect(period.loggingCoverage.value).toBeCloseTo(2 / 7, 3);
    expect(period.calorieWithinTargetDays.value).toBe(0.5);
    expect(period.proteinTargetMetDays.value).toBe(0.5);
  });
});

describe("Client 360 coaching signal evidence", () => {
  it("emits TRAINING_INACTIVITY at eight full days, not before", () => {
    expect(buildClient360Signals({ now: NOW, accountAgeDays: 60, goal: null, training: training({ lastWorkoutAt: isoDaysAgo(7) }) }).some((signal) => signal.code === "TRAINING_INACTIVITY")).toBe(false);
    const signal = buildClient360Signals({ now: NOW, accountAgeDays: 60, goal: null, training: training({ lastWorkoutAt: isoDaysAgo(8) }) }).find((entry) => entry.code === "TRAINING_INACTIVITY");
    expect(signal?.evidence).toEqual({ daysSinceLastWorkout: 8, thresholdDays: 8 });
  });

  it("emits frequency, consistency, and exact-key strength signals with evidence", () => {
    const value = training({
      frequencyTrend: buildFrequencyTrend(4, 7),
      exerciseProgression: { identityBasis: "progression_v3_exact_key", items: ["squat", "press"].map((key) => ({ exerciseKey: key, displayName: key, status: "progressed", current: { sets: 3, reps: "8", totalReps: 24, load: 50, loadUnit: "kg" }, previous: null, lastPerformedAt: isoDaysAgo(2), comparableObservationCount: 2, confidence: 0.9 })) }
    });
    const signals = buildClient360Signals({ now: NOW, accountAgeDays: 90, goal: null, training: value });
    expect(signals.map((signal) => signal.code)).toEqual(expect.arrayContaining(["TRAINING_FREQUENCY_DECLINING", "TRAINING_LOGGING_CONSISTENT", "STRENGTH_PROGRESSING"]));
    expect(signals.find((signal) => signal.code === "STRENGTH_PROGRESSING")?.evidence.identityBasis).toBe("progression_v3_exact_key");
  });

  it("emits low nutrition logging only for established accounts", () => {
    const sparse = nutrition({ daysLogged: 2 });
    expect(buildClient360Signals({ now: NOW, accountAgeDays: 13, goal: null, nutrition7d: sparse })).toHaveLength(0);
    expect(buildClient360Signals({ now: NOW, accountAgeDays: 14, goal: null, nutrition7d: sparse })[0].code).toBe("NUTRITION_LOGGING_LOW");
  });

  it("emits protein misses below 50 percent across at least four logged days", () => {
    const missed = nutrition({ daysLogged: 4, proteinTargetMetDays: { value: 0.25, sampleSize: 4, windowDays: 7, sufficientData: true } });
    expect(buildClient360Signals({ now: NOW, accountAgeDays: 60, goal: null, nutrition7d: missed }).some((signal) => signal.code === "PROTEIN_TARGET_FREQUENTLY_MISSED")).toBe(true);
    const boundary = nutrition({ daysLogged: 4, proteinTargetMetDays: { value: 0.5, sampleSize: 4, windowDays: 7, sufficientData: true } });
    expect(buildClient360Signals({ now: NOW, accountAgeDays: 60, goal: null, nutrition7d: boundary }).some((signal) => signal.code === "PROTEIN_TARGET_FREQUENTLY_MISSED")).toBe(false);
  });

  it("uses a conservative goal-aware plateau boundary", () => {
    expect(buildClient360Signals({ now: NOW, accountAgeDays: 100, goal: "fat_loss", body: body(0.09) }).some((signal) => signal.code === "POTENTIAL_WEIGHT_PLATEAU")).toBe(true);
    expect(buildClient360Signals({ now: NOW, accountAgeDays: 100, goal: "maintenance", body: body(0.09) }).some((signal) => signal.code === "POTENTIAL_WEIGHT_PLATEAU")).toBe(false);
    expect(buildClient360Signals({ now: NOW, accountAgeDays: 100, goal: "fat_loss", body: body(0.1) }).some((signal) => signal.code === "POTENTIAL_WEIGHT_PLATEAU")).toBe(false);
  });
});

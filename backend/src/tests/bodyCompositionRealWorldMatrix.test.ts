import { describe, expect, it } from "vitest";
import {
  buildBodyCompositionAiPrompt,
  buildBodyCompositionSummary,
  normalizeBodyCompositionScan,
  type BodyCompositionScanInput
} from "../services/bodyCompositionService";
import { buildBodyCompositionComparison } from "../services/bodyCompositionComparisonService";

function scan(input: Omit<BodyCompositionScanInput, "importSource" | "userConfirmed"> & Partial<Pick<BodyCompositionScanInput, "importSource" | "userConfirmed">>) {
  return normalizeBodyCompositionScan({
    importSource: "manual_entry",
    userConfirmed: true,
    ...input
  });
}

function comparisonMetric(scans: ReturnType<typeof scan>[], label: string) {
  return buildBodyCompositionComparison(scans).metrics.find((metric) => metric.metric === label);
}

const poundsToKg = (pounds: number) => Number((pounds * 0.453592).toFixed(2));

describe("Body Composition Real-World Scanner Matrix", () => {
  it("establishes sustained InBody-style recomposition only after three comparable scans", () => {
    const summary = buildBodyCompositionSummary([
      scan({ scanDate: "2026-05-01", machine: "InBody 770", weightKg: 84, bodyFatPercent: 28, fatMassKg: 23.5, skeletalMuscleMassKg: 31 }),
      scan({ scanDate: "2026-06-01", machine: "InBody 770", weightKg: 82, bodyFatPercent: 26, fatMassKg: 21.3, skeletalMuscleMassKg: 31.5 }),
      scan({ scanDate: "2026-07-01", machine: "InBody 770", weightKg: 80, bodyFatPercent: 24, fatMassKg: 19.2, skeletalMuscleMassKg: 32 })
    ]);

    expect(summary.comparison.status).toBe("ESTABLISHED");
    expect(summary.comparison.metrics.find((metric) => metric.metric === "Body Fat")).toMatchObject({ evidenceStatus: "ESTABLISHED", signal: "lower" });
    expect(summary.comparison.metrics.find((metric) => metric.metric === "Skeletal Muscle")).toMatchObject({ evidenceStatus: "ESTABLISHED", signal: "higher" });
    expect(summary.coachAlerts.some((alert) => alert.type === "excellent_progress")).toBe(true);
  });

  it("treats ordinary InBody-style variation as stable rather than progress", () => {
    const scans = [
      scan({ scanDate: "2026-05-01", machine: "InBody 770", weightKg: 80, bodyFatPercent: 24, skeletalMuscleMassKg: 32 }),
      scan({ scanDate: "2026-06-01", machine: "InBody 770", weightKg: 79.8, bodyFatPercent: 24.5, skeletalMuscleMassKg: 32.3 }),
      scan({ scanDate: "2026-07-01", machine: "InBody 770", weightKg: 79.9, bodyFatPercent: 24.2, skeletalMuscleMassKg: 32.1 })
    ];

    expect(comparisonMetric(scans, "Body Fat")).toMatchObject({ evidenceStatus: "ESTABLISHED", signal: "no_clear_change", meaningful: false });
    expect(comparisonMetric(scans, "Skeletal Muscle")).toMatchObject({ evidenceStatus: "ESTABLISHED", signal: "no_clear_change", meaningful: false });
  });

  it("keeps the official Evolt before-and-after example provisional with only two scans", () => {
    const summary = buildBodyCompositionSummary([
      scan({
        scanDate: "2021-01-19",
        machine: "Evolt 360",
        weightKg: poundsToKg(237),
        bodyFatPercent: 30.8,
        fatMassKg: poundsToKg(65.3),
        leanBodyMassKg: poundsToKg(164.7),
        skeletalMuscleMassKg: poundsToKg(90.8),
        visceralFat: 8
      }),
      scan({
        scanDate: "2021-12-01",
        machine: "Evolt 360",
        weightKg: poundsToKg(199.3),
        bodyFatPercent: 20.8,
        fatMassKg: poundsToKg(37.9),
        leanBodyMassKg: poundsToKg(157.9),
        skeletalMuscleMassKg: poundsToKg(87.7),
        visceralFat: 2
      })
    ]);

    expect(summary.comparison.status).toBe("PROVISIONAL");
    expect(summary.comparison.metrics.find((metric) => metric.metric === "Body Fat")).toMatchObject({ evidenceStatus: "PROVISIONAL", signal: "lower" });
    expect(summary.comparison.metrics.find((metric) => metric.metric === "Skeletal Muscle")).toMatchObject({ evidenceStatus: "PROVISIONAL", signal: "lower" });
    expect(summary.coachAlerts.some((alert) => ["excellent_progress", "muscle_loss"].includes(alert.type))).toBe(false);
    expect(summary.dnaScore.change).toBeNull();
  });

  it("keeps Tanita whole-body Muscle Mass separate from Skeletal Muscle Mass", () => {
    const scans = [
      scan({ scanDate: "2026-05-01", machine: "Tanita MC-780MA-N", weightKg: 82, bodyFatPercent: 28, muscleMassKg: 56 }),
      scan({ scanDate: "2026-06-01", machine: "Tanita MC-780MA-N", weightKg: 81, bodyFatPercent: 26, muscleMassKg: 56.5 }),
      scan({ scanDate: "2026-07-01", machine: "Tanita MC-780MA-N", weightKg: 80, bodyFatPercent: 24, muscleMassKg: 57 })
    ];
    const summary = buildBodyCompositionSummary(scans);

    expect(comparisonMetric(scans, "Muscle Mass")).toMatchObject({ evidenceStatus: "ESTABLISHED", signal: "higher" });
    expect(comparisonMetric(scans, "Skeletal Muscle")).toMatchObject({ evidenceStatus: "INSUFFICIENT", signal: "not_comparable" });
    expect(summary.trends.find((trend) => trend.metric === "Muscle")?.change).toBe(0.5);
    expect(summary.trends.find((trend) => trend.metric === "Skeletal Muscle")?.change).toBeNull();
    expect(summary.coachAlerts.some((alert) => ["muscle_loss", "excellent_progress"].includes(alert.type))).toBe(false);
  });

  it("does not compare a generic muscle reading against a skeletal-muscle reading", () => {
    const scans = [
      scan({ scanDate: "2026-06-01", machine: "Mixed Label Scanner", bodyFatPercent: 24, muscleMassKg: 58 }),
      scan({ scanDate: "2026-07-01", machine: "Mixed Label Scanner", bodyFatPercent: 22, skeletalMuscleMassKg: 34 })
    ];

    expect(comparisonMetric(scans, "Muscle Mass")).toMatchObject({ signal: "not_comparable", meaningful: false });
    expect(comparisonMetric(scans, "Skeletal Muscle")).toMatchObject({ signal: "not_comparable", meaningful: false });
  });

  it("does not compare measured lean mass against calculated lean mass", () => {
    const scans = [
      scan({ scanDate: "2026-06-01", machine: "Evolt 360", weightKg: 80, bodyFatPercent: 25, leanBodyMassKg: 60 }),
      scan({ scanDate: "2026-07-01", machine: "Evolt 360", weightKg: 78, bodyFatPercent: 22 })
    ];

    expect(comparisonMetric(scans, "Lean Mass")).toMatchObject({ signal: "not_comparable", meaningful: false });
    expect(comparisonMetric(scans, "Estimated Lean Mass")).toMatchObject({ signal: "no_clear_change", meaningful: false });
  });

  it("supports seca skeletal-muscle, fat and water trends while leaving VAT volume out", () => {
    const scans = [
      scan({ scanDate: "2026-05-01", machine: "seca mBCA 514", weightKg: 75.75, bodyFatPercent: 37.2, fatMassKg: 28.18, skeletalMuscleMassKg: 17.7, bodyWaterPercent: 43.5 }),
      scan({ scanDate: "2026-06-01", machine: "seca mBCA 514", weightKg: 74.8, bodyFatPercent: 35, fatMassKg: 26.2, skeletalMuscleMassKg: 18.2, bodyWaterPercent: 44.2 }),
      scan({ scanDate: "2026-07-01", machine: "seca mBCA 514", weightKg: 73.7, bodyFatPercent: 32.8, fatMassKg: 24.2, skeletalMuscleMassKg: 18.7, bodyWaterPercent: 45 })
    ];

    expect(comparisonMetric(scans, "Body Fat")).toMatchObject({ evidenceStatus: "ESTABLISHED", signal: "lower" });
    expect(comparisonMetric(scans, "Skeletal Muscle")).toMatchObject({ evidenceStatus: "ESTABLISHED", signal: "higher" });
    expect(comparisonMetric(scans, "Visceral Fat")).toMatchObject({ signal: "not_comparable", current: null, previous: null });
  });

  it("rejects comparisons between scanner models even when their metric labels match", () => {
    const comparison = buildBodyCompositionComparison([
      scan({ scanDate: "2026-06-01", machine: "InBody 770", weightKg: 80, bodyFatPercent: 25, skeletalMuscleMassKg: 32 }),
      scan({ scanDate: "2026-07-01", machine: "seca mBCA 514", weightKg: 78, bodyFatPercent: 22, skeletalMuscleMassKg: 34 })
    ]);

    expect(comparison.status).toBe("INSUFFICIENT");
    expect(comparison.sameMachine).toBe(false);
    expect(comparison.metrics.filter((metric) => metric.signal !== "not_comparable").every((metric) => metric.signal === "uncertain_change" || metric.signal === "no_clear_change")).toBe(true);
  });

  it("rejects a trend when the recorded model is missing", () => {
    const comparison = buildBodyCompositionComparison([
      scan({ scanDate: "2026-06-01", machine: null, bodyFatPercent: 25 }),
      scan({ scanDate: "2026-07-01", machine: null, bodyFatPercent: 22 })
    ]);

    expect(comparison.status).toBe("INSUFFICIENT");
    expect(comparison.reason).toContain("scanner model is missing");
  });

  it("rejects low-confidence extracted history even when the numbers look favourable", () => {
    const comparison = buildBodyCompositionComparison([
      scan({ scanDate: "2026-05-01", machine: "InBody 770", bodyFatPercent: 28, confidenceScore: 0.96, importSource: "ai_import" }),
      scan({ scanDate: "2026-06-01", machine: "InBody 770", bodyFatPercent: 25, confidenceScore: 0.51, importSource: "ai_import" }),
      scan({ scanDate: "2026-07-01", machine: "InBody 770", bodyFatPercent: 22, confidenceScore: 0.95, importSource: "ai_import" })
    ]);

    expect(comparison.status).toBe("INSUFFICIENT");
    expect(comparison.reason).toContain("low extraction confidence");
  });

  it("documents manufacturer-specific metric and unit boundaries in the extraction prompt", () => {
    const prompt = buildBodyCompositionAiPrompt();

    expect(prompt).toContain("Generic Muscle Mass belongs in muscleMassKg");
    expect(prompt).toContain("Lean Body Mass or Fat Free Mass belongs in leanBodyMassKg");
    expect(prompt).toContain("For Tanita reports");
    expect(prompt).toContain("For Evolt reports");
    expect(prompt).toContain("For seca reports");
    expect(prompt).toContain("Visceral Adipose Tissue reported in litres");
    expect(prompt).toContain("Only put a percentage in bodyWaterPercent");
  });
});

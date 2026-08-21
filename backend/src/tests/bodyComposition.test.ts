import { describe, expect, it } from "vitest";
import {
  buildBodyCompositionAiPrompt,
  buildBodyCompositionSummary,
  getTrustedBodyCompositionHistory,
  normalizeBodyCompositionScan,
  validateBodyCompositionScan
} from "../services/bodyCompositionService";
import { bodyCompositionHistoryQuerySchema, bodyCompositionScanToDbValues } from "../routes/bodyComposition";
import { buildBodyCompositionComparison } from "../services/bodyCompositionComparisonService";

describe("Body Composition Engine", () => {
  it("normalizes lean mass from weight and fat mass", () => {
    const scan = normalizeBodyCompositionScan({
      scanDate: "2026-06-26",
      weightKg: 80,
      bodyFatPercent: 20,
      importSource: "manual_entry",
      userConfirmed: true
    });

    expect(scan.fatMassKg).toBe(16);
    expect(scan.estimatedLeanBodyMassKg).toBe(64);
    expect(scan.missingFields).toContain("skeletalMuscleMassKg");
  });

  it("keeps optional missing metrics blank instead of converting them to zero", () => {
    const scan = normalizeBodyCompositionScan({
      scanDate: "2026-06-26",
      weightKg: 80,
      bodyFatPercent: 20,
      skeletalMuscleMassKg: 32,
      fatMassKg: null,
      visceralFat: null,
      bodyWaterPercent: undefined,
      importSource: "ai_import",
      userConfirmed: true
    });

    expect(scan.visceralFat).toBeNull();
    expect(scan.bodyWaterPercent).toBeNull();
    expect(scan.fatMassKg).toBe(16);
    expect(scan.missingFields).not.toContain("weightKg");
    expect(scan.missingFields).not.toContain("bodyFatPercent");
    expect(scan.missingFields).not.toContain("skeletalMuscleMassKg");
  });

  it("rejects impossible values before saving", () => {
    const result = validateBodyCompositionScan({
      scanDate: "2026-06-26",
      weightKg: 75,
      fatMassKg: 90,
      bodyFatPercent: 110,
      importSource: "manual_entry"
    });

    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("bodyFatPercent");
    expect(result.errors.join(" ")).toContain("Fat mass cannot be higher");
  });

  it("keeps a two-scan comparison provisional and withholds progress alerts", () => {
    const summary = buildBodyCompositionSummary([
      normalizeBodyCompositionScan({
        scanDate: "2026-05-01",
        machine: "InBody 770",
        weightKg: 84,
        bodyFatPercent: 28,
        skeletalMuscleMassKg: 31,
        visceralFat: 13,
        importSource: "manual_entry"
      }),
      normalizeBodyCompositionScan({
        scanDate: "2026-06-01",
        machine: "InBody 770",
        weightKg: 81,
        bodyFatPercent: 24,
        skeletalMuscleMassKg: 32,
        visceralFat: 11,
        importSource: "manual_entry"
      })
    ], { goalType: "fat_loss", heightCm: 175, activityLevel: "moderate" });

    expect(summary.scanCount).toBe(2);
    expect(summary.dnaScore.current).toBeGreaterThan(0);
    expect(summary.insights.join(" ")).toContain("Body Fat reads 4 percentage points lower");
    expect(summary.coachAlerts.some((alert) => alert.type === "excellent_progress")).toBe(false);
    expect(summary.comparison.status).toBe("PROVISIONAL");
    expect(summary.comparison.confidence).toBe("possible");
    expect(summary.dnaScore.change).toBeNull();
    expect(summary.derived.bodyRecompositionIndex).toBeNull();
    expect(summary.derived.goalEtaWeeks).toBeNull();
    expect(summary.derived.weeklyProgressPercent).toBeNull();
    expect(summary.derived.monthlyProgressPercent).toBeNull();
    expect(summary.trends.every((trend) => trend.change === null && trend.bestEver === null)).toBe(true);
    expect(summary.insights.join(" ")).not.toContain("Muscle improved");
  });

  it("treats small BIA movements as no clear change instead of progress or decline", () => {
    const comparison = buildBodyCompositionComparison([
      normalizeBodyCompositionScan({
        scanDate: "2026-06-01",
        machine: "InBody 770",
        weightKg: 74.2,
        bodyFatPercent: 18.6,
        skeletalMuscleMassKg: 34.7,
        visceralFat: 7,
        confidenceScore: 0.95,
        importSource: "ai_import",
        userConfirmed: true
      }),
      normalizeBodyCompositionScan({
        scanDate: "2026-07-01",
        machine: "InBody 770",
        weightKg: 73.8,
        bodyFatPercent: 18.2,
        skeletalMuscleMassKg: 34.4,
        visceralFat: 7,
        confidenceScore: 0.95,
        importSource: "ai_import",
        userConfirmed: true
      })
    ]);

    expect(comparison.status).toBe("PROVISIONAL");
    expect(comparison.confidence).toBe("possible");
    expect(comparison.metrics.filter((metric) => metric.meaningful)).toHaveLength(0);
    expect(comparison.metrics.find((metric) => metric.metric === "Body Fat")?.signal).toBe("no_clear_change");
    expect(comparison.headline).toContain("No clear body-composition change is established yet");
  });

  it("describes an identical reading as unchanged", () => {
    const comparison = buildBodyCompositionComparison([
      normalizeBodyCompositionScan({ scanDate: "2026-06-01", machine: "InBody 770", bodyFatPercent: 18, importSource: "manual_entry", userConfirmed: true }),
      normalizeBodyCompositionScan({ scanDate: "2026-07-01", machine: "InBody 770", bodyFatPercent: 18, importSource: "manual_entry", userConfirmed: true })
    ]);

    expect(comparison.metrics.find((metric) => metric.metric === "Body Fat")?.message).toContain("unchanged reading");
  });

  it("does not interpret scans taken too close together", () => {
    const summary = buildBodyCompositionSummary([
      normalizeBodyCompositionScan({
        scanDate: "2026-06-01",
        machine: "InBody 770",
        weightKg: 74,
        bodyFatPercent: 18,
        skeletalMuscleMassKg: 35,
        confidenceScore: 0.96,
        importSource: "ai_import",
        userConfirmed: true
      }),
      normalizeBodyCompositionScan({
        scanDate: "2026-06-03",
        machine: "InBody 770",
        weightKg: 72,
        bodyFatPercent: 15,
        skeletalMuscleMassKg: 33.5,
        confidenceScore: 0.96,
        importSource: "ai_import",
        userConfirmed: true
      })
    ]);

    expect(summary.comparison.confidence).toBe("insufficient");
    expect(summary.comparison.metrics.every((metric) => !metric.meaningful)).toBe(true);
    expect(summary.coachAlerts.some((alert) => ["muscle_loss", "rapid_weight_loss", "excellent_progress"].includes(alert.type))).toBe(false);
  });

  it("does not interpret AI-extracted scans with low extraction confidence", () => {
    const summary = buildBodyCompositionSummary([
      normalizeBodyCompositionScan({ scanDate: "2026-05-01", machine: "InBody 770", bodyFatPercent: 25, confidenceScore: 0.94, importSource: "ai_import", userConfirmed: true }),
      normalizeBodyCompositionScan({ scanDate: "2026-06-01", machine: "InBody 770", bodyFatPercent: 20, confidenceScore: 0.42, importSource: "ai_import", userConfirmed: true })
    ]);

    expect(summary.comparison.status).toBe("INSUFFICIENT");
    expect(summary.comparison.reason).toContain("low extraction confidence");
    expect(summary.dnaScore.change).toBeNull();
    expect(summary.coachAlerts.some((alert) => alert.severity === "positive")).toBe(false);
  });

  it("does not compare body-composition estimates from different machines", () => {
    const comparison = buildBodyCompositionComparison([
      normalizeBodyCompositionScan({
        scanDate: "2026-06-01",
        machine: "InBody 770",
        bodyFatPercent: 24,
        skeletalMuscleMassKg: 31,
        importSource: "manual_entry",
        userConfirmed: true
      }),
      normalizeBodyCompositionScan({
        scanDate: "2026-07-01",
        machine: "Tanita MC-780",
        bodyFatPercent: 19,
        skeletalMuscleMassKg: 34,
        importSource: "manual_entry",
        userConfirmed: true
      })
    ]);

    expect(comparison.sameMachine).toBe(false);
    expect(comparison.confidence).toBe("insufficient");
    expect(comparison.metrics.find((metric) => metric.metric === "Body Fat")?.signal).toBe("uncertain_change");
  });

  it("keeps missing readings unavailable instead of manufacturing zero-based changes", () => {
    const summary = buildBodyCompositionSummary([
      normalizeBodyCompositionScan({
        scanDate: "2026-06-01",
        machine: "InBody 770",
        weightKg: 75,
        importSource: "manual_entry",
        userConfirmed: true
      }),
      normalizeBodyCompositionScan({
        scanDate: "2026-07-01",
        machine: "InBody 770",
        weightKg: 74,
        bodyFatPercent: 20,
        skeletalMuscleMassKg: 32,
        importSource: "manual_entry",
        userConfirmed: true
      })
    ]);

    expect(summary.comparison.metrics.find((metric) => metric.metric === "Body Fat")?.signal).toBe("not_comparable");
    expect(summary.comparison.metrics.find((metric) => metric.metric === "Skeletal Muscle")?.signal).toBe("not_comparable");
    expect(summary.comparison.status).toBe("PROVISIONAL");
    expect(summary.comparison.reason).not.toContain("plausibility guardrail");
    expect(summary.derived.rateOfFatLossKgPerWeek).toBeNull();
    expect(summary.derived.rateOfMuscleGainKgPerMonth).toBeNull();
    expect(summary.coachAlerts.some((alert) => alert.type === "muscle_loss")).toBe(false);
  });

  it("marks two scans with no shared measurements as insufficient rather than provisional", () => {
    const comparison = buildBodyCompositionComparison([
      normalizeBodyCompositionScan({ scanDate: "2026-06-01", machine: "InBody 770", weightKg: 75, importSource: "manual_entry", userConfirmed: true }),
      normalizeBodyCompositionScan({ scanDate: "2026-07-01", machine: "InBody 770", bodyFatPercent: 20, importSource: "manual_entry", userConfirmed: true })
    ]);

    expect(comparison.status).toBe("INSUFFICIENT");
    expect(comparison.reason).toContain("do not share enough");
    expect(comparison.metrics.every((metric) => metric.evidenceStatus === "INSUFFICIENT")).toBe(true);
  });

  it("selects the latest two confirmed scans even when input history is unordered", () => {
    const comparison = buildBodyCompositionComparison([
      normalizeBodyCompositionScan({ scanDate: "2026-07-01", machine: "InBody 770", bodyFatPercent: 20, importSource: "manual_entry", userConfirmed: true }),
      normalizeBodyCompositionScan({ scanDate: "2026-05-01", machine: "InBody 770", bodyFatPercent: 25, importSource: "manual_entry", userConfirmed: true }),
      normalizeBodyCompositionScan({ scanDate: "2026-08-01", machine: "InBody 770", bodyFatPercent: 17, importSource: "manual_entry", userConfirmed: true }),
      normalizeBodyCompositionScan({ scanDate: "2026-09-01", machine: "InBody 770", bodyFatPercent: 10, importSource: "manual_entry", userConfirmed: false })
    ]);

    const bodyFat = comparison.metrics.find((metric) => metric.metric === "Body Fat");
    expect(comparison.daysBetweenScans).toBe(31);
    expect(bodyFat).toMatchObject({ previous: 20, current: 17, change: -3, signal: "lower", meaningful: true });
  });

  it("keeps unconfirmed extraction drafts out of every summary calculation", () => {
    const summary = buildBodyCompositionSummary([
      normalizeBodyCompositionScan({ scanDate: "2026-06-01", machine: "InBody 770", bodyFatPercent: 25, importSource: "manual_entry", userConfirmed: true }),
      normalizeBodyCompositionScan({ scanDate: "2026-07-01", machine: "InBody 770", bodyFatPercent: 12, importSource: "ai_import", confidenceScore: 0.99, userConfirmed: false })
    ]);

    expect(summary.scanCount).toBe(1);
    expect(summary.latestScan?.scanDate).toBe("2026-06-01");
    expect(summary.latestScan?.bodyFatPercent).toBe(25);
    expect(summary.comparison.status).toBe("INSUFFICIENT");
    expect(summary.dnaScore.change).toBeNull();
  });

  it("does not turn a provisional lower muscle reading into a muscle-loss alert", () => {
    const summary = buildBodyCompositionSummary([
      normalizeBodyCompositionScan({
        scanDate: "2026-06-01",
        machine: "InBody 770",
        skeletalMuscleMassKg: 35,
        bodyFatPercent: 20,
        importSource: "manual_entry",
        userConfirmed: true
      }),
      normalizeBodyCompositionScan({
        scanDate: "2026-07-01",
        machine: "InBody 770",
        skeletalMuscleMassKg: 33.8,
        bodyFatPercent: 19.5,
        importSource: "manual_entry",
        userConfirmed: true
      })
    ]);

    const muscle = summary.comparison.metrics.find((entry) => entry.metric === "Skeletal Muscle");
    expect(muscle).toMatchObject({ evidenceStatus: "PROVISIONAL", signal: "lower", meaningful: true });
    expect(muscle?.message).toContain("another consistent scan is needed");
    expect(summary.coachAlerts.some((entry) => entry.type === "muscle_loss")).toBe(false);
  });

  it("establishes a sustained trend only from three comparable, consistently spaced scans", () => {
    const summary = buildBodyCompositionSummary([
      normalizeBodyCompositionScan({ scanDate: "2026-05-01", machine: "InBody 770", weightKg: 84, bodyFatPercent: 28, skeletalMuscleMassKg: 31, visceralFat: 13, bodyWaterPercent: 50, importSource: "manual_entry", userConfirmed: true }),
      normalizeBodyCompositionScan({ scanDate: "2026-06-01", machine: "InBody 770", weightKg: 82, bodyFatPercent: 26, skeletalMuscleMassKg: 31.5, visceralFat: 12, bodyWaterPercent: 51, importSource: "manual_entry", userConfirmed: true }),
      normalizeBodyCompositionScan({ scanDate: "2026-07-01", machine: "InBody 770", weightKg: 80, bodyFatPercent: 24, skeletalMuscleMassKg: 32, visceralFat: 11, bodyWaterPercent: 52, importSource: "manual_entry", userConfirmed: true })
    ]);

    expect(summary.comparison.status).toBe("ESTABLISHED");
    expect(summary.comparison.metrics.find((entry) => entry.metric === "Body Fat")).toMatchObject({ evidenceStatus: "ESTABLISHED", signal: "lower" });
    expect(summary.comparison.metrics.find((entry) => entry.metric === "Skeletal Muscle")).toMatchObject({ evidenceStatus: "ESTABLISHED", signal: "higher" });
    expect(summary.coachAlerts.some((entry) => entry.type === "excellent_progress")).toBe(true);
    expect(summary.trends.find((trend) => trend.metric === "Body Fat")?.change).toBe(-2);
    expect(summary.dnaScore.change).not.toBeNull();
  });

  it("does not establish a trend when three comparable scans reverse direction", () => {
    const summary = buildBodyCompositionSummary([
      normalizeBodyCompositionScan({ scanDate: "2026-05-01", machine: "InBody 770", bodyFatPercent: 25, importSource: "manual_entry", userConfirmed: true }),
      normalizeBodyCompositionScan({ scanDate: "2026-06-01", machine: "InBody 770", bodyFatPercent: 21, importSource: "manual_entry", userConfirmed: true }),
      normalizeBodyCompositionScan({ scanDate: "2026-07-01", machine: "InBody 770", bodyFatPercent: 24, importSource: "manual_entry", userConfirmed: true })
    ]);

    expect(summary.comparison.status).toBe("PROVISIONAL");
    expect(summary.comparison.metrics.find((metric) => metric.metric === "Body Fat")?.evidenceStatus).toBe("PROVISIONAL");
    expect(summary.dnaScore.change).toBeNull();
    expect(summary.coachAlerts.some((alert) => alert.severity === "positive")).toBe(false);
  });

  it("can establish that three comparable readings show no clear trend", () => {
    const summary = buildBodyCompositionSummary([
      normalizeBodyCompositionScan({ scanDate: "2026-05-01", machine: "InBody 770", bodyFatPercent: 20, importSource: "manual_entry", userConfirmed: true }),
      normalizeBodyCompositionScan({ scanDate: "2026-06-01", machine: "InBody 770", bodyFatPercent: 20.4, importSource: "manual_entry", userConfirmed: true }),
      normalizeBodyCompositionScan({ scanDate: "2026-07-01", machine: "InBody 770", bodyFatPercent: 20.2, importSource: "manual_entry", userConfirmed: true })
    ]);

    expect(summary.comparison.status).toBe("ESTABLISHED");
    expect(summary.comparison.metrics.find((metric) => metric.metric === "Body Fat")).toMatchObject({
      evidenceStatus: "ESTABLISHED",
      signal: "no_clear_change",
      meaningful: false
    });
    expect(summary.coachAlerts.some((alert) => alert.severity === "positive")).toBe(false);
  });

  it("rejects invalid and future calendar dates before saving", () => {
    const invalid = validateBodyCompositionScan({ scanDate: "2026-02-30", weightKg: 75, importSource: "manual_entry" });
    const futureDate = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    const future = validateBodyCompositionScan({ scanDate: futureDate, weightKg: 75, importSource: "manual_entry" });

    expect(invalid.valid).toBe(false);
    expect(invalid.errors.join(" ")).toContain("real calendar date");
    expect(future.valid).toBe(false);
    expect(future.errors.join(" ")).toContain("future");
  });

  it("excludes drafts, invalid scans, and suspicious duplicates from canonical history", () => {
    const baseline = { id: "baseline", ...normalizeBodyCompositionScan({ scanDate: "2026-06-01", machine: "InBody 770", weightKg: 75, bodyFatPercent: 20, importSource: "manual_entry", userConfirmed: true }) };
    const duplicate = { ...baseline, id: "duplicate" };
    const draft = { id: "draft", ...normalizeBodyCompositionScan({ scanDate: "2026-07-01", machine: "InBody 770", weightKg: 70, bodyFatPercent: 15, importSource: "manual_entry", userConfirmed: false }) };
    const invalid = { id: "invalid", ...normalizeBodyCompositionScan({ scanDate: "2026-02-30", machine: "InBody 770", weightKg: 74, bodyFatPercent: 19, importSource: "manual_entry", userConfirmed: true }) };
    const trusted = getTrustedBodyCompositionHistory([draft, duplicate, invalid, baseline]);

    expect(trusted.confirmedHistory).toHaveLength(1);
    expect(trusted.latestConfirmedScan?.id).toBe("duplicate");
    expect(trusted.draftScans).toHaveLength(1);
    expect(trusted.excludedScans.flatMap((entry) => entry.reasons)).toEqual(expect.arrayContaining(["unconfirmed", "invalid_scan", "suspicious_duplicate"]));
  });

  it("withholds all progress outputs when an extreme jump fails the evidence guardrail", () => {
    const summary = buildBodyCompositionSummary([
      normalizeBodyCompositionScan({ scanDate: "2026-06-01", machine: "InBody 770", weightKg: 80, bodyFatPercent: 25, skeletalMuscleMassKg: 32, importSource: "manual_entry", userConfirmed: true }),
      normalizeBodyCompositionScan({ scanDate: "2026-07-01", machine: "InBody 770", weightKg: 66, bodyFatPercent: 14, skeletalMuscleMassKg: 39, importSource: "manual_entry", userConfirmed: true })
    ]);

    expect(summary.comparison.status).toBe("INSUFFICIENT");
    expect(summary.comparison.reason).toContain("plausibility guardrail");
    expect(summary.dnaScore.change).toBeNull();
    expect(summary.derived.bodyRecompositionIndex).toBeNull();
    expect(summary.derived.rateOfFatLossKgPerWeek).toBeNull();
    expect(summary.derived.rateOfMuscleGainKgPerMonth).toBeNull();
    expect(summary.derived.goalEtaWeeks).toBeNull();
    expect(summary.derived.weeklyProgressPercent).toBeNull();
    expect(summary.derived.monthlyProgressPercent).toBeNull();
    expect(summary.trends.every((trend) => trend.change === null && trend.bestEver === null)).toBe(true);
    expect(summary.insights).toEqual([]);
    expect(summary.coachAlerts.some((alert) => ["muscle_loss", "rapid_weight_loss", "excellent_progress"].includes(alert.type))).toBe(false);
  });

  it("does not call a gradual five-week weight change rapid loss", () => {
    const summary = buildBodyCompositionSummary([
      normalizeBodyCompositionScan({ scanDate: "2026-06-01", machine: "InBody 770", weightKg: 80, importSource: "manual_entry", userConfirmed: true }),
      normalizeBodyCompositionScan({ scanDate: "2026-07-06", machine: "InBody 770", weightKg: 78, importSource: "manual_entry", userConfirmed: true })
    ]);

    expect(summary.coachAlerts.some((alert) => alert.type === "rapid_weight_loss")).toBe(false);
  });

  it("keeps the AI prompt manufacturer-independent and conservative", () => {
    const prompt = buildBodyCompositionAiPrompt();

    expect(prompt).toContain("InBody");
    expect(prompt).toContain("Tanita");
    expect(prompt).toContain("Evolt");
    expect(prompt).toContain("Never guess numbers");
    expect(prompt).toContain("strict JSON");
    expect(prompt).toContain("Convert lb values to kg");
    expect(prompt).toContain("Never put a percent value into a Kg field");
    expect(prompt).toContain("confidenceScore must be a decimal from 0 to 1");
  });

  it("serializes JSONB scan fields before database insert", () => {
    const values = bodyCompositionScanToDbValues({
      scanDate: "2026-06-26",
      weightKg: 74.07,
      bodyFatPercent: 8.2,
      skeletalMuscleMassKg: 39.69,
      segmentalMuscle: { rightArmKg: 4.1 },
      segmentalFat: null,
      sourceImages: [{ key: "body-composition/test/scan.jpg" }],
      importSource: "ai_import",
      userConfirmed: true
    }, "390b6a4f-a2fc-43c8-afcf-44324ca12fb2", "390b6a4f-a2fc-43c8-afcf-44324ca12fb2");

    expect(values[18]).toBe(JSON.stringify({ rightArmKg: 4.1 }));
    expect(values[19]).toBe(JSON.stringify({}));
    expect(values[24]).toBe(JSON.stringify([{ key: "body-composition/test/scan.jpg" }]));
    expect(values[29]).toBe("athlete");

    const introductoryValues = bodyCompositionScanToDbValues({
      scanDate: "2026-06-26",
      weightKg: 74.07,
      importSource: "ai_import",
      userConfirmed: true
    }, "390b6a4f-a2fc-43c8-afcf-44324ca12fb2", "390b6a4f-a2fc-43c8-afcf-44324ca12fb2", "introductory");
    expect(introductoryValues[29]).toBe("introductory");
  });

  it("validates scan history pagination before it reaches PostgreSQL", () => {
    expect(bodyCompositionHistoryQuerySchema.parse({ limit: "25", offset: "10" })).toEqual({ limit: 25, offset: 10 });
    expect(() => bodyCompositionHistoryQuerySchema.parse({ limit: "not-a-number" })).toThrow();
    expect(() => bodyCompositionHistoryQuerySchema.parse({ limit: "101" })).toThrow();
  });
});

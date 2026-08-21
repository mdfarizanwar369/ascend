import { describe, expect, it } from "vitest";
import {
  buildBodyCompositionAiPrompt,
  buildBodyCompositionSummary,
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

  it("creates trends, alerts and experimental DNA score from scan history", () => {
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
    expect(summary.insights.join(" ")).toContain("Body Fat reading is 4 percentage points lower");
    expect(summary.coachAlerts.some((alert) => alert.type === "excellent_progress")).toBe(true);
    expect(summary.comparison.confidence).toBe("high");
    expect(summary.insights.join(" ")).toContain("reading is");
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

    expect(comparison.confidence).toBe("high");
    expect(comparison.metrics.filter((metric) => metric.meaningful)).toHaveLength(0);
    expect(comparison.metrics.find((metric) => metric.metric === "Body Fat")?.signal).toBe("no_clear_change");
    expect(comparison.headline).toBe("No clear body-composition change is established yet.");
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
    expect(summary.derived.rateOfFatLossKgPerWeek).toBeNull();
    expect(summary.derived.rateOfMuscleGainKgPerMonth).toBeNull();
    expect(summary.coachAlerts.some((alert) => alert.type === "muscle_loss")).toBe(false);
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

  it("flags a material lower muscle reading using cautious measurement language", () => {
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

    const alert = summary.coachAlerts.find((entry) => entry.type === "muscle_loss");
    expect(alert?.message).toContain("reading is 1.2 kg lower");
    expect(alert?.message).not.toContain("Muscle loss detected");
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

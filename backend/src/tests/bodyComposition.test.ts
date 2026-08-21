import { describe, expect, it } from "vitest";
import {
  buildBodyCompositionAiPrompt,
  buildBodyCompositionSummary,
  normalizeBodyCompositionScan,
  validateBodyCompositionScan
} from "../services/bodyCompositionService";
import { bodyCompositionHistoryQuerySchema, bodyCompositionScanToDbValues } from "../routes/bodyComposition";

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
        weightKg: 84,
        bodyFatPercent: 28,
        skeletalMuscleMassKg: 31,
        visceralFat: 13,
        importSource: "manual_entry"
      }),
      normalizeBodyCompositionScan({
        scanDate: "2026-06-01",
        weightKg: 81,
        bodyFatPercent: 24,
        skeletalMuscleMassKg: 32,
        visceralFat: 11,
        importSource: "manual_entry"
      })
    ], { goalType: "fat_loss", heightCm: 175, activityLevel: "moderate" });

    expect(summary.scanCount).toBe(2);
    expect(summary.dnaScore.current).toBeGreaterThan(0);
    expect(summary.insights.join(" ")).toContain("Body fat improved");
    expect(summary.coachAlerts.some((alert) => alert.type === "excellent_progress")).toBe(true);
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

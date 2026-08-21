import { describe, expect, it } from "vitest";
import { normalizeBodyCompositionScan } from "../services/bodyCompositionService";
import {
  bodyScanExplanationSchema,
  fallbackIntroductoryExplanation,
  introductoryBaseline,
  introductoryScanFacts,
  parseBodyScanExplanation,
  resolveOwnerBodyScanPreviewAccess
} from "../services/bodyScanPreviewService";

const scan = normalizeBodyCompositionScan({
  scanDate: "2026-08-20",
  machine: "Example scanner",
  weightKg: 74.2,
  bodyFatPercent: 21.4,
  skeletalMuscleMassKg: 33.1,
  visceralFat: 8,
  bodyWaterPercent: 55.2,
  bmrKcal: 1620,
  confidenceScore: 0.92,
  importSource: "ai_import",
  userConfirmed: true
});

describe("owner Body Scan preview", () => {
  it("is available only when both the flag and platform-owner identity are present", () => {
    expect(resolveOwnerBodyScanPreviewAccess({ featureEnabled: false, user: { isPlatformOwner: true } }).enabled).toBe(false);
    expect(resolveOwnerBodyScanPreviewAccess({ featureEnabled: true, user: { isPlatformOwner: false } }).enabled).toBe(false);
    expect(resolveOwnerBodyScanPreviewAccess({ featureEnabled: true, user: { isPlatformOwner: true } }).enabled).toBe(true);
  });

  it("does not expose comparison, DNA, or scan-driven nutrition access", () => {
    const access = resolveOwnerBodyScanPreviewAccess({ featureEnabled: true, user: { isPlatformOwner: true } });

    expect(access.canCompareScans).toBe(false);
    expect(access.canViewDna).toBe(false);
    expect(access.canUseScanForNutrition).toBe(false);
    expect(access.followUpLimit).toBe(2);
  });

  it("builds first-scan facts without trends or nutrition authority", () => {
    const facts = introductoryScanFacts(scan, { fullName: "Test Owner", goalType: "fat_loss" });

    expect(facts.context).toBe("first confirmed scan baseline");
    expect(facts.comparisonAllowed).toBe(false);
    expect(facts.nutritionRecalculationAllowed).toBe(false);
    expect(facts.confirmedReadings.bodyFatPercent).toBe(21.4);
    expect(facts).not.toHaveProperty("previousScan");
    expect(facts).not.toHaveProperty("dnaScore");
  });

  it("returns only introductory baseline fields to the universal client", () => {
    const baseline = introductoryBaseline({ ...scan, id: "994a6b08-0f12-4870-a938-bbc3ac0705a1" });

    expect(baseline?.bodyFatPercent).toBe(21.4);
    expect(baseline).not.toHaveProperty("dnaScore");
    expect(baseline).not.toHaveProperty("trends");
    expect(baseline).not.toHaveProperty("nutritionTargets");
  });

  it("produces a useful deterministic first explanation with two to three numbers and priorities", () => {
    const explanation = fallbackIntroductoryExplanation(scan, { fullName: "Test Owner", goalType: "fat_loss" });
    const words = Object.values(explanation)
      .flatMap((value) => Array.isArray(value) ? value.flatMap((item) => Object.values(item)) : [value])
      .join(" ")
      .trim()
      .split(/\s+/);

    expect(bodyScanExplanationSchema.safeParse(explanation).success).toBe(true);
    expect(words.length).toBeGreaterThanOrEqual(150);
    expect(words.length).toBeLessThanOrEqual(200);
    expect(explanation.importantNumbers.length).toBeGreaterThanOrEqual(2);
    expect(explanation.importantNumbers.length).toBeLessThanOrEqual(3);
    expect(explanation.priorities.length).toBeGreaterThanOrEqual(2);
    expect(explanation.priorities.length).toBeLessThanOrEqual(3);
    expect(explanation.measurementNote.toLowerCase()).toContain("hydration");
    expect(JSON.stringify(explanation).toLowerCase()).not.toContain("improved since");
  });

  it("rejects malformed coaching output instead of trusting arbitrary AI text", () => {
    const result = bodyScanExplanationSchema.safeParse({
      headline: "Looks good",
      summary: "A generic answer without the required evidence structure.",
      importantNumbers: [],
      priorities: []
    });

    expect(result.success).toBe(false);
  });

  it("falls back when generated coaching is outside the 150 to 200 word contract", () => {
    const fallback = fallbackIntroductoryExplanation(scan, { fullName: "Test Owner", goalType: "fat_loss" });
    const tooShort = JSON.stringify({
      headline: "Your baseline",
      summary: "A short answer.",
      importantNumbers: [
        { label: "Weight", value: "74.2 kg", meaning: "One confirmed reading." },
        { label: "Body fat", value: "21.4%", meaning: "One confirmed reading." }
      ],
      priorities: [
        { title: "Train", action: "Train consistently." },
        { title: "Recover", action: "Recover consistently." }
      ],
      measurementNote: "Readings vary.",
      nextScanGuidance: "Scan again later.",
      safetyNote: "This is not medical advice."
    });

    expect(parseBodyScanExplanation(tooShort, fallback)).toBe(fallback);
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { normalizeBodyCompositionScan } from "../services/bodyCompositionService";
import {
  bodyScanExplanationSchema,
  fallbackIntroductoryExplanation,
  introductoryBaseline,
  introductoryScanFacts,
  parseBodyScanExplanation,
  resolveBodyScanIntroductoryAccess
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

describe("introductory Body Scan", () => {
  it("supports a reversible public rollout while preserving the owner preview fallback", () => {
    const disabled = resolveBodyScanIntroductoryAccess({ publicEnabled: false, ownerPreviewEnabled: false, user: { isPlatformOwner: false }, hasBaseline: false });
    const ownerPreview = resolveBodyScanIntroductoryAccess({ publicEnabled: false, ownerPreviewEnabled: true, user: { isPlatformOwner: true }, hasBaseline: false });
    const publicMember = resolveBodyScanIntroductoryAccess({ publicEnabled: true, ownerPreviewEnabled: false, user: { isPlatformOwner: false }, hasBaseline: false });

    expect(disabled.enabled).toBe(false);
    expect(disabled.rollout).toBe("disabled");
    expect(ownerPreview.enabled).toBe(true);
    expect(ownerPreview.rollout).toBe("owner_preview");
    expect(publicMember.enabled).toBe(true);
    expect(publicMember.rollout).toBe("public");
  });

  it("does not expose comparison, DNA, or scan-driven nutrition access", () => {
    const access = resolveBodyScanIntroductoryAccess({ publicEnabled: true, ownerPreviewEnabled: false, user: { isPlatformOwner: false }, hasBaseline: false });

    expect(access.canCompareScans).toBe(false);
    expect(access.canViewDna).toBe(false);
    expect(access.canUseScanForNutrition).toBe(false);
    expect(access.followUpLimit).toBe(2);
  });

  it("allows one lifetime introductory scan and becomes read-only afterward", () => {
    const before = resolveBodyScanIntroductoryAccess({ publicEnabled: true, ownerPreviewEnabled: false, user: { isPlatformOwner: false }, hasBaseline: false });
    const after = resolveBodyScanIntroductoryAccess({ publicEnabled: true, ownerPreviewEnabled: false, user: { isPlatformOwner: false }, hasBaseline: true });

    expect(before.canCapture).toBe(true);
    expect(before.capturesRemaining).toBe(1);
    expect(after.canCapture).toBe(false);
    expect(after.canViewBaseline).toBe(true);
    expect(after.capturesUsed).toBe(1);
    expect(after.capturesRemaining).toBe(0);
  });

  it("backs the lifetime limit with a partial unique database index", () => {
    const migration = readFileSync(resolve(process.cwd(), "migrations/032_body_scan_introductory_lifetime_limit.sql"), "utf8");

    expect(migration).toContain("create unique index");
    expect(migration).toContain("experience_scope = 'introductory'");
    expect(migration).toContain("user_confirmed = true");
  });

  it("builds first-scan facts without trends or nutrition authority", () => {
    const facts = introductoryScanFacts(scan, { fullName: "Test Owner", goalType: "fat_loss" });

    expect(facts.context).toBe("first confirmed scan baseline");
    expect(facts.comparisonAllowed).toBe(false);
    expect(facts.nutritionRecalculationAllowed).toBe(false);
    expect(facts.recommendedRescanWindowWeeks).toEqual({ minimum: 4, maximum: 6 });
    expect(facts.confirmedReadings.bodyFatPercent).toBe(21.4);
    expect(facts).not.toHaveProperty("previousScan");
    expect(facts).not.toHaveProperty("dnaScore");
  });

  it("does not present derived or missing readings to Coach Zoe as confirmed measurements", () => {
    const partialScan = normalizeBodyCompositionScan({
      scanDate: "2026-08-20",
      weightKg: 61.3,
      bmi: 22.5,
      bodyFatPercent: 27.4,
      skeletalMuscleMassKg: 23.9,
      missingFields: ["fatMassKg", "leanBodyMassKg", "estimatedLeanBodyMassKg", "visceralFat", "bodyWaterPercent", "bmrKcal"],
      confidenceScore: 0.95,
      importSource: "ai_import",
      userConfirmed: true
    });
    const facts = introductoryScanFacts(partialScan, { fullName: "Test Owner", goalType: "fat_loss" });

    expect(partialScan.fatMassKg).toBe(16.8);
    expect(facts.confirmedReadings.fatMassKg).toBeNull();
    expect(facts.confirmedReadings.leanBodyMassKg).toBeNull();
    expect(facts.confirmedReadings.visceralFat).toBeNull();
    expect(facts.confirmedReadings.weightKg).toBe(61.3);
    expect(facts.confirmedReadings.bodyFatPercent).toBe(27.4);
    expect(facts.confirmedReadings.skeletalMuscleMassKg).toBe(23.9);
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

  it("rejects an otherwise valid explanation that introduces an unsupported number", () => {
    const fallback = fallbackIntroductoryExplanation(scan, { fullName: "Test Owner", goalType: "fat_loss" });
    const inventedInterval = JSON.stringify({
      ...fallback,
      nextScanGuidance: "Repeat this scan in 12 weeks under similar conditions."
    });

    expect(parseBodyScanExplanation(inventedInterval, fallback, [74.2, 21.4, 33.1, 8, 55.2, 1620, 4, 6])).toBe(fallback);
  });
});

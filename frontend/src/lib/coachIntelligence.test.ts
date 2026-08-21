import { describe, expect, it } from "vitest";
import { buildAthleteCoachInsights } from "./coachIntelligence";
import type { BodyCompositionSummary } from "./ascendApi";

function summaryWithComparison(overrides: Partial<BodyCompositionSummary["comparison"]>): BodyCompositionSummary {
  return {
    latestScan: { scanDate: "2026-07-01", machine: "InBody 770", skeletalMuscleMassKg: 33.8, bodyFatPercent: 19, importSource: "manual_entry" },
    previousScan: { scanDate: "2026-06-01", machine: "InBody 770", skeletalMuscleMassKg: 35, bodyFatPercent: 20, importSource: "manual_entry" },
    scanCount: 2,
    derived: { fatFreeMassKg: null, estimatedLeanBodyMassKg: null, ffmi: null, estimatedDailyEnergyNeedsKcal: null, bodyRecompositionIndex: null, rateOfFatLossKgPerWeek: null, rateOfMuscleGainKgPerMonth: null, goalEtaWeeks: null, weeklyProgressPercent: null, monthlyProgressPercent: null },
    dnaScore: { current: 70, previous: 68, change: 2, label: "Experimental" },
    trends: [],
    coachAlerts: [],
    insights: [],
    nutritionDataSource: "Profile + Body Scan History",
    comparison: {
      available: true,
      daysBetweenScans: 30,
      sameMachine: true,
      status: "PROVISIONAL",
      confidence: "possible",
      reason: "Same recorded scanner model and useful interval.",
      headline: "One reading changed.",
      measurementNote: "Compare under similar conditions.",
      metrics: [],
      ...overrides
    }
  };
}

describe("Athlete Coach Intelligence body scan comparisons", () => {
  it("does not create a muscle-loss alert from an uncertain comparison", () => {
    const summary = summaryWithComparison({
      status: "INSUFFICIENT",
      confidence: "insufficient",
      metrics: [{ metric: "Skeletal Muscle", current: 33.8, previous: 35, change: -1.2, unit: "kg", threshold: 0.8, signal: "uncertain_change", evidenceStatus: "INSUFFICIENT", confidence: "insufficient", meaningful: false, message: "Needs another scan." }]
    });

    expect(buildAthleteCoachInsights({ summary, scans: [summary.latestScan!, summary.previousScan!] }).some((insight) => insight.title.includes("muscle"))).toBe(false);
  });

  it("keeps a provisional lower muscle reading cautious and non-urgent", () => {
    const summary = summaryWithComparison({
      metrics: [{ metric: "Skeletal Muscle", current: 33.8, previous: 35, change: -1.2, unit: "kg", threshold: 0.8, signal: "lower", evidenceStatus: "PROVISIONAL", confidence: "possible", meaningful: true, message: "Skeletal Muscle reads 1.2 kg lower than the previous scan, although another comparable scan is needed." }]
    });

    const insights = buildAthleteCoachInsights({ summary, scans: [summary.latestScan!, summary.previousScan!] });
    const insight = insights.find((item) => item.title === "Muscle reading needs confirmation");
    expect(insight).toBeDefined();
    expect(insight?.tone).toBe("yellow");
    expect(insight?.explanation).toContain("reads");
    expect(insight?.action).toContain("one more scan");
    expect(insights.some((item) => item.tone === "red" && item.title.toLowerCase().includes("muscle"))).toBe(false);
  });

  it("creates a high-priority alert only for an established lower muscle trend", () => {
    const summary = summaryWithComparison({
      status: "ESTABLISHED",
      confidence: "high",
      metrics: [{ metric: "Skeletal Muscle", current: 33.8, previous: 35, change: -1.2, unit: "kg", threshold: 0.8, signal: "lower", evidenceStatus: "ESTABLISHED", confidence: "high", meaningful: true, message: "The last three comparable skeletal muscle readings support a sustained decrease." }]
    });

    const insight = buildAthleteCoachInsights({ summary, scans: [summary.latestScan!, summary.previousScan!] })
      .find((item) => item.title === "Lower muscle trend");
    expect(insight).toMatchObject({ tone: "red", priority: 100 });
  });

  it("does not preserve a decline alert after the provisional movement reverses", () => {
    const summary = summaryWithComparison({
      status: "PROVISIONAL",
      confidence: "possible",
      metrics: [{ metric: "Skeletal Muscle", current: 34.6, previous: 33.8, change: 0.8, unit: "kg", threshold: 0.8, signal: "uncertain_change", evidenceStatus: "PROVISIONAL", confidence: "possible", meaningful: false, message: "The readings changed direction, so no trend is established." }]
    });

    const insights = buildAthleteCoachInsights({ summary, scans: [summary.latestScan!, summary.previousScan!] });
    expect(insights.some((item) => item.title.toLowerCase().includes("muscle"))).toBe(false);
  });

  it("uses only established shared evidence when evaluating a body-fat plateau", () => {
    const summary = summaryWithComparison({
      status: "ESTABLISHED",
      confidence: "high",
      metrics: [{ metric: "Body Fat", current: 19.5, previous: 19.8, change: -0.3, unit: "percentage points", threshold: 2, signal: "no_clear_change", evidenceStatus: "ESTABLISHED", confidence: "high", meaningful: false, message: "Body fat remained within the caution range across three scans." }]
    });
    const scans = [
      { scanDate: "2026-04-01", machine: "InBody 770", bodyFatPercent: 20, userConfirmed: true, importSource: "manual_entry" as const },
      { scanDate: "2026-07-01", machine: "InBody 770", bodyFatPercent: 19.5, userConfirmed: true, importSource: "manual_entry" as const },
      { scanDate: "2026-05-15", machine: "InBody 770", bodyFatPercent: 19.8, userConfirmed: true, importSource: "manual_entry" as const },
      { scanDate: "2026-08-01", machine: "InBody 770", bodyFatPercent: 12, userConfirmed: false, importSource: "manual_entry" as const }
    ];

    expect(buildAthleteCoachInsights({ summary, scans }).some((insight) => insight.title === "Body fat trend is steady")).toBe(true);
  });
});

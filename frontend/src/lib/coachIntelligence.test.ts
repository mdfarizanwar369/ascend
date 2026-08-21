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
      confidence: "high",
      reason: "Same machine and useful interval.",
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
      confidence: "insufficient",
      metrics: [{ metric: "Skeletal Muscle", current: 33.8, previous: 35, change: -1.2, unit: "kg", threshold: 0.8, signal: "uncertain_change", confidence: "insufficient", meaningful: false, message: "Needs another scan." }]
    });

    expect(buildAthleteCoachInsights({ summary, scans: [summary.latestScan!, summary.previousScan!] }).some((insight) => insight.title.includes("muscle"))).toBe(false);
  });

  it("uses cautious language when a lower muscle reading is meaningful", () => {
    const summary = summaryWithComparison({
      metrics: [{ metric: "Skeletal Muscle", current: 33.8, previous: 35, change: -1.2, unit: "kg", threshold: 0.8, signal: "lower", confidence: "high", meaningful: true, message: "Skeletal Muscle reading is 1.2 kg lower than the previous scan." }]
    });

    const insight = buildAthleteCoachInsights({ summary, scans: [summary.latestScan!, summary.previousScan!] })[0];
    expect(insight.title).toBe("Lower muscle reading");
    expect(insight.explanation).toContain("reading");
    expect(insight.explanation).not.toContain("loss detected");
  });

  it("sorts confirmed scans before evaluating a body-fat plateau", () => {
    const summary = summaryWithComparison({ metrics: [] });
    const scans = [
      { scanDate: "2026-04-01", machine: "InBody 770", bodyFatPercent: 20, userConfirmed: true, importSource: "manual_entry" as const },
      { scanDate: "2026-07-01", machine: "InBody 770", bodyFatPercent: 19.5, userConfirmed: true, importSource: "manual_entry" as const },
      { scanDate: "2026-05-15", machine: "InBody 770", bodyFatPercent: 19.8, userConfirmed: true, importSource: "manual_entry" as const },
      { scanDate: "2026-08-01", machine: "InBody 770", bodyFatPercent: 12, userConfirmed: false, importSource: "manual_entry" as const }
    ];

    expect(buildAthleteCoachInsights({ summary, scans }).some((insight) => insight.title === "Body fat trend is steady")).toBe(true);
  });
});

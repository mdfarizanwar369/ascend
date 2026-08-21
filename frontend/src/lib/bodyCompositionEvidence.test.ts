import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { BodyCompositionScan, BodyCompositionSummary } from "@/lib/ascendApi";
import { bodyCompositionJourneyDetail, establishedProgressSeries } from "./bodyCompositionEvidence";

type ComparisonMetric = BodyCompositionSummary["comparison"]["metrics"][number];

function metric(overrides: Partial<ComparisonMetric> & Pick<ComparisonMetric, "metric">): ComparisonMetric {
  return {
    current: 24,
    previous: 21,
    change: 3,
    unit: "percentage points",
    threshold: 2,
    signal: "higher",
    evidenceStatus: "PROVISIONAL",
    confidence: "possible",
    meaningful: true,
    message: "Another comparable scan is needed.",
    ...overrides
  };
}

function summary(metrics: ComparisonMetric[]): BodyCompositionSummary {
  return {
    latestScan: null,
    previousScan: null,
    scanCount: 3,
    derived: { fatFreeMassKg: null, estimatedLeanBodyMassKg: null, ffmi: null, estimatedDailyEnergyNeedsKcal: null, bodyRecompositionIndex: null, rateOfFatLossKgPerWeek: null, rateOfMuscleGainKgPerMonth: null, goalEtaWeeks: null, weeklyProgressPercent: null, monthlyProgressPercent: null },
    dnaScore: { current: 70, previous: 68, change: null, label: "Experimental" },
    trends: [],
    coachAlerts: [],
    insights: [],
    comparison: { available: true, daysBetweenScans: 30, sameMachine: true, status: "ESTABLISHED", confidence: "high", reason: "One metric is established.", headline: "A metric trend is established.", measurementNote: "Compare similar conditions.", metrics },
    nutritionDataSource: "Profile + Body Scan History"
  };
}

const scans: BodyCompositionScan[] = [
  { scanDate: "2026-05-01", machine: "InBody 770", bodyFatPercent: 26, bmrKcal: 1700, importSource: "manual_entry", userConfirmed: true },
  { scanDate: "2026-06-01", machine: "InBody 770", bodyFatPercent: 21, bmrKcal: 1705, importSource: "manual_entry", userConfirmed: true },
  { scanDate: "2026-07-01", machine: "InBody 770", bodyFatPercent: 24, bmrKcal: 1702, importSource: "manual_entry", userConfirmed: true }
];

describe("metric-specific Body Scan presentation", () => {
  it("does not graph provisional body fat when another metric establishes the global state", () => {
    const result = establishedProgressSeries(summary([
      metric({ metric: "Body Fat" }),
      metric({ metric: "BMR", current: 1702, previous: 1705, change: -3, unit: "kcal", threshold: 50, signal: "no_clear_change", evidenceStatus: "ESTABLISHED", confidence: "high", meaningful: false })
    ]), scans);

    expect(result).toBeNull();
  });

  it("graphs only a metric with its own established evidence", () => {
    const result = establishedProgressSeries(summary([
      metric({ metric: "Body Fat", signal: "lower", evidenceStatus: "ESTABLISHED", confidence: "high" })
    ]), scans);

    expect(result).toEqual({ metric: "Body Fat", label: "Body fat", values: [26, 21, 24] });
  });

  it("limits an established graph to the three readings that support the active evidence window", () => {
    const result = establishedProgressSeries(summary([
      metric({ metric: "Body Fat", signal: "lower", evidenceStatus: "ESTABLISHED", confidence: "high" })
    ]), [
      { scanDate: "2026-01-01", machine: "InBody 770", bodyFatPercent: 5, importSource: "manual_entry", userConfirmed: true },
      ...scans
    ]);

    expect(result?.values).toEqual([26, 21, 24]);
    expect(result?.values).not.toContain(5);
  });

  it("keeps Journey wording specific when only one metric is established", () => {
    const detail = bodyCompositionJourneyDetail(summary([
      metric({ metric: "Body Fat" }),
      metric({ metric: "Skeletal Muscle", current: 33, previous: 32, change: 1, unit: "kg", threshold: 0.8, signal: "higher", evidenceStatus: "ESTABLISHED", confidence: "high" })
    ]));

    expect(detail).toBe("Your comparable scans support a sustained increase in skeletal muscle.");
    expect(detail).not.toContain("body-composition trend");
  });

  it("makes no Journey trend claim when every metric is insufficient or provisional", () => {
    const detail = bodyCompositionJourneyDetail(summary([
      metric({ metric: "Body Fat", evidenceStatus: "INSUFFICIENT", confidence: "insufficient", signal: "uncertain_change", meaningful: false }),
      metric({ metric: "Skeletal Muscle", signal: "no_clear_change", meaningful: false })
    ]));

    expect(detail).toBe("You are building a body-composition record for future comparison.");
  });

  it("never claims a known physical scanner device when only its model is recorded", () => {
    const files = [
      "src/components/athlete/BodyCompositionClient.tsx",
      "src/lib/coachIntelligence.ts",
      "../docs/BODY_SCAN_COMPARISON_RELEASE_GATE.md"
    ];
    const copy = files.map((file) => readFileSync(resolve(process.cwd(), file), "utf8")).join("\n");

    expect(copy).not.toMatch(/same[- ]machine|different[- ]machine|same recorded device|different recorded machines|scanner or device|device not entered/i);
    expect(copy).toContain("same recorded scanner model");
  });
});

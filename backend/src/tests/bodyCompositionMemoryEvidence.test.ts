import { describe, expect, it } from "vitest";
import { buildBodyCompositionMemoryMilestone } from "../services/ascendMemoryService";
import { buildBodyCompositionSummary, normalizeBodyCompositionScan } from "../services/bodyCompositionService";

describe("Body Scan memory evidence contract", () => {
  it("does not create a trend milestone from provisional evidence", () => {
    const summary = buildBodyCompositionSummary([
      normalizeBodyCompositionScan({ scanDate: "2026-06-01", machine: "InBody 770", bodyFatPercent: 26, skeletalMuscleMassKg: 31, importSource: "manual_entry", userConfirmed: true }),
      normalizeBodyCompositionScan({ scanDate: "2026-07-01", machine: "InBody 770", bodyFatPercent: 22, skeletalMuscleMassKg: 32, importSource: "manual_entry", userConfirmed: true })
    ]);

    expect(summary.comparison.status).toBe("PROVISIONAL");
    expect(buildBodyCompositionMemoryMilestone(summary)).toBeNull();
  });

  it("names only the metric whose evidence is established", () => {
    const summary = buildBodyCompositionSummary([
      normalizeBodyCompositionScan({ scanDate: "2026-05-01", machine: "InBody 770", bodyFatPercent: 26, skeletalMuscleMassKg: 31, importSource: "manual_entry", userConfirmed: true }),
      normalizeBodyCompositionScan({ scanDate: "2026-06-01", machine: "InBody 770", bodyFatPercent: 21, skeletalMuscleMassKg: 32, importSource: "manual_entry", userConfirmed: true }),
      normalizeBodyCompositionScan({ scanDate: "2026-07-01", machine: "InBody 770", bodyFatPercent: 24, skeletalMuscleMassKg: 33, importSource: "manual_entry", userConfirmed: true })
    ]);

    expect(summary.comparison.status).toBe("ESTABLISHED");
    expect(summary.comparison.metrics.find((metric) => metric.metric === "Body Fat")?.evidenceStatus).toBe("PROVISIONAL");
    expect(buildBodyCompositionMemoryMilestone(summary)).toMatchObject({
      title: "Muscle Trend Established",
      metadata: { establishedMetrics: ["Skeletal Muscle"] }
    });
    expect(buildBodyCompositionMemoryMilestone(summary)?.subtitle).not.toContain("body composition");
  });
});

import type { BodyCompositionScan, BodyCompositionSummary } from "@/lib/ascendApi";

type ComparisonMetric = BodyCompositionSummary["comparison"]["metrics"][number];

const trendCandidates = [
  { metric: "Body Fat", label: "Body fat", read: (scan: BodyCompositionScan) => scan.bodyFatPercent },
  { metric: "Weight", label: "Weight", read: (scan: BodyCompositionScan) => scan.weightKg },
  { metric: "Skeletal Muscle", label: "Skeletal muscle", read: (scan: BodyCompositionScan) => scan.skeletalMuscleMassKg ?? scan.muscleMassKg }
] as const;

function metricEvidence(summary: BodyCompositionSummary | null, metric: string) {
  return summary?.comparison.metrics.find((entry) => entry.metric === metric) ?? null;
}

export function establishedProgressSeries(summary: BodyCompositionSummary | null, scans: BodyCompositionScan[]) {
  for (const candidate of trendCandidates) {
    if (metricEvidence(summary, candidate.metric)?.evidenceStatus !== "ESTABLISHED") continue;
    const values = [...scans]
      .filter((scan) => scan.userConfirmed !== false)
      .sort((left, right) => new Date(left.scanDate).getTime() - new Date(right.scanDate).getTime())
      .slice(-3)
      .map((scan) => Number(candidate.read(scan)))
      .filter((value) => Number.isFinite(value));
    if (values.length >= 3) return { metric: candidate.metric, label: candidate.label, values };
  }
  return null;
}

function evidencePhrase(metric: ComparisonMetric) {
  const label = metric.metric === "BMR" ? "BMR" : metric.metric.toLowerCase();
  if (metric.signal === "higher") return `a sustained increase in ${label}`;
  if (metric.signal === "lower") return `a sustained decrease in ${label}`;
  if (metric.signal === "no_clear_change") return `no clear change in ${label}`;
  return null;
}

export function bodyCompositionJourneyDetail(summary: BodyCompositionSummary) {
  const supported = summary.comparison.metrics
    .filter((metric) => metric.evidenceStatus === "ESTABLISHED")
    .map(evidencePhrase)
    .filter((phrase): phrase is string => Boolean(phrase));

  if (!supported.length) return "You are building a body-composition record for future comparison.";
  if (supported.length === 1) return `Your comparable scans support ${supported[0]}.`;
  return `Your comparable scans support ${supported.slice(0, -1).join(", ")} and ${supported.at(-1)}.`;
}

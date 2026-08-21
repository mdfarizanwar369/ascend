import type { BodyCompositionScan } from "./bodyCompositionService";

export type BodyCompositionComparisonConfidence = "high" | "possible" | "insufficient";
export type BodyCompositionComparisonSignal = "higher" | "lower" | "no_clear_change" | "uncertain_change" | "not_comparable";

export type BodyCompositionMetricComparison = {
  metric: string;
  current: number | null;
  previous: number | null;
  change: number | null;
  unit: string;
  threshold: number;
  signal: BodyCompositionComparisonSignal;
  confidence: BodyCompositionComparisonConfidence;
  meaningful: boolean;
  message: string;
};

export type BodyCompositionComparison = {
  available: boolean;
  daysBetweenScans: number | null;
  sameMachine: boolean | null;
  confidence: BodyCompositionComparisonConfidence;
  reason: string;
  headline: string;
  measurementNote: string;
  metrics: BodyCompositionMetricComparison[];
};

type ComparableMetric = {
  label: string;
  key: keyof BodyCompositionScan;
  fallbackKey?: keyof BodyCompositionScan;
  unit: string;
  threshold: number;
};

// Conservative caution ranges for consumer BIA comparisons. They prevent small
// day-to-day reading changes from being presented as confirmed tissue change.
const comparableMetrics: ComparableMetric[] = [
  { label: "Weight", key: "weightKg", unit: "kg", threshold: 0.8 },
  { label: "Body Fat", key: "bodyFatPercent", unit: "percentage points", threshold: 2 },
  { label: "Skeletal Muscle", key: "skeletalMuscleMassKg", fallbackKey: "muscleMassKg", unit: "kg", threshold: 0.8 },
  { label: "Fat Mass", key: "fatMassKg", unit: "kg", threshold: 1 },
  { label: "Lean Mass", key: "leanBodyMassKg", fallbackKey: "estimatedLeanBodyMassKg", unit: "kg", threshold: 1 },
  { label: "Visceral Fat", key: "visceralFat", unit: "levels", threshold: 2 },
  { label: "Body Water", key: "bodyWaterPercent", unit: "percentage points", threshold: 2 },
  { label: "BMR", key: "bmrKcal", unit: "kcal", threshold: 50 },
  { label: "Metabolic Age", key: "metabolicAge", unit: "years", threshold: 2 }
];

function numeric(value: unknown) {
  const parsed = Number(value);
  return value === null || value === undefined || value === "" || !Number.isFinite(parsed) ? null : parsed;
}

function metricValue(scan: BodyCompositionScan, metric: ComparableMetric) {
  return numeric(scan[metric.key]) ?? (metric.fallbackKey ? numeric(scan[metric.fallbackKey]) : null);
}

function dateMs(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00Z`).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function rounded(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function normalizeBodyCompositionMachine(value?: string | null) {
  return value?.toLowerCase().replace(/[^a-z0-9]/g, "") || null;
}

function sameMachineFor(current: BodyCompositionScan, previous: BodyCompositionScan) {
  const currentMachine = normalizeBodyCompositionMachine(current.machine);
  const previousMachine = normalizeBodyCompositionMachine(previous.machine);
  if (!currentMachine || !previousMachine) return null;
  return currentMachine === previousMachine;
}

function comparisonConfidence(current: BodyCompositionScan, previous: BodyCompositionScan, daysBetween: number, sameMachine: boolean | null) {
  const lowestExtractionConfidence = Math.min(
    numeric(current.confidenceScore) ?? 1,
    numeric(previous.confidenceScore) ?? 1
  );

  if (daysBetween <= 6) {
    return { confidence: "insufficient" as const, reason: "The scans are too close together to separate progress from ordinary measurement variation." };
  }
  if (sameMachine === false) {
    return { confidence: "insufficient" as const, reason: "The scans came from different machines, so their body-composition estimates should not be treated as directly equivalent." };
  }
  if (lowestExtractionConfidence < 0.65) {
    return { confidence: "insufficient" as const, reason: "At least one scan has low extraction confidence and should be checked before comparing." };
  }
  if (daysBetween >= 21 && sameMachine === true && lowestExtractionConfidence >= 0.75) {
    return { confidence: "high" as const, reason: "The scans are separated by at least three weeks and use the same recorded machine." };
  }
  return {
    confidence: "possible" as const,
    reason: sameMachine === null
      ? "The interval is useful, but the scan machine is not confirmed on both records."
      : "The readings can be compared cautiously, but another consistently timed scan would strengthen the trend."
  };
}

function changePhrase(change: number, unit: string) {
  if (Math.abs(change) < 0.005) return "unchanged";
  const amount = Math.abs(change).toLocaleString(undefined, { maximumFractionDigits: 1 });
  return `${amount} ${unit} ${change > 0 ? "higher" : "lower"}`;
}

function compareMetric(
  metric: ComparableMetric,
  currentScan: BodyCompositionScan,
  previousScan: BodyCompositionScan,
  confidence: BodyCompositionComparisonConfidence,
  reason: string
): BodyCompositionMetricComparison {
  const current = metricValue(currentScan, metric);
  const previous = metricValue(previousScan, metric);
  if (current === null || previous === null) {
    return {
      metric: metric.label,
      current,
      previous,
      change: null,
      unit: metric.unit,
      threshold: metric.threshold,
      signal: "not_comparable",
      confidence: "insufficient",
      meaningful: false,
      message: `${metric.label} cannot be compared because one of the scans does not contain that reading.`
    };
  }

  const change = rounded(current - previous);
  if (Math.abs(change) < metric.threshold) {
    return {
      metric: metric.label,
      current,
      previous,
      change,
      unit: metric.unit,
      threshold: metric.threshold,
      signal: "no_clear_change",
      confidence,
      meaningful: false,
      message: `${metric.label} has no clear change yet; the ${changePhrase(change, metric.unit)} reading is within Ascend's comparison caution range.`
    };
  }

  if (confidence === "insufficient") {
    return {
      metric: metric.label,
      current,
      previous,
      change,
      unit: metric.unit,
      threshold: metric.threshold,
      signal: "uncertain_change",
      confidence,
      meaningful: false,
      message: `${metric.label} reads ${changePhrase(change, metric.unit)}, but Ascend cannot interpret that as a reliable body-composition change yet. ${reason}`
    };
  }

  return {
    metric: metric.label,
    current,
    previous,
    change,
    unit: metric.unit,
    threshold: metric.threshold,
    signal: change > 0 ? "higher" : "lower",
    confidence,
    meaningful: true,
    message: `${metric.label} reading is ${changePhrase(change, metric.unit)} than the previous scan.`
  };
}

export function buildBodyCompositionComparison(scans: BodyCompositionScan[]): BodyCompositionComparison {
  const confirmed = scans
    .filter((scan) => scan.userConfirmed !== false)
    .map((scan) => ({ scan, date: dateMs(scan.scanDate) }))
    .filter((entry): entry is { scan: BodyCompositionScan; date: number } => entry.date !== null)
    .sort((left, right) => right.date - left.date);
  const current = confirmed[0]?.scan ?? null;
  const previous = confirmed[1]?.scan ?? null;

  if (!current || !previous) {
    return {
      available: false,
      daysBetweenScans: null,
      sameMachine: null,
      confidence: "insufficient",
      reason: "A second confirmed scan is required.",
      headline: "Your first scan is now the baseline for a future comparison.",
      measurementNote: "Repeat the scan in roughly four weeks under similar conditions for a clearer comparison.",
      metrics: []
    };
  }

  const currentDate = dateMs(current.scanDate)!;
  const previousDate = dateMs(previous.scanDate)!;
  const daysBetweenScans = Math.max(0, Math.round((currentDate - previousDate) / 86_400_000));
  const sameMachine = sameMachineFor(current, previous);
  const assessment = comparisonConfidence(current, previous, daysBetweenScans, sameMachine);
  const metrics = comparableMetrics.map((metric) => compareMetric(metric, current, previous, assessment.confidence, assessment.reason));
  const meaningful = metrics.filter((metric) => metric.meaningful);
  const unclear = metrics.filter((metric) => metric.signal === "no_clear_change");

  const headline = assessment.confidence === "insufficient"
    ? "The readings changed, but this comparison is not reliable enough to call progress or decline."
    : meaningful.length
      ? `${meaningful.length} reading${meaningful.length === 1 ? "" : "s"} changed beyond Ascend's comparison caution range.`
      : unclear.length
        ? "No clear body-composition change is established yet."
        : "There is not enough matching scan data for a useful comparison yet.";

  return {
    available: true,
    daysBetweenScans,
    sameMachine,
    confidence: assessment.confidence,
    reason: assessment.reason,
    headline,
    measurementNote: "Body-composition machines estimate tissue from impedance. Hydration, food, recent training, and time of day can move the readings, so compare under similar conditions.",
    metrics
  };
}

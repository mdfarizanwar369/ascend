import type { BodyCompositionScan } from "./bodyCompositionService";

export type BodyCompositionEvidenceStatus = "INSUFFICIENT" | "PROVISIONAL" | "ESTABLISHED";
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
  evidenceStatus: BodyCompositionEvidenceStatus;
  confidence: BodyCompositionComparisonConfidence;
  meaningful: boolean;
  message: string;
};

export type BodyCompositionComparison = {
  available: boolean;
  daysBetweenScans: number | null;
  sameMachine: boolean | null;
  status: BodyCompositionEvidenceStatus;
  confidence: BodyCompositionComparisonConfidence;
  reason: string;
  headline: string;
  measurementNote: string;
  metrics: BodyCompositionMetricComparison[];
};

type ComparableMetric = {
  label: string;
  key: keyof BodyCompositionScan;
  unit: string;
  threshold: number;
};

// Conservative caution ranges for consumer BIA comparisons. They prevent small
// day-to-day reading changes from being presented as confirmed tissue change.
const comparableMetrics: ComparableMetric[] = [
  { label: "Weight", key: "weightKg", unit: "kg", threshold: 0.8 },
  { label: "Body Fat", key: "bodyFatPercent", unit: "percentage points", threshold: 2 },
  { label: "Skeletal Muscle", key: "skeletalMuscleMassKg", unit: "kg", threshold: 0.8 },
  { label: "Muscle Mass", key: "muscleMassKg", unit: "kg", threshold: 0.8 },
  { label: "Fat Mass", key: "fatMassKg", unit: "kg", threshold: 1 },
  { label: "Lean Mass", key: "leanBodyMassKg", unit: "kg", threshold: 1 },
  { label: "Estimated Lean Mass", key: "estimatedLeanBodyMassKg", unit: "kg", threshold: 1 },
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
  return numeric(scan[metric.key]);
}

export function bodyCompositionDateMs(value?: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = Date.UTC(year, month - 1, day);
  const date = new Date(parsed);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return parsed;
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

function extractionConfidence(scan: BodyCompositionScan) {
  if (scan.importSource === "manual_entry") return 1;
  return numeric(scan.confidenceScore) ?? 0;
}

export function isExtremeBodyCompositionChange(current: BodyCompositionScan, previous: BodyCompositionScan) {
  const currentDate = bodyCompositionDateMs(current.scanDate);
  const previousDate = bodyCompositionDateMs(previous.scanDate);
  if (currentDate === null || previousDate === null || Math.abs(currentDate - previousDate) > 45 * 86_400_000) return false;
  const currentWeight = numeric(current.weightKg);
  const previousWeight = numeric(previous.weightKg);
  const currentBodyFat = numeric(current.bodyFatPercent);
  const previousBodyFat = numeric(previous.bodyFatPercent);
  const bodyFatChange = currentBodyFat !== null && previousBodyFat !== null ? Math.abs(currentBodyFat - previousBodyFat) : 0;
  const currentSkeletalMuscle = numeric(current.skeletalMuscleMassKg);
  const previousSkeletalMuscle = numeric(previous.skeletalMuscleMassKg);
  const currentMuscle = numeric(current.muscleMassKg);
  const previousMuscle = numeric(previous.muscleMassKg);
  const weightChangePercent = currentWeight !== null && previousWeight !== null && previousWeight > 0
    ? Math.abs(currentWeight - previousWeight) / previousWeight * 100
    : 0;
  const skeletalMuscleChange = currentSkeletalMuscle !== null && previousSkeletalMuscle !== null
    ? Math.abs(currentSkeletalMuscle - previousSkeletalMuscle)
    : 0;
  const muscleChange = currentMuscle !== null && previousMuscle !== null ? Math.abs(currentMuscle - previousMuscle) : 0;
  return weightChangePercent > 10 || bodyFatChange > 8 || skeletalMuscleChange > 4 || muscleChange > 4;
}

function pairAssessment(current: BodyCompositionScan, previous: BodyCompositionScan, daysBetween: number, sameMachine: boolean | null) {
  const lowestExtractionConfidence = Math.min(
    extractionConfidence(current),
    extractionConfidence(previous)
  );

  if (daysBetween <= 6) {
    return { status: "INSUFFICIENT" as const, reason: "The scans are too close together to separate progress from ordinary measurement variation." };
  }
  if (sameMachine === false) {
    return { status: "INSUFFICIENT" as const, reason: "The scans came from different recorded scanner models, so their body-composition estimates should not be treated as directly equivalent." };
  }
  if (sameMachine === null) {
    return { status: "INSUFFICIENT" as const, reason: "The recorded scanner model is missing from at least one scan, so the readings cannot support a body-composition trend yet." };
  }
  if (lowestExtractionConfidence < 0.65) {
    return { status: "INSUFFICIENT" as const, reason: "At least one scan has low extraction confidence and should be checked before comparing." };
  }
  if (isExtremeBodyCompositionChange(current, previous)) {
    return { status: "INSUFFICIENT" as const, reason: "The readings changed beyond Ascend's plausibility guardrail and need review or another comparable scan before interpretation." };
  }
  return {
    status: "PROVISIONAL" as const,
    reason: daysBetween >= 21
      ? "The readings are separated by at least three weeks and use the same recorded scanner model, but another consistent scan is required to establish a trend."
      : "The readings can be compared cautiously, but more time and another consistent scan are required to establish a trend."
  };
}

function compatibleThreeScanHistory(scans: BodyCompositionScan[]) {
  if (scans.length < 3) return false;
  const recent = scans.slice(0, 3);
  const dates = recent.map((scan) => bodyCompositionDateMs(scan.scanDate));
  if (dates.some((date) => date === null)) return false;
  const machines = recent.map((scan) => normalizeBodyCompositionMachine(scan.machine));
  if (machines.some((machine) => machine === null) || new Set(machines).size !== 1) return false;
  if (recent.some((scan) => extractionConfidence(scan) < 0.75)) return false;
  if (isExtremeBodyCompositionChange(recent[0], recent[1]) || isExtremeBodyCompositionChange(recent[1], recent[2])) return false;
  const newestToMiddle = ((dates[0] as number) - (dates[1] as number)) / 86_400_000;
  const middleToOldest = ((dates[1] as number) - (dates[2] as number)) / 86_400_000;
  const totalSpan = ((dates[0] as number) - (dates[2] as number)) / 86_400_000;
  return newestToMiddle >= 14 && middleToOldest >= 14 && totalSpan >= 42;
}

function establishedMetricSignal(metric: ComparableMetric, scans: BodyCompositionScan[]) {
  if (!compatibleThreeScanHistory(scans)) return null;
  const [latest, middle, oldest] = scans;
  const current = metricValue(latest, metric);
  const previous = metricValue(middle, metric);
  const baseline = metricValue(oldest, metric);
  if (current === null || previous === null || baseline === null) return null;
  const recentChange = current - previous;
  const earlierChange = previous - baseline;
  const totalChange = current - baseline;
  if (Math.abs(recentChange) < metric.threshold && Math.abs(earlierChange) < metric.threshold && Math.abs(totalChange) < metric.threshold) {
    return "no_clear_change" as const;
  }
  const sameDirection = Math.sign(recentChange) !== 0 && Math.sign(recentChange) === Math.sign(earlierChange);
  const enoughMovement = Math.abs(recentChange) >= metric.threshold / 2
    && Math.abs(earlierChange) >= metric.threshold / 2
    && Math.abs(totalChange) >= metric.threshold;
  if (!sameDirection || !enoughMovement) return null;
  return totalChange > 0 ? "higher" as const : "lower" as const;
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
  status: BodyCompositionEvidenceStatus,
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
      evidenceStatus: "INSUFFICIENT",
      confidence: "insufficient",
      meaningful: false,
      message: `${metric.label} cannot be compared because one of the scans does not contain that reading.`
    };
  }

  const change = rounded(current - previous);
  const confidence: BodyCompositionComparisonConfidence = status === "ESTABLISHED" ? "high" : status === "PROVISIONAL" ? "possible" : "insufficient";
  if (Math.abs(change) < metric.threshold) {
    return {
      metric: metric.label,
      current,
      previous,
      change,
      unit: metric.unit,
      threshold: metric.threshold,
      signal: "no_clear_change",
      evidenceStatus: status,
      confidence,
      meaningful: false,
      message: `${metric.label} has no clear change yet; the ${changePhrase(change, metric.unit)} reading is within Ascend's comparison caution range.`
    };
  }

  if (status === "INSUFFICIENT") {
    return {
      metric: metric.label,
      current,
      previous,
      change,
      unit: metric.unit,
      threshold: metric.threshold,
      signal: "uncertain_change",
      evidenceStatus: status,
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
    evidenceStatus: status,
    confidence,
    meaningful: true,
    message: status === "ESTABLISHED"
      ? `The last three comparable ${metric.label.toLowerCase()} readings support a sustained ${change > 0 ? "increase" : "decrease"}.`
      : `${metric.label} reads ${changePhrase(change, metric.unit)} than the previous scan, although another consistent scan is needed to establish a trend.`
  };
}

export function buildBodyCompositionComparison(scans: BodyCompositionScan[]): BodyCompositionComparison {
  const confirmed = scans
    .filter((scan) => scan.userConfirmed !== false)
    .map((scan) => ({ scan, date: bodyCompositionDateMs(scan.scanDate) }))
    .filter((entry): entry is { scan: BodyCompositionScan; date: number } => entry.date !== null)
    .sort((left, right) => right.date - left.date);
  const current = confirmed[0]?.scan ?? null;
  const previous = confirmed[1]?.scan ?? null;

  if (!current || !previous) {
    return {
      available: false,
      daysBetweenScans: null,
      sameMachine: null,
      status: "INSUFFICIENT",
      confidence: "insufficient",
      reason: "A second confirmed scan is required.",
      headline: "Your first scan is now the baseline for a future comparison.",
      measurementNote: "Repeat the scan in roughly four weeks under similar conditions for a clearer comparison.",
      metrics: []
    };
  }

  const currentDate = bodyCompositionDateMs(current.scanDate)!;
  const previousDate = bodyCompositionDateMs(previous.scanDate)!;
  const daysBetweenScans = Math.max(0, Math.round((currentDate - previousDate) / 86_400_000));
  const sameMachine = sameMachineFor(current, previous);
  const pair = pairAssessment(current, previous, daysBetweenScans, sameMachine);
  const confirmedScans = confirmed.map((entry) => entry.scan);
  const historyEstablished = pair.status === "PROVISIONAL" && compatibleThreeScanHistory(confirmedScans);
  const provisionalMetrics = comparableMetrics.map((metric) => compareMetric(metric, current, previous, pair.status, pair.reason));
  const metrics = provisionalMetrics.map((comparison, index) => {
    if (!historyEstablished) return comparison;
    const establishedSignal = establishedMetricSignal(comparableMetrics[index], confirmedScans);
    if (!establishedSignal) return comparison;
    if (establishedSignal === "no_clear_change") {
      return {
        ...comparison,
        signal: establishedSignal,
        evidenceStatus: "ESTABLISHED" as const,
        confidence: "high" as const,
        meaningful: false,
        message: `${comparison.metric} has remained within Ascend's comparison caution range across the last three comparable scans.`
      };
    }
    return {
      ...comparison,
      signal: establishedSignal,
      evidenceStatus: "ESTABLISHED" as const,
      confidence: "high" as const,
      meaningful: true,
      message: `The last three comparable ${comparison.metric.toLowerCase()} readings support a sustained ${establishedSignal === "higher" ? "increase" : "decrease"}.`
    };
  });
  const hasEstablishedMetric = metrics.some((metric) => metric.evidenceStatus === "ESTABLISHED");
  const hasComparableMetric = metrics.some((metric) => metric.signal !== "not_comparable");
  const status: BodyCompositionEvidenceStatus = hasEstablishedMetric
    ? "ESTABLISHED"
    : pair.status === "PROVISIONAL" && hasComparableMetric
      ? "PROVISIONAL"
      : "INSUFFICIENT";
  const confidence: BodyCompositionComparisonConfidence = status === "ESTABLISHED" ? "high" : status === "PROVISIONAL" ? "possible" : "insufficient";
  const meaningful = metrics.filter((metric) => metric.meaningful);
  const unclear = metrics.filter((metric) => metric.signal === "no_clear_change");
  const establishedMeaningful = metrics.filter((metric) => metric.evidenceStatus === "ESTABLISHED" && metric.meaningful);
  const unresolvedComparable = metrics.filter((metric) => metric.evidenceStatus !== "ESTABLISHED" && metric.signal !== "not_comparable");

  const headline = status === "INSUFFICIENT"
    ? "These scans do not provide enough comparable evidence to call progress or decline."
    : status === "ESTABLISHED"
      ? establishedMeaningful.length
        ? `Multiple comparable scans support a sustained trend for ${establishedMeaningful.map((metric) => metric.metric.toLowerCase()).join(" and ")}.`
        : unresolvedComparable.length
          ? "At least one reading is stable across comparable scans, while other readings still need more evidence."
          : "Multiple comparable scans show no clear body-composition trend yet."
    : meaningful.length
      ? `${meaningful.length} reading${meaningful.length === 1 ? "" : "s"} moved beyond Ascend's comparison caution range, but the trend remains provisional.`
      : unclear.length
        ? "No clear body-composition change is established yet. Another consistent scan will strengthen the evidence."
        : "There is not enough matching scan data for a useful comparison yet.";

  return {
    available: true,
    daysBetweenScans,
    sameMachine,
    status,
    confidence,
    reason: status === "ESTABLISHED"
      ? "At least one metric across three scans uses the same recorded scanner model, meets the spacing and data-quality requirements, and supports a consistent interpretation."
      : !hasComparableMetric
        ? "The scans do not share enough of the same measurements for a useful comparison."
        : pair.reason,
    headline,
    measurementNote: "Body-composition machines estimate tissue from impedance. Hydration, food, recent training, and time of day can move the readings, so compare under similar conditions.",
    metrics
  };
}

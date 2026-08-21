import { NutritionTargetInput } from "@ascend/shared";
import {
  BodyCompositionComparison,
  bodyCompositionDateMs,
  buildBodyCompositionComparison,
  isExtremeBodyCompositionChange,
  normalizeBodyCompositionMachine
} from "./bodyCompositionComparisonService";

export type BodyCompositionImportSource = "ai_import" | "manual_entry";

export type BodyCompositionScanInput = {
  scanDate: string;
  machine?: string | null;
  weightKg?: number | null;
  bmi?: number | null;
  bodyFatPercent?: number | null;
  fatMassKg?: number | null;
  leanBodyMassKg?: number | null;
  estimatedLeanBodyMassKg?: number | null;
  skeletalMuscleMassKg?: number | null;
  muscleMassKg?: number | null;
  visceralFat?: number | null;
  bodyWaterPercent?: number | null;
  proteinPercent?: number | null;
  mineralPercent?: number | null;
  boneMassKg?: number | null;
  bmrKcal?: number | null;
  metabolicAge?: number | null;
  segmentalMuscle?: Record<string, unknown> | null;
  segmentalFat?: Record<string, unknown> | null;
  confidenceScore?: number | null;
  missingFields?: string[];
  notes?: string | null;
  importSource: BodyCompositionImportSource;
  sourceImages?: Array<{ key?: string | null; url?: string | null }>;
  userConfirmed?: boolean;
};

export type BodyCompositionScan = BodyCompositionScanInput & {
  id?: string;
  createdAt?: string;
};

export type BodyCompositionDerived = {
  fatFreeMassKg: number | null;
  estimatedLeanBodyMassKg: number | null;
  ffmi: number | null;
  estimatedDailyEnergyNeedsKcal: number | null;
  bodyRecompositionIndex: number | null;
  rateOfFatLossKgPerWeek: number | null;
  rateOfMuscleGainKgPerMonth: number | null;
  goalEtaWeeks: number | null;
  weeklyProgressPercent: number | null;
  monthlyProgressPercent: number | null;
};

export type BodyCompositionTrend = {
  metric: string;
  current: number | null;
  previous: number | null;
  bestEver: number | null;
  change: number | null;
};

export type BodyCompositionSummary = {
  latestScan: BodyCompositionScan | null;
  previousScan: BodyCompositionScan | null;
  scanCount: number;
  derived: BodyCompositionDerived;
  dnaScore: { current: number | null; previous: number | null; change: number | null; label: string };
  trends: BodyCompositionTrend[];
  coachAlerts: Array<{ type: string; severity: "positive" | "medium" | "high"; message: string }>;
  insights: string[];
  comparison: BodyCompositionComparison;
  nutritionDataSource: "Profile Only" | "Profile + Body Scan" | "Profile + Body Scan History";
};

export type BodyCompositionScanFlag = "low_extraction_confidence" | "unknown_scanner" | "extreme_change";
export type BodyCompositionExcludedReason = "unconfirmed" | "invalid_scan" | "suspicious_duplicate";

export type TrustedBodyCompositionHistory = {
  confirmedHistory: BodyCompositionScan[];
  latestConfirmedScan: BodyCompositionScan | null;
  previousConfirmedScan: BodyCompositionScan | null;
  draftScans: BodyCompositionScan[];
  excludedScans: Array<{ scan: BodyCompositionScan; reasons: BodyCompositionExcludedReason[]; validationErrors: string[] }>;
  flags: Array<{ scanId: string | null; scanDate: string; flags: BodyCompositionScanFlag[] }>;
};

export function bodyCompositionScanFromDb(row: Record<string, unknown>): BodyCompositionScan {
  return {
    id: String(row.id),
    scanDate: String(row.scan_date).slice(0, 10),
    machine: row.machine as string | null,
    weightKg: row.weight_kg === null ? null : Number(row.weight_kg),
    bmi: row.bmi === null ? null : Number(row.bmi),
    bodyFatPercent: row.body_fat_percent === null ? null : Number(row.body_fat_percent),
    fatMassKg: row.fat_mass_kg === null ? null : Number(row.fat_mass_kg),
    leanBodyMassKg: row.lean_body_mass_kg === null ? null : Number(row.lean_body_mass_kg),
    estimatedLeanBodyMassKg: row.estimated_lean_body_mass_kg === null ? null : Number(row.estimated_lean_body_mass_kg),
    skeletalMuscleMassKg: row.skeletal_muscle_mass_kg === null ? null : Number(row.skeletal_muscle_mass_kg),
    muscleMassKg: row.muscle_mass_kg === null ? null : Number(row.muscle_mass_kg),
    visceralFat: row.visceral_fat === null ? null : Number(row.visceral_fat),
    bodyWaterPercent: row.body_water_percent === null ? null : Number(row.body_water_percent),
    proteinPercent: row.protein_percent === null ? null : Number(row.protein_percent),
    mineralPercent: row.mineral_percent === null ? null : Number(row.mineral_percent),
    boneMassKg: row.bone_mass_kg === null ? null : Number(row.bone_mass_kg),
    bmrKcal: row.bmr_kcal === null ? null : Number(row.bmr_kcal),
    metabolicAge: row.metabolic_age === null ? null : Number(row.metabolic_age),
    segmentalMuscle: row.segmental_muscle as Record<string, unknown> ?? {},
    segmentalFat: row.segmental_fat as Record<string, unknown> ?? {},
    confidenceScore: row.confidence_score === null ? null : Number(row.confidence_score),
    missingFields: Array.isArray(row.missing_fields) ? row.missing_fields.map(String) : [],
    notes: row.notes as string | null,
    importSource: row.import_source as "ai_import" | "manual_entry",
    sourceImages: Array.isArray(row.source_images) ? row.source_images as Array<{ key?: string | null; url?: string | null }> : [],
    userConfirmed: row.user_confirmed === true,
    createdAt: row.created_at ? String(row.created_at) : undefined
  };
}

const metricRanges: Record<string, [number, number]> = {
  weightKg: [20, 400],
  bmi: [8, 80],
  bodyFatPercent: [1, 75],
  fatMassKg: [0, 250],
  leanBodyMassKg: [10, 250],
  estimatedLeanBodyMassKg: [10, 250],
  skeletalMuscleMassKg: [5, 120],
  muscleMassKg: [5, 180],
  visceralFat: [0, 40],
  bodyWaterPercent: [20, 80],
  proteinPercent: [5, 35],
  mineralPercent: [1, 15],
  boneMassKg: [1, 20],
  bmrKcal: [700, 5000],
  metabolicAge: [10, 100],
  confidenceScore: [0, 1]
};

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function rounded(value: number | null, decimals = 1) {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function dateMs(value?: string | null) {
  return bodyCompositionDateMs(value);
}

function metric(scan: BodyCompositionScan | null | undefined, key: keyof BodyCompositionScanInput) {
  if (!scan) return null;
  return toNumber(scan[key]);
}

export function validateBodyCompositionScan(input: BodyCompositionScanInput) {
  const errors: string[] = [];
  const parsedScanDate = bodyCompositionDateMs(input.scanDate);
  if (parsedScanDate === null) errors.push("Scan date must be a real calendar date in YYYY-MM-DD format.");
  else if (parsedScanDate > Date.now()) errors.push("Scan date cannot be in the future.");
  if (!["ai_import", "manual_entry"].includes(input.importSource)) errors.push("Import source is invalid.");

  for (const [key, [min, max]] of Object.entries(metricRanges)) {
    const rawValue = input[key as keyof BodyCompositionScanInput];
    const value = toNumber(rawValue);
    if (rawValue !== null && rawValue !== undefined && rawValue !== "" && value === null) {
      errors.push(`${key} must be a valid number.`);
      continue;
    }
    if (value === null) continue;
    if (value < min || value > max) errors.push(`${key} must be between ${min} and ${max}.`);
  }

  const weightKg = toNumber(input.weightKg);
  const fatMassKg = toNumber(input.fatMassKg);
  const leanBodyMassKg = toNumber(input.leanBodyMassKg);
  const estimatedLeanBodyMassKg = toNumber(input.estimatedLeanBodyMassKg);
  const skeletalMuscleMassKg = toNumber(input.skeletalMuscleMassKg);
  const muscleMassKg = toNumber(input.muscleMassKg);
  const bodyFatPercent = toNumber(input.bodyFatPercent);
  const measurableFields = Object.keys(metricRanges).filter((key) => key !== "confidenceScore" && toNumber(input[key as keyof BodyCompositionScanInput]) !== null);

  if (measurableFields.length === 0) errors.push("At least one body composition measurement is required.");
  if (weightKg !== null && fatMassKg !== null && fatMassKg > weightKg) {
    errors.push("Fat mass cannot be higher than total weight.");
  }
  if (weightKg !== null && leanBodyMassKg !== null && leanBodyMassKg > weightKg) {
    errors.push("Lean body mass cannot be higher than total weight.");
  }
  if (weightKg !== null && estimatedLeanBodyMassKg !== null && estimatedLeanBodyMassKg > weightKg) errors.push("Estimated lean body mass cannot be higher than total weight.");
  if (weightKg !== null && skeletalMuscleMassKg !== null && skeletalMuscleMassKg > weightKg * 0.8) errors.push("Skeletal muscle mass is not plausible for the recorded total weight.");
  if (weightKg !== null && muscleMassKg !== null && muscleMassKg > weightKg) errors.push("Muscle mass cannot be higher than total weight.");
  if (weightKg !== null && leanBodyMassKg !== null && fatMassKg !== null && leanBodyMassKg + fatMassKg > weightKg * 1.1) {
    errors.push("Lean mass and fat mass are inconsistent with total weight.");
  }
  if (weightKg !== null && bodyFatPercent !== null && fatMassKg !== null) {
    const expectedFatMass = weightKg * bodyFatPercent / 100;
    if (Math.abs(expectedFatMass - fatMassKg) > Math.max(3, weightKg * 0.08)) errors.push("Fat mass is inconsistent with weight and body fat percentage.");
  }
  if (input.machine && input.machine.length > 120) errors.push("Machine name is too long.");
  if (input.notes && input.notes.length > 2000) errors.push("Notes are too long.");
  if ((input.sourceImages?.length ?? 0) > 6) errors.push("A scan can include at most 6 images.");

  return { valid: errors.length === 0, errors };
}

function scanFingerprint(scan: BodyCompositionScan) {
  const values = [
    scan.weightKg,
    scan.bmi,
    scan.bodyFatPercent,
    scan.fatMassKg,
    scan.leanBodyMassKg,
    scan.estimatedLeanBodyMassKg,
    scan.skeletalMuscleMassKg,
    scan.muscleMassKg,
    scan.visceralFat,
    scan.bodyWaterPercent,
    scan.bmrKcal,
    scan.metabolicAge
  ]
    .map((value) => toNumber(value)?.toFixed(2) ?? "-")
    .join("|");
  return `${scan.scanDate}|${normalizeBodyCompositionMachine(scan.machine) ?? "unknown"}|${values}`;
}

export function areSuspiciousDuplicateBodyCompositionScans(left: BodyCompositionScan, right: BodyCompositionScan) {
  return scanFingerprint(left) === scanFingerprint(right);
}

export function getTrustedBodyCompositionHistory(scans: BodyCompositionScan[]): TrustedBodyCompositionHistory {
  const draftScans: BodyCompositionScan[] = [];
  const excludedScans: TrustedBodyCompositionHistory["excludedScans"] = [];
  const candidates: BodyCompositionScan[] = [];
  const fingerprints = new Set<string>();

  for (const scan of scans) {
    if (scan.userConfirmed === false) {
      draftScans.push(scan);
      excludedScans.push({ scan, reasons: ["unconfirmed"], validationErrors: [] });
      continue;
    }
    const validation = validateBodyCompositionScan(scan);
    if (!validation.valid) {
      excludedScans.push({ scan, reasons: ["invalid_scan"], validationErrors: validation.errors });
      continue;
    }
    const fingerprint = scanFingerprint(scan);
    if (fingerprints.has(fingerprint)) {
      excludedScans.push({ scan, reasons: ["suspicious_duplicate"], validationErrors: [] });
      continue;
    }
    fingerprints.add(fingerprint);
    candidates.push(scan);
  }

  const confirmedHistory = candidates.sort((left, right) => (dateMs(right.scanDate) ?? 0) - (dateMs(left.scanDate) ?? 0));
  const flags = confirmedHistory.map((scan, index) => {
    const scanFlags: BodyCompositionScanFlag[] = [];
    if (!normalizeBodyCompositionMachine(scan.machine)) scanFlags.push("unknown_scanner");
    if (scan.importSource === "ai_import" && (toNumber(scan.confidenceScore) ?? 0) < 0.65) scanFlags.push("low_extraction_confidence");
    if (confirmedHistory[index + 1] && isExtremeBodyCompositionChange(scan, confirmedHistory[index + 1])) scanFlags.push("extreme_change");
    return { scanId: scan.id ?? null, scanDate: scan.scanDate, flags: scanFlags };
  }).filter((entry) => entry.flags.length > 0);

  return {
    confirmedHistory,
    latestConfirmedScan: confirmedHistory[0] ?? null,
    previousConfirmedScan: confirmedHistory[1] ?? null,
    draftScans,
    excludedScans,
    flags
  };
}

export function normalizeBodyCompositionScan(input: BodyCompositionScanInput): BodyCompositionScanInput {
  const weightKg = toNumber(input.weightKg);
  const bodyFatPercent = toNumber(input.bodyFatPercent);
  const fatMassKg = toNumber(input.fatMassKg) ?? (weightKg !== null && bodyFatPercent !== null ? rounded(weightKg * bodyFatPercent / 100, 2) : null);
  const leanBodyMassKg = toNumber(input.leanBodyMassKg);
  const estimatedLeanBodyMassKg = toNumber(input.estimatedLeanBodyMassKg) ?? (weightKg !== null && fatMassKg !== null ? rounded(weightKg - fatMassKg, 2) : leanBodyMassKg);

  const knownFields = Object.keys(metricRanges).filter((key) => toNumber(input[key as keyof BodyCompositionScanInput]) !== null);
  const expectedFields = ["weightKg", "bodyFatPercent", "fatMassKg", "leanBodyMassKg", "skeletalMuscleMassKg", "visceralFat", "bodyWaterPercent", "bmrKcal"];
  const missingFields = input.missingFields?.length ? input.missingFields : expectedFields.filter((field) => !knownFields.includes(field));

  return {
    ...input,
    scanDate: input.scanDate.slice(0, 10),
    machine: input.machine?.trim() || null,
    weightKg,
    bmi: toNumber(input.bmi),
    bodyFatPercent,
    fatMassKg,
    leanBodyMassKg,
    estimatedLeanBodyMassKg,
    skeletalMuscleMassKg: toNumber(input.skeletalMuscleMassKg),
    muscleMassKg: toNumber(input.muscleMassKg),
    visceralFat: toNumber(input.visceralFat),
    bodyWaterPercent: toNumber(input.bodyWaterPercent),
    proteinPercent: toNumber(input.proteinPercent),
    mineralPercent: toNumber(input.mineralPercent),
    boneMassKg: toNumber(input.boneMassKg),
    bmrKcal: toNumber(input.bmrKcal),
    metabolicAge: toNumber(input.metabolicAge),
    confidenceScore: toNumber(input.confidenceScore),
    missingFields,
    segmentalMuscle: input.segmentalMuscle ?? {},
    segmentalFat: input.segmentalFat ?? {},
    sourceImages: input.sourceImages ?? []
  };
}

export function mergeBodyCompositionDrafts(drafts: BodyCompositionScanInput[]) {
  const normalized = drafts.map(normalizeBodyCompositionScan);
  const first = normalized[0] ?? normalizeBodyCompositionScan({ scanDate: new Date().toISOString().slice(0, 10), importSource: "ai_import" });
  const metricKeys: Array<keyof BodyCompositionScanInput> = [
    "weightKg", "bmi", "bodyFatPercent", "fatMassKg", "leanBodyMassKg", "estimatedLeanBodyMassKg",
    "skeletalMuscleMassKg", "muscleMassKg", "visceralFat", "bodyWaterPercent", "proteinPercent",
    "mineralPercent", "boneMassKg", "bmrKcal", "metabolicAge", "confidenceScore"
  ];
  const merged: BodyCompositionScanInput = { ...first, missingFields: [], notes: "", sourceImages: [] };

  for (const key of metricKeys) {
    const value = normalized.map((draft) => draft[key]).find((entry) => entry !== null && entry !== undefined);
    (merged as Record<string, unknown>)[key] = value ?? null;
  }

  merged.machine = normalized.map((draft) => draft.machine).find(Boolean) ?? null;
  merged.scanDate = normalized.map((draft) => draft.scanDate).find(Boolean) ?? first.scanDate;
  merged.segmentalMuscle = Object.assign({}, ...normalized.map((draft) => draft.segmentalMuscle ?? {}));
  merged.segmentalFat = Object.assign({}, ...normalized.map((draft) => draft.segmentalFat ?? {}));
  merged.missingFields = Array.from(new Set(normalized.flatMap((draft) => draft.missingFields ?? []))).filter((field) => {
    const camelField = field as keyof BodyCompositionScanInput;
    return !metricKeys.includes(camelField) || merged[camelField] === null || merged[camelField] === undefined;
  });
  merged.notes = normalized.map((draft) => draft.notes).filter(Boolean).join(" ").slice(0, 2000) || null;
  merged.importSource = "ai_import";
  merged.userConfirmed = false;
  return normalizeBodyCompositionScan(merged);
}

export function calculateBodyCompositionDerived(
  scans: BodyCompositionScan[],
  profile?: NutritionTargetInput,
  comparison = buildBodyCompositionComparison(scans)
): BodyCompositionDerived {
  const ordered = [...scans].sort((a, b) => (dateMs(a.scanDate) ?? 0) - (dateMs(b.scanDate) ?? 0));
  const latest = ordered[ordered.length - 1] ?? null;
  const weightKg = metric(latest, "weightKg");
  const heightM = toNumber(profile?.heightCm) ? Number(profile?.heightCm) / 100 : null;
  const fatMassKg = metric(latest, "fatMassKg");
  const leanBodyMassKg = metric(latest, "leanBodyMassKg") ?? metric(latest, "estimatedLeanBodyMassKg");
  const estimatedLeanBodyMassKg = leanBodyMassKg ?? (weightKg !== null && fatMassKg !== null ? weightKg - fatMassKg : null);
  const ffmi = heightM && estimatedLeanBodyMassKg ? estimatedLeanBodyMassKg / (heightM * heightM) : null;
  const bmr = metric(latest, "bmrKcal");
  const activityMultiplier = profile?.activityLevel === "high" ? 1.7 : profile?.activityLevel === "low" ? 1.35 : 1.5;
  const fatMassComparison = comparison.metrics.find((entry) => entry.metric === "Fat Mass" && entry.evidenceStatus === "ESTABLISHED") ?? null;
  const muscleComparison = comparison.metrics.find((entry) => entry.metric === "Skeletal Muscle" && entry.evidenceStatus === "ESTABLISHED") ?? null;
  const intervalWeeks = comparison.daysBetweenScans ? comparison.daysBetweenScans / 7 : null;
  const intervalMonths = comparison.daysBetweenScans ? comparison.daysBetweenScans / 30.4 : null;
  const fatLossRate = fatMassComparison?.signal === "lower" && intervalWeeks
    ? Math.abs(fatMassComparison.change ?? 0) / intervalWeeks
    : null;
  const muscleGainRate = muscleComparison?.signal === "higher" && intervalMonths
    ? Math.abs(muscleComparison.change ?? 0) / intervalMonths
    : null;

  return {
    fatFreeMassKg: rounded(estimatedLeanBodyMassKg, 2),
    estimatedLeanBodyMassKg: rounded(estimatedLeanBodyMassKg, 2),
    ffmi: rounded(ffmi, 2),
    estimatedDailyEnergyNeedsKcal: bmr ? Math.round(bmr * activityMultiplier) : null,
    bodyRecompositionIndex: null,
    rateOfFatLossKgPerWeek: rounded(fatLossRate, 2),
    rateOfMuscleGainKgPerMonth: rounded(muscleGainRate, 2),
    goalEtaWeeks: null,
    weeklyProgressPercent: null,
    monthlyProgressPercent: null
  };
}

function scoreScan(scan: BodyCompositionScan | null) {
  if (!scan) return null;
  let score = 55;
  const bodyFat = metric(scan, "bodyFatPercent");
  const visceral = metric(scan, "visceralFat");
  const water = metric(scan, "bodyWaterPercent");

  if (bodyFat !== null) score += bodyFat < 18 ? 12 : bodyFat < 25 ? 8 : bodyFat < 35 ? 2 : -6;
  if (visceral !== null) score += visceral < 10 ? 8 : visceral <= 14 ? 2 : -8;
  if (water !== null) score += water >= 45 && water <= 65 ? 6 : -4;
  return Math.round(Math.max(0, Math.min(100, score)));
}

export function calculateDnaScore(scans: BodyCompositionScan[], comparison = buildBodyCompositionComparison(scans)) {
  const ordered = [...scans].sort((a, b) => (dateMs(a.scanDate) ?? 0) - (dateMs(b.scanDate) ?? 0));
  const latest = ordered[ordered.length - 1] ?? null;
  const previous = ordered[ordered.length - 2] ?? null;
  const current = scoreScan(latest);
  const previousScore = scoreScan(previous);
  const dnaMetricLabels = ["Body Fat", "Visceral Fat", "Body Water"];
  const availableDnaMetrics = comparison.metrics.filter((entry) => dnaMetricLabels.includes(entry.metric) && entry.current !== null && entry.previous !== null);
  const dnaChangeEstablished = availableDnaMetrics.length > 0
    && availableDnaMetrics.every((entry) => entry.evidenceStatus === "ESTABLISHED");
  return {
    current,
    previous: previousScore,
    change: dnaChangeEstablished && current !== null && previousScore !== null ? current - previousScore : null,
    label: "Experimental"
  };
}

export function buildBodyCompositionSummary(scans: BodyCompositionScan[], profile?: NutritionTargetInput): BodyCompositionSummary {
  const trustedHistory = getTrustedBodyCompositionHistory(scans);
  const orderedDesc = trustedHistory.confirmedHistory;
  const latest = orderedDesc[0] ?? null;
  const previous = orderedDesc[1] ?? null;
  const comparison = buildBodyCompositionComparison(orderedDesc);
  const derived = calculateBodyCompositionDerived(orderedDesc, profile, comparison);
  const dnaScore = calculateDnaScore(orderedDesc, comparison);
  const trendMetrics: Array<[string, keyof BodyCompositionScanInput]> = [
    ["Weight", "weightKg"],
    ["Body Fat", "bodyFatPercent"],
    ["Muscle", "muscleMassKg"],
    ["Skeletal Muscle", "skeletalMuscleMassKg"],
    ["Lean Mass", "leanBodyMassKg"],
    ["Fat Mass", "fatMassKg"],
    ["Visceral Fat", "visceralFat"],
    ["Body Water", "bodyWaterPercent"],
    ["BMR", "bmrKcal"],
    ["Metabolic Age", "metabolicAge"]
  ];
  const trends = trendMetrics.map(([label, key]) => {
    const current = metric(latest, key);
    const prev = metric(previous, key);
    const comparisonLabel = label === "Muscle" ? "Muscle Mass" : label;
    const metricComparison = comparison.metrics.find((entry) => entry.metric === comparisonLabel) ?? null;
    const established = metricComparison?.evidenceStatus === "ESTABLISHED";
    return {
      metric: label,
      current,
      previous: prev,
      bestEver: null,
      change: established && current !== null && prev !== null ? rounded(current - prev, 2) : null
    };
  });

  const coachAlerts: BodyCompositionSummary["coachAlerts"] = [];
  const comparisonMetric = (label: string) => comparison.metrics.find((entry) => entry.metric === label) ?? null;
  const bodyFatComparison = comparisonMetric("Body Fat");
  const muscleComparison = comparisonMetric("Skeletal Muscle");
  const weightComparison = comparisonMetric("Weight");
  const visceralComparison = comparisonMetric("Visceral Fat");

  if (muscleComparison?.evidenceStatus === "ESTABLISHED" && muscleComparison.meaningful && muscleComparison.signal === "lower") {
    coachAlerts.push({ type: "muscle_loss", severity: "high", message: `${muscleComparison.message} Recheck under similar conditions and review protein, recovery, and training load.` });
  }
  if (weightComparison?.evidenceStatus === "ESTABLISHED" && weightComparison.meaningful && weightComparison.signal === "lower" && comparison.daysBetweenScans) {
    const previousWeight = weightComparison.previous ?? 0;
    const weeklyPercent = previousWeight > 0
      ? (Math.abs(weightComparison.change ?? 0) / previousWeight) / (comparison.daysBetweenScans / 7) * 100
      : 0;
    if (weeklyPercent > 1) coachAlerts.push({ type: "rapid_weight_loss", severity: "high", message: `${weightComparison.message} Review whether the current pace is intentional and sustainable.` });
  }
  if (bodyFatComparison?.evidenceStatus === "ESTABLISHED" && bodyFatComparison.meaningful && bodyFatComparison.signal === "higher") {
    coachAlerts.push({ type: "body_fat_increasing", severity: "medium", message: `${bodyFatComparison.message} Repeat under similar conditions before changing the plan.` });
  }
  if (visceralComparison?.evidenceStatus === "ESTABLISHED" && visceralComparison.meaningful && visceralComparison.signal === "higher") {
    coachAlerts.push({ type: "visceral_fat_increasing", severity: "medium", message: `${visceralComparison.message} Confirm the direction with another consistently timed scan.` });
  }
  if (bodyFatComparison?.evidenceStatus === "ESTABLISHED" && bodyFatComparison.meaningful && bodyFatComparison.signal === "lower" && muscleComparison?.evidenceStatus === "ESTABLISHED" && ["higher", "no_clear_change"].includes(muscleComparison.signal)) {
    coachAlerts.push({ type: "excellent_progress", severity: "positive", message: "The body-fat reading is lower without a clear decline in the skeletal-muscle reading." });
  }
  if (!latest || ((Date.now() - (dateMs(latest.scanDate) ?? Date.now())) / 86_400_000) > 45) coachAlerts.push({ type: "scan_overdue", severity: "medium", message: "No recent body composition scan uploaded." });

  const insights = comparison.metrics.filter((entry) => entry.meaningful).map((entry) => entry.message);

  return {
    latestScan: latest,
    previousScan: previous,
    scanCount: orderedDesc.length,
    derived,
    dnaScore,
    trends,
    coachAlerts,
    insights,
    comparison,
    nutritionDataSource: orderedDesc.length > 1 ? "Profile + Body Scan History" : orderedDesc.length === 1 ? "Profile + Body Scan" : "Profile Only"
  };
}

export function bodyCompositionForNutrition(scans: BodyCompositionScan[]) {
  const summary = buildBodyCompositionSummary(scans);
  const latest = summary.latestScan;
  if (!latest) return undefined;
  return {
    leanBodyMassKg: metric(latest, "leanBodyMassKg") ?? metric(latest, "estimatedLeanBodyMassKg"),
    bodyFatPercent: metric(latest, "bodyFatPercent"),
    skeletalMuscleMassKg: metric(latest, "skeletalMuscleMassKg"),
    fatMassKg: metric(latest, "fatMassKg"),
    bmrKcal: metric(latest, "bmrKcal"),
    visceralFat: metric(latest, "visceralFat"),
    metabolicAge: metric(latest, "metabolicAge"),
    scanCount: summary.scanCount
  };
}

export function buildBodyCompositionAiPrompt() {
  return [
    "Extract body composition scan data from the provided report photo(s).",
    "The report may come from InBody, Tanita, OSIM, Tabata, Evolt, Dexa, Styku or another device.",
    "Extract ONLY clearly visible values. Never guess numbers. If uncertain, return null.",
    "If multiple images show the same value, merge duplicates and prefer the clearest value.",
    "Many InBody reports use lb, not kg. Convert lb values to kg for every field ending in Kg. 1 lb = 0.453592 kg.",
    "For InBody Muscle-Fat Analysis, Weight, SMM and Body Fat Mass may be shown in lb; convert those to weightKg, skeletalMuscleMassKg and fatMassKg.",
    "Keep muscle definitions separate: only values explicitly labelled Skeletal Muscle Mass or SMM belong in skeletalMuscleMassKg. Generic Muscle Mass belongs in muscleMassKg and must never be relabelled as skeletal muscle.",
    "Keep lean definitions separate: Lean Body Mass or Fat Free Mass belongs in leanBodyMassKg. Do not place it in either muscle field.",
    "For Tanita reports, put the value labelled Muscle Mass in muscleMassKg. Do not treat SMI, MM/BW, a segment value, or a muscle rating as whole-body skeletal muscle mass.",
    "For Evolt reports, Skeletal Muscle Mass belongs in skeletalMuscleMassKg and Lean Body Mass belongs in leanBodyMassKg.",
    "For seca reports, SMM or Skeletal Muscle Mass belongs in skeletalMuscleMassKg. Visceral Adipose Tissue reported in litres, kilograms, pounds, or square centimetres is not a visceral-fat level and must remain null.",
    "Only put a percentage in bodyWaterPercent. Total Body Water shown in kg, lb, or litres must not be placed in bodyWaterPercent.",
    "For Segmental Lean Analysis, each segment often shows two rows: the top row is lb and the bottom row is percent. Put converted lb values in segmentalMuscle.*Kg and put percent values in segmentalMuscle.*Percent. Never put a percent value into a Kg field.",
    "For Visceral Fat Level, use the visible level number. For Basal Metabolic Rate, use the visible kcal number.",
    "confidenceScore must be a decimal from 0 to 1, not 0 to 10 or 0 to 100.",
    "Return strict JSON only with keys: scanDate, machine, weightKg, bmi, bodyFatPercent, fatMassKg, leanBodyMassKg, estimatedLeanBodyMassKg, skeletalMuscleMassKg, muscleMassKg, visceralFat, bodyWaterPercent, proteinPercent, mineralPercent, boneMassKg, bmrKcal, metabolicAge, segmentalMuscle, segmentalFat, confidenceScore, missingFields, notes.",
    "Use kg, kcal and percentages. Use null for missing fields. Do not provide medical diagnosis."
  ].join(" ");
}

export function buildBodyCompositionCoachSummary(scans: BodyCompositionScan[]) {
  const summary = buildBodyCompositionSummary(scans);
  if (!summary.latestScan) return "No body composition scan is available yet.";
  const highlights = summary.insights.length ? summary.insights.join(" ") : "A baseline scan is available. Future comparable scans can build trend evidence.";
  const alerts = summary.coachAlerts.filter((alert) => alert.severity !== "positive").map((alert) => alert.message).join(" ");
  return `${highlights}${alerts ? ` ${alerts}` : ""}`.trim();
}

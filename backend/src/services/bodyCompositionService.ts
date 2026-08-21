import { GoalType, NutritionTargetInput } from "@ascend/shared";
import {
  BodyCompositionComparison,
  buildBodyCompositionComparison,
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
  if (!value) return null;
  const time = new Date(`${value.slice(0, 10)}T00:00:00Z`).getTime();
  return Number.isFinite(time) ? time : null;
}

function metric(scan: BodyCompositionScan | null | undefined, key: keyof BodyCompositionScanInput) {
  if (!scan) return null;
  return toNumber(scan[key]);
}

export function validateBodyCompositionScan(input: BodyCompositionScanInput) {
  const errors: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.scanDate)) errors.push("Scan date must be YYYY-MM-DD.");
  if (!["ai_import", "manual_entry"].includes(input.importSource)) errors.push("Import source is invalid.");

  for (const [key, [min, max]] of Object.entries(metricRanges)) {
    const value = toNumber(input[key as keyof BodyCompositionScanInput]);
    if (value === null) continue;
    if (value < min || value > max) errors.push(`${key} must be between ${min} and ${max}.`);
  }

  if (input.weightKg && input.fatMassKg && input.fatMassKg > input.weightKg) {
    errors.push("Fat mass cannot be higher than total weight.");
  }
  if (input.weightKg && input.leanBodyMassKg && input.leanBodyMassKg > input.weightKg) {
    errors.push("Lean body mass cannot be higher than total weight.");
  }
  if (input.machine && input.machine.length > 120) errors.push("Machine name is too long.");
  if (input.notes && input.notes.length > 2000) errors.push("Notes are too long.");
  if ((input.sourceImages?.length ?? 0) > 6) errors.push("A scan can include at most 6 images.");

  return { valid: errors.length === 0, errors };
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

export function calculateBodyCompositionDerived(scans: BodyCompositionScan[], profile?: NutritionTargetInput): BodyCompositionDerived {
  const ordered = [...scans].sort((a, b) => (dateMs(a.scanDate) ?? 0) - (dateMs(b.scanDate) ?? 0));
  const latest = ordered[ordered.length - 1] ?? null;
  const previous = ordered[ordered.length - 2] ?? null;
  const weightKg = metric(latest, "weightKg");
  const heightM = toNumber(profile?.heightCm) ? Number(profile?.heightCm) / 100 : null;
  const fatMassKg = metric(latest, "fatMassKg");
  const leanBodyMassKg = metric(latest, "leanBodyMassKg") ?? metric(latest, "estimatedLeanBodyMassKg");
  const estimatedLeanBodyMassKg = leanBodyMassKg ?? (weightKg !== null && fatMassKg !== null ? weightKg - fatMassKg : null);
  const ffmi = heightM && estimatedLeanBodyMassKg ? estimatedLeanBodyMassKg / (heightM * heightM) : null;
  const bmr = metric(latest, "bmrKcal");
  const activityMultiplier = profile?.activityLevel === "high" ? 1.7 : profile?.activityLevel === "low" ? 1.35 : 1.5;

  const first = ordered[0] ?? null;
  const days = first && latest ? ((dateMs(latest.scanDate) ?? 0) - (dateMs(first.scanDate) ?? 0)) / 86_400_000 : 0;
  const firstFatMass = metric(first, "fatMassKg");
  const latestMuscle = metric(latest, "skeletalMuscleMassKg") ?? metric(latest, "muscleMassKg");
  const firstMuscle = metric(first, "skeletalMuscleMassKg") ?? metric(first, "muscleMassKg");
  const latestBodyFat = metric(latest, "bodyFatPercent");
  const previousBodyFat = metric(previous, "bodyFatPercent");
  const previousMuscle = metric(previous, "skeletalMuscleMassKg") ?? metric(previous, "muscleMassKg");
  const sameTrackedMachine = first && latest
    ? normalizeBodyCompositionMachine(first.machine) !== null
      && normalizeBodyCompositionMachine(first.machine) === normalizeBodyCompositionMachine(latest.machine)
    : false;
  const fatLossRate = days >= 14 && sameTrackedMachine && firstFatMass !== null && fatMassKg !== null
    ? (firstFatMass - fatMassKg) / (days / 7)
    : null;
  const muscleGainRate = days >= 28 && sameTrackedMachine && latestMuscle !== null && firstMuscle !== null
    ? (latestMuscle - firstMuscle) / (days / 30.4)
    : null;
  const bodyFatChange = previousBodyFat !== null && latestBodyFat !== null ? previousBodyFat - latestBodyFat : null;
  const muscleChange = latestMuscle !== null && previousMuscle !== null ? latestMuscle - previousMuscle : null;

  let goalEtaWeeks: number | null = null;
  const targetWeight = toNumber(profile?.targetWeightKg);
  const goal = profile?.goalType;
  if (targetWeight && weightKg && ordered.length >= 2) {
    const latestDate = dateMs(latest.scanDate) ?? 0;
    const previousDate = dateMs(previous?.scanDate) ?? 0;
    const weeks = (latestDate - previousDate) / (7 * 86_400_000);
    const weeklyChange = weeks > 0 ? (weightKg - (metric(previous, "weightKg") ?? weightKg)) / weeks : 0;
    if (goal === "fat_loss" && weeklyChange < -0.05) goalEtaWeeks = Math.max(0, (weightKg - targetWeight) / Math.abs(weeklyChange));
    if (goal === "muscle_gain" && weeklyChange > 0.05) goalEtaWeeks = Math.max(0, (targetWeight - weightKg) / weeklyChange);
  }

  return {
    fatFreeMassKg: rounded(estimatedLeanBodyMassKg, 2),
    estimatedLeanBodyMassKg: rounded(estimatedLeanBodyMassKg, 2),
    ffmi: rounded(ffmi, 2),
    estimatedDailyEnergyNeedsKcal: bmr ? Math.round(bmr * activityMultiplier) : null,
    bodyRecompositionIndex: bodyFatChange !== null || muscleChange !== null
      ? rounded((bodyFatChange ?? 0) * 8 + (muscleChange ?? 0) * 6, 1)
      : null,
    rateOfFatLossKgPerWeek: rounded(fatLossRate, 2),
    rateOfMuscleGainKgPerMonth: rounded(muscleGainRate, 2),
    goalEtaWeeks: rounded(goalEtaWeeks, 1),
    weeklyProgressPercent: rounded(bodyFatChange !== null || muscleChange !== null ? Math.max(-100, Math.min(100, (bodyFatChange ?? 0) * 10 + (muscleChange ?? 0) * 8)) : null, 1),
    monthlyProgressPercent: rounded(days >= 28 && sameTrackedMachine && latestBodyFat !== null && metric(first, "bodyFatPercent") !== null && latestMuscle !== null && firstMuscle !== null
      ? Math.max(-100, Math.min(100, ((metric(first, "bodyFatPercent") as number) - latestBodyFat) * 8 + (latestMuscle - firstMuscle) * 6))
      : null, 1)
  };
}

function scoreScan(scan: BodyCompositionScan | null, previous: BodyCompositionScan | null, consistency: number) {
  if (!scan) return null;
  let score = 55;
  const bodyFat = metric(scan, "bodyFatPercent");
  const visceral = metric(scan, "visceralFat");
  const water = metric(scan, "bodyWaterPercent");
  const muscle = metric(scan, "skeletalMuscleMassKg") ?? metric(scan, "muscleMassKg");
  const previousBodyFat = metric(previous, "bodyFatPercent");
  const previousMuscle = metric(previous, "skeletalMuscleMassKg") ?? metric(previous, "muscleMassKg");

  if (bodyFat !== null) score += bodyFat < 18 ? 12 : bodyFat < 25 ? 8 : bodyFat < 35 ? 2 : -6;
  if (visceral !== null) score += visceral < 10 ? 8 : visceral <= 14 ? 2 : -8;
  if (water !== null) score += water >= 45 && water <= 65 ? 6 : -4;
  if (previousBodyFat !== null && bodyFat !== null) score += Math.max(-12, Math.min(12, (previousBodyFat - bodyFat) * 5));
  if (previousMuscle !== null && muscle !== null) score += Math.max(-10, Math.min(10, (muscle - previousMuscle) * 4));
  score += Math.min(10, consistency);

  return Math.round(Math.max(0, Math.min(100, score)));
}

export function calculateDnaScore(scans: BodyCompositionScan[]) {
  const ordered = [...scans].sort((a, b) => (dateMs(a.scanDate) ?? 0) - (dateMs(b.scanDate) ?? 0));
  const latest = ordered[ordered.length - 1] ?? null;
  const previous = ordered[ordered.length - 2] ?? null;
  const consistency = Math.min(10, ordered.length * 2);
  const current = scoreScan(latest, previous, consistency);
  const previousScore = scoreScan(previous, ordered[ordered.length - 3] ?? null, Math.max(0, consistency - 2));
  return {
    current,
    previous: previousScore,
    change: current !== null && previousScore !== null ? current - previousScore : null,
    label: "Experimental"
  };
}

export function buildBodyCompositionSummary(scans: BodyCompositionScan[], profile?: NutritionTargetInput): BodyCompositionSummary {
  const orderedDesc = [...scans].sort((a, b) => (dateMs(b.scanDate) ?? 0) - (dateMs(a.scanDate) ?? 0));
  const latest = orderedDesc[0] ?? null;
  const previous = orderedDesc[1] ?? null;
  const derived = calculateBodyCompositionDerived(scans, profile);
  const dnaScore = calculateDnaScore(scans);
  const comparison = buildBodyCompositionComparison(scans);
  const trendMetrics: Array<[string, keyof BodyCompositionScanInput, "min" | "max"]> = [
    ["Weight", "weightKg", profile?.goalType === "muscle_gain" ? "max" : "min"],
    ["Body Fat", "bodyFatPercent", "min"],
    ["Muscle", "muscleMassKg", "max"],
    ["Skeletal Muscle", "skeletalMuscleMassKg", "max"],
    ["Lean Mass", "leanBodyMassKg", "max"],
    ["Fat Mass", "fatMassKg", "min"],
    ["Visceral Fat", "visceralFat", "min"],
    ["Body Water", "bodyWaterPercent", "max"],
    ["BMR", "bmrKcal", "max"],
    ["Metabolic Age", "metabolicAge", "min"]
  ];
  const trends = trendMetrics.map(([label, key, best]) => {
    const values = orderedDesc.map((scan) => metric(scan, key)).filter((value): value is number => value !== null);
    const current = metric(latest, key);
    const prev = metric(previous, key);
    return {
      metric: label,
      current,
      previous: prev,
      bestEver: values.length ? (best === "min" ? Math.min(...values) : Math.max(...values)) : null,
      change: current !== null && prev !== null ? rounded(current - prev, 2) : null
    };
  });

  const coachAlerts: BodyCompositionSummary["coachAlerts"] = [];
  const comparisonMetric = (label: string) => comparison.metrics.find((entry) => entry.metric === label) ?? null;
  const bodyFatComparison = comparisonMetric("Body Fat");
  const muscleComparison = comparisonMetric("Skeletal Muscle");
  const weightComparison = comparisonMetric("Weight");
  const visceralComparison = comparisonMetric("Visceral Fat");

  if (muscleComparison?.meaningful && muscleComparison.signal === "lower") {
    coachAlerts.push({ type: "muscle_loss", severity: "high", message: `${muscleComparison.message} Recheck under similar conditions and review protein, recovery, and training load.` });
  }
  if (weightComparison?.meaningful && weightComparison.signal === "lower" && comparison.daysBetweenScans) {
    const previousWeight = weightComparison.previous ?? 0;
    const weeklyPercent = previousWeight > 0
      ? (Math.abs(weightComparison.change ?? 0) / previousWeight) / (comparison.daysBetweenScans / 7) * 100
      : 0;
    if (weeklyPercent > 1) coachAlerts.push({ type: "rapid_weight_loss", severity: "high", message: `${weightComparison.message} Review whether the current pace is intentional and sustainable.` });
  }
  if (bodyFatComparison?.meaningful && bodyFatComparison.signal === "higher") {
    coachAlerts.push({ type: "body_fat_increasing", severity: "medium", message: `${bodyFatComparison.message} Repeat under similar conditions before changing the plan.` });
  }
  if (visceralComparison?.meaningful && visceralComparison.signal === "higher") {
    coachAlerts.push({ type: "visceral_fat_increasing", severity: "medium", message: `${visceralComparison.message} Confirm the direction with another consistently timed scan.` });
  }
  if (bodyFatComparison?.meaningful && bodyFatComparison.signal === "lower" && muscleComparison && ["higher", "no_clear_change"].includes(muscleComparison.signal)) {
    coachAlerts.push({ type: "excellent_progress", severity: "positive", message: "The body-fat reading is lower without a clear decline in the skeletal-muscle reading." });
  }
  if (!latest || ((Date.now() - (dateMs(latest.scanDate) ?? Date.now())) / 86_400_000) > 45) coachAlerts.push({ type: "scan_overdue", severity: "medium", message: "No recent body composition scan uploaded." });

  const insights = comparison.metrics.filter((entry) => entry.meaningful).map((entry) => entry.message);

  return {
    latestScan: latest,
    previousScan: previous,
    scanCount: scans.length,
    derived,
    dnaScore,
    trends,
    coachAlerts,
    insights,
    comparison,
    nutritionDataSource: scans.length > 1 ? "Profile + Body Scan History" : scans.length === 1 ? "Profile + Body Scan" : "Profile Only"
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
    scanCount: scans.length
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
  const highlights = summary.insights.length ? summary.insights.join(" ") : "A baseline scan is available. Upload another scan to unlock trend coaching.";
  const alerts = summary.coachAlerts.filter((alert) => alert.severity !== "positive").map((alert) => alert.message).join(" ");
  return `${highlights}${alerts ? ` ${alerts}` : ""}`.trim();
}

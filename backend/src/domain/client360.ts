import type {
  Client360BodyProgress,
  Client360CoachingSignal,
  Client360Metric,
  Client360NutritionPeriod,
  Client360Training,
  Client360Trend
} from "@ascend/shared";

export const CLIENT_360_RULES = {
  inactivityDays: 8,
  frequencyWindowDays: 28,
  frequencyMinimumWorkouts: 4,
  frequencyMaterialChange: 2,
  loggingConsistentActiveWeeks: 6,
  nutritionLowMaximumLoggedDays7d: 2,
  nutritionMinimumAccountAgeDays: 14,
  proteinMinimumLoggedDays7d: 4,
  proteinMinimumTargetRate: 0.5,
  strengthMinimumProgressingExercises: 2,
  plateauMinimumSamples: 6,
  plateauMinimumSpanDays: 21,
  stableWeightRateKgPerWeek: 0.1
} as const;

const DAY_MS = 86_400_000;
const round = (value: number, decimals = 2) => Number(value.toFixed(decimals));
export const client360DaysBetween = (later: Date, earlier: Date) => Math.max(0, (later.getTime() - earlier.getTime()) / DAY_MS);

export function buildFrequencyTrend(current28: number, previous28: number): Client360Trend {
  const sampleSize = current28 + previous28;
  const sufficientData = sampleSize >= CLIENT_360_RULES.frequencyMinimumWorkouts;
  const delta = current28 - previous28;
  return {
    direction: !sufficientData ? "insufficient" : delta >= CLIENT_360_RULES.frequencyMaterialChange
      ? "increasing" : delta <= -CLIENT_360_RULES.frequencyMaterialChange ? "decreasing" : "stable",
    ratePerWeek: sufficientData ? round(delta / 4) : null,
    sampleSize,
    windowDays: 56,
    observedSpanDays: 56,
    sufficientData
  };
}

export type DatedNumber = { value: number; recordedAt: string };

export function buildWeightTrend(records: DatedNumber[], now: Date): Client360Trend {
  const eligible = records
    .map((record) => ({ ...record, date: new Date(record.recordedAt) }))
    .filter((record) => Number.isFinite(record.value) && !Number.isNaN(record.date.getTime()) && client360DaysBetween(now, record.date) <= 28)
    .sort((left, right) => left.date.getTime() - right.date.getTime());
  const observedSpanDays = eligible.length > 1 ? client360DaysBetween(eligible.at(-1)!.date, eligible[0].date) : 0;
  const sufficientData = eligible.length >= 4 && observedSpanDays >= 14;
  if (!sufficientData) {
    return { direction: "insufficient", ratePerWeek: null, sampleSize: eligible.length, windowDays: 28, observedSpanDays: round(observedSpanDays, 1), sufficientData };
  }
  const origin = eligible[0].date.getTime();
  const points = eligible.map((record) => ({ x: (record.date.getTime() - origin) / DAY_MS, y: record.value }));
  const xMean = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const yMean = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const denominator = points.reduce((sum, point) => sum + (point.x - xMean) ** 2, 0);
  const slopePerDay = denominator ? points.reduce((sum, point) => sum + (point.x - xMean) * (point.y - yMean), 0) / denominator : 0;
  const ratePerWeek = slopePerDay * 7;
  const direction = Math.abs(ratePerWeek) < CLIENT_360_RULES.stableWeightRateKgPerWeek
    ? "stable" : ratePerWeek > 0 ? "increasing" : "decreasing";
  return { direction, ratePerWeek: round(ratePerWeek), sampleSize: eligible.length, windowDays: 28, observedSpanDays: round(observedSpanDays, 1), sufficientData };
}

export function buildWeightChange(records: DatedNumber[], now: Date, windowDays: 7 | 30 | 90) {
  const minimumSpan = windowDays === 7 ? 3 : windowDays === 30 ? 14 : 45;
  const eligible = records
    .map((record) => ({ ...record, date: new Date(record.recordedAt) }))
    .filter((record) => Number.isFinite(record.value) && !Number.isNaN(record.date.getTime()) && client360DaysBetween(now, record.date) <= windowDays)
    .sort((left, right) => left.date.getTime() - right.date.getTime());
  const observedSpanDays = eligible.length > 1 ? client360DaysBetween(eligible.at(-1)!.date, eligible[0].date) : 0;
  const sufficientData = eligible.length >= 2 && observedSpanDays >= minimumSpan;
  return {
    value: sufficientData ? round(eligible.at(-1)!.value - eligible[0].value) : null,
    sampleSize: eligible.length,
    windowDays,
    sufficientData,
    observedSpanDays: round(observedSpanDays, 1)
  };
}

export type NutritionDay = { date: string; calories: number; proteinG: number };

function metric(value: number | null, sampleSize: number, windowDays: number, sufficientData: boolean): Client360Metric<number> {
  return { value, sampleSize, windowDays, sufficientData };
}

export function buildNutritionPeriod(
  days: NutritionDay[],
  windowDays: 7 | 30,
  calorieTarget: number,
  proteinTargetG: number,
  calorieRange: { minimum: number; maximum: number }
): Client360NutritionPeriod {
  const period = days.slice(0, windowDays);
  const logged = period.filter((day) => day.calories > 0 || day.proteinG > 0);
  const daysLogged = logged.length;
  const calories = logged.reduce((sum, day) => sum + day.calories, 0);
  const protein = logged.reduce((sum, day) => sum + day.proteinG, 0);
  const calorieWithin = logged.filter((day) => {
    const ratio = day.calories / Math.max(calorieTarget, 1);
    return ratio >= calorieRange.minimum && ratio <= calorieRange.maximum;
  }).length;
  const proteinMet = logged.filter((day) => day.proteinG >= proteinTargetG).length;
  return {
    daysLogged,
    loggingCoverage: metric(round(daysLogged / windowDays, 3), windowDays, windowDays, true),
    averageCaloriesPerLoggedDay: metric(daysLogged ? Math.round(calories / daysLogged) : null, daysLogged, windowDays, daysLogged > 0),
    averageProteinGPerLoggedDay: metric(daysLogged ? round(protein / daysLogged, 1) : null, daysLogged, windowDays, daysLogged > 0),
    calorieWithinTargetDays: metric(daysLogged ? round(calorieWithin / daysLogged, 3) : null, daysLogged, windowDays, daysLogged > 0),
    proteinTargetMetDays: metric(daysLogged ? round(proteinMet / daysLogged, 3) : null, daysLogged, windowDays, daysLogged > 0)
  };
}

export function buildClient360Signals(input: {
  now: Date;
  accountAgeDays: number;
  goal: "fat_loss" | "muscle_gain" | "maintenance" | null;
  training?: Client360Training;
  nutrition7d?: Client360NutritionPeriod;
  body?: Client360BodyProgress;
}): Client360CoachingSignal[] {
  const signals: Client360CoachingSignal[] = [];
  const lastWorkout = input.training?.lastWorkoutAt ? new Date(input.training.lastWorkoutAt) : null;
  const daysSinceLastWorkout = lastWorkout && !Number.isNaN(lastWorkout.getTime()) ? Math.floor(client360DaysBetween(input.now, lastWorkout)) : null;
  if (daysSinceLastWorkout !== null && daysSinceLastWorkout >= CLIENT_360_RULES.inactivityDays) {
    signals.push({ code: "TRAINING_INACTIVITY", severity: "attention", sourceSection: "training", evidence: { daysSinceLastWorkout, thresholdDays: CLIENT_360_RULES.inactivityDays } });
  }
  if (input.training?.frequencyTrend.direction === "decreasing") {
    signals.push({ code: "TRAINING_FREQUENCY_DECLINING", severity: "attention", sourceSection: "training", evidence: { ratePerWeek: input.training.frequencyTrend.ratePerWeek, sampleSize: input.training.frequencyTrend.sampleSize } });
  }
  if (input.training?.loggingConsistency8w.sufficientData && input.training.activeWeeks8 >= CLIENT_360_RULES.loggingConsistentActiveWeeks) {
    signals.push({ code: "TRAINING_LOGGING_CONSISTENT", severity: "positive", sourceSection: "training", evidence: { activeWeeks: input.training.activeWeeks8, windowWeeks: 8, thresholdActiveWeeks: CLIENT_360_RULES.loggingConsistentActiveWeeks } });
  }
  const progressing = input.training?.exerciseProgression.items.filter((item) =>
    ["progressed", "personal_best"].includes(item.status) && client360DaysBetween(input.now, new Date(item.lastPerformedAt)) <= 30
  ) ?? [];
  if (progressing.length >= CLIENT_360_RULES.strengthMinimumProgressingExercises) {
    signals.push({ code: "STRENGTH_PROGRESSING", severity: "positive", sourceSection: "training", evidence: { exerciseCount: progressing.length, windowDays: 30, identityBasis: "progression_v3_exact_key" } });
  }
  if (input.nutrition7d && input.accountAgeDays >= CLIENT_360_RULES.nutritionMinimumAccountAgeDays && input.nutrition7d.daysLogged <= CLIENT_360_RULES.nutritionLowMaximumLoggedDays7d) {
    signals.push({ code: "NUTRITION_LOGGING_LOW", severity: "information", sourceSection: "nutrition", evidence: { daysLogged: input.nutrition7d.daysLogged, windowDays: 7, thresholdDays: CLIENT_360_RULES.nutritionLowMaximumLoggedDays7d } });
  }
  const protein = input.nutrition7d?.proteinTargetMetDays;
  if (protein?.sufficientData && protein.sampleSize >= CLIENT_360_RULES.proteinMinimumLoggedDays7d && protein.value !== null && protein.value < CLIENT_360_RULES.proteinMinimumTargetRate) {
    signals.push({ code: "PROTEIN_TARGET_FREQUENTLY_MISSED", severity: "attention", sourceSection: "nutrition", evidence: { targetMetRate: protein.value, loggedDays: protein.sampleSize, minimumRate: CLIENT_360_RULES.proteinMinimumTargetRate } });
  }
  const weightTrend = input.body?.weight.trend28d;
  if ((input.goal === "fat_loss" || input.goal === "muscle_gain") && weightTrend?.sufficientData && weightTrend.sampleSize >= CLIENT_360_RULES.plateauMinimumSamples && weightTrend.observedSpanDays >= CLIENT_360_RULES.plateauMinimumSpanDays && Math.abs(weightTrend.ratePerWeek ?? Infinity) < CLIENT_360_RULES.stableWeightRateKgPerWeek) {
    signals.push({ code: "POTENTIAL_WEIGHT_PLATEAU", severity: "attention", sourceSection: "bodyProgress", evidence: { goal: input.goal, rateKgPerWeek: weightTrend.ratePerWeek, sampleSize: weightTrend.sampleSize, observedSpanDays: weightTrend.observedSpanDays, stableThresholdKgPerWeek: CLIENT_360_RULES.stableWeightRateKgPerWeek } });
  }
  return signals;
}

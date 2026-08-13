import { GoalType, MOMENTUM_V2_WEIGHTS, MomentumPillarStatus, MomentumV2Breakdown } from "@ascend/shared";

export type MomentumDay = {
  date: string;
  weight: number;
  meals: number;
  calories: number;
  proteinG: number;
  waterMl: number;
  workouts: number;
  activeMinutes: number;
  steps: number;
  activeCalories: number;
  sleepQuality: "poor" | "okay" | "good" | null;
  focusAssigned: number;
  focusCompleted: number;
};

export type MomentumV2Input = {
  goal: GoalType | null;
  calorieTarget: number;
  proteinTargetG: number;
  waterTargetMl: number;
  days: MomentumDay[];
};

const clamp = (value: number) => Math.max(0, Math.min(1, value));

function status(value: number | null): MomentumPillarStatus {
  if (value === null) return "not_available";
  if (value >= 0.75) return "strong";
  if (value >= 0.45) return "building";
  return "needs_attention";
}

function weightedAverage(values: Array<{ value: number; weight: number }>) {
  const denominator = values.reduce((total, item) => total + item.weight, 0);
  if (!denominator) return 0;
  return values.reduce((total, item) => total + item.value * item.weight, 0) / denominator;
}

function fuelRatio(day: MomentumDay, input: MomentumV2Input) {
  if (!day.meals) return 0;
  const logging = clamp(day.meals / 3);
  const protein = clamp(day.proteinG / Math.max(input.proteinTargetG, 1));
  const calorieRatio = day.calories / Math.max(input.calorieTarget, 1);
  const range = input.goal === "fat_loss" ? [0.65, 1.1] : input.goal === "muscle_gain" ? [0.8, 1.2] : [0.75, 1.15];
  const calories = calorieRatio >= range[0] && calorieRatio <= range[1]
    ? 1
    : clamp(1 - Math.min(Math.abs(calorieRatio - range[0]), Math.abs(calorieRatio - range[1])));
  return logging * 0.55 + protein * 0.3 + calories * 0.15;
}

function moveRatio(day: MomentumDay) {
  if (day.workouts > 0) return 1;
  if (day.steps >= 8000 || day.activeCalories >= 300 || day.activeMinutes >= 40) return 0.9;
  if (day.steps >= 5000 || day.activeCalories >= 180 || day.activeMinutes >= 25) return 0.7;
  if (day.steps >= 2500 || day.activeCalories >= 80 || day.activeMinutes >= 10) return 0.4;
  return 0;
}

function recoveryRatio(day: MomentumDay, previousDay: MomentumDay | undefined, input: MomentumV2Input) {
  const hydration = clamp(day.waterMl / Math.max(input.waterTargetMl, 1));
  const sleep = day.sleepQuality === "good" ? 1 : day.sleepQuality === "okay" ? 0.65 : day.sleepQuality === "poor" ? 0.25 : null;
  const trainingBalance = day.workouts > 0 && (previousDay?.workouts ?? 0) > 0 ? 0.65 : 1;
  if (sleep === null) return hydration * 0.75 + trainingBalance * 0.25;
  return hydration * 0.45 + sleep * 0.4 + trainingBalance * 0.15;
}

export function calculateMomentumV2(input: MomentumV2Input): MomentumV2Breakdown {
  const days = input.days.slice(-7);
  const focusActive = days.some((day) => day.focusAssigned > 0);
  const weights = focusActive ? MOMENTUM_V2_WEIGHTS.withFocus : MOMENTUM_V2_WEIGHTS.withoutFocus;
  const fuel = weightedAverage(days.map((day) => ({ value: fuelRatio(day, input), weight: day.weight })));
  const move = weightedAverage(days.map((day) => ({ value: moveRatio(day), weight: day.weight })));
  const recover = weightedAverage(days.map((day, index) => ({ value: recoveryRatio(day, days[index - 1], input), weight: day.weight })));
  const focus = focusActive
    ? weightedAverage(days.filter((day) => day.focusAssigned > 0).map((day) => ({ value: clamp(day.focusCompleted / day.focusAssigned), weight: day.weight })))
    : null;
  const fuelScore = Math.round(fuel * weights.fuel);
  const moveScore = Math.round(move * weights.move);
  const recoverScore = Math.round(recover * weights.recover);
  const focusScore = focus === null ? null : Math.round(focus * weights.focus);

  return {
    score: Math.max(0, Math.min(100, fuelScore + moveScore + recoverScore + (focusScore ?? 0))),
    fuelScore,
    moveScore,
    recoverScore,
    focusScore,
    fuelStatus: status(fuel),
    moveStatus: status(move),
    recoverStatus: status(recover),
    focusStatus: status(focus),
    focusActive,
    periodStart: days[0]?.date ?? new Date().toISOString().slice(0, 10),
    periodEnd: days.at(-1)?.date ?? new Date().toISOString().slice(0, 10),
    scoreVersion: "v2"
  };
}

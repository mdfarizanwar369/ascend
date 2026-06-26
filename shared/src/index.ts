export type Role = "client" | "trainer" | "admin" | "owner";
export type GoalType = "fat_loss" | "muscle_gain" | "maintenance";
export type CoachingMode = "self_coached" | "ai_coach" | "human_coach";
export type Sex = "female" | "male" | "prefer_not_to_say";
export type ActivityLevel = "low" | "moderate" | "high";
export type SubscriptionPlan = "free" | "premium" | "trainer_pro";
export type SubscriptionProvider = "lemonsqueezy" | "toyyibpay" | "stripe" | "manual";
export type SubscriptionStatus = "active" | "trialing" | "past_due" | "canceled" | "expired";
export type InstallPlatform = "ios" | "android" | "desktop";

export * from "./ascendDna";
export * from "./notificationEngine";
export * from "./bodyScanImage";

export function detectInstallPlatform(userAgent: string, platform = "", maxTouchPoints = 0): InstallPlatform {
  const isIpadOs = platform === "MacIntel" && maxTouchPoints > 1;
  if (/iPad|iPhone|iPod/i.test(userAgent) || isIpadOs) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "desktop";
}

export function canAutoOfferInstall(input: {
  eligible: boolean;
  installed: boolean;
  alreadyPrompted: boolean;
  pathname: string;
}) {
  const deferredPaths = new Set(["/", "/login", "/launch", "/reset", "/onboarding"]);
  return input.eligible && !input.installed && !input.alreadyPrompted && !deferredPaths.has(input.pathname);
}

export const MARKETING_DEMO_SCENE_DURATIONS_MS = [3500, 4000, 3500, 4000, 3500, 4000, 3500, 4000] as const;

export function getMarketingDemoFrame(elapsedMs: number) {
  const totalDurationMs = MARKETING_DEMO_SCENE_DURATIONS_MS.reduce((total, duration) => total + duration, 0);
  const normalizedElapsedMs = ((Math.max(0, elapsedMs) % totalDurationMs) + totalDurationMs) % totalDurationMs;
  let sceneStartMs = 0;

  for (let sceneIndex = 0; sceneIndex < MARKETING_DEMO_SCENE_DURATIONS_MS.length; sceneIndex += 1) {
    const durationMs = MARKETING_DEMO_SCENE_DURATIONS_MS[sceneIndex];
    if (normalizedElapsedMs < sceneStartMs + durationMs) {
      return {
        sceneIndex,
        sceneProgress: (normalizedElapsedMs - sceneStartMs) / durationMs,
        totalProgress: normalizedElapsedMs / totalDurationMs,
        totalDurationMs
      };
    }
    sceneStartMs += durationMs;
  }

  return { sceneIndex: 0, sceneProgress: 0, totalProgress: 0, totalDurationMs };
}
export type RiskAlertType =
  | "inactive_7_days"
  | "low_compliance"
  | "no_food_logs"
  | "weight_trend_off_goal";
export type RiskSeverity = "low" | "medium" | "high";

export interface Gym {
  id: string;
  name: string;
  slug: string;
  location: string;
  country: string;
  timezone: string;
}

export interface UserProfile {
  id: string;
  firebaseUid: string;
  email: string;
  fullName: string;
  primaryRole: Role;
  gymId?: string;
  assignedTrainerId?: string;
  goalType?: GoalType;
  coachingMode?: CoachingMode;
}

export interface FoodEstimate {
  foodName: string;
  confidence: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  notes: string;
}

export interface ComplianceBreakdown {
  foodScore: number;
  weightScore: number;
  waterScore: number;
  habitScore: number;
  totalScore: number;
}

export const PLANS: Record<SubscriptionPlan, { label: string; priceRm: number; audience: string }> = {
  free: { label: "Free", priceRm: 0, audience: "Client" },
  premium: { label: "Premium", priceRm: 19.99, audience: "Client" },
  trainer_pro: { label: "Trainer Pro", priceRm: 99.99, audience: "Trainer" }
};

export const LOCAL_FOODS = [
  "Nasi Lemak",
  "Chicken Rice",
  "Mee Goreng",
  "Roti Canai",
  "Satay",
  "Laksa",
  "Char Kway Teow",
  "Economy Rice",
  "Teh Tarik",
  "Briyani",
  "Thosai",
  "Wanton Mee"
] as const;

export const COMPLIANCE_WEIGHTS = {
  food: 35,
  weight: 25,
  water: 20,
  habits: 20
} as const;

export interface NutritionTargetInput {
  goalType?: GoalType | null;
  sex?: Sex | null;
  ageYears?: number | string | null;
  heightCm?: number | string | null;
  weightKg?: number | string | null;
  targetWeightKg?: number | string | null;
  activityLevel?: ActivityLevel | null;
  bodyComposition?: {
    leanBodyMassKg?: number | string | null;
    bodyFatPercent?: number | string | null;
    skeletalMuscleMassKg?: number | string | null;
    fatMassKg?: number | string | null;
    bmrKcal?: number | string | null;
    visceralFat?: number | string | null;
    metabolicAge?: number | string | null;
    scanCount?: number | string | null;
  } | null;
}

export interface NutritionTargets {
  calorieTarget: number;
  proteinTargetG: number;
  carbsTargetG: number;
  fatTargetG: number;
  waterTargetMl: number;
  estimated: boolean;
  explanation: string;
  adaptiveAdjustment: number;
  adaptationReason?: string;
  dataSourcesUsed?: "Profile Only" | "Profile + Body Scan" | "Profile + Body Scan History";
}

export interface WeightTrendEntry {
  weightKg: number | string;
  loggedAt: string;
}

function toPositiveNumber(value: number | string | null | undefined) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function calculateNutritionTargets(input: NutritionTargetInput): NutritionTargets {
  const weightKg = toPositiveNumber(input.weightKg) ?? toPositiveNumber(input.targetWeightKg) ?? 70;
  const heightCm = toPositiveNumber(input.heightCm) ?? 170;
  const ageYears = toPositiveNumber(input.ageYears) ?? 30;
  const sex = input.sex ?? "prefer_not_to_say";
  const activityLevel = input.activityLevel ?? "moderate";
  const goalType = input.goalType ?? "maintenance";
  const bodyComposition = input.bodyComposition ?? null;
  const leanBodyMassKg = toPositiveNumber(bodyComposition?.leanBodyMassKg);
  const measuredBmr = toPositiveNumber(bodyComposition?.bmrKcal);
  const visceralFat = toPositiveNumber(bodyComposition?.visceralFat);
  const bodyFatPercent = toPositiveNumber(bodyComposition?.bodyFatPercent);
  const scanCount = toPositiveNumber(bodyComposition?.scanCount) ?? 0;
  const estimated = !input.weightKg || !input.heightCm || !input.ageYears || !input.sex || !input.activityLevel;

  const sexAdjustment = sex === "female" ? -161 : sex === "male" ? 5 : -78;
  const profileBmr = 10 * weightKg + 6.25 * heightCm - 5 * ageYears + sexAdjustment;
  const bmr = measuredBmr ?? profileBmr;
  const activityMultiplier = activityLevel === "low" ? 1.35 : activityLevel === "high" ? 1.7 : 1.5;
  const maintenanceCalories = bmr * activityMultiplier;
  const lowMuscleMass = leanBodyMassKg !== null && leanBodyMassKg / weightKg < 0.58;
  const elevatedVisceralFat = visceralFat !== null && visceralFat >= 14;
  let goalAdjustment = goalType === "fat_loss" ? -400 : goalType === "muscle_gain" ? 250 : 0;
  if (goalType === "fat_loss" && lowMuscleMass) goalAdjustment = -250;
  if (goalType === "fat_loss" && elevatedVisceralFat && !lowMuscleMass) goalAdjustment = -350;
  const calorieTarget = Math.round(Math.min(4200, Math.max(1200, maintenanceCalories + goalAdjustment)) / 25) * 25;
  const proteinBaseKg = leanBodyMassKg ?? weightKg;
  const proteinMultiplier = leanBodyMassKg
    ? goalType === "muscle_gain" ? 2.2 : goalType === "fat_loss" ? 2.1 : 1.9
    : goalType === "muscle_gain" ? 1.8 : goalType === "fat_loss" ? 1.7 : 1.5;
  const muscleProtectionBoost = lowMuscleMass || (bodyFatPercent !== null && goalType === "fat_loss" && bodyFatPercent < 18) ? 10 : 0;
  const proteinTargetG = Math.round(Math.min(240, Math.max(70, proteinBaseKg * proteinMultiplier + muscleProtectionBoost)) / 5) * 5;
  const fatCalorieRatio = goalType === "fat_loss" ? 0.28 : goalType === "muscle_gain" ? 0.25 : 0.3;
  const fatTargetG = Math.round(Math.max(40, (calorieTarget * fatCalorieRatio) / 9) / 5) * 5;
  const remainingCalories = Math.max(0, calorieTarget - proteinTargetG * 4 - fatTargetG * 9);
  const carbsTargetG = Math.round(Math.max(80, remainingCalories / 4) / 5) * 5;

  return {
    calorieTarget,
    proteinTargetG,
    carbsTargetG,
    fatTargetG,
    waterTargetMl: 2500,
    estimated,
    adaptiveAdjustment: 0,
    dataSourcesUsed: scanCount > 1 ? "Profile + Body Scan History" : scanCount === 1 ? "Profile + Body Scan" : "Profile Only",
    explanation:
      bodyComposition
        ? goalType === "fat_loss"
          ? `Profile and body scan data were used. Calories use ${measuredBmr ? "measured BMR" : "profile-estimated BMR"} and protein prioritizes lean mass to protect muscle during fat loss${lowMuscleMass ? " with a conservative deficit because lean mass needs protection" : ""}.`
          : goalType === "muscle_gain"
            ? `Profile and body scan data were used. Calories use ${measuredBmr ? "measured BMR" : "profile-estimated BMR"} with a controlled surplus, and protein prioritizes lean mass to support muscle gain.`
            : `Profile and body scan data were used. Calories use ${measuredBmr ? "measured BMR" : "profile-estimated BMR"} with steady macros for maintenance and consistency.`
        : goalType === "fat_loss"
          ? "A gentle calorie deficit with higher protein to support fat loss."
          : goalType === "muscle_gain"
            ? "A small calorie surplus with higher protein to support muscle gain."
            : "A steady maintenance guide to support consistency."
  };
}

export function calculateAdaptiveNutritionTargets(input: NutritionTargetInput, entries: WeightTrendEntry[]): NutritionTargets {
  const base = calculateNutritionTargets(input);
  const valid = entries
    .map((entry) => ({ weightKg: Number(entry.weightKg), loggedAt: new Date(entry.loggedAt).getTime() }))
    .filter((entry) => Number.isFinite(entry.weightKg) && entry.weightKg > 0 && Number.isFinite(entry.loggedAt))
    .sort((a, b) => a.loggedAt - b.loggedAt);

  if (valid.length < 3 || Number(input.ageYears ?? 18) < 18) return base;

  const first = valid[0];
  const latest = valid[valid.length - 1];
  const elapsedWeeks = (latest.loggedAt - first.loggedAt) / (7 * 24 * 60 * 60 * 1000);
  if (elapsedWeeks < 2) return base;

  const weeklyPercentChange = ((latest.weightKg - first.weightKg) / first.weightKg / elapsedWeeks) * 100;
  const goal = input.goalType ?? "maintenance";
  let adaptiveAdjustment = 0;
  let adaptationReason: string | undefined;

  if (goal === "fat_loss") {
    if (weeklyPercentChange > -0.1) {
      adaptiveAdjustment = -100;
      adaptationReason = "Your recent weight trend is steady, so the guide has been gently reduced by 100 kcal.";
    } else if (weeklyPercentChange < -1) {
      adaptiveAdjustment = 100;
      adaptationReason = "Your recent weight trend is moving quickly, so the guide has been gently increased by 100 kcal.";
    }
  } else if (goal === "muscle_gain") {
    if (weeklyPercentChange < 0.05) {
      adaptiveAdjustment = 100;
      adaptationReason = "Your recent weight trend is steady, so the guide has been gently increased by 100 kcal.";
    } else if (weeklyPercentChange > 0.75) {
      adaptiveAdjustment = -100;
      adaptationReason = "Your recent weight trend is moving quickly, so the guide has been gently reduced by 100 kcal.";
    }
  } else if (weeklyPercentChange > 0.5) {
    adaptiveAdjustment = -100;
    adaptationReason = "Your recent weight trend is above your maintenance range, so the guide has been gently reduced by 100 kcal.";
  } else if (weeklyPercentChange < -0.5) {
    adaptiveAdjustment = 100;
    adaptationReason = "Your recent weight trend is below your maintenance range, so the guide has been gently increased by 100 kcal.";
  }

  if (!adaptiveAdjustment) return base;

  const calorieTarget = Math.round(Math.min(4200, Math.max(1200, base.calorieTarget + adaptiveAdjustment)) / 25) * 25;
  const remainingCalories = Math.max(0, calorieTarget - base.proteinTargetG * 4 - base.fatTargetG * 9);

  return {
    ...base,
    calorieTarget,
    carbsTargetG: Math.round(Math.max(80, remainingCalories / 4) / 5) * 5,
    adaptiveAdjustment,
    adaptationReason
  };
}

export function hasReachedWeightGoal(goalType: GoalType | null | undefined, weightKg: number, targetWeightKg: number) {
  if (!Number.isFinite(weightKg) || !Number.isFinite(targetWeightKg)) return false;
  if (goalType === "fat_loss") return weightKg <= targetWeightKg;
  if (goalType === "muscle_gain") return weightKg >= targetWeightKg;
  return false;
}

export type Role = "client" | "trainer" | "admin" | "owner";
export type GoalType = "fat_loss" | "muscle_gain" | "maintenance";
export type CoachingMode = "self_coached" | "ai_coach" | "human_coach";
export type Sex = "female" | "male" | "prefer_not_to_say";
export type ActivityLevel = "low" | "moderate" | "high";
export type SubscriptionPlan = "free" | "premium" | "trainer_pro";
export type SubscriptionProvider = "lemonsqueezy" | "toyyibpay" | "stripe" | "manual";
export type SubscriptionStatus = "active" | "trialing" | "past_due" | "canceled" | "expired";
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
  premium: { label: "Premium", priceRm: 19, audience: "Client" },
  trainer_pro: { label: "Trainer Pro", priceRm: 99, audience: "Trainer" }
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
}

export interface NutritionTargets {
  calorieTarget: number;
  proteinTargetG: number;
  carbsTargetG: number;
  fatTargetG: number;
  waterTargetMl: number;
  estimated: boolean;
  explanation: string;
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
  const estimated = !input.weightKg || !input.heightCm || !input.ageYears || !input.sex || !input.activityLevel;

  const sexAdjustment = sex === "female" ? -161 : sex === "male" ? 5 : -78;
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * ageYears + sexAdjustment;
  const activityMultiplier = activityLevel === "low" ? 1.35 : activityLevel === "high" ? 1.7 : 1.5;
  const maintenanceCalories = bmr * activityMultiplier;
  const goalAdjustment = goalType === "fat_loss" ? -400 : goalType === "muscle_gain" ? 250 : 0;
  const calorieTarget = Math.round(Math.min(4200, Math.max(1200, maintenanceCalories + goalAdjustment)) / 25) * 25;
  const proteinMultiplier = goalType === "muscle_gain" ? 1.8 : goalType === "fat_loss" ? 1.7 : 1.5;
  const proteinTargetG = Math.round(Math.min(220, Math.max(70, weightKg * proteinMultiplier)) / 5) * 5;
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
    explanation:
      goalType === "fat_loss"
        ? "A gentle calorie deficit with higher protein to support fat loss."
        : goalType === "muscle_gain"
          ? "A small calorie surplus with higher protein to support muscle gain."
          : "A steady maintenance guide to support consistency."
  };
}

export type Role = "client" | "trainer" | "admin" | "owner";
export type GoalType = "fat_loss" | "muscle_gain" | "maintenance";
export type SubscriptionPlan = "free" | "premium" | "trainer_pro";
export type SubscriptionProvider = "toyyibpay" | "stripe" | "manual";
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


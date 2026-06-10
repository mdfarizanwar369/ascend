import { FoodEstimate, GoalType, SubscriptionPlan } from "@ascend/shared";
import { api } from "./api";
import { getFirebaseToken } from "./authToken";

async function authed<T>(path: string, options: RequestInit = {}) {
  return api<T>(path, options, await getFirebaseToken());
}

export function completeOnboarding(input: {
  fullName: string;
  referralCode?: string;
  goalType: GoalType;
  heightCm?: number;
  startingWeightKg: number;
  targetWeightKg?: number;
}) {
  return authed("/me/onboarding", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getMe() {
  return authed<{
    user: {
      id: string;
      email: string;
      full_name: string;
      goal_type?: GoalType | null;
      starting_weight_kg?: string | number | null;
      target_weight_kg?: string | number | null;
      gym_id?: string | null;
      assigned_trainer_id?: string | null;
    };
    roles: string[];
  }>("/me");
}

export function getFoodLogs() {
  return authed<{
    foodLogs: Array<{
      id: string;
      estimated_food_name: string;
      calories: number;
      protein_g: string | number;
      carbs_g: string | number;
      fat_g: string | number;
      logged_at: string;
    }>;
  }>("/food-logs");
}

export function getWeightLogs() {
  return authed<{
    weightLogs: Array<{
      id: string;
      weight_kg: string | number;
      logged_at: string;
    }>;
  }>("/weight-logs");
}

export function getWaterLogs() {
  return authed<{
    waterLogs: Array<{
      id: string;
      amount_ml: number;
      logged_at: string;
    }>;
  }>("/water-logs");
}

export function saveWeightLog(input: { weightKg: number; loggedAt?: string }) {
  return authed<{
    weightLog: {
      id: string;
      weight_kg: string | number;
      logged_at: string;
    };
  }>("/weight-logs", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function saveWaterLog(input: { amountMl: number; loggedAt?: string }) {
  return authed<{
    waterLog: {
      id: string;
      amount_ml: number;
      logged_at: string;
    };
  }>("/water-logs", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getHabits() {
  return authed<{
    habits: Array<{
      id: string;
      name: string;
      frequency: string;
      active: boolean;
      created_at: string;
    }>;
  }>("/habits");
}

export function createHabit(input: { name: string; frequency?: "daily" | "weekly" }) {
  return authed<{
    habit: {
      id: string;
      name: string;
      frequency: string;
      active: boolean;
      created_at: string;
    };
  }>("/habits", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getHabitLogs() {
  return authed<{
    habitLogs: Array<{
      id: string;
      habit_id: string;
      completed: boolean;
      logged_at: string;
    }>;
  }>("/habit-logs");
}

export function saveHabitLog(input: { habitId: string; completed?: boolean; loggedAt?: string }) {
  return authed<{
    habitLog: {
      id: string;
      habit_id: string;
      completed: boolean;
      logged_at: string;
    };
  }>("/habit-logs", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getComplianceToday() {
  return authed<{
    compliance: {
      id: string;
      score: number;
      food_score: number;
      weight_score: number;
      water_score: number;
      habit_score: number;
      calculated_for_date: string;
    } | null;
  }>("/compliance/today");
}

export function getBurnLogs() {
  return authed<{
    burnLogs: Array<{
      id: string;
      metadata: {
        activityType?: string;
        durationMinutes?: number;
        caloriesBurned?: number;
      };
      created_at: string;
    }>;
  }>("/burn-logs");
}

export function saveBurnLog(input: {
  activityType: string;
  durationMinutes: number;
  caloriesBurned: number;
  loggedAt?: string;
}) {
  return authed<{
    burnLog: {
      id: string;
      metadata: {
        activityType?: string;
        durationMinutes?: number;
        caloriesBurned?: number;
      };
      created_at: string;
    };
  }>("/burn-logs", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function requestFoodUploadUrl(contentType: string) {
  return authed<{ uploadUrl: string; key: string }>("/food-logs/photo-upload-url", {
    method: "POST",
    body: JSON.stringify({ contentType })
  });
}

export function estimateFood(imageUrl: string) {
  return authed<{ estimate: FoodEstimate }>("/food-logs/estimate", {
    method: "POST",
    body: JSON.stringify({ imageUrl })
  });
}

export function saveFoodLog(input: {
  imageS3Key?: string;
  mealType: string;
  estimatedFoodName: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  aiEstimateRaw?: FoodEstimate;
  wasEditedByUser: boolean;
}) {
  return authed("/food-logs", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function createCheckout(plan: Exclude<SubscriptionPlan, "free">) {
  return authed<{ checkoutUrl: string; providerReference: string }>("/subscriptions/checkout", {
    method: "POST",
    body: JSON.stringify({ plan })
  });
}

export function sendCoachMessage(message: string) {
  return authed<{ reply: string }>("/ai/chat", {
    method: "POST",
    body: JSON.stringify({ message })
  });
}

export function getTrainerClients() {
  return authed<{ clients: unknown[] }>("/trainer/clients");
}

export function getAdminRevenue() {
  return authed<{ byGym: unknown[]; byTrainer: unknown[] }>("/admin/analytics/revenue");
}

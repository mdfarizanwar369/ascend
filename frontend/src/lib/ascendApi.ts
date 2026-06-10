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

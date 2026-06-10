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

export function bootstrapOwner() {
  return authed<{
    user: {
      id: string;
      email: string;
      full_name: string;
      primary_role: string;
    };
    roles: string[];
  }>("/auth/bootstrap-owner", {
    method: "POST"
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

export function estimateBurnFromText(text: string) {
  return authed<{
    estimate: {
      activityType: string;
      durationMinutes: number;
      caloriesBurned: number;
      notes?: string;
    };
  }>("/ai/burn-estimate", {
    method: "POST",
    body: JSON.stringify({ text })
  });
}

export function getTrainerClients() {
  return authed<{
    clients: Array<{
      id: string;
      full_name: string;
      email: string;
      goal_type?: GoalType | null;
      compliance_score?: number | null;
      risk_severity?: string | null;
    }>;
  }>("/trainer/clients");
}

export function getTrainerClient(clientId: string) {
  return authed<{
    client: {
      id: string;
      full_name: string;
      email: string;
      goal_type?: GoalType | null;
      starting_weight_kg?: string | number | null;
      target_weight_kg?: string | number | null;
      gym_name?: string | null;
      compliance_score?: number | null;
    };
  }>(`/trainer/clients/${clientId}`);
}

export function getTrainerClientFoodLogs(clientId: string) {
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
  }>(`/trainer/clients/${clientId}/food-logs`);
}

export function getTrainerClientWeightLogs(clientId: string) {
  return authed<{
    weightLogs: Array<{
      id: string;
      weight_kg: string | number;
      logged_at: string;
    }>;
  }>(`/trainer/clients/${clientId}/weight-logs`);
}

export function getTrainerClientWaterLogs(clientId: string) {
  return authed<{
    waterLogs: Array<{
      id: string;
      amount_ml: number;
      logged_at: string;
    }>;
  }>(`/trainer/clients/${clientId}/water-logs`);
}

export function getTrainerRiskAlerts() {
  return authed<{
    alerts: Array<{
      id: string;
      user_id: string;
      type: string;
      severity: string;
      message: string;
      status: string;
      created_at: string;
    }>;
  }>("/trainer/risk-alerts");
}

export function createWeeklyCheckin(clientId: string) {
  return authed<{ summary: string }>(`/ai/weekly-checkin/${clientId}`, {
    method: "POST"
  });
}

export function getAdminRevenue() {
  return authed<{
    byGym: Array<{
      gym_name: string | null;
      revenue_cents: string | number;
      active_subscriptions: string | number;
    }>;
    byTrainer: Array<{
      trainer_name: string | null;
      revenue_cents: string | number;
      active_subscriptions: string | number;
    }>;
  }>("/admin/analytics/revenue");
}

export function getAdminUsage() {
  return authed<{
    usage: Array<{
      gym_name: string;
      clients: string | number;
      food_logs: string | number;
      weight_logs: string | number;
      water_logs: string | number;
    }>;
  }>("/admin/analytics/usage");
}

export function getAdminCompliance() {
  return authed<{
    compliance: Array<{
      gym_name: string;
      average_compliance: string | number | null;
      low_compliance_clients: string | number;
    }>;
  }>("/admin/analytics/compliance");
}

export function getAdminReferrals() {
  return authed<{
    referrals: Array<{
      code: string;
      type: "gym" | "trainer";
      gym_name: string | null;
      trainer_name: string | null;
      referred_users: string | number;
      active_revenue_cents: string | number;
    }>;
  }>("/admin/referrals/analytics");
}

export function getAdminSubscriptions() {
  return authed<{
    subscriptions: Array<{
      id: string;
      full_name: string;
      email: string;
      plan: string;
      provider: string;
      status: string;
      amount_cents: number;
      currency: string;
      referred_gym_name: string | null;
      referred_trainer_name: string | null;
      created_at: string;
    }>;
  }>("/admin/subscriptions");
}

import { FoodEstimate, GoalType, SubscriptionPlan } from "@ascend/shared";
import { api } from "./api";
import { getFirebaseToken } from "./authToken";

function shouldRefreshToken(error: unknown) {
  if (!(error instanceof Error)) return false;
  return /401|invalid or expired token|missing bearer token|authentication is still loading/i.test(error.message);
}

async function authed<T>(path: string, options: RequestInit = {}) {
  try {
    return await api<T>(path, options, await getFirebaseToken());
  } catch (error) {
    if (!shouldRefreshToken(error)) throw error;
    return api<T>(path, options, await getFirebaseToken(true));
  }
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
      primary_role?: "client" | "trainer" | "admin" | "owner";
      goal_type?: GoalType | null;
      starting_weight_kg?: string | number | null;
      target_weight_kg?: string | number | null;
      gym_id?: string | null;
      assigned_trainer_id?: string | null;
      assigned_trainer_name?: string | null;
      trainer_status?: string | null;
    };
    roles: string[];
  }>("/me");
}

export function getFoodLogs() {
  return authed<{
    foodLogs: Array<{
      id: string;
      image_url?: string | null;
      image_s3_key?: string | null;
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
  return authed<{ uploadUrl: string; key: string; storageConfigured?: boolean }>("/food-logs/photo-upload-url", {
    method: "POST",
    body: JSON.stringify({ contentType })
  });
}

export function requestProgressUploadUrl(contentType: string) {
  return authed<{ uploadUrl: string; key: string; storageConfigured?: boolean }>("/progress-photos/upload-url", {
    method: "POST",
    body: JSON.stringify({ contentType })
  });
}

export function getProgressPhotos() {
  return authed<{
    progressPhotos: Array<{
      id: string;
      image_url?: string | null;
      image_s3_key?: string | null;
      photo_type: "front" | "side" | "back" | "other";
      logged_at: string;
    }>;
  }>("/progress-photos");
}

export function saveProgressPhoto(input: { imageS3Key: string; photoType: "front" | "side" | "back" | "other"; loggedAt?: string }) {
  return authed<{
    progressPhoto: {
      id: string;
      image_s3_key: string;
      photo_type: string;
      logged_at: string;
    };
  }>("/progress-photos", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function estimateFood(imageUrl: string) {
  return authed<{ estimate: FoodEstimate }>("/food-logs/estimate", {
    method: "POST",
    body: JSON.stringify({ imageUrl })
  });
}

export function estimateFoodFromDataUrl(imageDataUrl: string) {
  return authed<{ estimate: FoodEstimate }>("/food-logs/estimate-data-url", {
    method: "POST",
    body: JSON.stringify({ imageDataUrl })
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

export function getMySubscription() {
  return authed<{
    subscription: {
      id?: string;
      plan: SubscriptionPlan;
      provider?: string;
      status: string;
      amount_cents?: number;
      currency?: string;
      current_period_end?: string | null;
    };
  }>("/subscriptions/me");
}

export function activatePilotSubscription(plan: Exclude<SubscriptionPlan, "free">) {
  return authed<{
    subscription: {
      id: string;
      plan: SubscriptionPlan;
      provider: string;
      status: string;
      amount_cents: number;
      currency: string;
      current_period_end: string;
    };
  }>("/subscriptions/demo-activate", {
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

export function getCurrentWeeklyReport() {
  return authed<{
    report: {
      id: string;
      week_start: string;
      week_end: string;
      summary: string;
      ai_generated_checkin?: string | null;
      compliance_score?: number | null;
      created_at: string;
    } | null;
  }>("/reports/weekly/current");
}

export function generateWeeklyReport() {
  return authed<{
    report: {
      id: string;
      week_start: string;
      week_end: string;
      summary: string;
      ai_generated_checkin?: string | null;
      compliance_score?: number | null;
      created_at: string;
    };
  }>("/reports/weekly/generate", {
    method: "POST"
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

export function getMessageContacts() {
  return authed<{
    contacts: Array<{
      id: string;
      full_name: string;
      email: string;
      primary_role: string;
    }>;
  }>("/messages/contacts");
}

export function getMessages(userId: string) {
  return authed<{
    messages: Array<{
      id: string;
      sender_user_id: string;
      receiver_user_id: string;
      body: string;
      created_at: string;
      read_at?: string | null;
    }>;
  }>(`/messages/${userId}`);
}

export function sendMessage(input: { receiverUserId: string; body: string }) {
  return authed<{
    message: {
      id: string;
      sender_user_id: string;
      receiver_user_id: string;
      body: string;
      created_at: string;
    };
  }>("/messages", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getTrainerClientMessages(clientId: string) {
  return authed<{
    messages: Array<{
      id: string;
      sender_user_id: string;
      receiver_user_id: string;
      body: string;
      created_at: string;
      read_at?: string | null;
    }>;
  }>(`/trainer/clients/${clientId}/messages`);
}

export function sendTrainerClientMessage(clientId: string, body: string) {
  return authed<{
    message: {
      id: string;
      sender_user_id: string;
      receiver_user_id: string;
      body: string;
      created_at: string;
    };
  }>(`/trainer/clients/${clientId}/messages`, {
    method: "POST",
    body: JSON.stringify({ body })
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
      last_food_logged_at?: string | null;
      last_weight_logged_at?: string | null;
      last_water_logged_at?: string | null;
      last_client_message_at?: string | null;
      open_alerts?: string | number | null;
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
      image_url?: string | null;
      image_s3_key?: string | null;
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

export function getTrainerClientProgressPhotos(clientId: string) {
  return authed<{
    progressPhotos: Array<{
      id: string;
      image_url?: string | null;
      image_s3_key?: string | null;
      photo_type: "front" | "side" | "back" | "other";
      logged_at: string;
    }>;
  }>(`/trainer/clients/${clientId}/progress-photos`);
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

export function getGyms() {
  return api<{
    gyms: Array<{
      id: string;
      name: string;
      slug: string;
      location: string;
      country: string;
      timezone: string;
    }>;
  }>("/gyms");
}

export function getAdminUsers() {
  return authed<{
    users: Array<{
      id: string;
      full_name: string;
      email: string;
      primary_role: "client" | "trainer" | "admin" | "owner";
      roles: string[];
      gym_id: string | null;
      gym_name: string | null;
      assigned_trainer_id: string | null;
      assigned_trainer_name: string | null;
      referred_by_gym_id: string | null;
      referred_gym_name: string | null;
      referred_by_trainer_id: string | null;
      referred_trainer_name: string | null;
      referral_source: "gym" | "trainer" | "none";
      created_at: string;
    }>;
  }>("/admin/users");
}

export function getAdminTrainers() {
  return authed<{
    trainers: Array<{
      id: string;
      user_id: string;
      gym_id: string;
      full_name: string;
      email: string;
      gym_name: string;
      specialties: string[];
      status: string;
    }>;
  }>("/admin/trainers");
}

export function updateAdminUserRole(input: { userId: string; role: "client" | "trainer" | "admin" | "owner"; gymId?: string }) {
  return authed<{ user: unknown }>(`/admin/users/${input.userId}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role: input.role, gymId: input.gymId })
  });
}

export function assignAdminClient(input: { clientId: string; trainerId: string | null }) {
  return authed<{ user: unknown }>("/admin/assign-client", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function createAdminReferral(input: {
  code: string;
  type: "gym" | "trainer";
  gymId?: string | null;
  trainerId?: string | null;
}) {
  return authed<{ referral: unknown }>("/admin/referral-codes", {
    method: "POST",
    body: JSON.stringify(input)
  });
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

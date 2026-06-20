import { CoachingMode, FoodEstimate, GoalType, SubscriptionPlan } from "@ascend/shared";
import { api } from "./api";
import { getFirebaseToken } from "./authToken";

export interface ProgressComparison {
  periodDays: number;
  daysTracked: number;
  hasComparison: boolean;
  current: { weightKg: number | null; momentum: number | null; checkinDays: number };
  baseline: { weightKg: number | null; momentum: number | null; checkinDays: number };
  highlights: Array<{ key: string; label: string; message: string }>;
}

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

async function withTimeout<T>(ms: number, action: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);

  try {
    return await action(controller.signal);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("AI is taking too long. Please try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function completeOnboarding(input: {
  fullName: string;
  referralCode?: string;
  coachingMode?: CoachingMode;
  goalType: GoalType;
  gender?: "female" | "male" | "prefer_not_to_say";
  ageYears?: number;
  activityLevel?: "low" | "moderate" | "high";
  heightCm?: number;
  startingWeightKg: number;
  targetWeightKg?: number;
}) {
  return authed("/me/onboarding", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateGuideProfile(input: {
  gender: "female" | "male" | "prefer_not_to_say";
  ageYears: number;
  activityLevel: "low" | "moderate" | "high";
  heightCm: number;
  goalType: GoalType;
  targetWeightKg?: number | null;
}) {
  return authed("/me/guide-profile", {
    method: "PATCH",
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
      coaching_mode?: CoachingMode | string | null;
      goal_type?: GoalType | null;
      goal_updated_at?: string | null;
      gender?: "female" | "male" | "prefer_not_to_say" | string | null;
      age_years?: string | number | null;
      activity_level?: "low" | "moderate" | "high" | string | null;
      height_cm?: string | number | null;
      starting_weight_kg?: string | number | null;
      target_weight_kg?: string | number | null;
      goal_version?: string | number | null;
      gym_id?: string | null;
      assigned_trainer_id?: string | null;
      assigned_trainer_name?: string | null;
      trainer_status?: string | null;
      profile_photo_url?: string | null;
      athlete_mode_enabled?: boolean;
    };
    roles: string[];
  }>("/me");
}

export function saveProfilePhoto(imageDataUrl: string) {
  return authed<{ profilePhotoUrl: string }>("/me/profile-photo", {
    method: "POST",
    body: JSON.stringify({ imageDataUrl })
  });
}

export function removeProfilePhoto() {
  return authed<{ removed: boolean }>("/me/profile-photo", { method: "DELETE" });
}

export function getFoodLogs() {
  return authed<{
    foodLogs: Array<{
      id: string;
      image_url?: string | null;
      image_s3_key?: string | null;
      meal_type?: "breakfast" | "lunch" | "dinner" | "snack" | string;
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
    milestone?: {
      id: string;
      goal_type: GoalType;
      target_weight_kg: string | number;
      achieved_weight_kg: string | number;
      achieved_at: string;
    } | null;
  }>("/weight-logs", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getGoalStatus() {
  return authed<{
    goalStatus: {
      goal_type?: GoalType | null;
      goal_updated_at?: string | null;
      goal_version?: string | number | null;
      starting_weight_kg?: string | number | null;
      target_weight_kg?: string | number | null;
      current_weight_kg?: string | number | null;
      milestone_id?: string | null;
      milestone_goal_type?: GoalType | null;
      milestone_target_weight_kg?: string | number | null;
      achieved_weight_kg?: string | number | null;
      achieved_at?: string | null;
      acknowledged_at?: string | null;
    };
  }>("/me/goal-status");
}

export function getMyProgressComparison() {
  return authed<{ comparison: ProgressComparison }>("/me/progress-comparison");
}

export function acknowledgeGoalMilestone(milestoneId: string) {
  return authed(`/me/goal-milestones/${milestoneId}/acknowledge`, { method: "PATCH" });
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

export function getMyStreak() {
  return authed<{
    streak: {
      current: number;
      best: number;
      activeDaysThisWeek: number;
      checkedInToday: boolean;
    };
  }>("/streaks/me");
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

export function getTodayMission() {
  return authed<{
    mission: {
      id: string;
      title: string;
      status: "open" | "completed";
      due_date: string;
      completed_at?: string | null;
      trainer_name?: string | null;
      created_at: string;
    } | null;
  }>("/missions/today");
}

export function getLatestRecognition() {
  return authed<{
    recognition: {
      id: string;
      message: string;
      signal: string;
      trainer_name?: string | null;
      created_at: string;
    } | null;
  }>("/recognitions/latest");
}

export function completeMission(missionId: string) {
  return authed<{
    mission: {
      id: string;
      title: string;
      status: "completed";
      due_date: string;
      completed_at?: string | null;
    };
  }>(`/missions/${missionId}/complete`, {
    method: "PATCH"
  });
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

export function uploadFoodPhotoDataUrl(imageDataUrl: string) {
  return authed<{ key: string; storageConfigured?: boolean }>("/food-logs/photo-upload-data-url", {
    method: "POST",
    body: JSON.stringify({ imageDataUrl })
  });
}

export function requestProgressUploadUrl(contentType: string) {
  return authed<{ uploadUrl: string; key: string; storageConfigured?: boolean }>("/progress-photos/upload-url", {
    method: "POST",
    body: JSON.stringify({ contentType })
  });
}

export function uploadProgressPhotoDataUrl(imageDataUrl: string) {
  return authed<{ key: string; storageConfigured?: boolean }>("/progress-photos/upload-data-url", {
    method: "POST",
    body: JSON.stringify({ imageDataUrl })
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

export type FoodAiAllowance = {
  period: "week" | "day" | "unlimited";
  label: string;
  limit: number | null;
  used: number;
  remaining: number | null;
};

export function getFoodAiAllowance() {
  return authed<{ allowance: FoodAiAllowance }>("/food-logs/ai-allowance");
}

export function estimateFood(imageUrl: string) {
  return authed<{ estimate: FoodEstimate; allowance?: FoodAiAllowance }>("/food-logs/estimate", {
    method: "POST",
    body: JSON.stringify({ imageUrl })
  });
}

export function estimateFoodFromDataUrl(imageDataUrl: string) {
  return withTimeout(75_000, (signal) =>
    authed<{ estimate: FoodEstimate; allowance?: FoodAiAllowance }>("/food-logs/estimate-data-url", {
      method: "POST",
      body: JSON.stringify({ imageDataUrl }),
      signal
    })
  );
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
  return authed<{
    foodLog: {
      id: string;
      image_s3_key?: string | null;
      meal_type: string;
      estimated_food_name: string;
      calories: number;
      protein_g: string | number;
      carbs_g: string | number;
      fat_g: string | number;
      logged_at: string;
    };
  }>("/food-logs", {
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

export function getBillingPortal() {
  return authed<{ url: string }>("/subscriptions/billing-portal");
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
      profile_photo_url?: string | null;
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
      goal_updated_at?: string | null;
      goal_achieved_at?: string | null;
      gender?: "female" | "male" | "prefer_not_to_say" | string | null;
      age_years?: string | number | null;
      activity_level?: "low" | "moderate" | "high" | string | null;
      height_cm?: string | number | null;
      starting_weight_kg?: string | number | null;
      target_weight_kg?: string | number | null;
      compliance_score?: number | null;
      risk_severity?: string | null;
      last_food_logged_at?: string | null;
      calories_today?: string | number | null;
      protein_g_today?: string | number | null;
      carbs_g_today?: string | number | null;
      fat_g_today?: string | number | null;
      latest_weight_kg?: string | number | null;
      last_weight_logged_at?: string | null;
      last_water_logged_at?: string | null;
      last_client_message_at?: string | null;
      open_alerts?: string | number | null;
      consistency_streak?: string | number | null;
      profile_photo_url?: string | null;
    }>;
  }>("/trainer/clients");
}

export function getTrainerAttention() {
  return authed<{
    attention: Array<{
      id: string;
      full_name: string;
      email: string;
      goal_type?: GoalType | null;
      current_score?: string | number | null;
      reason: string;
      detail: string;
      priority: number;
      profile_photo_url?: string | null;
    }>;
    summary: {
      totalClients: number;
      needsAttention: number;
      allClear: boolean;
    };
  }>("/trainer/attention");
}

export function sendTrainerClientPraise(clientId: string) {
  return authed<{
    recognition: {
      id: string;
      message: string;
      signal: string;
      created_at: string;
    };
    reused: boolean;
  }>(`/trainer/clients/${clientId}/praise`, {
    method: "POST"
  });
}

export function getTrainerClient(clientId: string) {
  return authed<{
    client: {
      id: string;
      full_name: string;
      email: string;
      goal_type?: GoalType | null;
      goal_updated_at?: string | null;
      goal_achieved_at?: string | null;
      gender?: "female" | "male" | "prefer_not_to_say" | string | null;
      age_years?: string | number | null;
      activity_level?: "low" | "moderate" | "high" | string | null;
      height_cm?: string | number | null;
      starting_weight_kg?: string | number | null;
      target_weight_kg?: string | number | null;
      gym_name?: string | null;
      compliance_score?: number | null;
      last_trainer_message_at?: string | null;
      profile_photo_url?: string | null;
    };
  }>(`/trainer/clients/${clientId}`);
}

export function getTrainerClientProgressComparison(clientId: string) {
  return authed<{ comparison: ProgressComparison }>(`/trainer/clients/${clientId}/progress-comparison`);
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

export function getTrainerClientMissions(clientId: string) {
  return authed<{
    missions: Array<{
      id: string;
      title: string;
      status: "open" | "completed";
      due_date: string;
      completed_at?: string | null;
      created_by_name?: string | null;
      created_at: string;
    }>;
  }>(`/trainer/clients/${clientId}/missions`);
}

export function createTrainerClientMission(input: { clientId: string; title: string; dueDate?: string }) {
  return authed<{
    mission: {
      id: string;
      title: string;
      status: "open" | "completed";
      due_date: string;
      created_at: string;
    };
  }>(`/trainer/clients/${input.clientId}/missions`, {
    method: "POST",
    body: JSON.stringify({ title: input.title, dueDate: input.dueDate })
  });
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
      full_name?: string | null;
      profile_photo_url?: string | null;
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

export function getAdminAiUsage() {
  return authed<{
    summary: {
      monthly_food_image_analyses: string | number;
      monthly_ai_chat_messages: string | number;
      monthly_weekly_reports: string | number;
      monthly_cache_hits: string | number;
      monthly_errors: string | number;
      monthly_estimated_cost_cents: string | number;
      projected_monthly_cost_cents: string | number;
      spend_limit_cents: string | number;
      spend_percent: string | number;
      warning_level: 50 | 75 | 90 | null;
      limits: {
        monthlySpendLimitCents: number;
        monthlyFoodAnalysisLimit: number;
        monthlyChatLimit: number;
        monthlyWeeklyReportLimit: number;
      };
    };
    daily: Array<Record<string, string | number | null>>;
    weekly: Array<Record<string, string | number | null>>;
    monthly: Array<Record<string, string | number | null>>;
  }>("/admin/analytics/ai-usage");
}

export function getAdminPilotMetrics() {
  return authed<{
    clients: {
      dailyActiveUsers: number;
      weeklyActiveUsers: number;
      foodLoggingRate: number;
      weightLoggingRate: number;
      waterLoggingRate: number;
      habitCompletionRate: number;
      averageComplianceScore: number;
    };
    trainers: {
      dailyTrainerLogins: number;
      trainerResponseRate: number;
      riskAlertsGenerated: number;
      riskAlertsResolved: number;
      clientsMonitored: number;
    };
    business: {
      freeUsers: number;
      premiumUsers: number;
      trialConversions: number;
      monthlyRecurringRevenueCents: number;
      churnRate: number;
      referralPerformance: Array<{
        code: string;
        type: "gym" | "trainer";
        gym_name: string | null;
        trainer_name: string | null;
        referred_users: string | number;
        converted_users: string | number;
        revenue_cents: string | number;
      }>;
    };
    ai: {
      aiSpendCents: number;
      costPerActiveUserCents: number;
      cacheHitRate: number;
      estimatedMonthlyCostCents: number;
    };
    trends: Array<{
      period: string;
      active_users: string | number;
      food_logs: string | number;
      weight_logs: string | number;
      water_logs: string | number;
      habit_completions: string | number;
      average_compliance_score: string | number;
      ai_cost_cents: string | number;
    }>;
  }>("/admin/analytics/pilot-metrics");
}

export function getAdminNotifications() {
  return authed<{
    notifications: Array<{
      id: string;
      type: string;
      severity: "critical" | "important";
      title: string;
      body: string;
      href: string;
      count: number;
    }>;
    summary: {
      total: number;
      critical: number;
      important: number;
    };
  }>("/admin/notifications");
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

export function validateReferral(code: string) {
  return api<{
    referral: {
      id: string;
      code: string;
      type: "gym" | "trainer";
      gym_name: string | null;
      trainer_name: string | null;
    };
  }>(`/referrals/validate/${encodeURIComponent(code)}`);
}

export function getAdminUsers() {
  return authed<{
    canManageOwnerGyms: boolean;
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
      coaching_mode: CoachingMode | string | null;
      athlete_mode_enabled: boolean;
      owner_gym_ids: string[];
      current_plan: SubscriptionPlan;
      subscription_status: string | null;
      status: "active" | "inactive";
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
      user_status: "active" | "inactive";
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

export function grantAdminSubscription(input: { userId: string; plan: SubscriptionPlan }) {
  return authed<{ subscription: unknown }>(`/admin/users/${input.userId}/subscription`, {
    method: "POST",
    body: JSON.stringify({ plan: input.plan })
  });
}

export function updateAdminUserStatus(input: { userId: string; status: "active" | "inactive" }) {
  return authed<{
    user: {
      id: string;
      full_name: string;
      email: string;
      status: "active" | "inactive";
    };
  }>(`/admin/users/${input.userId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status: input.status })
  });
}

export function assignOwnerGym(userId: string, gymId: string) {
  return authed<{ assigned: true }>(`/admin/owners/${userId}/gyms`, {
    method: "POST",
    body: JSON.stringify({ gymId })
  });
}

export function removeOwnerGym(userId: string, gymId: string) {
  return authed<{ assigned: false }>(`/admin/owners/${userId}/gyms/${gymId}`, { method: "DELETE" });
}

export function deleteAdminUser(userId: string) {
  return authed<{
    deleted: { id: string; full_name: string; email: string };
  }>(`/admin/users/${userId}`, { method: "DELETE" });
}

export function assignAdminClient(input: { clientId: string; trainerId: string | null }) {
  return authed<{ user: unknown }>("/admin/assign-client", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function setAdminAthleteMode(userId: string, enabled: boolean) {
  return authed<{ athleteProfile: AthleteProfile }>(`/admin/users/${userId}/athlete-mode`, {
    method: "PATCH",
    body: JSON.stringify({ enabled })
  });
}

export type AthleteProfile = {
  user_id: string;
  enabled: boolean;
  sport?: string | null;
  division?: string | null;
  competition_name?: string | null;
  competition_date?: string | null;
  coach_name?: string | null;
  goal_weight_kg?: string | number | null;
  current_weight_kg?: string | number | null;
};

export type AthleteCheckin = {
  id: string;
  checkin_date: string;
  sleep_hours: string | number;
  energy: number;
  soreness: number;
  stress: number;
  hunger: number;
  motivation: number;
  readiness_score: number;
  readiness_band: "green" | "yellow" | "red";
};

export type AthleteTarget = {
  id: string;
  target_type: string;
  target_value: number;
  completed_value: number;
  unit: string;
  notes?: string | null;
  week_start: string;
};

export type AthleteReview = {
  id: string;
  week_start: string;
  week_end: string;
  readiness_average?: string | number | null;
  compliance_percent: string | number;
  checkins_completed: number;
  summary: string;
  coach_comment?: string | null;
};

export type AthleteDashboard = {
  profile: AthleteProfile;
  countdown: { days: number; weeks: number; milestone?: string | null } | null;
  latestCheckin: AthleteCheckin | null;
  checkins: AthleteCheckin[];
  targets: AthleteTarget[];
  compliancePercent: number;
  latestReview: AthleteReview | null;
  progressPhotos: Array<{ id: string; photo_type: string; image_url?: string | null; logged_at: string }>;
};

export function getAthleteDashboard() {
  return authed<{ athlete: AthleteDashboard }>("/athlete/me");
}

export function updateAthleteProfile(input: {
  sport: string;
  division?: string | null;
  competitionName?: string | null;
  competitionDate?: string | null;
  coachName?: string | null;
  goalWeightKg?: number | null;
}) {
  return authed<{ profile: AthleteProfile }>("/athlete/me/profile", { method: "PATCH", body: JSON.stringify(input) });
}

export function saveAthleteCheckin(input: {
  sleepHours: number;
  energy: number;
  soreness: number;
  stress: number;
  hunger: number;
  motivation: number;
}) {
  return authed<{ checkin: AthleteCheckin }>("/athlete/me/checkins", { method: "POST", body: JSON.stringify(input) });
}

export function saveAthleteTargetProgress(targetId: string, completedValue: number) {
  return authed<{ progress: unknown }>(`/athlete/me/targets/${targetId}/progress`, {
    method: "PUT",
    body: JSON.stringify({ completedValue })
  });
}

export function generateAthleteWeeklyReview() {
  return authed<{ review: AthleteReview }>("/athlete/me/reviews/generate", { method: "POST" });
}

export function getTrainerAthleteDashboard(clientId: string) {
  return authed<{ athlete: AthleteDashboard }>(`/trainer/clients/${clientId}/athlete`);
}

export function createAthleteTarget(clientId: string, input: {
  targetType: string;
  targetValue: number;
  unit: string;
  notes?: string;
}) {
  return authed<{ target: AthleteTarget }>(`/trainer/clients/${clientId}/athlete/targets`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getAthleteCoachNotes(clientId: string) {
  return authed<{ notes: Array<{ id: string; body: string; author_name: string; created_at: string }> }>(
    `/trainer/clients/${clientId}/athlete/notes`
  );
}

export function createAthleteCoachNote(clientId: string, body: string) {
  return authed<{ note: { id: string; body: string; created_at: string } }>(`/trainer/clients/${clientId}/athlete/notes`, {
    method: "POST",
    body: JSON.stringify({ body })
  });
}

export function updateAthleteReviewComment(clientId: string, coachComment: string | null) {
  return authed<{ review: AthleteReview }>(`/trainer/clients/${clientId}/athlete/review`, {
    method: "PATCH",
    body: JSON.stringify({ coachComment })
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

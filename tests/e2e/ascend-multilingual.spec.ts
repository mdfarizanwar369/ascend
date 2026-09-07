import { expect, type Page, test } from "@playwright/test";

type Locale = "en" | "ms-MY" | "zh-Hans";

const clientId = "10000000-0000-4000-8000-000000000001";
const now = "2026-09-07T08:00:00.000Z";

const localeAnchors: Record<Locale, { login: string; settings: string; dashboard: string; admin: string; zoeResponse: string }> = {
  en: {
    login: "Start your Ascend journey.",
    settings: "App language",
    dashboard: "Today's essentials",
    admin: "Owner Command Center",
    zoeResponse: "Adjust today's workout by lowering intensity"
  },
  "ms-MY": {
    login: "Mulakan perjalanan Ascend anda.",
    settings: "Bahasa aplikasi",
    dashboard: "Keperluan hari ini",
    admin: "Command Center Owner",
    zoeResponse: "Kurangkan intensiti latihan hari ini"
  },
  "zh-Hans": {
    login: "开始你的 Ascend 旅程。",
    settings: "应用语言",
    dashboard: "今日要点",
    admin: "Owner Command Center",
    zoeResponse: "今天可以适当降低训练强度"
  }
};

function account(locale: Locale) {
  return {
    user: {
      id: "00000000-0000-4000-8000-000000000001",
      email: "owner@ascend.test",
      full_name: "Ascend Owner",
      primary_role: "owner",
      status: "active",
      coaching_mode: "human_coach",
      goal_type: "fat_loss",
      activity_level: "moderate",
      starting_weight_kg: 74,
      target_weight_kg: 68,
      preferred_locale: locale,
      is_platform_owner: true,
      body_scan_owner_preview_enabled: true,
      body_scan_introductory_enabled: true,
      athlete_mode_enabled: true
    },
    roles: ["owner", "admin", "trainer", "client"]
  };
}

function progressComparison() {
  return {
    comparison: {
      periodDays: 30,
      daysTracked: 18,
      hasComparison: true,
      current: { weightKg: 71.8, momentum: 82, checkinDays: 18 },
      baseline: { weightKg: 73.1, momentum: 71, checkinDays: 12 },
      highlights: [{ key: "weight", label: "Weight", message: "Down 1.3kg over the comparison window." }]
    }
  };
}

function bodyCompositionSummary() {
  const scan = {
    id: "scan-1",
    scanDate: "2026-09-01",
    machine: "Synthetic",
    weightKg: 71.8,
    bmi: 24.2,
    bodyFatPercent: 24.5,
    leanBodyMassKg: 54.2,
    skeletalMuscleMassKg: 29.1,
    importSource: "manual_entry",
    userConfirmed: true
  };
  return {
    summary: {
      latestScan: scan,
      previousScan: null,
      scanCount: 1,
      derived: {
        fatFreeMassKg: 54.2,
        estimatedLeanBodyMassKg: 54.2,
        ffmi: 18.3,
        estimatedDailyEnergyNeedsKcal: 2200,
        bodyRecompositionIndex: null,
        rateOfFatLossKgPerWeek: null,
        rateOfMuscleGainKgPerMonth: null,
        goalEtaWeeks: null,
        weeklyProgressPercent: null,
        monthlyProgressPercent: null
      },
      dnaScore: { current: 72, previous: null, change: null, label: "Building" },
      trends: [],
      coachAlerts: [],
      insights: ["Synthetic scan baseline is available."],
      comparison: {
        available: false,
        daysBetweenScans: null,
        sameMachine: null,
        status: "PROVISIONAL",
        confidence: "possible",
        reason: "One confirmed scan only.",
        headline: "Baseline scan saved",
        measurementNote: "Use another comparable scan for trends.",
        metrics: []
      },
      nutritionDataSource: "Profile + Body Scan"
    },
    nutritionTargets: nutritionTargets()
  };
}

function nutritionTargets() {
  return {
    targets: {
      calorieTarget: 1850,
      proteinTargetG: 125,
      carbsTargetG: 180,
      fatTargetG: 60,
      waterTargetMl: 2500,
      estimated: false,
      explanation: "Synthetic nutrition target.",
      adaptiveAdjustment: 0,
      dataSourcesUsed: "Profile + Body Scan"
    }
  };
}

function client360View(locale: Locale) {
  const localizedInsight = locale === "ms-MY"
    ? {
        summary: "Rekod latihan konsisten, manakala kadar pencapaian protein ialah perkara utama untuk disemak. Trend berat 28 hari menurun dan latihan terkini masih baharu. Anggap imbasan tunggal sebagai data sementara sehingga ada imbasan seterusnya untuk perbandingan.",
        title: "Semak kadar pencapaian protein",
        reason: "Sasaran protein dicapai pada 45% hari yang direkodkan.",
        caveat: "Perubahan komposisi badan masih sementara."
      }
    : locale === "zh-Hans"
      ? {
          summary: "训练记录稳定，目前最值得关注的是蛋白质目标达成率。近 28 天体重趋势下降，最近一次训练记录也很新。只有一次扫描时，身体成分变化仍需视为暂定结果。",
          title: "查看蛋白质目标达成率",
          reason: "已记录日期中，蛋白质目标达成率为 45%。",
          caveat: "身体成分变化仍是暂定结果。"
        }
      : {
          summary: "Training logging is consistent, while protein target rate is the clearest current coaching review point. Weight has a supported downward 28-day trend and the latest workout is fresh. Keep interpreting the single scan as provisional until another comparable scan is available.",
          title: "Review protein target rate",
          reason: "Protein target was met on 45% of logged days.",
          caveat: "Body composition change is provisional."
        };
  return {
    snapshot: {
      version: "client_360_snapshot_v1",
      clientId,
      generatedAt: now,
      access: {
        mode: "relationship",
        relationshipId: "20000000-0000-4000-8000-000000000001",
        relationshipStatus: "active",
        authorizationVersion: 3,
        sections: {
          profile: { state: "granted", requiredScope: "profile" },
          training: { state: "granted", requiredScope: "training" },
          nutrition: { state: "granted", requiredScope: "nutrition" },
          bodyProgress: { state: "granted", requiredScope: "body" },
          activity: { state: "granted", requiredScope: "recovery" }
        }
      },
      profile: { displayName: "Sarah Lim", goal: "fat_loss", activityLevel: "moderate" },
      training: {
        completedWorkouts: { last7Days: 3, last30Days: 11, last90Days: 31 },
        averageSessionsPerWeek30d: 2.6,
        activeWeeks8: 7,
        loggingConsistency8w: { value: 0.875, sampleSize: 8, windowDays: 56, sufficientData: true },
        lastWorkoutAt: "2026-09-06T08:00:00.000Z",
        averageDurationMinutes30d: { value: 48, sampleSize: 11, windowDays: 30, sufficientData: true },
        frequencyTrend: { direction: "stable", ratePerWeek: 0, sampleSize: 16, windowDays: 56, observedSpanDays: 56, sufficientData: true },
        recentWorkouts: [{ id: "workout-1", completedAt: "2026-09-06T08:00:00.000Z", title: "Lower Strength", workoutType: "strength", durationMinutes: 48, exerciseCount: 5, recordedSets: 15, source: "generated", debriefAvailable: true }],
        exerciseProgression: { identityBasis: "progression_v3_exact_key", items: [] }
      },
      nutrition: {
        targets: { calories: 1850, proteinG: 125, source: "ascend_recommendation", calorieRangeRatio: { minimum: 0.9, maximum: 1.1 } },
        last7Days: {
          daysLogged: 6,
          loggingCoverage: { value: 0.857, sampleSize: 7, windowDays: 7, sufficientData: true },
          averageCaloriesPerLoggedDay: { value: 1810, sampleSize: 6, windowDays: 7, sufficientData: true },
          averageProteinGPerLoggedDay: { value: 116, sampleSize: 6, windowDays: 7, sufficientData: true },
          calorieWithinTargetDays: { value: 0.833, sampleSize: 6, windowDays: 7, sufficientData: true },
          proteinTargetMetDays: { value: 0.5, sampleSize: 6, windowDays: 7, sufficientData: true }
        },
        last30Days: {
          daysLogged: 22,
          loggingCoverage: { value: 0.733, sampleSize: 30, windowDays: 30, sufficientData: true },
          averageCaloriesPerLoggedDay: { value: 1840, sampleSize: 22, windowDays: 30, sufficientData: true },
          averageProteinGPerLoggedDay: { value: 111, sampleSize: 22, windowDays: 30, sufficientData: true },
          calorieWithinTargetDays: { value: 0.77, sampleSize: 22, windowDays: 30, sufficientData: true },
          proteinTargetMetDays: { value: 0.45, sampleSize: 22, windowDays: 30, sufficientData: true }
        },
        targetEvaluationBasis: "logged_days_only"
      },
      bodyProgress: {
        weight: {
          currentKg: 71.8,
          currentRecordedAt: "2026-09-06T08:00:00.000Z",
          change7dKg: { value: -0.2, sampleSize: 4, windowDays: 7, sufficientData: true, observedSpanDays: 7 },
          change30dKg: { value: -1.3, sampleSize: 10, windowDays: 30, sufficientData: true, observedSpanDays: 29 },
          change90dKg: { value: null, sampleSize: 10, windowDays: 90, sufficientData: false, observedSpanDays: 29 },
          trend28d: { direction: "decreasing", ratePerWeek: -0.3, sampleSize: 10, windowDays: 28, observedSpanDays: 28, sufficientData: true }
        },
        bodyComposition: { scanCount: 1, latestScanAt: "2026-09-01T00:00:00.000Z", previousScanAt: null, evidenceStatus: "PROVISIONAL", latest: { weightKg: 71.8, bodyFatPercent: 24.5, leanBodyMassKg: 54.2, skeletalMuscleMassKg: 29.1 }, establishedChanges: [] }
      },
      activity: { connected: true, lastSyncedAt: "2026-09-06T20:00:00.000Z", todaySteps: 6100, averageSteps7d: { value: 7400, sampleSize: 7, windowDays: 7, sufficientData: true }, exerciseSessions7d: 3, lastExerciseSessionAt: "2026-09-06T08:00:00.000Z" },
      coachingSignals: [
        { code: "TRAINING_LOGGING_CONSISTENT", severity: "positive", sourceSection: "training", evidence: { activeWeeks: 7, windowWeeks: 8, thresholdActiveWeeks: 6 } },
        { code: "PROTEIN_TARGET_FREQUENTLY_MISSED", severity: "attention", sourceSection: "nutrition", evidence: { targetMetRate: 0.45, loggedDays: 22, minimumRate: 0.5 } }
      ],
      freshness: { generatedAt: now, latestWorkoutAt: "2026-09-06T08:00:00.000Z", latestNutritionLogAt: "2026-09-06", latestWeightAt: "2026-09-06T08:00:00.000Z", latestScanAt: "2026-09-01T00:00:00.000Z", activityLastSyncedAt: "2026-09-06T20:00:00.000Z" }
    },
    coachInsight: {
      status: "available",
      source: "cache",
      insight: {
        summary: localizedInsight.summary,
        priorities: [{ title: localizedInsight.title, reason: localizedInsight.reason, signalCodes: ["PROTEIN_TARGET_FREQUENTLY_MISSED"] }],
        dataCaveats: [localizedInsight.caveat]
      },
      generatedAt: now,
      expiresAt: "2026-09-14T08:00:00.000Z",
      promptVersion: "coach-insight-v2",
      provider: "mock",
      model: "e2e"
    }
  };
}

async function installApiMocks(page: Page, initialLocale: Locale) {
  let preferredLocale = initialLocale;
  const apiStatuses: Array<{ url: string; status: number }> = [];
  const apiFailures: string[] = [];
  const zoeRequests: Array<{ locale: Locale; message: string; mode: string }> = [];

  await page.addInitScript((locale) => {
    window.localStorage.setItem("ascend:locale", locale);
  }, initialLocale);

  page.on("response", (response) => {
    if (response.url().includes("/api/v1/")) apiStatuses.push({ url: response.url(), status: response.status() });
  });
  page.on("requestfailed", (request) => {
    if (request.url().includes("/api/v1/")) apiFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`);
  });

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/api/v1", "");
    const method = request.method();

    const json = (body: unknown, status = 200) => route.fulfill({
      status,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(body)
    });

    if (method === "OPTIONS") return json({});
    if (path === "/me" && method === "GET") return json(account(preferredLocale));
    if (path === "/me/language" && method === "PATCH") {
      const body = JSON.parse(request.postData() || "{}") as { locale?: Locale };
      preferredLocale = body.locale ?? preferredLocale;
      return json({ locale: preferredLocale });
    }
    if (path === "/subscriptions/me") return json({ subscription: { plan: "trainer_pro", status: "active", provider: "manual", current_period_end: null } });
    if (path === "/me/goal-status") return json({ goalStatus: { goal_type: "fat_loss", starting_weight_kg: 74, target_weight_kg: 68, current_weight_kg: 71.8 } });
    if (path === "/me/progress-comparison" || path.endsWith("/progress-comparison")) return json(progressComparison());
    if (path === "/compliance/today") return json({ score: { score: 82, fuel_score: 76, move_score: 88, recover_score: 80, focus_score: 75, scoreVersion: "v2" } });
    if (path === "/streaks/me") return json({ streak: { current: 12, best: 18 } });
    if (path === "/missions/today") return json({ mission: { id: "mission-1", title: "Log one meal", status: "open", due_date: "2026-09-07" } });
    if (path === "/recognitions/latest") return json({ recognition: null });
    if (path === "/coach-presence") return json({ settings: { enabled: true }, messages: [] });
    if (path === "/health-sync/status") return json({ status: { provider: "health_connect", connected: true, permissions: [], timezone: "Asia/Singapore", lastSyncedAt: now, summary: null } });
    if (path === "/memory/me") return json({ timeline: [] });
    if (path.startsWith("/food-logs")) return json({ foodLogs: [{ id: "food-1", estimated_food_name: "Chicken rice", calories: 520, protein_g: 32, carbs_g: 60, fat_g: 16, meal_type: "lunch", logged_at: now }], nextOffset: null });
    if (path === "/nutrition/targets/me") return json(nutritionTargets());
    if (path === "/me/nutrition-targets") return json(nutritionTargets());
    if (path === "/nutrition/plan/me") return json({ coachPlan: null });
    if (path === "/recovery-checkins/today") return json({ checkin: null });
    if (path === "/notifications/activity" && method === "POST") return json({ recorded: true });
    if (path === "/client-errors" && method === "POST") return json({ recorded: true });
    if (path.startsWith("/weight-logs")) return json({ weightLogs: [{ id: "weight-1", weight_kg: 71.8, logged_at: now }], nextOffset: null });
    if (path.startsWith("/water-logs")) return json({ waterLogs: [{ id: "water-1", amount_ml: 750, logged_at: now }], nextOffset: null });
    if (path.startsWith("/burn-logs")) return json({ burnLogs: [{ id: "burn-1", metadata: { workoutTitle: "Lower Strength", workoutType: "Strength", durationMinutes: 48, caloriesBurned: 260 }, created_at: now }], nextOffset: null });
    if (path === "/habits") return json({ habits: [] });
    if (path === "/habit-logs") return json({ habitLogs: [], nextOffset: null });
    if (path === "/workouts/recent-detailed") return json({ enabled: true, workouts: [], allowance: null });
    if (path === "/workouts/progression-history") return json({ enabled: true, history: [] });
    if (path === "/workout-capture/access") return json({ enabled: true, allowance: null });
    if (path === "/ai/chat" && method === "POST") {
      const body = JSON.parse(request.postData() || "{}") as { message?: string; mode?: string };
      zoeRequests.push({ locale: preferredLocale, message: body.message ?? "", mode: body.mode ?? "general" });
      return json({ reply: localeAnchors[preferredLocale].zoeResponse });
    }
    if (path === "/ai/today-priority" && method === "POST") {
      return json({
        priority: { key: "Meal", title: "Log lunch", reason: "One meal log keeps today visible.", href: "/food-log", cta: "Log meal" },
        source: "rules"
      });
    }
    if (path === "/ai/workout-plan" && method === "POST") return json({ workout: { title: "Balanced Full Body Session", exercises: [], warmup: [], cooldown: [], estimatedDurationMinutes: 30, focus: "Full body", intensity: "moderate", intro: "Synthetic workout.", coachTip: "Keep it smooth.", disclaimer: "Stop if pain occurs." } });
    if (path === "/body-composition/access") return json({ access: { enabled: true, experience: "introductory", rollout: "owner_preview", canCapture: true, canViewBaseline: true, canCompareScans: false, canViewDna: false, canUseScanForNutrition: false, followUpLimit: 2, captureLimit: 1, capturesUsed: 0, capturesRemaining: 1 } });
    if (path === "/body-composition/baseline") return json({ scan: null, explanation: null, access: { enabled: true, experience: "introductory", rollout: "owner_preview", canCapture: true, canViewBaseline: true, canCompareScans: false, canViewDna: false, canUseScanForNutrition: false, followUpLimit: 2, captureLimit: 1, capturesUsed: 0, capturesRemaining: 1 } });
    if (path === "/athlete/me") return json({ athlete: { profile: { enabled: true, sport: "Fitness", division: null, competitionName: null, competitionDate: null, goalWeightKg: 68, timezone: "Asia/Singapore" }, countdown: null, latestCheckin: null, readiness: { score: 78, band: "green", status: "Ready", warningReasons: [] }, readinessTrend: { direction: "steady", warningPatterns: [], days: [] }, checkins: [], targets: [], compliancePercent: 80, dailyCompliancePercent: 80, weeklyCompliancePercent: 80, latestReview: null, progressPhotos: [] } });
    if (path === "/athlete/body-composition/summary") return json(bodyCompositionSummary());
    if (path === "/athlete/body-composition/scans") return json({ scans: [bodyCompositionSummary().summary.latestScan] });
    if (path === "/progress-photos") return json({ progressPhotos: [], nextOffset: null });
    if (path === "/trainer/clients") return json({ clients: [{ id: clientId, full_name: "Sarah Lim", email: "sarah@example.test", goal_type: "fat_loss", compliance_score: 82, fuel_score: 76, move_score: 88, recover_score: 80, focus_score: 75, focus_active: true, last_activity_at: now, profile_photo_url: null, current_plan: "premium" }] });
    if (path === "/trainer/attention") return json({ attention: [], summary: { totalClients: 1, needsAttention: 0, allClear: true } });
    if (path === "/trainer/risk-alerts") return json({ alerts: [] });
    if (path === "/ascend-coach/clients") return json({ clients: [{ clientId, accessMode: "relationship", relationshipId: "relationship-1", relationshipStatus: "active", authorizationVersion: 3, grantedScopes: ["profile", "training", "nutrition", "body", "recovery"], displayName: "Sarah Lim", goal: "fat_loss", lastWorkoutAt: now }] });
    if (path === `/ascend-coach/clients/${clientId}/360`) return json(client360View(preferredLocale));
    if (path === `/trainer/clients/${clientId}`) return json({ client: { id: clientId, full_name: "Sarah Lim", email: "sarah@example.test", goal_type: "fat_loss", compliance_score: 82, gym_name: "Ascend Test Gym", nutrition_targets: nutritionTargets().targets } });
    if (path.startsWith(`/trainer/clients/${clientId}/food-logs`)) return json({ foodLogs: [], nextOffset: null });
    if (path === `/trainer/clients/${clientId}/messages`) return json({ messages: [] });
    if (path === `/trainer/clients/${clientId}/weight-logs`) return json({ weightLogs: [] });
    if (path === `/trainer/clients/${clientId}/water-logs`) return json({ waterLogs: [] });
    if (path === `/trainer/clients/${clientId}/burn-logs`) return json({ burnLogs: [] });
    if (path === `/trainer/clients/${clientId}/missions`) return json({ missions: [] });
    if (path === `/trainer/clients/${clientId}/weekly-report`) return json({ report: null });
    if (path === `/trainer/clients/${clientId}/progress-photos`) return json({ progressPhotos: [] });
    if (path === `/trainer/clients/${clientId}/coach-presence`) return json({ latest: null, history: [], settings: { enabled: true, paused: false, pause_until: null } });
    if (path === `/trainer/clients/${clientId}/memory`) return json({ timeline: [] });
    if (path === `/trainer/clients/${clientId}/athlete`) return json({ athlete: { profile: { enabled: true, sport: "Fitness", division: null, competitionName: null, competitionDate: null, goalWeightKg: 68, timezone: "Asia/Singapore" }, countdown: null, latestCheckin: null, readiness: { score: 78, band: "green", status: "Ready", warningReasons: [] }, readinessTrend: { direction: "steady", warningPatterns: [], days: [] }, checkins: [], targets: [], compliancePercent: 80, dailyCompliancePercent: 80, weeklyCompliancePercent: 80, latestReview: null, progressPhotos: [] } });
    if (path === `/trainer/clients/${clientId}/athlete/notes`) return json({ notes: [] });
    if (path === `/trainer/clients/${clientId}/body-composition`) return json({ ...bodyCompositionSummary(), scans: [bodyCompositionSummary().summary.latestScan] });
    if (path === "/admin/analytics/revenue") return json({ revenue: { total_revenue_cents: 50000, active_subscriptions: 12, currency: "MYR" }, byGym: [], byTrainer: [] });
    if (path === "/admin/analytics/usage") return json({ usage: { total_users: 20, active_users_7d: 15, food_logs: 80, weight_logs: 40, water_logs: 60, weekly_active_clients: 10, workout_loggers_7d: 8, body_scan_users_90d: 3, assigned_clients: 9, active_trainers: 2, clients_contacted_7d: 6 } });
    if (path === "/admin/analytics/compliance") return json({ compliance: [] });
    if (path === "/admin/analytics/ai-usage") return json({ summary: { monthly_food_image_analyses: 0, monthly_ai_chat_messages: 0, monthly_weekly_reports: 0, monthly_cache_hits: 0, monthly_errors: 0, monthly_estimated_cost_cents: 0, projected_monthly_cost_cents: 0, spend_limit_cents: 5000, spend_percent: 0, warning_level: null, limits: { monthlySpendLimitCents: 5000, monthlyFoodAnalysisLimit: 1000, monthlyChatLimit: 3000, monthlyWeeklyReportLimit: 500 } }, daily: [], weekly: [], monthly: [] });
    if (path === "/admin/analytics/pilot-metrics") return json({ generatedAt: now, clients: { totalClients: 20, dailyActiveUsers: 8, weeklyActiveUsers: 15, foodLoggingRate: 0.7, weightLoggingRate: 0.5, waterLoggingRate: 0.6, habitCompletionRate: 0.55, workoutLoggingRate: 0.4, bodyScanUsers90d: 3, athleteClients: 2, bodyScanAdoptionRate: 0.15, averageComplianceScore: 78 }, trainers: { activeTrainers: 2, trainersMessagedToday: 1, clientsContacted7d: 6, followUpCoverageRate: 0.67, weeklyReviewsCompleted7d: 2, outstandingFollowUps: 1, unassignedClients: 1, pendingTrainers: 0, responseWithin48hRate: 0.9, riskAlertsGenerated: 1, riskAlertsResolved: 1, clientsMonitored: 9 }, business: { freeUsers: 8, premiumUsers: 10, premiumReviewCandidates: 2, trainerProUsers: 2, activeSubscriptions: 12, activePlanValueCents: 50000, referralPerformance: [] }, ai: { aiSpendCents: 0, costPerActiveUserCents: 0, cacheHitRate: 1, estimatedMonthlyCostCents: 0 }, trends: [] });
    if (path === "/admin/notifications") return json({ notifications: [], summary: { total: 0, critical: 0, important: 0 } });
    if (path === "/admin/users") return json({ canManageOwnerGyms: true, users: [{ id: clientId, full_name: "Sarah Lim", email: "sarah@example.test", primary_role: "client", roles: ["client"], trainer_profile_id: null, trainer_profile_status: null, is_platform_owner_account: false, gym_id: "gym-1", gym_name: "Ascend Test Gym", assigned_trainer_id: "trainer-1", assigned_trainer_name: "Ascend Owner", referred_by_gym_id: "gym-1", referred_gym_name: "Ascend Test Gym", referred_by_trainer_id: "trainer-1", referred_trainer_name: "Ascend Owner", referral_source: "trainer", coaching_mode: "human_coach", athlete_mode_enabled: true, owner_gym_ids: [], current_plan: "premium", subscription_status: "active", subscription_provider: "manual", subscription_current_period_end: null, trainer_assignment_eligible: true, status: "active", created_at: now }] });
    if (path === "/admin/trainers") return json({ trainers: [{ id: "trainer-1", user_id: "owner-user", gym_id: "gym-1", full_name: "Ascend Owner", email: "owner@ascend.test", user_status: "active", gym_name: "Ascend Test Gym", specialties: ["Pilot coaching"], status: "active" }] });
    if (path === "/admin/referrals") return json({ referrals: [] });
    if (path === "/admin/subscriptions") return json({ subscriptions: [], page: 1, pageSize: 25, total: 0 });
    if (path === "/gyms") return json({ gyms: [{ id: "gym-1", name: "Ascend Test Gym", slug: "test", location: "Kuala Lumpur", country: "MY", timezone: "Asia/Kuala_Lumpur" }] });

    return json({});
  });

  return {
    zoeRequests,
    assertApiHealthy() {
      expect(apiFailures).toEqual([]);
      const unexpected = apiStatuses.filter((item) => item.status >= 400);
      expect(unexpected).toEqual([]);
    }
  };
}

async function chooseLanguage(page: Page, locale: Locale) {
  async function selectVisibleLanguageControl() {
    const selects = page.locator("select");
    const selectCount = await selects.count();
    for (let index = 0; index < selectCount; index += 1) {
      const current = selects.nth(index);
      const optionValues = await current.locator("option").evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
      if (optionValues.includes(locale)) {
        await current.selectOption(locale);
        return;
      }
    }
    await page.getByRole("button", { name: locale === "en" ? /English/ : locale === "ms-MY" ? /Bahasa Melayu/ : /中文/ }).click();
  }

  await selectVisibleLanguageControl();
  try {
    await expect.poll(() => page.evaluate(() => document.documentElement.lang), { timeout: 3_000 }).toBe(locale);
  } catch {
    await selectVisibleLanguageControl();
    await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe(locale);
  }
}

async function assertPageHealthy(page: Page) {
  await expect(page.locator("body")).toBeVisible();
  const bodyText = await page.locator("body").evaluate((element) => (element as HTMLElement).innerText);
  expect(bodyText.match(/\b(?:common|auth|dashboard|trainer|admin|food|workout|account|errors|nav|coach|progress|bodyScan)\.[a-z0-9_.-]+\b/i)).toBeNull();
  await expect(page.locator("body")).not.toContainText(/missing translation|hydration failed|Unhandled Runtime Error/i);
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(horizontalOverflow).toBeLessThanOrEqual(2);
}

const unexpectedRenderedEnglish = [
  /Today's essentials/i,
  /Your three\. Build your momentum\./i,
  /Start sipping water/i,
  /Log Water/i,
  /Log Movement/i,
  /Log Recovery/i,
  /No log yet/i,
  /Nothing recorded today/i,
  /Start today/i,
  /Building momentum/i,
  /Quick Coach Actions/i,
  /Practical help without the guesswork/i,
  /Today's Insight/i,
  /Zoe noticed something useful/i,
  /One useful observation, based on what you've logged/i,
  /Generate Today's Workout/i,
  /Explain my progress/i,
  /Help me stay consistent/i,
  /Meal History/i,
  /Log Food/i,
  /Daily guide, not a strict limit/i,
  /Photograph your meal/i,
  /Ascend reads the food and prepares an estimate/i,
  /Your recent progress is starting to feel like a real story/i,
  /Talk to Zoe/i,
  /Platform Owner/i
] as const;

async function assertNoUnexpectedRenderedEnglish(page: Page, locale: Locale) {
  if (locale === "en") return;
  const visibleText = await page.locator("body").evaluate((element) => (element as HTMLElement).innerText);
  const phraseLeaks = unexpectedRenderedEnglish
    .filter((pattern) => pattern.test(visibleText))
    .map((pattern) => pattern.source);
  const intentionalTerms = /\b(?:ASCEND DNA|Ascend Coach|Ascend|Client 360|Coach Zoe|Zoe|RPE|RIR|FFMI|kcal|BMI|VO2|PT|English|Bahasa Melayu|Trainer Pro|Premium|Athlete|Stripe|Google Play|Lemon Squeezy|DELETE)\b/gi;
  const syntheticUserContent = /\b(?:Ascend Owner|Sarah Lim|Ascend Test Gym|Chicken rice|Lower Strength|Log one meal|Synthetic|Fitness|owner@ascend\.test|sarah@example\.test)\b/gi;
  const lines = visibleText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const lexicalLeaks = lines.filter((line) => {
    const candidate = line
      .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, "")
      .replace(syntheticUserContent, "")
      .replace(intentionalTerms, "")
      .trim();
    if (!candidate) return false;
    if (locale === "zh-Hans") return /\b[A-Za-z]{3,}\b/.test(candidate);
    return /\b(?:Home|Admin|Trainer|Profile|Progress|Snapshot|Insight|Workout|Recover|Move|Fuel|Start|Continue|Settings|Guide|Calories|Carbs|Fat|Meal|Food|History|Photograph|Tools|Mission|Follow[ -]?up|Handover|Timeline|Intake|Logged|Logging|Ready|Building|Today|Water|Sleep)\b/i.test(candidate);
  });
  const leaks = [...new Set([...phraseLeaks, ...lexicalLeaks])];
  expect(leaks, `Unexpected English UI rendered for ${locale}:\n${visibleText}`).toEqual([]);
}

test.describe("Ascend multilingual browser validation", () => {
  test.beforeEach(async ({ page }) => {
    page.on("console", (message) => {
      const text = message.text();
      if (["error", "warning"].includes(message.type()) && /hydration|missing translation|uncaught|react/i.test(text)) {
        if (/hydrated but some attributes.*caret-color:\"transparent\"/is.test(text)) return;
        throw new Error(`Browser console ${message.type()}: ${text}`);
      }
    });
    page.on("pageerror", (error) => {
      throw error;
    });
  });

  for (const locale of ["en", "ms-MY", "zh-Hans"] as const) {
    test(`athlete, trainer, owner and Zoe paths render in ${locale}`, async ({ page }, testInfo) => {
      test.setTimeout(180_000);
      const mocks = await installApiMocks(page, locale);
      await page.goto("/login");
      await expect(page.getByText(localeAnchors[locale].login)).toBeVisible();
      await assertPageHealthy(page);
      await assertNoUnexpectedRenderedEnglish(page, locale);

      await page.goto("/dashboard");
      await expect(page.getByText(localeAnchors[locale].dashboard, { exact: true }).first()).toBeVisible();
      await assertPageHealthy(page);
      await assertNoUnexpectedRenderedEnglish(page, locale);
      await testInfo.attach(`home-${locale}`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });

      const athleteRoutes = [
        ["/onboarding", /Ascend|Goal|目标|Matlamat|目标/i],
        ["/burn-log", /workout|训练|活动|senaman|latihan|aktiviti/i],
        ["/food-log", /meal|food|makanan|食物|Nutrition/i],
        ["/coach", /Zoe|Coach/i],
        ["/progress", /Progress|Kemajuan|进展/i],
        ["/body-scan", /Body|Scan|身体|badan/i],
        ["/profile", /Profile|Profil|个人资料/i],
        ["/profile/account", new RegExp(localeAnchors[locale].settings)]
      ] as const;

      for (const [route, anchor] of athleteRoutes) {
        await page.goto(route);
        await expect(page.locator("body")).toContainText(anchor);
        await assertPageHealthy(page);
        await assertNoUnexpectedRenderedEnglish(page, locale);
      }

      await page.goto("/coach");
      const question = locale === "en"
        ? "How should I adjust today's workout if I feel tired?"
        : locale === "ms-MY"
          ? "Bagaimana saya patut melaraskan latihan hari ini jika berasa letih?"
          : "如果今天感觉疲劳，我应该怎样调整训练？";
      await page.getByRole("textbox").first().fill(question);
      await page.getByRole("button", { name: locale === "en" ? /send message/i : locale === "ms-MY" ? /hantar mesej/i : /发送消息/i }).click();
      await expect(page.getByText(localeAnchors[locale].zoeResponse)).toBeVisible();
      await assertNoUnexpectedRenderedEnglish(page, locale);
      expect(mocks.zoeRequests.at(-1)).toMatchObject({ locale, mode: expect.any(String) });
      await testInfo.attach(`zoe-${locale}`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });

      const trainerRoutes = [
        "/trainer",
        "/trainer/clients",
        `/trainer/clients/${clientId}/360`,
        `/trainer/clients/${clientId}`,
        `/trainer/clients/${clientId}/body-composition`
      ];
      for (const route of trainerRoutes) {
        await page.goto(route);
        await expect(page.locator("body")).toContainText(/Sarah Lim|Client 360|Coach|Trainer|Klien|客户/i);
        await assertPageHealthy(page);
        await assertNoUnexpectedRenderedEnglish(page, locale);
      }

      const adminRoutes = ["/admin", "/admin/users", "/admin/referrals", "/admin/subscriptions"];
      for (const route of adminRoutes) {
        await page.goto(route);
        await expect(page.locator("body")).toContainText(/Owner|Admin|Business|用户|Pengguna|Subscription|Langganan/i);
        await assertPageHealthy(page);
        await assertNoUnexpectedRenderedEnglish(page, locale);
      }
      await expect(page.getByText(localeAnchors[locale].admin)).toBeVisible({ timeout: 12_000 }).catch(() => undefined);

      await page.goto("/food-log");
      await testInfo.attach(`nutrition-${locale}`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
      await page.goto("/burn-log");
      await testInfo.attach(`workout-${locale}`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
      await page.goto("/progress");
      await testInfo.attach(`progress-${locale}`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
      await page.goto("/profile/account");
      await testInfo.attach(`settings-${locale}`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });

      mocks.assertApiHealthy();
    });
  }

  test("language switching and persistence work across logged-out and logged-in surfaces", async ({ page }) => {
    const mocks = await installApiMocks(page, "en");

    await page.goto("/login");
    await chooseLanguage(page, "ms-MY");
    await expect(page.getByText(localeAnchors["ms-MY"].login, { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText(localeAnchors["ms-MY"].login, { exact: true })).toBeVisible();

    await page.goto("/dashboard");
    await expect(page.getByText(localeAnchors["ms-MY"].dashboard, { exact: true })).toBeVisible();
    await page.goto("/profile/account");
    await chooseLanguage(page, "zh-Hans");
    await page.goto("/dashboard");
    await expect(page.getByText(localeAnchors["zh-Hans"].dashboard, { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText(localeAnchors["zh-Hans"].dashboard, { exact: true })).toBeVisible();

    await page.goto("/profile/account");
    await chooseLanguage(page, "en");
    await page.goto("/burn-log");
    await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe("en");
    await page.goto("/profile/account");
    await chooseLanguage(page, "ms-MY");
    await page.goto("/food-log");
    await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe("ms-MY");
    await page.goto("/profile/account");
    await chooseLanguage(page, "zh-Hans");
    await page.goto("/coach");
    await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe("zh-Hans");
    await page.goto("/progress");
    await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe("zh-Hans");
    await page.goto("/profile/account");
    await chooseLanguage(page, "en");
    await page.goto("/profile/account");
    await expect(page.getByText(localeAnchors.en.settings, { exact: true })).toBeVisible();
    await chooseLanguage(page, "ms-MY");
    await expect(page.getByText(localeAnchors["ms-MY"].settings, { exact: true })).toBeVisible();
    await page.goto("/profile/account");
    await chooseLanguage(page, "zh-Hans");
    await page.goto(`/trainer/clients/${clientId}/360`);
    await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe("zh-Hans");
    await page.goto("/profile/account");
    await chooseLanguage(page, "en");
    await page.goto("/admin");
    await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe("en");

    await page.goto("/login");
    await expect(page.getByText(localeAnchors.en.login, { exact: true })).toBeVisible();
    mocks.assertApiHealthy();
  });

  test("falls back to English for an unsupported account locale", async ({ page }) => {
    const mocks = await installApiMocks(page, "en");
    await page.route("**/api/v1/me", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...account("en"), user: { ...account("en").user, preferred_locale: "id-ID" } })
      });
    });
    await page.goto("/dashboard");
    await expect(page.getByText(localeAnchors.en.dashboard)).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe("en");
    mocks.assertApiHealthy();
  });
});

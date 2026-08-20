import { WorkoutMemorySummary } from "./workoutMemoryService";
import { localDateKeyAtOffset } from "./memberTimeService";

type CoachAccessInput = {
  tier: string;
  premiumDepth: boolean;
};

type ProfileRow = {
  goal_type?: unknown;
  starting_weight_kg?: unknown;
  target_weight_kg?: unknown;
  activity_level?: unknown;
  age_years?: unknown;
  gender?: unknown;
  height_cm?: unknown;
};

type FoodConsistencyRow = {
  logs_7d?: unknown;
  food_days_7d?: unknown;
  avg_protein_g?: unknown;
  latest_food_at?: unknown;
};

type RecentWorkoutRow = {
  metadata?: Record<string, unknown> | null;
  created_at?: string | Date | null;
};

type AthleteModeRow = {
  enabled?: unknown;
  sport?: unknown;
  division?: unknown;
  competition_name?: unknown;
  competition_date?: unknown;
  goal_weight_kg?: unknown;
};

type BodyScanRow = {
  scan_date?: unknown;
  weight_kg?: unknown;
  body_fat_percent?: unknown;
  skeletal_muscle_mass_kg?: unknown;
  visceral_fat?: unknown;
  bmr_kcal?: unknown;
};

type RecentMessageRow = {
  role?: unknown;
  message?: unknown;
};

type HealthSyncSummaryInput = {
  todaySteps: number | null;
  averageSteps7d: number | null;
  todayActiveCalories: number | null;
  workoutsThisWeek: number | null;
  workoutCompletedToday: boolean;
  lastSyncedAt: string | null;
} | null;

type WorkoutRequestInput = {
  location: string;
  timeAvailable: string;
  goal: string;
  equipment: string;
};

type BuildWorkoutPlannerContextInput = {
  coachAccess: CoachAccessInput;
  profile: ProfileRow | null | undefined;
  latestWeightKg: number | null;
  recentFoodConsistency: FoodConsistencyRow | null | undefined;
  recentWorkouts: RecentWorkoutRow[];
  workoutMemory: WorkoutMemorySummary;
  athleteMode: AthleteModeRow | null | undefined;
  latestBodyScan: BodyScanRow | null | undefined;
  recentCoachZoeContext: RecentMessageRow[];
  healthSync: HealthSyncSummaryInput;
  request: WorkoutRequestInput;
  timezoneOffsetMinutes?: number;
};

function asNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function summarizeRecentWorkouts(rows: RecentWorkoutRow[]) {
  return rows
    .map((row) => {
      const metadata = (row.metadata ?? {}) as Record<string, unknown>;
      return {
        title:
          asText(metadata.workoutTitle) ??
          asText(metadata.activityType) ??
          asText(metadata.workoutType) ??
          "Workout",
        workoutType: asText(metadata.workoutType) ?? asText(metadata.activityType) ?? "Workout",
        durationMinutes: asNumber(metadata.durationMinutes),
        estimatedCaloriesBurned: asNumber(metadata.estimatedCaloriesBurned ?? metadata.caloriesBurned),
        difficulty: asText(metadata.workoutDifficultyLabel ?? metadata.workoutDifficulty),
        completedAt: row.created_at ? new Date(row.created_at).toISOString() : null
      };
    })
    .slice(0, 5);
}

function buildCoachingProfiles(input: {
  ageYears: number | null;
  currentWeightKg: number | null;
  bmiEstimate: number | null;
  activityLevel: string | null;
  recentWorkoutCount: number;
  athleteModeEnabled: boolean;
  healthSyncWorkoutsThisWeek: number | null;
}) {
  const conservativeSignal =
    (input.ageYears !== null && input.ageYears >= 55) ||
    (input.currentWeightKg !== null && input.currentWeightKg >= 100) ||
    (input.bmiEstimate !== null && input.bmiEstimate >= 32) ||
    input.activityLevel === "low" ||
    input.recentWorkoutCount === 0;
  const progressiveSignal =
    input.athleteModeEnabled ||
    input.activityLevel === "high" ||
    input.recentWorkoutCount >= 4 ||
    (input.healthSyncWorkoutsThisWeek ?? 0) >= 4;

  return {
    volumeProfile: conservativeSignal ? "conservative" : progressiveSignal ? "progressive" : "standard",
    impactProfile: conservativeSignal ? "lower_impact" : progressiveSignal ? "can_include_higher_impact_if_form_allows" : "mixed_impact",
    restProfile: conservativeSignal ? "longer_rest_60_to_90_seconds" : progressiveSignal ? "moderate_rest_30_to_60_seconds" : "standard_rest_45_to_75_seconds",
    intensityGuide: conservativeSignal ? "easy_to_moderate" : progressiveSignal ? "moderate_to_challenging" : "moderate"
  };
}

export function buildWorkoutPlannerContext(input: BuildWorkoutPlannerContextInput) {
  const profile = input.profile ?? {};
  const latestBodyScan = input.latestBodyScan ?? {};
  const athleteMode = input.athleteMode ?? {};
  const currentWeightKg = input.latestWeightKg ?? asNumber(latestBodyScan.weight_kg) ?? asNumber(profile.starting_weight_kg);
  const heightCm = asNumber(profile.height_cm);
  const bmiEstimate = currentWeightKg && heightCm ? round(currentWeightKg / ((heightCm / 100) ** 2), 1) : null;
  const ageYears = asNumber(profile.age_years);
  const activityLevel = asText(profile.activity_level);
  const sex = asText(profile.gender);
  const goalType = asText(profile.goal_type);
  const recentWorkoutHistory = summarizeRecentWorkouts(input.recentWorkouts);
  const recentWorkoutDays = new Set(
    recentWorkoutHistory
      .map((row) => row.completedAt ? localDateKeyAtOffset(row.completedAt, input.timezoneOffsetMinutes) : "")
      .filter(Boolean)
  ).size;
  const athleteModeEnabled = athleteMode.enabled === true;
  const missingProfileFields = [
    ageYears === null ? "ageYears" : null,
    sex === null ? "sex" : null,
    currentWeightKg === null ? "weightKg" : null,
    heightCm === null ? "heightCm" : null,
    goalType === null ? "goalType" : null,
    activityLevel === null ? "activityLevel" : null
  ].filter((field): field is string => Boolean(field));
  const explicitFitnessLevel = null;
  const limitations = null;
  const coachingProfiles = buildCoachingProfiles({
    ageYears,
    currentWeightKg,
    bmiEstimate,
    activityLevel,
    recentWorkoutCount: recentWorkoutHistory.length,
    athleteModeEnabled,
    healthSyncWorkoutsThisWeek: input.healthSync?.workoutsThisWeek ?? null
  });

  return {
    coachAccess: {
      tier: input.coachAccess.tier,
      analysisDepth: input.coachAccess.premiumDepth ? "complete_journey" : "recent_history_only"
    },
    workoutRequest: {
      location: input.request.location,
      timeAvailableMinutes: Number.parseInt(input.request.timeAvailable, 10) || 30,
      goal: input.request.goal,
      availableEquipment: input.request.equipment
    },
    profile: {
      ageYears,
      sex,
      currentWeightKg,
      heightCm,
      bmiEstimate,
      goalType,
      startingWeightKg: asNumber(profile.starting_weight_kg),
      targetWeightKg: asNumber(profile.target_weight_kg),
      activityLevel,
      explicitFitnessLevel,
      injuriesOrLimitations: limitations,
      missingFields: missingProfileFields
    },
    personalization: {
      useBeginnerFriendlyDefaults: missingProfileFields.length > 0 || explicitFitnessLevel === null,
      profileCompleteness: missingProfileFields.length === 0 ? "complete" : "partial",
      profileNote:
        missingProfileFields.length > 0
          ? "Some profile details are missing. Keep the workout beginner-friendly, lower impact where appropriate, and mention that better profile details will improve future workouts."
          : "Profile details are available. Personalize exercise selection, volume, intensity, rest, and impact level to this member.",
      explicitFitnessLevel,
      injuriesOrLimitations: limitations,
      coachingProfiles
    },
    recentFoodConsistency: {
      logs7d: asNumber(input.recentFoodConsistency?.logs_7d) ?? 0,
      foodDays7d: asNumber(input.recentFoodConsistency?.food_days_7d) ?? 0,
      averageProteinG: asNumber(input.recentFoodConsistency?.avg_protein_g) ?? 0,
      latestFoodAt: input.recentFoodConsistency?.latest_food_at ?? null
    },
    recentActivity: {
      recentWorkoutCount: recentWorkoutHistory.length,
      recentWorkoutDays,
      recentWorkoutHistory,
      latestWorkoutAt: recentWorkoutHistory[0]?.completedAt ?? null,
      healthSync: input.healthSync
    },
    workoutMemory: input.workoutMemory,
    athleteMode: athleteModeEnabled
      ? {
          enabled: true,
          sport: asText(athleteMode.sport),
          division: asText(athleteMode.division),
          competitionName: asText(athleteMode.competition_name),
          competitionDate: athleteMode.competition_date ?? null,
          goalWeightKg: asNumber(athleteMode.goal_weight_kg)
        }
      : null,
    latestBodyScan: latestBodyScan.scan_date
      ? {
          scanDate: latestBodyScan.scan_date,
          weightKg: asNumber(latestBodyScan.weight_kg),
          bodyFatPercent: asNumber(latestBodyScan.body_fat_percent),
          skeletalMuscleMassKg: asNumber(latestBodyScan.skeletal_muscle_mass_kg),
          visceralFat: asNumber(latestBodyScan.visceral_fat),
          bmrKcal: asNumber(latestBodyScan.bmr_kcal)
        }
      : null,
    recentCoachZoeContext: input.recentCoachZoeContext
      .map((row) => ({
        role: asText(row.role),
        message: asText(row.message)
      }))
      .filter((row) => row.role && row.message)
  };
}

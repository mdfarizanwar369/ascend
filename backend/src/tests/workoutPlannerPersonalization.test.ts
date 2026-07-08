import { describe, expect, it } from "vitest";
import { buildWorkoutMemorySummary } from "../services/workoutMemoryService";
import { buildWorkoutPlannerContext } from "../services/workoutPlannerPersonalizationService";

describe("workout planner personalization", () => {
  it("includes real profile and history signals in the workout context when available", () => {
    const recentWorkouts = [
      {
        metadata: {
          workoutTitle: "Upper Body Strength",
          workoutType: "Strength",
          durationMinutes: 48,
          estimatedCaloriesBurned: 340,
          workoutDifficultyLabel: "Challenging"
        },
        created_at: "2026-07-07T09:00:00.000Z"
      },
      {
        metadata: {
          workoutTitle: "Mobility Flow",
          workoutType: "Mobility",
          durationMinutes: 25
        },
        created_at: "2026-07-05T09:00:00.000Z"
      }
    ];

    const context = buildWorkoutPlannerContext({
      coachAccess: { tier: "premium", premiumDepth: true },
      profile: {
        goal_type: "muscle_gain",
        starting_weight_kg: 78,
        target_weight_kg: 82,
        activity_level: "high",
        age_years: 29,
        gender: "male",
        height_cm: 180
      },
      latestWeightKg: 80,
      recentFoodConsistency: {
        logs_7d: 11,
        food_days_7d: 6,
        avg_protein_g: 142,
        latest_food_at: "2026-07-07T13:00:00.000Z"
      },
      recentWorkouts,
      workoutMemory: buildWorkoutMemorySummary(recentWorkouts, { currentMomentum: 62, now: new Date("2026-07-08T09:00:00.000Z") }),
      athleteMode: {
        enabled: true,
        sport: "Hyrox",
        division: "Open",
        competition_name: "Singapore Hyrox",
        competition_date: "2026-09-14",
        goal_weight_kg: 79
      },
      latestBodyScan: {
        scan_date: "2026-07-01",
        weight_kg: 79.5,
        body_fat_percent: 14.2,
        skeletal_muscle_mass_kg: 38.4,
        visceral_fat: 6,
        bmr_kcal: 1810
      },
      recentCoachZoeContext: [
        { role: "assistant", message: "You trained hard yesterday." },
        { role: "user", message: "Keep the next one strength-focused." }
      ],
      healthSync: {
        todaySteps: 8320,
        averageSteps7d: 7450,
        todayActiveCalories: 420,
        workoutsThisWeek: 4,
        workoutCompletedToday: false,
        lastSyncedAt: "2026-07-08T08:55:00.000Z"
      },
      request: {
        location: "gym",
        timeAvailable: "45",
        goal: "strength",
        equipment: "Full Gym"
      }
    });

    expect(context.profile).toMatchObject({
      ageYears: 29,
      sex: "male",
      currentWeightKg: 80,
      heightCm: 180,
      goalType: "muscle_gain",
      activityLevel: "high",
      missingFields: []
    });
    expect(context.personalization).toMatchObject({
      profileCompleteness: "complete",
      explicitFitnessLevel: null,
      injuriesOrLimitations: null
    });
    expect(context.personalization.coachingProfiles).toMatchObject({
      volumeProfile: "progressive",
      intensityGuide: "moderate_to_challenging"
    });
    expect(context.recentActivity.recentWorkoutHistory[0]).toMatchObject({
      title: "Upper Body Strength",
      workoutType: "Strength",
      durationMinutes: 48,
      estimatedCaloriesBurned: 340
    });
    expect(context.athleteMode).toMatchObject({
      enabled: true,
      sport: "Hyrox"
    });
    expect(context.latestBodyScan).toMatchObject({
      bodyFatPercent: 14.2,
      skeletalMuscleMassKg: 38.4
    });
  });

  it("falls back to beginner-safe defaults when profile details are missing", () => {
    const context = buildWorkoutPlannerContext({
      coachAccess: { tier: "free", premiumDepth: false },
      profile: {
        goal_type: null,
        starting_weight_kg: null,
        target_weight_kg: null,
        activity_level: null,
        age_years: null,
        gender: null,
        height_cm: null
      },
      latestWeightKg: null,
      recentFoodConsistency: null,
      recentWorkouts: [],
      workoutMemory: buildWorkoutMemorySummary([], { now: new Date("2026-07-08T09:00:00.000Z") }),
      athleteMode: null,
      latestBodyScan: null,
      recentCoachZoeContext: [],
      healthSync: null,
      request: {
        location: "home",
        timeAvailable: "20",
        goal: "general_fitness",
        equipment: "Bodyweight"
      }
    });

    expect(context.profile.missingFields).toEqual(
      expect.arrayContaining(["ageYears", "sex", "weightKg", "heightCm", "goalType", "activityLevel"])
    );
    expect(context.personalization.useBeginnerFriendlyDefaults).toBe(true);
    expect(context.personalization.profileNote).toContain("better profile details will improve future workouts");
    expect(context.personalization.coachingProfiles).toMatchObject({
      volumeProfile: "conservative",
      impactProfile: "lower_impact",
      intensityGuide: "easy_to_moderate"
    });
  });
});

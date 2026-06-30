type CoachZoeGoalType = "fat_loss" | "muscle_gain" | "maintenance";

export type CoachZoeProactiveInsightKey =
  | "workout_completed"
  | "streak_milestone"
  | "recovery_day"
  | "workout_gap"
  | "protein_low"
  | "calories_high"
  | "calories_low"
  | "water_low"
  | "hydration_excellent"
  | "weight_trend_positive"
  | "weight_trend_watch"
  | "momentum_improving"
  | "activity_high"
  | "activity_low"
  | "milestone_memory"
  | "steady";

export type CoachZoeWorkoutSnapshot = {
  title?: string | null;
  type?: string | null;
  completedToday?: boolean;
  completedYesterday?: boolean;
};

export type CoachZoeHealthSyncSnapshot = {
  connected?: boolean;
  todaySteps?: number;
  averageSteps7d?: number;
  todayActiveCalories?: number;
  workoutsThisWeek?: number;
  workoutCompletedToday?: boolean;
};

export type CoachZoeProactiveInput = {
  now?: string | Date;
  goalType?: CoachZoeGoalType | null;
  currentStreak?: number | null;
  momentumScore?: number | null;
  previousMomentumScore?: number | null;
  todaysFoodCount: number;
  caloriesToday: number;
  calorieTarget: number;
  proteinTodayG: number;
  proteinTargetG: number;
  waterTodayMl: number;
  waterTargetMl: number;
  workoutDays7?: number;
  daysSinceWorkout?: number | null;
  lowProteinDays3?: number;
  highCaloriesDays3?: number;
  lowCaloriesDays3?: number;
  weightTrendKg?: number | null;
  latestWorkout?: CoachZoeWorkoutSnapshot | null;
  healthSync?: CoachZoeHealthSyncSnapshot | null;
  recentMilestoneTitle?: string | null;
};

export type CoachZoeProactiveInsight = {
  key: CoachZoeProactiveInsightKey;
  title: string;
  body: string;
  href: string;
  priority: number;
};

function numberOrZero(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function cleanWorkoutName(value?: string | null) {
  return typeof value === "string" && value.trim() ? value.trim() : "today's workout";
}

function isHardTraining(type?: string | null, title?: string | null) {
  const lower = `${type ?? ""} ${title ?? ""}`.toLowerCase();
  return /(strength|hiit|legs|lower|upper|push|pull|full body|cardio|conditioning)/.test(lower);
}

function streakMilestone(streak: number) {
  return [90, 30, 14, 10, 7].find((value) => streak === value) ?? null;
}

export function buildCoachZoeProactiveInsight(input: CoachZoeProactiveInput): CoachZoeProactiveInsight {
  const streak = numberOrZero(input.currentStreak);
  const momentumDelta = numberOrZero(input.momentumScore) - numberOrZero(input.previousMomentumScore);
  const proteinRatio = input.proteinTargetG > 0 ? input.proteinTodayG / input.proteinTargetG : 0;
  const calorieRatio = input.calorieTarget > 0 ? input.caloriesToday / input.calorieTarget : 0;
  const waterRatio = input.waterTargetMl > 0 ? input.waterTodayMl / input.waterTargetMl : 0;
  const workoutDays7 = numberOrZero(input.workoutDays7);
  const daysSinceWorkout = input.daysSinceWorkout ?? null;
  const lowProteinDays3 = numberOrZero(input.lowProteinDays3);
  const highCaloriesDays3 = numberOrZero(input.highCaloriesDays3);
  const lowCaloriesDays3 = numberOrZero(input.lowCaloriesDays3);
  const weightTrendKg = input.weightTrendKg ?? null;
  const latestWorkout = input.latestWorkout ?? null;
  const milestone = streakMilestone(streak);
  const healthSync = input.healthSync ?? null;
  const todaySteps = numberOrZero(healthSync?.todaySteps);
  const averageSteps = numberOrZero(healthSync?.averageSteps7d);
  const workoutName = cleanWorkoutName(latestWorkout?.title);

  if (latestWorkout?.completedToday) {
    const followUp =
      proteinRatio < 0.8
        ? "Recovery and protein will help you get the most from it."
        : waterRatio < 0.8
          ? "Hydration is the best follow-through now."
          : "Recovery is the priority now.";
    return {
      key: "workout_completed",
      title: "Today's Insight",
      body: `Excellent work completing ${workoutName}. ${followUp}`,
      href: proteinRatio < 0.8 ? "/food-log" : waterRatio < 0.8 ? "/water-log" : "/dashboard",
      priority: 100
    };
  }

  if (milestone) {
    return {
      key: "streak_milestone",
      title: "Today's Insight",
      body: `Today makes ${milestone} straight days of consistency. That's how lasting habits are built.`,
      href: "/dashboard",
      priority: 95
    };
  }

  if (latestWorkout?.completedYesterday && isHardTraining(latestWorkout?.type, latestWorkout?.title) && workoutDays7 >= 3) {
    return {
      key: "recovery_day",
      title: "Today's Insight",
      body: "You've trained hard recently. A lighter recovery session today will help you progress better than forcing intensity.",
      href: "/coach",
      priority: 90
    };
  }

  if (daysSinceWorkout !== null && daysSinceWorkout >= 3 && workoutDays7 > 0) {
    return {
      key: "workout_gap",
      title: "Today's Insight",
      body: "It's been a few days since your last workout. A short session today would help you get back into rhythm.",
      href: "/coach",
      priority: 85
    };
  }

  if (lowProteinDays3 >= 2 || (input.todaysFoodCount > 0 && proteinRatio < 0.45)) {
    return {
      key: "protein_low",
      title: "Today's Insight",
      body: "Protein has been lower than target recently. One high-protein meal today would make a real difference.",
      href: "/food-log",
      priority: 80
    };
  }

  if (highCaloriesDays3 >= 2 || (input.todaysFoodCount > 0 && calorieRatio > 1.15)) {
    return {
      key: "calories_high",
      title: "Today's Insight",
      body: "Calories have been running high lately. A simpler plate today will help steady the week.",
      href: "/food-log",
      priority: 76
    };
  }

  if (lowCaloriesDays3 >= 2 && input.todaysFoodCount > 0) {
    return {
      key: "calories_low",
      title: "Today's Insight",
      body: "Calories have been very low lately. A balanced meal today will support recovery and consistency.",
      href: "/food-log",
      priority: 75
    };
  }

  if (input.waterTodayMl > 0 && waterRatio < 0.4) {
    return {
      key: "water_low",
      title: "Today's Insight",
      body: "Water is still very low today. The easiest win right now is one more bottle.",
      href: "/water-log",
      priority: 70
    };
  }

  if (waterRatio >= 1) {
    return {
      key: "hydration_excellent",
      title: "Today's Insight",
      body: "Hydration has been excellent today. That quiet kind of consistency matters more than it looks.",
      href: "/water-log",
      priority: 64
    };
  }

  if (input.goalType === "fat_loss" && weightTrendKg !== null && weightTrendKg <= -0.3) {
    return {
      key: "weight_trend_positive",
      title: "Today's Insight",
      body: "Your recent weight trend is moving in the right direction. Protect it with simple food choices today.",
      href: "/weight-log",
      priority: 60
    };
  }

  if (input.goalType === "muscle_gain" && weightTrendKg !== null && weightTrendKg >= 0.2) {
    return {
      key: "weight_trend_positive",
      title: "Today's Insight",
      body: "Your recent weight trend is supporting muscle gain. Keep eating and training with the same calm consistency.",
      href: "/weight-log",
      priority: 60
    };
  }

  if (input.goalType === "fat_loss" && weightTrendKg !== null && weightTrendKg >= 0.4) {
    return {
      key: "weight_trend_watch",
      title: "Today's Insight",
      body: "Your recent weight trend has drifted upward a little. A calmer day of eating would help bring things back in line.",
      href: "/food-log",
      priority: 58
    };
  }

  if (momentumDelta >= 10) {
    return {
      key: "momentum_improving",
      title: "Today's Insight",
      body: "Momentum has improved noticeably. Keep today's actions simple so the trend has room to keep building.",
      href: "/dashboard",
      priority: 56
    };
  }

  if (healthSync?.connected && averageSteps > 0 && todaySteps >= averageSteps + 2500) {
    return {
      key: "activity_high",
      title: "Today's Insight",
      body: "You've already moved more than usual today. A lighter session or recovery focus may be all you need.",
      href: "/coach",
      priority: 54
    };
  }

  if (healthSync?.connected && averageSteps >= 6000 && todaySteps > 0 && todaySteps <= averageSteps * 0.45) {
    return {
      key: "activity_low",
      title: "Today's Insight",
      body: "Activity is lower than your usual pace today. A short walk would move the day forward without much friction.",
      href: "/dashboard",
      priority: 52
    };
  }

  if (input.recentMilestoneTitle) {
    return {
      key: "milestone_memory",
      title: "Today's Insight",
      body: `${input.recentMilestoneTitle} is worth protecting. Keep building on that momentum today.`,
      href: "/reports",
      priority: 48
    };
  }

  return {
    key: "steady",
    title: "Today's Insight",
    body: "Keep building consistency.",
    href: "/dashboard",
    priority: 10
  };
}

export type TodayPriorityKey = "Meal" | "Water" | "Movement" | "Habit";

export type TodayPriorityCandidate = {
  key: TodayPriorityKey;
  title: string;
  reason: string;
  href: string;
  cta: string;
  rank: number;
};

export type TodayPriorityFacts = {
  localHour: number;
  mealsToday: number;
  proteinTodayG: number;
  proteinTargetG: number;
  waterTodayMl: number;
  waterTargetMl: number;
  workoutCompletedToday: boolean;
  daysSinceWorkout: number | null;
  stepsToday: number;
  activeCaloriesToday: number;
  activeHabits: number;
  habitsCompletedToday: number;
};

export function buildTodayPriorityCandidates(facts: TodayPriorityFacts): TodayPriorityCandidate[] {
  const candidates: TodayPriorityCandidate[] = [];
  const waterLeftMl = Math.max(0, facts.waterTargetMl - facts.waterTodayMl);
  const waterProgress = facts.waterTargetMl > 0 ? facts.waterTodayMl / facts.waterTargetMl : 0;
  const proteinLeft = Math.max(0, facts.proteinTargetG - facts.proteinTodayG);
  const movementUnderway = facts.workoutCompletedToday || facts.stepsToday >= 5_000 || facts.activeCaloriesToday >= 150;

  if (facts.mealsToday === 0) {
    candidates.push({
      key: "Meal",
      title: facts.localHour < 11 ? "Start with your first meal" : "Log the meal that matters now",
      reason: facts.localHour < 11 ? "No meal is recorded yet. One honest check-in is enough to begin." : "No meals are recorded yet today, so food is the clearest missing signal.",
      href: "/food-log",
      cta: "Log Meal",
      rank: facts.localHour >= 12 ? 95 : 76
    });
  } else if (facts.localHour >= 16 && proteinLeft > 30) {
    candidates.push({
      key: "Meal",
      title: "Make the next meal protein-rich",
      reason: `${Math.round(proteinLeft)}g remains toward today's protein guide.`,
      href: "/food-log",
      cta: "Log Meal",
      rank: facts.proteinTodayG < facts.proteinTargetG * 0.6 ? 78 : 68
    });
  }

  if (!movementUnderway && (facts.daysSinceWorkout === null || facts.daysSinceWorkout >= 2)) {
    const partialSteps = facts.stepsToday >= 2_500;
    candidates.push({
      key: "Movement",
      title: partialSteps ? "A short walk would finish well" : facts.daysSinceWorkout === null ? "Add a little movement today" : "Movement is today's best next step",
      reason: partialSteps
        ? `${facts.stepsToday.toLocaleString()} steps are already recorded. A little more movement would build on that.`
        : facts.daysSinceWorkout === null
          ? "No recent movement is recorded, and the basics are already underway."
          : `It has been ${facts.daysSinceWorkout} days since your last recorded workout.`,
      href: "/burn-log",
      cta: "Log Movement",
      rank: facts.localHour >= 12 ? (partialSteps ? 76 : 90) : 64
    });
  }

  if (waterLeftMl > 0) {
    const hydrationUrgency = facts.localHour >= 16 && waterProgress < 0.25
      ? 94
      : facts.localHour >= 19 && waterProgress < 0.75
      ? 86
      : facts.localHour >= 16 && waterProgress < 0.5
        ? 82
        : facts.localHour >= 12 && waterProgress < 0.25
          ? 74
          : 50;
    candidates.push({
      key: "Water",
      title: `Keep sipping through the ${facts.localHour >= 17 ? "evening" : "day"}`,
      reason: `${Number((waterLeftMl / 1000).toFixed(1))}L remains, but it does not need to be finished all at once.`,
      href: "/water-log",
      cta: "Log Water",
      rank: hydrationUrgency
    });
  }

  if (facts.activeHabits > 0 && facts.habitsCompletedToday === 0) {
    candidates.push({ key: "Habit", title: "Keep one promise to yourself", reason: "No habit is checked off yet today.", href: "/habits", cta: "Open Habits", rank: 58 });
  }

  return candidates.sort((left, right) => right.rank - left.rank).slice(0, 3);
}

export function deterministicTodayPriority(facts: TodayPriorityFacts): TodayPriorityCandidate | {
  key: null;
  title: string;
  reason: string;
  href: string;
  cta: string;
  rank: number;
} {
  return buildTodayPriorityCandidates(facts)[0] ?? {
    key: null,
    title: "Protect the progress you have built",
    reason: "The important basics are already in motion. Keep the rest of the day steady.",
    href: "/progress",
    cta: "View Progress",
    rank: 0
  };
}

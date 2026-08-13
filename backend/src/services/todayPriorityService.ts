export type TodayPriorityKey = "Meal" | "Water" | "Movement" | "Weight" | "Habit";

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
  weightLoggedToday: boolean;
  weightLogs7d: number;
  activeHabits: number;
  habitsCompletedToday: number;
};

export function buildTodayPriorityCandidates(facts: TodayPriorityFacts): TodayPriorityCandidate[] {
  const candidates: TodayPriorityCandidate[] = [];
  const waterLeftMl = Math.max(0, facts.waterTargetMl - facts.waterTodayMl);
  const waterProgress = facts.waterTargetMl > 0 ? facts.waterTodayMl / facts.waterTargetMl : 0;
  const proteinLeft = Math.max(0, facts.proteinTargetG - facts.proteinTodayG);

  if (facts.mealsToday === 0) {
    candidates.push({ key: "Meal", title: "Log your first meal", reason: "No meals are recorded yet today.", href: "/food-log", cta: "Log Meal", rank: facts.localHour >= 13 ? 95 : 78 });
  } else if (facts.localHour >= 16 && proteinLeft > 30) {
    candidates.push({ key: "Meal", title: "Make the next meal protein-rich", reason: `${Math.round(proteinLeft)}g remains toward today's protein guide.`, href: "/food-log", cta: "Log Meal", rank: 70 });
  }

  if (!facts.workoutCompletedToday && (facts.daysSinceWorkout === null || facts.daysSinceWorkout >= 2)) {
    candidates.push({
      key: "Movement",
      title: facts.daysSinceWorkout === null ? "Add a little movement today" : "Movement is today's best next step",
      reason: facts.daysSinceWorkout === null ? "No recent workout is recorded, and the basics are already underway." : `It has been ${facts.daysSinceWorkout} days since your last recorded workout.`,
      href: "/burn-log",
      cta: "Log Movement",
      rank: facts.localHour >= 12 ? 88 : 68
    });
  }

  if (waterLeftMl > 0) {
    const hydrationUrgency = facts.localHour >= 19 ? 86 : facts.localHour >= 16 && waterProgress < 0.5 ? 80 : waterProgress < 0.35 ? 74 : 56;
    candidates.push({
      key: "Water",
      title: `Keep sipping through the ${facts.localHour >= 17 ? "evening" : "day"}`,
      reason: `${Number((waterLeftMl / 1000).toFixed(1))}L remains, but it does not need to be finished all at once.`,
      href: "/water-log",
      cta: "Log Water",
      rank: hydrationUrgency
    });
  }

  if (!facts.weightLoggedToday && facts.weightLogs7d < 2) {
    candidates.push({ key: "Weight", title: "Add a progress check-in", reason: "A weigh-in would make this week's trend clearer.", href: "/weight-log", cta: "Log Weight", rank: facts.localHour < 12 ? 64 : 42 });
  }

  if (facts.activeHabits > 0 && facts.habitsCompletedToday === 0) {
    candidates.push({ key: "Habit", title: "Keep one promise to yourself", reason: "No habit is checked off yet today.", href: "/habits", cta: "Open Habits", rank: 58 });
  }

  return candidates.sort((left, right) => right.rank - left.rank).slice(0, 3);
}

export function deterministicTodayPriority(facts: TodayPriorityFacts) {
  return buildTodayPriorityCandidates(facts)[0] ?? {
    key: "Habit" as const,
    title: "Protect the progress you have built",
    reason: "The important basics are already in motion. Keep the rest of the day steady.",
    href: "/habits",
    cta: "View Today",
    rank: 0
  };
}

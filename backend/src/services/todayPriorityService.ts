export type TodayPriorityKey = "Meal" | "Water" | "Movement";

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
  sleepQuality: "poor" | "okay" | "good" | null;
};

const DAY_MS = 86_400_000;

export function localCalendarDaysSince(
  occurredAtMs: number,
  timezoneOffsetMinutes: number,
  nowMs = Date.now()
) {
  if (!Number.isFinite(occurredAtMs) || !Number.isFinite(nowMs)) return null;
  const offsetMs = timezoneOffsetMinutes * 60_000;
  const occurredDay = Math.floor((occurredAtMs - offsetMs) / DAY_MS);
  const currentDay = Math.floor((nowMs - offsetMs) / DAY_MS);
  return Math.max(0, currentDay - occurredDay);
}

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

  if (!movementUnderway) {
    const partialSteps = facts.stepsToday >= 2_500;
    const trainedYesterday = facts.daysSinceWorkout === 1;
    candidates.push({
      key: "Movement",
      title: partialSteps
        ? "A short walk would finish well"
        : trainedYesterday || facts.sleepQuality === "poor"
          ? "Choose gentle movement today"
          : facts.daysSinceWorkout === null
            ? "Add a little movement today"
            : "Movement is today's best next step",
      reason: partialSteps
        ? `${facts.stepsToday.toLocaleString()} steps are already recorded. A little more movement would build on that.`
        : trainedYesterday
          ? "No movement is recorded today. Since you trained yesterday, an easy walk or mobility is enough."
          : facts.sleepQuality === "poor"
            ? "No movement is recorded today. Keep it light after a poor night's sleep."
        : facts.daysSinceWorkout === null
          ? "No recent movement is recorded, and the basics are already underway."
          : `It has been ${facts.daysSinceWorkout} days since your last recorded workout.`,
      href: "/burn-log",
      cta: "Log Movement",
      rank: facts.localHour >= 12
        ? partialSteps
          ? 76
          : trainedYesterday || facts.sleepQuality === "poor"
            ? 82
            : 90
        : trainedYesterday || facts.sleepQuality === "poor"
          ? 64
          : 68
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

  return candidates.sort((left, right) => right.rank - left.rank).slice(0, 3);
}

export function shouldUseAiPriorityRefinement(candidates: TodayPriorityCandidate[]) {
  return candidates.length > 1 && candidates[0].rank - candidates[1].rank <= 10;
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

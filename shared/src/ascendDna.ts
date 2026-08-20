export type AscendDnaActionType = "food" | "water" | "weight" | "habit" | "activity" | "progress_photo" | "screen_open";
export type AscendDnaTimeBucket = "morning" | "afternoon" | "evening" | "night";
export type AscendDnaTrend = "improving" | "stable" | "declining";

export interface AscendDnaEvent {
  type: AscendDnaActionType;
  occurredAt: string | Date;
  habitName?: string | null;
  completed?: boolean | null;
  screenName?: string | null;
  durationMs?: number | null;
}

export interface AscendDnaProfile {
  preferredLoggingTime: AscendDnaTimeBucket;
  foodConsistency: number;
  waterConsistency: number;
  weightConsistency: number;
  habitConsistency: number;
  activityConsistency: number;
  progressPhotoConsistency: number;
  currentStreak: number;
  bestStreak: number;
  averageWeeklyConsistency: number;
  weekendConsistency: number;
  mostCompletedHabit: string | null;
  mostSkippedHabit: string | null;
  lastCompletedAction: AscendDnaActionType | null;
  lastOpenedScreen: string | null;
  averageSessionLength: number;
  averageOpenTime: AscendDnaTimeBucket;
  momentumTrend: AscendDnaTrend;
  daysSinceFood: number | null;
  daysSinceWeight: number | null;
  daysSinceWater: number | null;
  lastCelebration: string | null;
  weeklyMemory: AscendDnaWeeklyMemory;
}

export interface AscendDnaWeeklyMemory {
  weeklyConsistency: number;
  strongestHabit: string | null;
  weakestHabit: string | null;
  improvedArea: string | null;
  recommendedFocus: string;
  celebration: string;
}

export interface AscendDnaBuildInput {
  now?: string | Date;
  timezoneOffsetMinutes?: number;
  events: AscendDnaEvent[];
  currentStreak?: number | null;
  bestStreak?: number | null;
  momentumScores?: Array<{ score: number; occurredAt: string | Date }>;
  lastCelebration?: string | null;
}

export interface AscendDnaRecommendationInput {
  now?: string | Date;
  timezoneOffsetMinutes?: number;
  dna: AscendDnaProfile;
  todaysFoodCount: number;
  caloriesLeft: number;
  calorieOver: number;
  proteinLeft: number;
  waterLeftMl: number;
  completedHabits: number;
  totalHabits: number;
  todaysBurnCalories: number;
  latestWeightLoggedToday: boolean;
  progressPhotoDue: boolean;
}

export interface AscendDnaMove {
  title: string;
  detail: string;
  href: string;
  cta: string;
}

export interface AscendDnaCelebration {
  title: string;
  detail: string;
  secondary: string;
}

const DAY_MS = 86_400_000;
const ACTION_TYPES: Exclude<AscendDnaActionType, "screen_open">[] = ["food", "water", "weight", "habit", "activity", "progress_photo"];

function toDate(value: string | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function localDateParts(value: string | Date, timezoneOffsetMinutes?: number) {
  const date = toDate(value);
  if (!date) return null;
  if (timezoneOffsetMinutes === undefined) {
    return { year: date.getFullYear(), month: date.getMonth(), day: date.getDate(), hour: date.getHours() };
  }
  const safeOffset = Math.min(840, Math.max(-840, timezoneOffsetMinutes));
  const localDate = new Date(date.getTime() - safeOffset * 60_000);
  return {
    year: localDate.getUTCFullYear(),
    month: localDate.getUTCMonth(),
    day: localDate.getUTCDate(),
    hour: localDate.getUTCHours()
  };
}

function dateKey(value: string | Date, timezoneOffsetMinutes?: number): string | null {
  const parts = localDateParts(value, timezoneOffsetMinutes);
  if (!parts) return null;
  return `${parts.year}-${String(parts.month + 1).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function daysAgo(now: Date, days: number, timezoneOffsetMinutes?: number) {
  if (timezoneOffsetMinutes === undefined) {
    const date = new Date(now);
    date.setDate(date.getDate() - days);
    return dateKey(date) ?? "";
  }
  return dateKey(new Date(now.getTime() - days * DAY_MS), timezoneOffsetMinutes) ?? "";
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function getUniqueDays(events: AscendDnaEvent[], type: AscendDnaActionType, now: Date, days = 7, timezoneOffsetMinutes?: number) {
  const keys = new Set(Array.from({ length: days }, (_, index) => daysAgo(now, index, timezoneOffsetMinutes)));
  return new Set(
    events
      .filter((event) => event.type === type)
      .map((event) => dateKey(event.occurredAt, timezoneOffsetMinutes))
      .filter((key): key is string => key !== null && keys.has(key))
  );
}

function consistency(events: AscendDnaEvent[], type: AscendDnaActionType, now: Date, days = 7, timezoneOffsetMinutes?: number) {
  return clampPercent((getUniqueDays(events, type, now, days, timezoneOffsetMinutes).size / days) * 100);
}

function lastEvent(events: AscendDnaEvent[], types = ACTION_TYPES as AscendDnaActionType[]) {
  return events
    .filter((event) => types.includes(event.type))
    .map((event) => ({ event, date: toDate(event.occurredAt) }))
    .filter((entry): entry is { event: AscendDnaEvent; date: Date } => Boolean(entry.date))
    .sort((a, b) => b.date.getTime() - a.date.getTime())[0]?.event ?? null;
}

function daysSince(events: AscendDnaEvent[], type: AscendDnaActionType, now: Date) {
  const latest = lastEvent(events, [type]);
  const date = latest ? toDate(latest.occurredAt) : null;
  if (!date) return null;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / DAY_MS));
}

function mostCommon(values: Array<string | null | undefined>) {
  const counts = new Map<string, number>();
  values.filter((value): value is string => Boolean(value)).forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
}

function stableChoice<T>(items: T[], seed: string) {
  if (!items.length) throw new Error("stableChoice requires at least one item");
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return items[hash % items.length];
}

export function getAscendDnaTimeBucket(value: string | Date, timezoneOffsetMinutes?: number): AscendDnaTimeBucket {
  const hour = localDateParts(value, timezoneOffsetMinutes)?.hour ?? new Date().getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

export function buildAscendDnaProfile(input: AscendDnaBuildInput): AscendDnaProfile {
  const now = toDate(input.now ?? new Date()) ?? new Date();
  const timezoneOffsetMinutes = input.timezoneOffsetMinutes;
  const events = input.events.filter((event) => Boolean(toDate(event.occurredAt)));
  const actionEvents = events.filter((event) => event.type !== "screen_open");
  const buckets = actionEvents.map((event) => getAscendDnaTimeBucket(event.occurredAt, timezoneOffsetMinutes));
  const preferredLoggingTime = mostCommon(buckets) as AscendDnaTimeBucket | null ?? getAscendDnaTimeBucket(now, timezoneOffsetMinutes);
  const screenEvents = events.filter((event) => event.type === "screen_open");
  const openedScreen = lastEvent(events, ["screen_open"]);
  const sessionLengths = screenEvents.map((event) => Number(event.durationMs ?? 0)).filter((duration) => duration > 0);
  const averageSessionLength = sessionLengths.length
    ? Math.round(sessionLengths.reduce((total, duration) => total + duration, 0) / sessionLengths.length)
    : 0;
  const averageOpenTime = mostCommon(screenEvents.map((event) => getAscendDnaTimeBucket(event.occurredAt, timezoneOffsetMinutes))) as AscendDnaTimeBucket | null ?? preferredLoggingTime;
  const momentumScores = (input.momentumScores ?? [])
    .map((entry) => ({ score: Number(entry.score), date: toDate(entry.occurredAt) }))
    .filter((entry): entry is { score: number; date: Date } => Number.isFinite(entry.score) && Boolean(entry.date))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const momentumTrend: AscendDnaTrend = momentumScores.length < 2
    ? "stable"
    : momentumScores[momentumScores.length - 1].score - momentumScores[0].score >= 8
      ? "improving"
      : momentumScores[momentumScores.length - 1].score - momentumScores[0].score <= -8
        ? "declining"
        : "stable";
  const weekendKeys = new Set(
    Array.from({ length: 14 }, (_, index) => {
      const key = daysAgo(now, index, timezoneOffsetMinutes);
      if (!key) return null;
      const day = new Date(`${key}T00:00:00.000Z`).getUTCDay();
      return [0, 6].includes(day) ? key : null;
    }).filter((key): key is string => Boolean(key))
  );
  const weekendActiveDays = new Set(actionEvents.map((event) => dateKey(event.occurredAt, timezoneOffsetMinutes)).filter((key): key is string => key !== null && weekendKeys.has(key)));
  const foodConsistency = consistency(events, "food", now, 7, timezoneOffsetMinutes);
  const waterConsistency = consistency(events, "water", now, 7, timezoneOffsetMinutes);
  const weightConsistency = consistency(events, "weight", now, 7, timezoneOffsetMinutes);
  const habitConsistency = consistency(events, "habit", now, 7, timezoneOffsetMinutes);
  const activityConsistency = consistency(events, "activity", now, 7, timezoneOffsetMinutes);
  const progressPhotoConsistency = consistency(events, "progress_photo", now, 28, timezoneOffsetMinutes);
  const averageWeeklyConsistency = clampPercent(
    (foodConsistency + waterConsistency + weightConsistency + habitConsistency + activityConsistency) / 5
  );
  const completedHabitNames = events
    .filter((event) => event.type === "habit" && event.completed !== false)
    .map((event) => event.habitName);
  const skippedHabitNames = events
    .filter((event) => event.type === "habit" && event.completed === false)
    .map((event) => event.habitName);
  const strongestHabit = mostCommon(completedHabitNames);
  const weakestHabit = mostCommon(skippedHabitNames);
  const focusScores = [
    ["food", foodConsistency],
    ["water", waterConsistency],
    ["weight", weightConsistency],
    ["habits", habitConsistency],
    ["activity", activityConsistency]
  ] as const;
  const recommendedFocus = [...focusScores].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))[0][0];
  const improvedArea = momentumTrend === "improving" ? "momentum" : [...focusScores].sort((a, b) => b[1] - a[1])[0][0];
  const lastCompleted = lastEvent(events);

  return {
    preferredLoggingTime,
    foodConsistency,
    waterConsistency,
    weightConsistency,
    habitConsistency,
    activityConsistency,
    progressPhotoConsistency,
    currentStreak: Math.max(0, Number(input.currentStreak ?? 0)),
    bestStreak: Math.max(0, Number(input.bestStreak ?? input.currentStreak ?? 0)),
    averageWeeklyConsistency,
    weekendConsistency: clampPercent((weekendActiveDays.size / Math.max(1, weekendKeys.size)) * 100),
    mostCompletedHabit: strongestHabit,
    mostSkippedHabit: weakestHabit,
    lastCompletedAction: lastCompleted?.type && lastCompleted.type !== "screen_open" ? lastCompleted.type : null,
    lastOpenedScreen: openedScreen?.screenName ?? null,
    averageSessionLength,
    averageOpenTime,
    momentumTrend,
    daysSinceFood: daysSince(events, "food", now),
    daysSinceWeight: daysSince(events, "weight", now),
    daysSinceWater: daysSince(events, "water", now),
    lastCelebration: input.lastCelebration ?? null,
    weeklyMemory: {
      weeklyConsistency: averageWeeklyConsistency,
      strongestHabit,
      weakestHabit,
      improvedArea,
      recommendedFocus,
      celebration: averageWeeklyConsistency >= 80 ? "Great work building a steady week." : "Small steps this week still count."
    }
  };
}

export function getAscendDnaGreeting(dna: AscendDnaProfile, now: string | Date = new Date()) {
  const bucket = getAscendDnaTimeBucket(now);
  const date = toDate(now) ?? new Date();
  const daySeed = dateKey(date) ?? String(date.getTime());
  if (dna.currentStreak >= 5) return stableChoice(["Great consistency lately", "Your rhythm is building", "Keep that streak alive"], `${daySeed}:streak`);
  if (dna.momentumTrend === "improving") return stableChoice(["You are building momentum", "Small steps are adding up"], `${daySeed}:improving`);
  if (dna.momentumTrend === "declining") return stableChoice(["One small action today is enough", "Welcome back"], `${daySeed}:calm`);
  if (bucket === "morning") return "Good morning";
  if (bucket === "afternoon") return "Good afternoon";
  if (bucket === "evening") return "Good evening";
  return "Finishing strong";
}

function waterCoachAction(remainingMl: number, bucket: AscendDnaTimeBucket) {
  if (remainingMl <= 250) return "Take a small sip break.";
  if (remainingMl <= 500) return "Drink 250ml water.";
  if (bucket === "night") return "Take a small sip break.";
  return "Drink another 500ml water.";
}

export function getAscendDnaNextBestMove(input: AscendDnaRecommendationInput): AscendDnaMove {
  const now = input.now ?? new Date();
  const bucket = getAscendDnaTimeBucket(now, input.timezoneOffsetMinutes);
  const deferFoodForEveningLogger =
    input.dna.preferredLoggingTime === "evening" &&
    bucket === "morning" &&
    input.dna.daysSinceFood !== null &&
    input.dna.daysSinceFood <= 1;
  if (!input.todaysFoodCount && !deferFoodForEveningLogger) {
    return {
      title: "Log your first meal.",
      detail: "One meal is enough to restart today's momentum. It usually takes under a minute.",
      href: "/food-log",
      cta: "Log Food"
    };
  }
  if (!deferFoodForEveningLogger && input.proteinLeft >= 25 && input.calorieOver <= 150) {
    return {
      title: "Add a protein-rich meal.",
      detail: `You have ${Math.round(input.proteinLeft)}g protein remaining today. One protein-focused choice can close the gap.`,
      href: "/food-log",
      cta: "Log Food"
    };
  }
  if (!deferFoodForEveningLogger && input.caloriesLeft >= 450 && input.calorieOver <= 150) {
    return {
      title: "Add another balanced meal.",
      detail: "You're one meal away from today's nutrition goal. Keep it simple and log what you eat.",
      href: "/food-log",
      cta: "Log Food"
    };
  }
  if (input.waterLeftMl >= 250 && !(input.dna.waterConsistency >= 90 && input.waterLeftMl < 750)) {
    return {
      title: waterCoachAction(input.waterLeftMl, bucket),
      detail: "Small water breaks are easier to repeat than forcing a huge amount at once.",
      href: "/water-log",
      cta: "Log Water"
    };
  }
  if (!input.latestWeightLoggedToday) {
    return {
      title: "Record today's weight.",
      detail: input.dna.weightConsistency < 45
        ? "A quick weigh-in makes your long-term trend easier to see."
        : "Small updates create better long-term progress. This takes less than 30 seconds.",
      href: "/weight-log",
      cta: "Log Weight"
    };
  }
  if (input.completedHabits < input.totalHabits && input.totalHabits > 0) {
    return {
      title: "Complete today's habit.",
      detail: input.dna.currentStreak > 0 ? "One minute now keeps your streak alive." : "One minute now helps build the rhythm.",
      href: "/habits",
      cta: "Open Habits"
    };
  }
  if (!input.todaysBurnCalories && bucket !== "morning") {
    return {
      title: "Log today's activity.",
      detail: "If you moved today, capture it now so your progress reflects the work.",
      href: "/burn-log",
      cta: "Log Activity"
    };
  }
  if (input.progressPhotoDue) {
    return {
      title: "Capture today's progress.",
      detail: "Small changes become visible over time. A quick photo helps you compare later.",
      href: "/progress",
      cta: "Add Photo"
    };
  }
  return {
    title: "Amazing work.",
    detail: "You've completed today's priorities. View today's progress when you want the full picture.",
    href: "/dashboard",
    cta: "View Progress"
  };
}

export function getAscendDnaCelebration(type: Exclude<AscendDnaActionType, "screen_open">): AscendDnaCelebration {
  const celebrations: Record<Exclude<AscendDnaActionType, "screen_open">, AscendDnaCelebration> = {
    food: {
      title: "Food logged.",
      detail: "Nice work. One honest meal log is a vote for the result you want.",
      secondary: "When you're ready, check whether protein or water needs a small top-up."
    },
    weight: {
      title: "Weight recorded.",
      detail: "That update makes your long-term trend clearer. Progress is easier to coach when it is visible.",
      secondary: "No rush. Your next small move can be food, water, or a habit."
    },
    water: {
      title: "Water logged.",
      detail: "Good check-in. Hydration is one of the simplest ways to support energy and consistency.",
      secondary: "Keep the next sip easy, not forced."
    },
    habit: {
      title: "Habit completed.",
      detail: "That is the kind of small repeatable action that makes tomorrow easier.",
      secondary: "Take the win. You can review your progress when you want the detail."
    },
    activity: {
      title: "Activity logged.",
      detail: "Good work capturing the effort. Movement still counts even when the day is busy.",
      secondary: "Let the win land before chasing the next task."
    },
    progress_photo: {
      title: "Progress photo saved.",
      detail: "Great move. Visible change is easier to notice when you capture it consistently.",
      secondary: "Your future self gets a clearer comparison."
    }
  };
  return celebrations[type];
}

export function getAscendDnaMotivation(dna: AscendDnaProfile, now: string | Date = new Date()) {
  const seed = `${dateKey(now) ?? "today"}:${dna.currentStreak}:${dna.momentumTrend}:${dna.averageWeeklyConsistency}`;
  if (dna.currentStreak > dna.bestStreak && dna.currentStreak > 1) return "You just set a new consistency mark.";
  if (dna.averageWeeklyConsistency >= 80) return stableChoice(["Great work building a steady week.", "Your consistency is doing the heavy lifting."], seed);
  if (dna.weekendConsistency < 35) return "A simple reset today is enough to start strong.";
  return stableChoice(["Small actions create big results.", "One action at a time keeps you moving.", "Every choice matters."], seed);
}

export const AscendDNAService = {
  buildProfile: buildAscendDnaProfile,
  getGreeting: getAscendDnaGreeting,
  getNextBestMove: getAscendDnaNextBestMove,
  getCelebration: getAscendDnaCelebration,
  getMotivation: getAscendDnaMotivation
} as const;

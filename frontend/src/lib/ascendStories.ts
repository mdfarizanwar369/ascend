export type AscendStoryFormat = "today" | "then-now" | "earned";
export type AscendStoryStyle = "loud" | "cinematic" | "quiet";

export type AscendStoryPhoto = {
  id: string;
  url: string;
  loggedAt: string;
  photoType: string;
};

export type AscendStoryCrop = {
  zoom: number;
  x: number;
  y: number;
};

export type AscendStoryMetric = {
  key: "streak" | "momentum" | "weight-change" | "workouts" | "meals";
  label: string;
  value: string;
  sensitive: boolean;
};

export type AscendStoryMilestone = {
  key: string;
  title: string;
  detail: string;
  occurredAt: string;
};

export type AscendStoryContext = {
  firstPhoto: AscendStoryPhoto;
  latestPhoto: AscendStoryPhoto;
  milestone: AscendStoryMilestone | null;
  milestones: AscendStoryMilestone[];
  metrics: AscendStoryMetric[];
  currentStreak: number;
};

export type AscendStoryDraft = {
  format: AscendStoryFormat;
  style: AscendStoryStyle;
  caption: string;
  showDate: boolean;
  showElapsed: boolean;
  metricKeys: AscendStoryMetric["key"][];
  showAttribution: boolean;
  firstCrop: AscendStoryCrop;
  latestCrop: AscendStoryCrop;
};

export const DEFAULT_ASCEND_STORY_CROP: AscendStoryCrop = { zoom: 1, x: 0, y: 0 };

function validDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function daysBetween(left: string, right: string) {
  const start = validDate(left);
  const end = validDate(right);
  if (!start || !end) return 0;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000));
}

export function formatStoryDate(value: string) {
  const date = validDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

export function defaultStoryCaption(format: AscendStoryFormat, context: AscendStoryContext) {
  if (format === "earned" && context.milestone) return context.milestone.title;

  if (format === "then-now") {
    const days = daysBetween(context.firstPhoto.loggedAt, context.latestPhoto.loggedAt);
    if (days >= 60) return `${Math.max(2, Math.round(days / 30))} months of choosing progress.`;
    if (days >= 14) return `${Math.max(2, Math.round(days / 7))} weeks of showing up.`;
    if (days > 0) return `${days} days. One ascent at a time.`;
    return "Progress worth remembering.";
  }

  if (context.currentStreak >= 7) return `${context.currentStreak} days of showing up.`;
  return "Today, I chose progress.";
}

export function createStoryDraft(format: AscendStoryFormat, context: AscendStoryContext): AscendStoryDraft {
  return {
    format,
    style: "cinematic",
    caption: defaultStoryCaption(format, context),
    showDate: true,
    showElapsed: format === "then-now",
    metricKeys: [],
    showAttribution: true,
    firstCrop: { ...DEFAULT_ASCEND_STORY_CROP },
    latestCrop: { ...DEFAULT_ASCEND_STORY_CROP }
  };
}

export function availableStoryFormats(context: AscendStoryContext) {
  const formats: AscendStoryFormat[] = ["today"];
  if (context.firstPhoto.id !== context.latestPhoto.id) formats.push("then-now");
  if (context.milestone) formats.push("earned");
  return formats;
}

export function storyElapsedLabel(firstDate: string, latestDate: string) {
  const days = daysBetween(firstDate, latestDate);
  if (days >= 60) return `${Math.max(2, Math.round(days / 30))} months between check-ins`;
  if (days >= 14) return `${Math.max(2, Math.round(days / 7))} weeks between check-ins`;
  if (days > 0) return `${days} days between check-ins`;
  return "";
}

export function isThenNowSelectionValid(firstPhoto: AscendStoryPhoto, latestPhoto: AscendStoryPhoto) {
  return firstPhoto.id !== latestPhoto.id;
}

export function isThenNowDateReversed(firstPhoto: AscendStoryPhoto, latestPhoto: AscendStoryPhoto) {
  const first = validDate(firstPhoto.loggedAt);
  const latest = validDate(latestPhoto.loggedAt);
  return Boolean(first && latest && latest.getTime() < first.getTime());
}

type MemoryLike = {
  milestoneKey: string;
  type: string;
  title: string;
  subtitle: string;
  occurredAt: string;
  priority: number;
};

type VerifiedMilestoneInput = {
  memories?: MemoryLike[];
  currentStreak?: number;
  bestStreak?: number;
  goalAchievedAt?: string | null;
  workouts?: number;
  workoutsAreMinimum?: boolean;
  meals?: number;
  mealsAreMinimum?: boolean;
};

export function listVerifiedMilestones(input: VerifiedMilestoneInput) {
  const candidates: Array<(AscendStoryMilestone & { score: number }) | null> = [];

  if (input.goalAchievedAt) {
    candidates.push({
      key: "goal-achieved",
      title: "A goal I worked for. Earned.",
      detail: "Goal achieved in Ascend.",
      occurredAt: input.goalAchievedAt,
      score: 100
    });
  }

  const memory = [...(input.memories ?? [])]
    .filter((item) => item.title.trim() && item.occurredAt && !["started_journey", "coach_homework_assigned"].includes(item.type))
    .sort((left, right) => right.priority - left.priority || new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())[0];
  if (memory) {
    candidates.push({
      key: memory.milestoneKey,
      title: memory.title,
      detail: memory.subtitle,
      occurredAt: memory.occurredAt,
      score: Math.min(90, 45 + memory.priority)
    });
  }

  const streak = Math.max(input.currentStreak ?? 0, input.bestStreak ?? 0);
  if (streak >= 7) {
    candidates.push({
      key: `streak-${streak}`,
      title: `${streak} days of consistency. Earned.`,
      detail: "Verified from your Ascend streak.",
      occurredAt: new Date().toISOString(),
      score: 40 + Math.min(30, streak)
    });
  }

  if ((input.workouts ?? 0) >= 10) {
    const workoutCount = `${input.workouts}${input.workoutsAreMinimum ? "+" : ""}`;
    candidates.push({
      key: `workouts-${input.workouts}`,
      title: `${workoutCount} workouts completed. Still ascending.`,
      detail: "Verified from your workout history.",
      occurredAt: new Date().toISOString(),
      score: 35 + Math.min(25, Math.floor((input.workouts ?? 0) / 5))
    });
  }

  if ((input.meals ?? 0) >= 25) {
    const mealCount = `${input.meals}${input.mealsAreMinimum ? "+" : ""}`;
    candidates.push({
      key: `meals-${input.meals}`,
      title: `${mealCount} honest meal check-ins. That counts.`,
      detail: "Verified from your meal history.",
      occurredAt: new Date().toISOString(),
      score: 30 + Math.min(20, Math.floor((input.meals ?? 0) / 10))
    });
  }

  const sorted = candidates
    .filter((item): item is AscendStoryMilestone & { score: number } => Boolean(item))
    .sort((left, right) => right.score - left.score || new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime());

  return Array.from(new Map(sorted.map(({ score: _score, ...item }) => [item.key, item])).values());
}

export function chooseVerifiedMilestone(input: VerifiedMilestoneInput) {
  return listVerifiedMilestones(input)[0] ?? null;
}

export function buildVerifiedStoryMetrics(input: {
  currentStreak?: number;
  momentum?: number | null;
  currentWeight?: number | null;
  baselineWeight?: number | null;
  workouts?: number;
  workoutsAreMinimum?: boolean;
  meals?: number;
  mealsAreMinimum?: boolean;
}) {
  const metrics: AscendStoryMetric[] = [];
  if ((input.currentStreak ?? 0) > 0) metrics.push({ key: "streak", label: "Current streak", value: `${input.currentStreak} days`, sensitive: false });
  if (input.momentum !== null && input.momentum !== undefined) metrics.push({ key: "momentum", label: "Momentum", value: `${Math.round(input.momentum)}/100`, sensitive: false });
  if (input.currentWeight && input.baselineWeight) {
    const change = Number((input.currentWeight - input.baselineWeight).toFixed(1));
    if (change !== 0) metrics.push({ key: "weight-change", label: "Weight change", value: `${change > 0 ? "+" : ""}${change} kg`, sensitive: true });
  }
  if ((input.workouts ?? 0) > 0) metrics.push({ key: "workouts", label: "Workouts logged", value: `${input.workouts}${input.workoutsAreMinimum ? "+" : ""}`, sensitive: false });
  if ((input.meals ?? 0) > 0) metrics.push({ key: "meals", label: "Meals logged", value: `${input.meals}${input.mealsAreMinimum ? "+" : ""}`, sensitive: false });
  return metrics.slice(0, 3);
}

export function clampStoryCrop(crop: AscendStoryCrop): AscendStoryCrop {
  return {
    zoom: Math.min(2.5, Math.max(1, crop.zoom)),
    x: Math.min(50, Math.max(-50, crop.x)),
    y: Math.min(50, Math.max(-50, crop.y))
  };
}

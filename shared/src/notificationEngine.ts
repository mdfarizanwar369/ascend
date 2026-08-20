import { AscendDnaProfile, AscendDnaTimeBucket, getAscendDnaTimeBucket } from "./ascendDna";

export type NotificationPriority = 1 | 2 | 3 | 4 | 5;
export type NotificationType =
  | "trainer_message"
  | "trainer_praise"
  | "trainer_mission"
  | "trainer_nutrition_plan"
  | "celebration"
  | "weekly_reflection"
  | "proactive_coaching"
  | "next_best_move";

export interface NotificationCandidate {
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  body: string;
  href: string;
  tag: string;
  dedupeKey: string;
  bypassQuietHours?: boolean;
}

export interface NotificationEngineInput {
  now?: string | Date;
  localTimeZone?: string | null;
  timezoneOffsetMinutes?: number;
  dna: AscendDnaProfile;
  openedToday: boolean;
  prioritiesComplete: boolean;
  sentToday: {
    coaching: boolean;
    celebration: boolean;
    trainerMessage: boolean;
  };
  nextBestMove?: {
    title: string;
    detail: string;
    href: string;
  } | null;
  trainerEvent?: {
    type: "message" | "praise" | "mission" | "nutrition_plan";
    senderName?: string | null;
    missionTitle?: string | null;
  } | null;
  celebrationSignals?: Array<{
    type: "longest_streak" | "best_week" | "protein_improved" | "water_improved" | "consistency_improved";
    value?: string | number | null;
  }>;
  weeklyReflectionDue?: boolean;
  proactiveInsight?: {
    title: string;
    body: string;
    href: string;
    dedupeKey: string;
  } | null;
}

const bannedPhrases = [
  "log breakfast",
  "log lunch",
  "log dinner",
  "drink water now",
  "you forgot",
  "you failed",
  "you missed",
  "you are behind"
];

function toDate(value: string | Date | undefined) {
  const date = value ? value instanceof Date ? value : new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function localDateAtOffset(date: Date, timezoneOffsetMinutes?: number) {
  if (timezoneOffsetMinutes === undefined) return date;
  const safeOffset = Math.min(840, Math.max(-840, timezoneOffsetMinutes));
  return new Date(date.getTime() - safeOffset * 60_000);
}

function localDateKey(date: Date, timezoneOffsetMinutes?: number) {
  const localDate = localDateAtOffset(date, timezoneOffsetMinutes);
  const year = timezoneOffsetMinutes === undefined ? localDate.getFullYear() : localDate.getUTCFullYear();
  const month = timezoneOffsetMinutes === undefined ? localDate.getMonth() : localDate.getUTCMonth();
  const day = timezoneOffsetMinutes === undefined ? localDate.getDate() : localDate.getUTCDate();
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function hourForBucket(bucket: AscendDnaTimeBucket) {
  if (bucket === "morning") return 9;
  if (bucket === "afternoon") return 14;
  if (bucket === "evening") return 20;
  return 21;
}

function localHour(now: Date, timezoneOffsetMinutes?: number) {
  const localDate = localDateAtOffset(now, timezoneOffsetMinutes);
  return timezoneOffsetMinutes === undefined ? localDate.getHours() : localDate.getUTCHours();
}

function isQuietHour(now: Date, timezoneOffsetMinutes?: number) {
  const hour = localHour(now, timezoneOffsetMinutes);
  return hour >= 22 || hour < 8;
}

function isCoachWindow(now: Date, dna: AscendDnaProfile, timezoneOffsetMinutes?: number) {
  const targetHour = hourForBucket(dna.averageOpenTime || dna.preferredLoggingTime);
  const notifyStart = Math.max(8, targetHour - 1);
  const notifyEnd = Math.min(21, targetHour);
  const hour = localHour(now, timezoneOffsetMinutes);
  return hour >= notifyStart && hour <= notifyEnd;
}

function cleanCandidate(candidate: NotificationCandidate | null) {
  if (!candidate) return null;
  const text = `${candidate.title} ${candidate.body}`.toLowerCase();
  if (bannedPhrases.some((phrase) => text.includes(phrase))) return null;
  return candidate;
}

function trainerCandidate(input: NotificationEngineInput, todayKey: string): NotificationCandidate | null {
  if (!input.trainerEvent || input.sentToday.trainerMessage) return null;
  const senderName = input.trainerEvent.senderName?.trim() || "Your coach";

  if (input.trainerEvent.type === "praise") {
    return {
      type: "trainer_praise",
      priority: 1,
      title: "Your trainer noticed your progress.",
      body: `${senderName} sent encouragement.`,
      href: "/messages",
      tag: "ascend-trainer",
      dedupeKey: `trainer:praise:${todayKey}`,
      bypassQuietHours: true
    };
  }

  if (input.trainerEvent.type === "mission") {
    return {
      type: "trainer_mission",
      priority: 1,
      title: "Your trainer set a mission.",
      body: input.trainerEvent.missionTitle?.trim() || "Open Ascend when you are ready.",
      href: "/dashboard",
      tag: "ascend-trainer",
      dedupeKey: `trainer:mission:${todayKey}`,
      bypassQuietHours: true
    };
  }

  if (input.trainerEvent.type === "nutrition_plan") {
    return {
      type: "trainer_nutrition_plan",
      priority: 1,
      title: "Your coach updated your nutrition targets.",
      body: "View your new plan in Ascend.",
      href: "/dashboard",
      tag: "ascend-trainer",
      dedupeKey: `trainer:nutrition-plan:${todayKey}`,
      bypassQuietHours: true
    };
  }

  return {
    type: "trainer_message",
    priority: 1,
    title: "Your trainer sent a message.",
    body: `${senderName} checked in with you.`,
    href: "/messages",
    tag: "ascend-trainer",
    dedupeKey: `trainer:message:${todayKey}`,
    bypassQuietHours: true
  };
}

function celebrationCandidate(input: NotificationEngineInput, todayKey: string): NotificationCandidate | null {
  if (input.sentToday.celebration) return null;
  const signal = input.celebrationSignals?.[0];
  if (!signal) return null;

  const bodyByType: Record<typeof signal.type, string> = {
    longest_streak: "New personal best. Your consistency is building.",
    best_week: "This is your strongest week so far.",
    protein_improved: "Your protein consistency improved this week.",
    water_improved: "Your water tracking is more consistent this week.",
    consistency_improved: "You're more consistent than last week."
  };

  return {
    type: "celebration",
    priority: 2,
    title: "Nice progress.",
    body: bodyByType[signal.type],
    href: "/dashboard",
    tag: "ascend-celebration",
    dedupeKey: `celebration:${signal.type}:${todayKey}`
  };
}

function weeklyCandidate(input: NotificationEngineInput, todayKey: string): NotificationCandidate | null {
  if (!input.weeklyReflectionDue || input.sentToday.coaching) return null;
  return {
    type: "weekly_reflection",
    priority: 3,
    title: "Your weekly reflection is ready.",
    body: "See what improved.",
    href: "/reports",
    tag: "ascend-weekly-reflection",
    dedupeKey: `weekly-reflection:${todayKey}`
  };
}

function proactiveCandidate(input: NotificationEngineInput): NotificationCandidate | null {
  if (input.sentToday.coaching || !input.proactiveInsight) return null;
  return {
    type: "proactive_coaching",
    priority: 4,
    title: input.proactiveInsight.title,
    body: input.proactiveInsight.body,
    href: input.proactiveInsight.href,
    tag: "ascend-coach",
    dedupeKey: input.proactiveInsight.dedupeKey
  };
}

function nextMoveCandidate(input: NotificationEngineInput, todayKey: string): NotificationCandidate | null {
  if (input.sentToday.coaching || input.openedToday || input.prioritiesComplete || !input.nextBestMove) return null;
  const move = input.nextBestMove;
  const lowerTitle = move.title.toLowerCase();
  let body = "One small action keeps today moving.";

  if (lowerTitle.includes("protein")) body = "One protein-rich choice keeps today's momentum alive.";
  else if (lowerTitle.includes("water") || lowerTitle.includes("sip")) body = "One more bottle gets you closer to today's goal.";
  else if (lowerTitle.includes("weight")) body = "A quick check-in keeps your trend clear.";
  else if (lowerTitle.includes("habit")) body = "One small habit keeps your rhythm alive.";
  else if (lowerTitle.includes("photo")) body = "A quick photo helps you see change over time.";

  return {
    type: "next_best_move",
    priority: 5,
    title: "Your next best move is ready.",
    body,
    href: move.href,
    tag: "ascend-coach",
    dedupeKey: `coach:${todayKey}`
  };
}

export function selectNotification(input: NotificationEngineInput): NotificationCandidate | null {
  const now = toDate(input.now);
  const todayKey = localDateKey(now, input.timezoneOffsetMinutes);
  const candidates = [
    trainerCandidate(input, todayKey),
    celebrationCandidate(input, todayKey),
    weeklyCandidate(input, todayKey),
    proactiveCandidate(input),
    nextMoveCandidate(input, todayKey)
  ].filter((candidate): candidate is NotificationCandidate => Boolean(candidate));

  const selected = candidates.sort((a, b) => a.priority - b.priority)[0] ?? null;
  if (!selected) return null;
  if (!selected.bypassQuietHours && isQuietHour(now, input.timezoneOffsetMinutes)) return null;
  if (selected.type === "next_best_move" && !isCoachWindow(now, input.dna, input.timezoneOffsetMinutes)) return null;
  return cleanCandidate(selected);
}

export const NotificationEngine = {
  select: selectNotification,
  getTimeBucket: getAscendDnaTimeBucket
} as const;

export type ReadinessInput = {
  sleepHours: number;
  energy: number;
  soreness: number;
  stress: number;
  hunger: number;
  motivation: number;
};

export type ReadinessBand = "green" | "yellow" | "red";

export type ReadinessHistoryEntry = {
  checkinDate: string;
  sleepHours: number;
  score: number;
};

export type WeightHistoryEntry = {
  loggedAt: string;
  weightKg: number;
};

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

export function calculateReadiness(input: ReadinessInput) {
  const sleepScore = clamp(100 - Math.abs(8 - input.sleepHours) * 18);
  const energyScore = input.energy * 10;
  const recoveryScore = (11 - input.soreness) * 10;
  const stressScore = (11 - input.stress) * 10;
  const hungerScore = clamp(100 - Math.abs(5 - input.hunger) * 12);
  const motivationScore = input.motivation * 10;
  const score = Math.round(
    sleepScore * 0.25 +
      energyScore * 0.2 +
      recoveryScore * 0.2 +
      stressScore * 0.15 +
      hungerScore * 0.05 +
      motivationScore * 0.15
  );
  const warningReasons: string[] = [];
  if (input.soreness >= 9) warningReasons.push("Severe soreness reported");
  if (input.sleepHours < 5) warningReasons.push("Sleep below 5 hours");
  if (input.energy <= 2) warningReasons.push("Very low energy reported");
  if (input.stress >= 9) warningReasons.push("High stress reported");
  const band: ReadinessBand = warningReasons.length ? "red" : score >= 70 ? "green" : score >= 45 ? "yellow" : "red";
  return { score, band, warningReasons };
}

function dateValue(date: string) {
  return new Date(`${date.slice(0, 10)}T00:00:00Z`).getTime();
}

export function localDateKey(now = new Date(), timeZone = "Asia/Kuala_Lumpur") {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(now);
    const part = (type: string) => parts.find((entry) => entry.type === type)?.value;
    return `${part("year")}-${part("month")}-${part("day")}`;
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export function readinessPatterns(input: {
  checkins: ReadinessHistoryEntry[];
  weights?: WeightHistoryEntry[];
  today: string;
  activatedAt?: string | null;
}) {
  const ordered = [...input.checkins].sort((a, b) => dateValue(b.checkinDate) - dateValue(a.checkinDate));
  const reasons: string[] = [];
  const latest = ordered[0];
  const twoLatest = ordered.slice(0, 2);
  const latestSleepGap = twoLatest.length === 2 ? Math.abs(dateValue(twoLatest[0].checkinDate) - dateValue(twoLatest[1].checkinDate)) / 86_400_000 : Infinity;
  if (twoLatest.length === 2 && latestSleepGap <= 2 && twoLatest.every((entry) => entry.sleepHours < 5)) reasons.push("Low sleep for 2 nights");

  const referenceDate = latest?.checkinDate ?? input.activatedAt?.slice(0, 10);
  if (referenceDate) {
    const missedDays = Math.floor((dateValue(input.today) - dateValue(referenceDate)) / 86_400_000);
    if (missedDays >= 2) reasons.push(`No readiness check-in for ${missedDays} days`);
  }

  const weights = [...(input.weights ?? [])]
    .filter((entry) => Number.isFinite(entry.weightKg) && entry.weightKg > 0)
    .sort((a, b) => dateValue(a.loggedAt) - dateValue(b.loggedAt));
  if (weights.length >= 2) {
    const first = weights[0];
    const last = weights[weights.length - 1];
    const days = (dateValue(last.loggedAt) - dateValue(first.loggedAt)) / 86_400_000;
    if (days >= 3) {
      const weeklyPercent = Math.abs(((last.weightKg - first.weightKg) / first.weightKg) * (7 / days) * 100);
      if (weeklyPercent > 1.5) reasons.push("Rapid weight change detected");
    }
  }

  const chronological = ordered.slice(0, 7).reverse();
  const firstScore = chronological[0]?.score;
  const lastScore = chronological[chronological.length - 1]?.score;
  const direction = firstScore === undefined || lastScore === undefined || chronological.length < 2
    ? "steady"
    : lastScore > firstScore + 4 ? "improving" : lastScore < firstScore - 4 ? "declining" : "steady";
  return { reasons, direction } as const;
}

export function calculateTargetCompliance(targets: Array<{ targetValue: number; completedValue: number }>) {
  if (!targets.length) return 0;
  const total = targets.reduce((sum, target) => {
    if (!Number.isFinite(target.targetValue) || target.targetValue <= 0) return sum;
    return sum + clamp((target.completedValue / target.targetValue) * 100);
  }, 0);
  return Math.round(total / targets.length);
}

export function eventCountdown(competitionDate: string | Date | null | undefined, now = new Date(), timeZone = "Asia/Kuala_Lumpur") {
  if (!competitionDate) return null;
  const date = new Date(`${typeof competitionDate === "string" ? competitionDate.slice(0, 10) : competitionDate.toISOString().slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return null;
  const today = new Date(`${localDateKey(now, timeZone)}T00:00:00Z`);
  const days = Math.ceil((date.getTime() - today.getTime()) / 86_400_000);
  const weeks = Math.max(0, Math.ceil(days / 7));
  const milestone = days === 0 ? "Competition day" : days <= 7 && days > 0 ? "Final week" : [28, 56, 84].includes(days) ? `${weeks} weeks out` : null;
  return { days, weeks, milestone };
}

export function buildWeeklySummary(input: {
  readinessAverage: number | null;
  compliancePercent: number;
  checkinsCompleted: number;
  targetCount?: number;
}) {
  const readiness = input.readinessAverage === null
    ? "No readiness average is available yet."
    : `Average readiness was ${Math.round(input.readinessAverage)}/100.`;
  const compliance = input.targetCount === 0
    ? "No training targets were assigned this week."
    : input.compliancePercent >= 80
    ? "Training targets were followed consistently."
    : input.compliancePercent >= 50
      ? "Some training targets were completed; the next focus is consistency."
      : "The week needs a simpler, more achievable target plan.";
  return `${readiness} ${input.checkinsCompleted} daily check-in${input.checkinsCompleted === 1 ? "" : "s"} completed. ${compliance}`;
}

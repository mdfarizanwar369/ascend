export type ReadinessInput = {
  sleepHours: number;
  energy: number;
  soreness: number;
  stress: number;
  hunger: number;
  motivation: number;
};

export type ReadinessBand = "green" | "yellow" | "red";

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
  const band: ReadinessBand = score >= 70 ? "green" : score >= 45 ? "yellow" : "red";
  return { score, band };
}

export function calculateTargetCompliance(targets: Array<{ targetValue: number; completedValue: number }>) {
  if (!targets.length) return 0;
  const total = targets.reduce((sum, target) => {
    if (!Number.isFinite(target.targetValue) || target.targetValue <= 0) return sum;
    return sum + clamp((target.completedValue / target.targetValue) * 100);
  }, 0);
  return Math.round(total / targets.length);
}

export function eventCountdown(competitionDate: string | Date | null | undefined, now = new Date()) {
  if (!competitionDate) return null;
  const date = new Date(`${typeof competitionDate === "string" ? competitionDate.slice(0, 10) : competitionDate.toISOString().slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return null;
  const today = new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  const days = Math.ceil((date.getTime() - today.getTime()) / 86_400_000);
  const weeks = Math.max(0, Math.ceil(days / 7));
  const milestone = days === 0 ? "Competition day" : days <= 7 && days > 0 ? "Final week" : [28, 56, 84].includes(days) ? `${weeks} weeks out` : null;
  return { days, weeks, milestone };
}

export function buildWeeklySummary(input: {
  readinessAverage: number | null;
  compliancePercent: number;
  checkinsCompleted: number;
}) {
  const readiness = input.readinessAverage === null
    ? "No readiness average is available yet."
    : `Average readiness was ${Math.round(input.readinessAverage)}/100.`;
  const compliance = input.compliancePercent >= 80
    ? "Training targets were followed consistently."
    : input.compliancePercent >= 50
      ? "Some training targets were completed; the next focus is consistency."
      : "The week needs a simpler, more achievable target plan.";
  return `${readiness} ${input.checkinsCompleted} daily check-in${input.checkinsCompleted === 1 ? "" : "s"} completed. ${compliance}`;
}

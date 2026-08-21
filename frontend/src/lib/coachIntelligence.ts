import { AthleteDashboard, BodyCompositionScan, BodyCompositionSummary } from "@/lib/ascendApi";

export type CoachInsightTone = "red" | "orange" | "yellow" | "green" | "blue";

export type CoachInsight = {
  tone: CoachInsightTone;
  title: string;
  explanation: string;
  action: string;
  priority: number;
};

type FoodLogLike = {
  logged_at: string;
};

export function numberOrNull(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

export function daysSince(date?: string | null) {
  if (!date) return null;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startDate = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()).getTime();
  return Math.floor((startToday - startDate) / 86_400_000);
}

function foodLogsInWindow(foodLogs: FoodLogLike[], startDaysAgo: number, endDaysAgo: number) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - startDaysAgo).getTime();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() - endDaysAgo + 1).getTime();
  return foodLogs.filter((log) => {
    const logged = new Date(log.logged_at).getTime();
    return logged >= start && logged < end;
  }).length;
}

function bodyFatPlateau(scans: BodyCompositionScan[]) {
  const withBodyFat = scans
    .filter((scan) => scan.userConfirmed !== false && numberOrNull(scan.bodyFatPercent) !== null)
    .sort((left, right) => new Date(`${right.scanDate}T00:00:00Z`).getTime() - new Date(`${left.scanDate}T00:00:00Z`).getTime())
    .slice(0, 3);
  if (withBodyFat.length < 3) return false;
  const newestDate = new Date(`${withBodyFat[0].scanDate}T00:00:00Z`).getTime();
  const oldestDate = new Date(`${withBodyFat[withBodyFat.length - 1].scanDate}T00:00:00Z`).getTime();
  if (!Number.isFinite(newestDate) || !Number.isFinite(oldestDate) || newestDate - oldestDate < 42 * 86_400_000) return false;
  const machines = withBodyFat.map((scan) => scan.machine?.toLowerCase().replace(/[^a-z0-9]/g, "") || null);
  if (machines.some((machine) => !machine) || new Set(machines).size !== 1) return false;
  const newest = numberOrNull(withBodyFat[0].bodyFatPercent);
  const oldest = numberOrNull(withBodyFat[withBodyFat.length - 1].bodyFatPercent);
  if (newest === null || oldest === null) return false;
  return Math.abs(oldest - newest) < 2;
}

export function buildAthleteCoachInsights(input: {
  athlete?: Pick<AthleteDashboard, "profile"> | null;
  summary: BodyCompositionSummary | null;
  scans?: BodyCompositionScan[];
  foodLogs?: FoodLogLike[];
}) {
  const insights: CoachInsight[] = [];
  const scans = input.scans ?? [];
  const foodLogs = input.foodLogs ?? [];
  const latest = input.summary?.latestScan ?? scans[0] ?? null;
  const comparison = input.summary?.comparison;
  const muscleComparison = comparison?.metrics.find((metric) => metric.metric === "Skeletal Muscle") ?? null;
  const bodyFatComparison = comparison?.metrics.find((metric) => metric.metric === "Body Fat") ?? null;

  if (muscleComparison?.meaningful && muscleComparison.signal === "lower") {
    insights.push({
      tone: "red",
      title: "Lower muscle reading",
      explanation: muscleComparison.message,
      action: "Recheck the scan conditions, then review protein, recovery, and resistance training.",
      priority: 100
    });
  }

  if (bodyFatPlateau(scans)) {
    insights.push({
      tone: "orange",
      title: "Body fat trend is steady",
      explanation: "Three same-machine readings over at least six weeks show no clear movement beyond the comparison caution range.",
      action: "Review recent consistency before adjusting the plan.",
      priority: 80
    });
  }

  const scanAge = daysSince(latest?.scanDate);
  if (scanAge === null) {
    insights.push({
      tone: "yellow",
      title: "No Body Scan yet",
      explanation: "This athlete does not have a confirmed Body Scan baseline yet.",
      action: "Invite client for their first Body Scan.",
      priority: 70
    });
  } else if (scanAge > 28) {
    insights.push({
      tone: "yellow",
      title: "Body Scan overdue",
      explanation: `Last Body Scan was ${scanAge} days ago.`,
      action: "Invite client for another Body Scan.",
      priority: 70
    });
  }

  const recentFoodLogs = foodLogsInWindow(foodLogs, 6, 0);
  const previousFoodLogs = foodLogsInWindow(foodLogs, 13, 7);
  if (previousFoodLogs >= 4 && recentFoodLogs <= Math.max(2, Math.floor(previousFoodLogs * 0.5))) {
    insights.push({
      tone: "yellow",
      title: "Nutrition consistency low",
      explanation: `Food logging dropped from ${previousFoodLogs} to ${recentFoodLogs} logs compared with the previous week.`,
      action: "Check in with client.",
      priority: 60
    });
  }

  if (bodyFatComparison?.meaningful && bodyFatComparison.signal === "lower" && muscleComparison && ["higher", "no_clear_change"].includes(muscleComparison.signal)) {
    insights.push({
      tone: "green",
      title: "Excellent progress",
      explanation: "The body-fat reading is lower without a clear decline in the skeletal-muscle reading.",
      action: "Continue current plan.",
      priority: 40
    });
  }

  const goalWeight = numberOrNull(input.athlete?.profile.goal_weight_kg);
  const latestWeight = numberOrNull(latest?.weightKg ?? input.athlete?.profile.current_weight_kg);
  if (goalWeight !== null && latestWeight !== null && Math.abs(latestWeight - goalWeight) <= Math.max(1, goalWeight * 0.1)) {
    insights.push({
      tone: "blue",
      title: "Goal approaching",
      explanation: "Client is within approximately 10% of the goal weight.",
      action: "Begin planning the maintenance phase.",
      priority: 30
    });
  }

  return insights.sort((a, b) => b.priority - a.priority).slice(0, 3);
}

export function insightToneClass(tone: CoachInsightTone) {
  if (tone === "red") return "border-red-400/50 bg-red-400/10 text-red-200";
  if (tone === "orange") return "border-orange-400/50 bg-orange-400/10 text-orange-200";
  if (tone === "yellow") return "border-amber/50 bg-amber/10 text-amber";
  if (tone === "green") return "border-teal-400/50 bg-teal-400/10 text-teal-200";
  return "border-blue-400/50 bg-blue-400/10 text-blue-200";
}

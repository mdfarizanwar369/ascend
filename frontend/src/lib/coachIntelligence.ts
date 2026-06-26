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
  const withBodyFat = scans.filter((scan) => numberOrNull(scan.bodyFatPercent) !== null).slice(0, 3);
  if (withBodyFat.length < 3) return false;
  const newest = numberOrNull(withBodyFat[0].bodyFatPercent);
  const oldest = numberOrNull(withBodyFat[withBodyFat.length - 1].bodyFatPercent);
  if (newest === null || oldest === null) return false;
  return oldest - newest < 0.3;
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
  const previous = input.summary?.previousScan ?? scans[1] ?? null;
  const latestMuscle = numberOrNull(latest?.skeletalMuscleMassKg ?? latest?.muscleMassKg);
  const previousMuscle = numberOrNull(previous?.skeletalMuscleMassKg ?? previous?.muscleMassKg);
  const latestBodyFat = numberOrNull(latest?.bodyFatPercent);
  const previousBodyFat = numberOrNull(previous?.bodyFatPercent);

  if (latestMuscle !== null && previousMuscle !== null && latestMuscle < previousMuscle - 0.2) {
    insights.push({
      tone: "red",
      title: "Muscle loss detected",
      explanation: `Skeletal muscle is down by ${(previousMuscle - latestMuscle).toFixed(1)}kg since the previous scan.`,
      action: "Review protein intake and resistance training.",
      priority: 100
    });
  }

  if (bodyFatPlateau(scans)) {
    insights.push({
      tone: "orange",
      title: "Body fat plateau",
      explanation: "Body fat has not meaningfully improved across the recent scans.",
      action: "Consider reviewing calorie intake or increasing activity.",
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

  if (latestBodyFat !== null && previousBodyFat !== null && latestBodyFat < previousBodyFat - 0.3 && (latestMuscle ?? 0) >= (previousMuscle ?? 0) - 0.1) {
    insights.push({
      tone: "green",
      title: "Excellent progress",
      explanation: "Body fat decreased while muscle stayed stable or improved.",
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

import { AthleteDashboard, BodyCompositionScan, BodyCompositionSummary } from "@/lib/ascendApi";
import { englishMessage } from "@/lib/i18n/static";

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
  const muscleComparison = comparison?.metrics.find((metric) => metric.metric === englishMessage("bodyScan.metricSkeletalMuscle")) ?? null;
  const bodyFatComparison = comparison?.metrics.find((metric) => metric.metric === englishMessage("bodyScan.metricBodyFat")) ?? null;

  if (muscleComparison?.evidenceStatus === "ESTABLISHED" && muscleComparison.meaningful && muscleComparison.signal === "lower") {
    insights.push({
      tone: "red",
      title: englishMessage("coachInsight.lowerMuscleTrend"),
      explanation: muscleComparison.message,
      action: englishMessage("coachInsight.recheckScanAction"),
      priority: 100
    });
  } else if (muscleComparison?.evidenceStatus === "PROVISIONAL" && muscleComparison.meaningful && muscleComparison.signal === "lower") {
    insights.push({
      tone: "yellow",
      title: englishMessage("coachInsight.muscleConfirmationTitle"),
      explanation: muscleComparison.message,
      action: englishMessage("coachInsight.compareScanAction"),
      priority: 55
    });
  }

  if (bodyFatComparison?.evidenceStatus === "ESTABLISHED" && bodyFatComparison.signal === "no_clear_change") {
    insights.push({
      tone: "orange",
      title: englishMessage("coachInsight.bodyFatSteady"),
      explanation: englishMessage("coachInsight.bodyFatSteadyExplanation"),
      action: englishMessage("coachInsight.reviewConsistencyAction"),
      priority: 80
    });
  }

  const scanAge = daysSince(latest?.scanDate);
  if (scanAge === null) {
    insights.push({
      tone: "yellow",
      title: englishMessage("coachInsight.noBodyScan"),
      explanation: englishMessage("coachInsight.noBodyScanExplanation"),
      action: englishMessage("coachInsight.inviteFirstBodyScan"),
      priority: 70
    });
  } else if (scanAge > 28) {
    insights.push({
      tone: "yellow",
      title: englishMessage("coachInsight.bodyScanOverdue"),
      explanation: englishMessage("coachInsight.lastBodyScanDays", { days: scanAge }),
      action: englishMessage("coachInsight.inviteAnotherBodyScan"),
      priority: 70
    });
  }

  const recentFoodLogs = foodLogsInWindow(foodLogs, 6, 0);
  const previousFoodLogs = foodLogsInWindow(foodLogs, 13, 7);
  if (previousFoodLogs >= 4 && recentFoodLogs <= Math.max(2, Math.floor(previousFoodLogs * 0.5))) {
    insights.push({
      tone: "yellow",
      title: englishMessage("coachInsight.nutritionConsistencyLow"),
      explanation: englishMessage("coachInsight.foodLoggingDropped", { previous: previousFoodLogs, recent: recentFoodLogs }),
      action: englishMessage("coachInsight.checkInClient"),
      priority: 60
    });
  }

  if (bodyFatComparison?.evidenceStatus === "ESTABLISHED" && bodyFatComparison.meaningful && bodyFatComparison.signal === "lower" && muscleComparison?.evidenceStatus === "ESTABLISHED" && ["higher", "no_clear_change"].includes(muscleComparison.signal)) {
    insights.push({
      tone: "green",
      title: englishMessage("coachInsight.excellentProgress"),
      explanation: englishMessage("coachInsight.excellentProgressExplanation"),
      action: englishMessage("coachInsight.continuePlan"),
      priority: 40
    });
  }

  const goalWeight = numberOrNull(input.athlete?.profile.goal_weight_kg);
  const latestWeight = numberOrNull(latest?.weightKg ?? input.athlete?.profile.current_weight_kg);
  if (goalWeight !== null && latestWeight !== null && Math.abs(latestWeight - goalWeight) <= Math.max(1, goalWeight * 0.1)) {
    insights.push({
      tone: "blue",
      title: englishMessage("coachInsight.goalApproaching"),
      explanation: englishMessage("coachInsight.goalApproachingExplanation"),
      action: englishMessage("coachInsight.planMaintenance"),
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

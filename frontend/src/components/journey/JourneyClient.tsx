"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  Award,
  CalendarDays,
  Camera,
  CheckCircle2,
  Flame,
  ImageIcon,
  MessageCircle,
  Scale,
  Sparkles,
  Target,
  TrendingUp,
  Zap
} from "lucide-react";
import {
  getAscendMemory,
  getAthleteDashboard,
  getBodyCompositionSummary,
  getBurnLogs,
  getCoachPresence,
  getComplianceToday,
  getCurrentWeeklyReport,
  getFoodLogs,
  getGoalStatus,
  getLatestRecognition,
  getMe,
  getMessages,
  getMyProgressComparison,
  getMyStreak,
  getProgressPhotos,
  getWaterLogs,
  getWeightLogs,
  type AscendMemoryItem,
  type AscendMemoryResponse,
  type AthleteDashboard,
  type BodyCompositionSummary,
  type CoachPresenceMessage
} from "@/lib/ascendApi";
import { BackButton } from "@/components/BackButton";
import { AscendMemoryCard } from "@/components/memory/AscendMemoryCard";
import { ProgressComparisonCard } from "@/components/ProgressComparisonCard";
import { WeeklyReportSummary } from "@/components/reports/WeeklyReportSummary";
import { SectionShell, SkeletonBlock, SkeletonCardList, SkeletonText } from "@/components/PerceivedLoading";
import { localDateKey } from "@/lib/date";

type JourneyUser = Awaited<ReturnType<typeof getMe>>["user"];
type WeightLog = Awaited<ReturnType<typeof getWeightLogs>>["weightLogs"][number];
type FoodLog = Awaited<ReturnType<typeof getFoodLogs>>["foodLogs"][number];
type WaterLog = Awaited<ReturnType<typeof getWaterLogs>>["waterLogs"][number];
type BurnLog = Awaited<ReturnType<typeof getBurnLogs>>["burnLogs"][number];
type ProgressPhoto = Awaited<ReturnType<typeof getProgressPhotos>>["progressPhotos"][number];
type WeeklyReport = NonNullable<Awaited<ReturnType<typeof getCurrentWeeklyReport>>["report"]>;
type Recognition = Awaited<ReturnType<typeof getLatestRecognition>>["recognition"];
type Message = Awaited<ReturnType<typeof getMessages>>["messages"][number];
type GoalStatus = Awaited<ReturnType<typeof getGoalStatus>>["goalStatus"];
type ProgressComparison = Awaited<ReturnType<typeof getMyProgressComparison>>["comparison"];

type TimelineItem = {
  key: string;
  occurredAt: string;
  title: string;
  subtitle: string;
  tone: "calm" | "lime" | "amber" | "purple";
};

function asNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatShortDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(date);
}

function formatLongDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function daysBetween(startIso: string, end = new Date()) {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return 0;
  return Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1);
}

function startOfTimeline<T>(items: T[], getValue: (item: T) => string | null | undefined) {
  const values = items.map(getValue).filter((value): value is string => Boolean(value));
  return values.sort()[0] ?? null;
}

function buildWeightBars(weightLogs: WeightLog[]) {
  const recent = [...weightLogs]
    .sort((left, right) => new Date(left.logged_at).getTime() - new Date(right.logged_at).getTime())
    .slice(-7);
  if (!recent.length) return [];

  const values = recent.map((log) => asNumber(log.weight_kg));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(0.4, max - min);

  return recent.map((log) => ({
    key: log.id,
    label: formatShortDate(log.logged_at),
    value: asNumber(log.weight_kg),
    height: `${22 + ((asNumber(log.weight_kg) - min) / range) * 58}%`
  }));
}

function buildOverallConsistency(foodLogs: FoodLog[], waterLogs: WaterLog[], weightLogs: WeightLog[], burnLogs: BurnLog[], photos: ProgressPhoto[]) {
  const activeKeys = new Set<string>();
  for (const item of foodLogs) activeKeys.add(localDateKey(item.logged_at));
  for (const item of waterLogs) activeKeys.add(localDateKey(item.logged_at));
  for (const item of weightLogs) activeKeys.add(localDateKey(item.logged_at));
  for (const item of burnLogs) activeKeys.add(localDateKey(item.created_at));
  for (const item of photos) activeKeys.add(localDateKey(item.logged_at));

  const last30Days = Array.from({ length: 30 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - index);
    return localDateKey(date.toISOString());
  });
  const activeDays = last30Days.filter((key) => activeKeys.has(key)).length;
  return Math.round((activeDays / 30) * 100);
}

function buildBiggestAchievement({
  weightLogs,
  streakCurrent,
  streakBest,
  foodLogs,
  burnLogs,
  waterLogs,
  memory,
  bodyComposition
}: {
  weightLogs: WeightLog[];
  streakCurrent: number;
  streakBest: number;
  foodLogs: FoodLog[];
  burnLogs: BurnLog[];
  waterLogs: WaterLog[];
  memory: AscendMemoryResponse | null;
  bodyComposition: BodyCompositionSummary | null;
}) {
  const sortedWeights = [...weightLogs].sort((left, right) => new Date(left.logged_at).getTime() - new Date(right.logged_at).getTime());
  const firstWeight = sortedWeights[0] ? asNumber(sortedWeights[0].weight_kg) : null;
  const latestWeight = sortedWeights[sortedWeights.length - 1] ? asNumber(sortedWeights[sortedWeights.length - 1].weight_kg) : null;
  const lost = firstWeight !== null && latestWeight !== null ? Number((firstWeight - latestWeight).toFixed(1)) : null;

  const candidates = [
    lost !== null && Math.abs(lost) >= 1
      ? {
          rank: 10 + Math.abs(lost),
          title: lost > 0 ? `You're ${lost.toFixed(1)}kg lighter than when you started.` : `You're ${Math.abs(lost).toFixed(1)}kg stronger on the scale than when you began.`,
          detail: "The trend is moving because your small decisions keep repeating."
        }
      : null,
    streakBest >= 7
      ? {
          rank: 8 + streakBest / 7,
          title: `Longest streak: ${streakBest} days.`,
          detail: streakCurrent >= 3 ? "You already know how to string good days together." : "You have already proved that consistency can stick."
        }
      : null,
    foodLogs.length >= 20
      ? {
          rank: 6 + foodLogs.length / 25,
          title: `You've logged ${foodLogs.length} meals.`,
          detail: "That is real accountability, not just intention."
        }
      : null,
    burnLogs.length >= 5
      ? {
          rank: 5 + burnLogs.length / 5,
          title: `You've completed ${burnLogs.length} workouts.`,
          detail: "The routine is becoming part of your normal week."
        }
      : null,
    waterLogs.length >= 14
      ? {
          rank: 4 + waterLogs.length / 14,
          title: "Hydration has become part of your routine.",
          detail: "The quieter habits still matter because they support everything else."
        }
      : null,
    bodyComposition?.scanCount
      ? {
          rank: 7 + bodyComposition.scanCount,
          title: `You've saved ${bodyComposition.scanCount} body scans.`,
          detail: "You are building proof of progress, not guessing."
        }
      : null,
    memory?.timeline[0]
      ? {
          rank: 4,
          title: memory.timeline[0].title,
          detail: memory.timeline[0].subtitle
        }
      : null
  ].filter((item): item is { rank: number; title: string; detail: string } => Boolean(item));

  return candidates.sort((left, right) => right.rank - left.rank)[0] ?? {
    title: foodLogs.length || burnLogs.length || weightLogs.length ? "You have already started building proof." : "Your story starts with one honest day.",
    detail:
      foodLogs.length || burnLogs.length || weightLogs.length
        ? "A handful of real check-ins already matters more than waiting for the perfect start."
        : "The first meal, workout, or weight log is enough for Ascend to begin remembering your progress."
  };
}

function buildTimeline(
  memory: AscendMemoryResponse | null,
  foodLogs: FoodLog[],
  burnLogs: BurnLog[],
  weightLogs: WeightLog[],
  waterLogs: WaterLog[],
  progressPhotos: ProgressPhoto[],
  goalStatus: GoalStatus | null,
  bodyComposition: BodyCompositionSummary | null,
  weeklyReport: WeeklyReport | null
) {
  const items: TimelineItem[] = [];
  const earliestActivity =
    startOfTimeline(foodLogs, (item) => item.logged_at) ??
    startOfTimeline(burnLogs, (item) => item.created_at) ??
    startOfTimeline(weightLogs, (item) => item.logged_at) ??
    startOfTimeline(waterLogs, (item) => item.logged_at) ??
    startOfTimeline(progressPhotos, (item) => item.logged_at) ??
    memory?.timeline[memory.timeline.length - 1]?.occurredAt ??
    null;

  if (earliestActivity) {
    items.push({
      key: "journey-started",
      occurredAt: earliestActivity,
      title: "Started Ascend",
      subtitle: "The first honest check-in is where the story began.",
      tone: "calm"
    });
  }

  const firstMeal = [...foodLogs].sort((left, right) => new Date(left.logged_at).getTime() - new Date(right.logged_at).getTime())[0];
  if (firstMeal) {
    items.push({
      key: "first-meal",
      occurredAt: firstMeal.logged_at,
      title: "First meal logged",
      subtitle: firstMeal.estimated_food_name,
      tone: "lime"
    });
  }

  const firstWorkout = [...burnLogs]
    .filter((item) => item.metadata.workoutTitle || item.metadata.activityType)
    .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime())[0];
  if (firstWorkout) {
    items.push({
      key: "first-workout",
      occurredAt: firstWorkout.created_at,
      title: "First workout completed",
      subtitle: firstWorkout.metadata.workoutTitle ?? firstWorkout.metadata.activityType ?? "Activity logged",
      tone: "purple"
    });
  }

  const firstWeight = [...weightLogs].sort((left, right) => new Date(left.logged_at).getTime() - new Date(right.logged_at).getTime())[0];
  if (firstWeight) {
    items.push({
      key: "first-weight",
      occurredAt: firstWeight.logged_at,
      title: "First weight logged",
      subtitle: `${asNumber(firstWeight.weight_kg).toFixed(1)}kg gave your journey a visible starting point.`,
      tone: "calm"
    });
  }

  const firstPhoto = [...progressPhotos].sort((left, right) => new Date(left.logged_at).getTime() - new Date(right.logged_at).getTime())[0];
  if (firstPhoto) {
    items.push({
      key: "first-photo",
      occurredAt: firstPhoto.logged_at,
      title: "First progress photo",
      subtitle: "You started tracking what the scale cannot always show.",
      tone: "amber"
    });
  }

  if (goalStatus?.achieved_at) {
    items.push({
      key: "goal-achieved",
      occurredAt: goalStatus.achieved_at,
      title: "Goal achieved",
      subtitle: "A milestone earned through repetition.",
      tone: "lime"
    });
  }

  if (weeklyReport?.created_at) {
    items.push({
      key: "weekly-reflection",
      occurredAt: weeklyReport.created_at,
      title: "Weekly reflection generated",
      subtitle: "Your recent week was turned into a story you can learn from.",
      tone: "purple"
    });
  }

  if (bodyComposition?.latestScan?.scanDate) {
    items.push({
      key: "first-body-scan",
      occurredAt: bodyComposition.latestScan.scanDate,
      title: bodyComposition.scanCount > 1 ? "Latest body scan saved" : "First body scan saved",
      subtitle: bodyComposition.dnaScore.current !== null ? `Body Progress Score ${bodyComposition.dnaScore.current}` : "A new body scan is now part of your story.",
      tone: "purple"
    });
  }

  for (const item of memory?.timeline ?? []) {
    items.push({
      key: `memory-${item.milestoneKey}`,
      occurredAt: item.occurredAt,
      title: item.title,
      subtitle: item.reflection ?? item.subtitle,
      tone: item.aiGenerated ? "purple" : "calm"
    });
  }

  const seenTitles = new Set<string>();
  return items
    .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())
    .filter((item) => {
      const normalized = `${localDateKey(item.occurredAt)}:${item.title.toLowerCase()}`;
      if (seenTitles.has(normalized)) return false;
      seenTitles.add(normalized);
      return true;
    })
    .slice(0, 12);
}

function toneClasses(tone: TimelineItem["tone"]) {
  if (tone === "lime") return "border-lime/20 bg-lime/10";
  if (tone === "amber") return "border-amber/20 bg-amber/10";
  if (tone === "purple") return "border-purple-400/20 bg-purple-400/10";
  return "border-line bg-ink/80";
}

function buildCoachMoments({
  recognition,
  messages,
  coachPresence,
  trainerName,
  burnLogs,
  foodLogs
}: {
  recognition: Recognition;
  messages: Message[];
  coachPresence: CoachPresenceMessage[];
  trainerName?: string | null;
  burnLogs: BurnLog[];
  foodLogs: FoodLog[];
}) {
  if (trainerName) {
    const trainerMoments = [
      recognition
        ? {
            key: `recognition-${recognition.id}`,
            title: `${trainerName} noticed your effort`,
            body: recognition.message,
            date: recognition.created_at
          }
        : null,
      ...messages
        .slice(-3)
        .reverse()
        .map((message) => ({
          key: `message-${message.id}`,
          title: `${trainerName} left feedback`,
          body: message.body,
          date: message.created_at
        }))
    ].filter((item): item is { key: string; title: string; body: string; date: string } => Boolean(item));
    return trainerMoments.slice(0, 3);
  }

  const actualCoachPresence = coachPresence.slice(0, 3).map((message) => ({
    key: `zoe-${message.id}`,
    title: "Coach Zoe insight",
    body: message.message,
    date: message.created_at
  }));
  if (actualCoachPresence.length) return actualCoachPresence;

  if (burnLogs.length) {
    const latestWorkout = burnLogs[0];
    return [{
      key: "coach-workout-memory",
      title: "Coach Zoe adapted to your training",
      body: `Your latest workout was ${latestWorkout.metadata.workoutTitle ?? latestWorkout.metadata.activityType ?? "a training session"}. That now shapes your next recommendation.`,
      date: latestWorkout.created_at
    }];
  }

  if (foodLogs.length) {
    return [{
      key: "coach-food-memory",
      title: "Coach Zoe is learning your nutrition pattern",
      body: `${foodLogs.length} meal logs already give Zoe a clearer read on what usually helps your momentum.`,
      date: foodLogs[0].logged_at
    }];
  }

  return [];
}

function buildMemoryMoments(
  memory: AscendMemoryResponse | null,
  biggestAchievement: { title: string; detail: string },
  workoutCount: number,
  foodLogs: FoodLog[],
  streakCurrent: number
) {
  const reflected = (memory?.timeline ?? []).filter((item) => item.reflection).slice(0, 2);
  if (reflected.length) {
    return reflected.map((item) => ({
      key: item.milestoneKey,
      title: item.title,
      body: item.reflection ?? item.subtitle
    }));
  }

  return [
    {
      key: "story",
      title: biggestAchievement.title,
      body: biggestAchievement.detail
    },
    {
      key: "effort",
      title: workoutCount ? "You are building evidence, not guessing." : "Your story is still beginning.",
      body: workoutCount
        ? `You have already completed ${workoutCount} workouts and logged ${foodLogs.length} meals. That is how a rough intention becomes a real pattern.`
        : streakCurrent >= 1
          ? `A ${streakCurrent}-day streak already means this is no longer just an idea.`
          : "One honest day is enough to start building something real."
    }
  ];
}

function buildNextMilestone({
  goalStatus,
  streakCurrent,
  workoutsCompleted,
  foodLogs
}: {
  goalStatus: GoalStatus | null;
  streakCurrent: number;
  workoutsCompleted: number;
  foodLogs: FoodLog[];
}) {
  const currentWeight = goalStatus?.current_weight_kg ? asNumber(goalStatus.current_weight_kg) : null;
  const targetWeight = goalStatus?.target_weight_kg ? asNumber(goalStatus.target_weight_kg) : null;
  if (currentWeight !== null && targetWeight !== null && Math.abs(currentWeight - targetWeight) >= 0.4) {
    const delta = Math.min(1, Math.abs(currentWeight - targetWeight));
    return {
      title: currentWeight > targetWeight ? `Lose another ${delta.toFixed(1)}kg` : `Gain another ${delta.toFixed(1)}kg`,
      detail: "Keep the next stretch simple. Repetition matters more than force."
    };
  }

  const streakTargets = [3, 7, 14, 30];
  const nextStreak = streakTargets.find((value) => value > streakCurrent);
  if (nextStreak) {
    return {
      title: `Reach a ${nextStreak}-day streak`,
      detail: "One more honest day keeps the rhythm feeling real."
    };
  }

  if (workoutsCompleted < 5) {
    return {
      title: `Complete your ${workoutsCompleted + 1}${workoutsCompleted + 1 === 1 ? "st" : workoutsCompleted + 1 === 2 ? "nd" : workoutsCompleted + 1 === 3 ? "rd" : "th"} workout`,
      detail: "Movement gets easier to trust when it is part of your normal week."
    };
  }

  if (foodLogs.length < 14) {
    const remaining = Math.max(3, 14 - foodLogs.length);
    return {
      title: `Log ${remaining} more meals to reveal your pattern`,
      detail: "A deeper meal history gives Ascend sharper coaching instead of broad guesses."
    };
  }

  return {
    title: `Protect your next ${Math.max(streakCurrent + 1, 7)}-day rhythm`,
    detail: "The next milestone is usually a manageable rhythm you can actually keep."
  };
}

export function JourneyClient() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("Loading your journey...");
  const [user, setUser] = useState<JourneyUser | null>(null);
  const [streakCurrent, setStreakCurrent] = useState(0);
  const [streakBest, setStreakBest] = useState(0);
  const [overallConsistency, setOverallConsistency] = useState(0);
  const [foodLogs, setFoodLogs] = useState<FoodLog[]>([]);
  const [waterLogs, setWaterLogs] = useState<WaterLog[]>([]);
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [burnLogs, setBurnLogs] = useState<BurnLog[]>([]);
  const [progressPhotos, setProgressPhotos] = useState<ProgressPhoto[]>([]);
  const [ascendMemory, setAscendMemory] = useState<AscendMemoryResponse | null>(null);
  const [goalStatus, setGoalStatus] = useState<GoalStatus | null>(null);
  const [progressComparison, setProgressComparison] = useState<ProgressComparison | null>(null);
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReport | null>(null);
  const [coachPresenceHistory, setCoachPresenceHistory] = useState<CoachPresenceMessage[]>([]);
  const [latestRecognition, setLatestRecognition] = useState<Recognition>(null);
  const [trainerMessages, setTrainerMessages] = useState<Message[]>([]);
  const [athleteDashboard, setAthleteDashboard] = useState<AthleteDashboard | null>(null);
  const [bodyComposition, setBodyComposition] = useState<BodyCompositionSummary | null>(null);

  useEffect(() => {
    let active = true;

    async function loadJourney() {
      try {
        setLoading(true);
        setStatus("Loading your journey...");

        const meResponse = await getMe();
        if (!active) return;
        setUser(meResponse.user);

        const [
          streakResponse,
          complianceResponse,
          foodResponse,
          waterResponse,
          weightResponse,
          burnResponse,
          photoResponse,
          memoryResponse,
          goalResponse,
          comparisonResponse,
          reportResponse,
          coachPresenceResponse,
          recognitionResponse
        ] = await Promise.all([
          getMyStreak(),
          getComplianceToday(),
          getFoodLogs({ range: "all", order: "newest", limit: 100 }),
          getWaterLogs(),
          getWeightLogs(),
          getBurnLogs(),
          getProgressPhotos(),
          getAscendMemory(),
          getGoalStatus(),
          getMyProgressComparison(),
          getCurrentWeeklyReport(),
          getCoachPresence(),
          getLatestRecognition()
        ]);

        const trainerMessageResponse = meResponse.user.assigned_trainer_id ? await getMessages(meResponse.user.assigned_trainer_id) : null;
        const athleteResponse = meResponse.user.athlete_mode_enabled ? await getAthleteDashboard() : null;
        const bodyCompositionResponse = meResponse.user.athlete_mode_enabled ? await getBodyCompositionSummary() : null;
        if (!active) return;

        setStreakCurrent(streakResponse.streak.current);
        setStreakBest(streakResponse.streak.best);
        setFoodLogs(foodResponse.foodLogs);
        setWaterLogs(waterResponse.waterLogs);
        setWeightLogs(weightResponse.weightLogs);
        setBurnLogs(burnResponse.burnLogs);
        setProgressPhotos(photoResponse.progressPhotos);
        setAscendMemory(memoryResponse);
        setGoalStatus(goalResponse.goalStatus ?? null);
        setProgressComparison(comparisonResponse.comparison);
        setWeeklyReport(reportResponse.report);
        setCoachPresenceHistory(coachPresenceResponse.history);
        setLatestRecognition(recognitionResponse.recognition);
        setTrainerMessages(trainerMessageResponse?.messages ?? []);
        setAthleteDashboard(athleteResponse?.athlete ?? null);
        setBodyComposition(bodyCompositionResponse?.summary ?? null);
        setOverallConsistency(
          complianceResponse.compliance?.score
            ? Math.round((complianceResponse.compliance.score + buildOverallConsistency(foodResponse.foodLogs, waterResponse.waterLogs, weightResponse.weightLogs, burnResponse.burnLogs, photoResponse.progressPhotos)) / 2)
            : buildOverallConsistency(foodResponse.foodLogs, waterResponse.waterLogs, weightResponse.weightLogs, burnResponse.burnLogs, photoResponse.progressPhotos)
        );
        setStatus("");
      } catch (error) {
        if (!active) return;
        setStatus(error instanceof Error ? error.message : "Could not load your journey yet.");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadJourney();

    return () => {
      active = false;
    };
  }, []);

  const timeline = useMemo(
    () => buildTimeline(ascendMemory, foodLogs, burnLogs, weightLogs, waterLogs, progressPhotos, goalStatus, bodyComposition, weeklyReport),
    [ascendMemory, foodLogs, burnLogs, weightLogs, waterLogs, progressPhotos, goalStatus, bodyComposition, weeklyReport]
  );
  const biggestAchievement = useMemo(
    () =>
      buildBiggestAchievement({
        weightLogs,
        streakCurrent,
        streakBest,
        foodLogs,
        burnLogs,
        waterLogs,
        memory: ascendMemory,
        bodyComposition
      }),
    [weightLogs, streakCurrent, streakBest, foodLogs, burnLogs, waterLogs, ascendMemory, bodyComposition]
  );
  const weightBars = useMemo(() => buildWeightBars(weightLogs), [weightLogs]);
  const coachMoments = useMemo(
    () =>
      buildCoachMoments({
        recognition: latestRecognition,
        messages: trainerMessages,
        coachPresence: coachPresenceHistory,
        trainerName: user?.assigned_trainer_name,
        burnLogs,
        foodLogs
      }),
    [latestRecognition, trainerMessages, coachPresenceHistory, user?.assigned_trainer_name, burnLogs, foodLogs]
  );
  const memoryMoments = useMemo(
    () => buildMemoryMoments(ascendMemory, biggestAchievement, burnLogs.length, foodLogs, streakCurrent),
    [ascendMemory, biggestAchievement, burnLogs.length, foodLogs, streakCurrent]
  );
  const nextMilestone = useMemo(
    () =>
      buildNextMilestone({
        goalStatus,
        streakCurrent,
        workoutsCompleted: burnLogs.length,
        foodLogs
      }),
    [goalStatus, streakCurrent, burnLogs.length, foodLogs]
  );

  const firstJourneyDate = useMemo(() => {
    return (
      timeline[timeline.length - 1]?.occurredAt ??
      ascendMemory?.timeline[ascendMemory.timeline.length - 1]?.occurredAt ??
      foodLogs[foodLogs.length - 1]?.logged_at ??
      waterLogs[waterLogs.length - 1]?.logged_at ??
      weightLogs[weightLogs.length - 1]?.logged_at ??
      burnLogs[burnLogs.length - 1]?.created_at ??
      progressPhotos[progressPhotos.length - 1]?.logged_at ??
      null
    );
  }, [timeline, ascendMemory, foodLogs, waterLogs, weightLogs, burnLogs, progressPhotos]);

  const premiumLocked = user && !user.assigned_trainer_id && !user.athlete_mode_enabled && ascendMemory?.access === "none";

  if (loading) {
    return (
      <main className="min-h-screen bg-ink px-4 py-5 text-white">
        <div className="mx-auto max-w-md">
          <header className="flex items-center gap-3 py-3">
            <BackButton fallbackHref="/dashboard" />
            <div>
              <p className="text-sm text-zinc-400">Today</p>
              <h1 className="text-2xl font-semibold">Journey</h1>
            </div>
          </header>
          <SectionShell title="Your Journey">
            <SkeletonText lines={3} />
            <div className="mt-4 grid grid-cols-3 gap-2">
              <SkeletonBlock className="h-20 rounded-2xl" />
              <SkeletonBlock className="h-20 rounded-2xl" />
              <SkeletonBlock className="h-20 rounded-2xl" />
            </div>
          </SectionShell>
          <SectionShell title="Timeline">
            <SkeletonCardList count={3} compact />
          </SectionShell>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ink px-4 py-5 text-white">
      <div className="mx-auto max-w-md">
        <header className="flex items-center gap-3 py-3">
          <BackButton fallbackHref="/dashboard" />
          <div>
            <p className="text-sm text-zinc-400">Today</p>
            <h1 className="text-2xl font-semibold">Journey</h1>
          </div>
        </header>

        {status ? <p className="mt-3 rounded-lg border border-amber/40 bg-amber/10 p-3 text-sm text-amber">{status}</p> : null}

        <section className="mt-4 rounded-[1.8rem] border border-calm/25 bg-[radial-gradient(circle_at_top_right,rgba(61,230,209,0.16),transparent_16rem),linear-gradient(180deg,rgba(18,23,33,0.98),rgba(9,12,18,0.98))] p-5 shadow-soft">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-calm">Your Journey</p>
          <h2 className="mt-3 text-3xl font-semibold leading-tight">Every small decision has brought you here.</h2>
          <div className="mt-5 grid grid-cols-3 gap-2">
            <div className="rounded-2xl border border-white/10 bg-ink/70 p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Streak</p>
              <p className="mt-2 text-2xl font-semibold">{streakCurrent}</p>
              <p className="mt-1 text-xs text-zinc-400">Current days</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-ink/70 p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Since start</p>
              <p className="mt-2 text-2xl font-semibold">{firstJourneyDate ? daysBetween(firstJourneyDate) : "--"}</p>
              <p className="mt-1 text-xs text-zinc-400">Days building</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-ink/70 p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Consistency</p>
              <p className="mt-2 text-2xl font-semibold">{overallConsistency}%</p>
              <p className="mt-1 text-xs text-zinc-400">Recent rhythm</p>
            </div>
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-amber/20 bg-[linear-gradient(180deg,rgba(248,184,78,0.1),rgba(18,23,33,0.98))] p-5 shadow-soft">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber/15 text-amber">
              <Award size={20} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber">Biggest Achievement</p>
              <h2 className="mt-2 text-xl font-semibold text-white">{biggestAchievement.title}</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-300">{biggestAchievement.detail}</p>
            </div>
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-line bg-surface p-4 shadow-soft">
          <div className="flex items-center gap-2">
            <CalendarDays className="text-calm" size={18} />
            <div>
              <p className="text-sm font-semibold text-white">Timeline</p>
              <p className="text-xs text-zinc-400">Newest moments first.</p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {timeline.length ? (
              timeline.map((item) => (
                <article key={item.key} className={`rounded-2xl border p-4 ${toneClasses(item.tone)}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-white">{item.title}</p>
                    <p className="text-xs text-zinc-500">{formatShortDate(item.occurredAt)}</p>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">{item.subtitle}</p>
                </article>
              ))
            ) : (
              <p className="rounded-2xl border border-line bg-ink/80 p-4 text-sm leading-6 text-zinc-400">
                Your journey timeline will fill in as soon as you start logging meals, movement, weight, or progress photos.
              </p>
            )}
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-line bg-surface p-4 shadow-soft">
          <div className="flex items-center gap-2">
            <TrendingUp className="text-calm" size={18} />
            <div>
              <p className="text-sm font-semibold text-white">Progress</p>
              <p className="text-xs text-zinc-400">Everything in one story.</p>
            </div>
          </div>

          {weightBars.length ? (
            <div className="mt-4 rounded-2xl border border-line bg-ink/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">Weight trend</p>
                  <p className="text-xs text-zinc-400">Recent check-ins</p>
                </div>
                <Link href="/weight-log" className="text-xs font-semibold text-calm">Open</Link>
              </div>
              <div className="mt-4 flex h-32 items-end gap-2">
                {weightBars.map((bar) => (
                  <div key={bar.key} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                    <div className="text-[11px] text-zinc-500">{bar.value.toFixed(1)}</div>
                    <div className="flex h-20 w-full items-end rounded-full bg-surface px-1 pb-1">
                      <div className="w-full rounded-full bg-[linear-gradient(180deg,rgba(61,230,209,0.95),rgba(109,246,220,0.72))]" style={{ height: bar.height }} />
                    </div>
                    <div className="text-[11px] text-zinc-500">{bar.label}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Link href="/progress" className="rounded-2xl border border-line bg-ink/70 p-4">
              <div className="flex items-center gap-2">
                <Camera className="text-calm" size={17} />
                <p className="text-sm font-semibold text-white">Progress Photos</p>
              </div>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                {progressPhotos.length ? `${progressPhotos.length} photos saved. See the visual proof.` : "Capture your first photo when you are ready."}
              </p>
            </Link>
            <Link href="/reports" className="rounded-2xl border border-line bg-ink/70 p-4">
              <div className="flex items-center gap-2">
                <Sparkles className="text-purple-200" size={17} />
                <p className="text-sm font-semibold text-white">Weekly Reflection</p>
              </div>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                {weeklyReport ? "Your latest reflection is ready to revisit." : "Your weekly reflection appears once there is enough activity to review."}
              </p>
            </Link>
          </div>

          {progressComparison?.hasComparison ? (
            <div className="mt-4">
              <ProgressComparisonCard comparison={progressComparison} photoHref="/progress" />
            </div>
          ) : null}

          {weeklyReport ? (
            <div className="mt-4 rounded-2xl border border-line bg-ink/70 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">This week in review</p>
                  <p className="mt-1 text-xs text-zinc-400">
                    {formatLongDate(weeklyReport.week_start)} - {formatLongDate(weeklyReport.week_end)}
                  </p>
                </div>
                <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold text-calm">
                  {weeklyReport.compliance_score ?? "--"}/100
                </span>
              </div>
              <div className="mt-4">
                <WeeklyReportSummary summary={weeklyReport.summary} audience="client" />
              </div>
            </div>
          ) : null}

          {ascendMemory ? (
            <div className="mt-4">
              <AscendMemoryCard memory={ascendMemory} compact />
            </div>
          ) : premiumLocked ? (
            <div className="mt-4 rounded-2xl border border-purple-400/20 bg-purple-400/8 p-4">
              <p className="text-sm font-semibold text-white">Ascend Memory</p>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Premium unlocks milestone reflections so your journey feels remembered, not just logged.
              </p>
            </div>
          ) : null}

          {user?.athlete_mode_enabled && bodyComposition ? (
            <Link href="/athlete" className="mt-4 block rounded-2xl border border-purple-400/20 bg-purple-400/8 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">Body Scan</p>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">
                    {bodyComposition.latestScan
                      ? `Latest body scan on ${formatShortDate(bodyComposition.latestScan.scanDate)}.`
                      : "Your first body scan will strengthen your progress story."}
                  </p>
                </div>
                <span className="rounded-full bg-ink px-3 py-1 text-xs font-semibold text-purple-200">
                  {bodyComposition.dnaScore.current ?? "--"} DNA
                </span>
              </div>
            </Link>
          ) : null}
        </section>

        <section className="mt-4 rounded-2xl border border-line bg-surface p-4 shadow-soft">
          <div className="flex items-center gap-2">
            <MessageCircle className="text-calm" size={18} />
            <div>
              <p className="text-sm font-semibold text-white">Coach Moments</p>
              <p className="text-xs text-zinc-400">
                {user?.assigned_trainer_name ? "The moments your coach has shaped." : "The moments Coach Zoe noticed."}
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {coachMoments.length ? (
              coachMoments.map((item) => (
                <article key={item.key} className="rounded-2xl border border-line bg-ink/80 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-white">{item.title}</p>
                    <p className="text-xs text-zinc-500">{formatShortDate(item.date)}</p>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">{item.body}</p>
                </article>
              ))
            ) : (
              <p className="rounded-2xl border border-line bg-ink/80 p-4 text-sm leading-6 text-zinc-400">
                Coach moments will appear here as Zoe or your trainer leave signals worth remembering.
              </p>
            )}
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-line bg-surface p-4 shadow-soft">
          <div className="flex items-center gap-2">
            <Sparkles className="text-purple-200" size={18} />
            <div>
              <p className="text-sm font-semibold text-white">Memories</p>
              <p className="text-xs text-zinc-400">The emotional proof that something is changing.</p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {memoryMoments.map((item) => (
              <article key={item.key} className="rounded-2xl border border-purple-400/20 bg-purple-400/8 p-4">
                <p className="text-sm font-semibold text-white">{item.title}</p>
                <p className="mt-2 text-sm leading-6 text-zinc-300">{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-calm/20 bg-[linear-gradient(180deg,rgba(61,230,209,0.07),rgba(18,23,33,0.98))] p-4 shadow-soft">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-calm/12 text-calm">
              <Target size={19} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-calm">Next Milestone</p>
              <h2 className="mt-2 text-xl font-semibold text-white">{nextMilestone.title}</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-300">{nextMilestone.detail}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href="/food-log" className="rounded-full border border-line bg-ink px-4 py-2 text-sm font-semibold text-zinc-200">Log meal</Link>
                <Link href="/coach" className="rounded-full border border-calm/30 bg-ink px-4 py-2 text-sm font-semibold text-calm">Open Coach</Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

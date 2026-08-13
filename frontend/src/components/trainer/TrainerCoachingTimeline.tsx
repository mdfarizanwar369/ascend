"use client";

import { type ReactNode, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Dumbbell,
  Flame,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Utensils,
  Waves
} from "lucide-react";
import { localDateKey } from "@/lib/date";
import {
  getTrainerClientBurnLogs,
  getTrainerClientCoachPresence,
  getTrainerClientFoodLogs,
  getTrainerClientMissions,
  getTrainerClientWaterLogs,
  getTrainerClientWeeklyReport,
  getTrainerClientWeightLogs
} from "@/lib/ascendApi";

type FoodLog = Awaited<ReturnType<typeof getTrainerClientFoodLogs>>["foodLogs"][number];
type WeightLog = Awaited<ReturnType<typeof getTrainerClientWeightLogs>>["weightLogs"][number];
type WaterLog = Awaited<ReturnType<typeof getTrainerClientWaterLogs>>["waterLogs"][number];
type Mission = Awaited<ReturnType<typeof getTrainerClientMissions>>["missions"][number];
type BurnLog = Awaited<ReturnType<typeof getTrainerClientBurnLogs>>["burnLogs"][number];
type WeeklyReport = Awaited<ReturnType<typeof getTrainerClientWeeklyReport>>["report"];
type CoachPresenceHistory = Awaited<ReturnType<typeof getTrainerClientCoachPresence>>["history"];

export type CoachingTimelineItem = {
  id: string;
  at: string;
  title: string;
  summary: string[];
  icon: ReactNode;
  priority: number;
  workout?: BurnLog;
};

export type CoachingTimelineGroup = {
  date: string;
  label: string;
  items: CoachingTimelineItem[];
};

type TimelineInput = {
  foodLogs: FoodLog[];
  waterLogs: WaterLog[];
  burnLogs: BurnLog[];
  coachPresenceHistory: CoachPresenceHistory;
  missions: Mission[];
  weeklyReport: WeeklyReport;
  latestWeight?: WeightLog | null;
  previousWeight?: WeightLog | null;
  weightDelta: number;
  goalType?: string | null;
  proteinTargetG: number;
};

function asNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatShortDate(value?: string | null) {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Not yet";
  return date.toLocaleDateString([], { day: "numeric", month: "short" });
}

function formatDateTime(value?: string | null) {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Not yet";
  return date.toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function dateGroupLabel(value?: string | null) {
  if (!value) return "Recently";
  const key = localDateKey(value);
  const today = localDateKey();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = localDateKey(yesterday.toISOString());
  if (key === today) return "Today";
  if (key === yesterdayKey) return "Yesterday";
  return formatShortDate(value);
}

function titleCase(value?: string | null) {
  if (!value) return "Not set";
  return value
    .replace(/[_-]/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function workoutName(log?: BurnLog | null) {
  return log?.metadata?.workoutTitle ?? log?.metadata?.activityType ?? "Workout";
}

function workoutCalories(log?: BurnLog | null) {
  return Math.round(Number(log?.metadata?.estimatedCaloriesBurned ?? log?.metadata?.caloriesBurned ?? 0));
}

function TimelineMetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-ink/80 p-3">
      <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function WorkoutDetail({ workout }: { workout: BurnLog }) {
  const exercises = workout.metadata?.exercises ?? [];

  return (
    <div className="mt-4 rounded-2xl border border-purple-300/20 bg-ink/80 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-purple-200">Saved Workout</p>
          <h3 className="mt-1 text-xl font-semibold text-white">{workoutName(workout)}</h3>
          <p className="mt-1 text-sm text-zinc-400">Workout Completed / {formatDateTime(workout.created_at)}</p>
        </div>
        <span className="rounded-full bg-lime px-3 py-1 text-xs font-bold text-ink">Completed</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <TimelineMetricTile label="Duration" value={`${Number(workout.metadata?.durationMinutes ?? 0) || "--"} min`} />
        <TimelineMetricTile label="Focus" value={titleCase(workout.metadata?.workoutType ?? workout.metadata?.activityType)} />
        <TimelineMetricTile label="Difficulty" value={titleCase(workout.metadata?.workoutDifficultyLabel ?? workout.metadata?.workoutDifficulty)} />
        <TimelineMetricTile label="Estimated burn" value={`~${workoutCalories(workout)} kcal`} />
      </div>

      {exercises.length ? (
        <div className="mt-4 space-y-2">
          {exercises.map((exercise, index) => (
            <div key={`${exercise.name ?? "exercise"}-${index}`} className="rounded-xl border border-white/5 bg-surface/70 p-3">
              <p className="font-semibold text-white">{exercise.name ?? `Exercise ${index + 1}`}</p>
              <p className="mt-1 text-sm text-zinc-400">
                {[exercise.sets ? `${exercise.sets} sets` : null, exercise.reps ? `${exercise.reps} reps` : null, exercise.duration, exercise.rest ? `${exercise.rest} rest` : null]
                  .filter(Boolean)
                  .join(" / ")}
              </p>
              {exercise.note ? <p className="mt-2 text-xs leading-5 text-zinc-500">{exercise.note}</p> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function buildCoachingTimelineGroups(input: TimelineInput, options: { maxDays?: number; maxItemsPerDay?: number } = {}) {
  const items: CoachingTimelineItem[] = [];
  const foodByDay = new Map<string, { at: string; meals: number; calories: number; proteinG: number }>();

  input.foodLogs.forEach((log) => {
    const key = localDateKey(log.logged_at);
    const current = foodByDay.get(key);
    const next = current ?? { at: log.logged_at, meals: 0, calories: 0, proteinG: 0 };
    next.meals += 1;
    next.calories += Number(log.calories ?? 0);
    next.proteinG += asNumber(log.protein_g);
    if (new Date(log.logged_at).getTime() > new Date(next.at).getTime()) next.at = log.logged_at;
    foodByDay.set(key, next);
  });

  Array.from(foodByDay.values()).forEach((day) => {
    const proteinAchieved = day.proteinG >= input.proteinTargetG * 0.9;
    items.push({
      id: `nutrition-${localDateKey(day.at)}`,
      at: day.at,
      title: "Nutrition Summary",
      summary: [
        `${day.meals} meal${day.meals === 1 ? "" : "s"} logged`,
        `${Math.round(day.calories).toLocaleString()} kcal / ${Math.round(day.proteinG)}g protein`,
        proteinAchieved ? "Protein target achieved" : "Protein target still needs attention"
      ],
      icon: <Utensils size={17} />,
      priority: proteinAchieved ? 72 : 82
    });
  });

  const waterByDay = new Map<string, { at: string; amountMl: number; logs: number }>();
  input.waterLogs.forEach((log) => {
    const key = localDateKey(log.logged_at);
    const current = waterByDay.get(key) ?? { at: log.logged_at, amountMl: 0, logs: 0 };
    current.amountMl += log.amount_ml;
    current.logs += 1;
    if (new Date(log.logged_at).getTime() > new Date(current.at).getTime()) current.at = log.logged_at;
    waterByDay.set(key, current);
  });

  Array.from(waterByDay.values()).forEach((day) => {
    const targetReached = day.amountMl >= 2500;
    items.push({
      id: `hydration-${localDateKey(day.at)}`,
      at: day.at,
      title: "Hydration",
      summary: [
        `${(day.amountMl / 1000).toFixed(1)}L logged`,
        targetReached ? "Goal completed" : "Hydration target missed",
        day.logs > 1 ? `${day.logs} check-ins combined` : "Single hydration check-in"
      ],
      icon: <Waves size={17} />,
      priority: targetReached ? 58 : 80
    });
  });

  input.burnLogs.forEach((log) => {
    const isCoachedSession = log.metadata?.source === "trainer_logged_session";
    const isCoachZoeWorkout = log.metadata?.source === "coach_zoe_workout_planner" || Boolean(log.metadata?.workoutTitle);
    if (isCoachZoeWorkout) {
      items.push({
        id: `workout-${log.id}`,
        at: log.created_at,
        title: isCoachedSession ? "Coached Session Completed" : "Coach Zoe Workout Completed",
        summary: [
          isCoachedSession ? `Recorded by ${String(log.metadata?.trainerName ?? "the trainer")}` : "Workout generated by Coach Zoe",
          `Completed ${workoutName(log)}`,
          `${Number(log.metadata?.durationMinutes ?? 0) || "--"} mins / ~${workoutCalories(log)} kcal`,
          isCoachedSession ? log.metadata?.sessionIntelligence?.headline : null
        ].filter((value): value is string => Boolean(value)),
        icon: <Dumbbell size={17} />,
        priority: 95,
        workout: log
      });
      return;
    }

    items.push({
      id: `activity-${log.id}`,
      at: log.created_at,
      title: "Activity Logged",
      summary: [`${workoutName(log)} recorded`, `~${workoutCalories(log)} kcal burned`],
      icon: <Flame size={17} />,
      priority: 60
    });
  });

  const seenInsights = new Set<string>();
  input.coachPresenceHistory.forEach((message) => {
    const insightKey = `${localDateKey(message.created_at)}:${message.message.trim().toLowerCase()}`;
    if (seenInsights.has(insightKey)) return;
    seenInsights.add(insightKey);
    items.push({
      id: `zoe-${message.id}`,
      at: message.created_at,
      title: "Coach Zoe Insight",
      summary: [message.message],
      icon: <Sparkles size={17} />,
      priority: 75
    });
  });

  input.missions.forEach((mission) => {
    items.push({
      id: `mission-assigned-${mission.id}`,
      at: mission.created_at,
      title: "Trainer Mission Assigned",
      summary: [mission.title, `Due ${formatShortDate(mission.due_date)}`],
      icon: <Target size={17} />,
      priority: 66
    });
    if (mission.completed_at) {
      items.push({
        id: `mission-completed-${mission.id}`,
        at: mission.completed_at,
        title: "Trainer Mission Completed",
        summary: [mission.title, "Client completed the assigned action"],
        icon: <CheckCircle2 size={17} />,
        priority: 84
      });
    }
  });

  if (input.latestWeight && input.previousWeight && Math.abs(input.weightDelta) >= 0.3) {
    const movingTowardGoal =
      (input.goalType === "fat_loss" && input.weightDelta < 0) ||
      (input.goalType === "muscle_gain" && input.weightDelta > 0) ||
      (input.goalType !== "fat_loss" && input.goalType !== "muscle_gain");
    items.push({
      id: `weight-${input.latestWeight.id}`,
      at: input.latestWeight.logged_at,
      title: movingTowardGoal ? "Weight Progress" : "Weight Trend Needs Review",
      summary: [
        `${asNumber(input.latestWeight.weight_kg).toFixed(1)}kg current weight`,
        `${input.weightDelta > 0 ? "+" : ""}${input.weightDelta.toFixed(1)}kg vs previous`
      ],
      icon: movingTowardGoal ? <TrendingDown size={17} /> : <TrendingUp size={17} />,
      priority: movingTowardGoal ? 70 : 86
    });
  }

  if (input.weeklyReport) {
    items.push({
      id: `weekly-report-${input.weeklyReport.id}`,
      at: input.weeklyReport.created_at,
      title: "Weekly Reflection Generated",
      summary: [
        `Week of ${formatShortDate(input.weeklyReport.week_start)}`,
        input.weeklyReport.compliance_score ? `Momentum ${Math.round(Number(input.weeklyReport.compliance_score))}/100` : "Report ready for review"
      ],
      icon: <ClipboardList size={17} />,
      priority: 78
    });
  }

  const grouped = new Map<string, CoachingTimelineItem[]>();
  items
    .filter((item) => Boolean(item.at))
    .sort((a, b) => {
      const timeDiff = new Date(b.at).getTime() - new Date(a.at).getTime();
      if (localDateKey(a.at) !== localDateKey(b.at)) return timeDiff;
      if (b.priority !== a.priority) return b.priority - a.priority;
      return timeDiff;
    })
    .forEach((item) => {
      const key = localDateKey(item.at);
      grouped.set(key, [...(grouped.get(key) ?? []), item]);
    });

  let groups = Array.from(grouped.entries())
    .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
    .map(([date, dayItems]) => ({
      date,
      label: dateGroupLabel(date),
      items: options.maxItemsPerDay ? dayItems.slice(0, options.maxItemsPerDay) : dayItems
    }))
    .filter((group) => group.items.length > 0);

  if (options.maxDays) groups = groups.slice(0, options.maxDays);
  return groups;
}

function CoachingTimelineCard({
  item,
  expanded,
  onToggle
}: {
  item: CoachingTimelineItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <article className="relative border-l border-line py-3 pl-6">
      <div className="flex gap-3">
        <span className="absolute -left-5 top-3 grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line bg-surface text-calm shadow-soft">{item.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-sm font-semibold text-white">{item.title}</p>
            <p className="text-xs text-zinc-500">{dateGroupLabel(item.at)}</p>
          </div>
          <div className="mt-2 space-y-1">
            {item.summary.slice(0, 3).map((line) => (
              <p key={line} className="text-sm leading-5 text-zinc-300">{line}</p>
            ))}
          </div>
          {item.workout ? (
            <button
              type="button"
              onClick={onToggle}
              className="mt-3 inline-flex items-center gap-2 rounded-xl border border-purple-300/30 bg-purple-500/10 px-3 py-2 text-xs font-bold text-purple-200"
            >
              {expanded ? "Hide workout" : "Expand workout"}
              <ChevronDown className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} size={14} />
            </button>
          ) : null}
        </div>
      </div>
      {item.workout && expanded ? <WorkoutDetail workout={item.workout} /> : null}
    </article>
  );
}

export function CoachingTimelineGroups({ groups }: { groups: CoachingTimelineGroup[] }) {
  const [expandedTimelineWorkoutId, setExpandedTimelineWorkoutId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.date}>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">{group.label}</p>
          <div className="ml-5">
            {group.items.map((item) => (
              <CoachingTimelineCard
                key={item.id}
                item={item}
                expanded={expandedTimelineWorkoutId === item.id}
                onToggle={() => setExpandedTimelineWorkoutId((current) => (current === item.id ? null : item.id))}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

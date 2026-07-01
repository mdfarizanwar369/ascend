"use client";

import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { calculateAdaptiveNutritionTargets } from "@ascend/shared";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Brain,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Dumbbell,
  Flame,
  MessageCircle,
  NotebookText,
  Send,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Utensils,
  Zap
} from "lucide-react";
import {
  createTrainerClientMission,
  createWeeklyCheckin,
  getTrainerClientMemory,
  getTrainerClientCoachPresence,
  getTrainerClient,
  getTrainerClientBurnLogs,
  getTrainerClientFoodLogs,
  getTrainerClientMissions,
  getTrainerClientMessages,
  getTrainerClientNutritionPlan,
  getTrainerClientProgressPhotos,
  getTrainerClientProgressComparison,
  getTrainerClientWaterLogs,
  getTrainerClientWeeklyReport,
  getTrainerClientWeightLogs,
  saveTrainerClientNutritionPlan,
  sendTrainerClientPraise,
  sendTrainerClientMessage,
  pauseTrainerClientCoachPresence,
  CoachPresenceMessage,
  CoachPresenceSettings,
  AscendMemoryResponse
} from "@/lib/ascendApi";
import { BackButton } from "@/components/BackButton";
import { localDateKey } from "@/lib/date";
import { ProgressComparisonCard } from "@/components/ProgressComparisonCard";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { AthleteCoachPanel } from "@/components/athlete/AthleteCoachPanel";
import { WeeklyReportSummary } from "@/components/reports/WeeklyReportSummary";
import { buildCoachingTimelineGroups, CoachingTimelineGroups } from "@/components/trainer/TrainerCoachingTimeline";

type ClientProfile = Awaited<ReturnType<typeof getTrainerClient>>["client"];
type FoodLog = Awaited<ReturnType<typeof getTrainerClientFoodLogs>>["foodLogs"][number];
type Message = Awaited<ReturnType<typeof getTrainerClientMessages>>["messages"][number];
type ProgressPhoto = Awaited<ReturnType<typeof getTrainerClientProgressPhotos>>["progressPhotos"][number];
type WeightLog = Awaited<ReturnType<typeof getTrainerClientWeightLogs>>["weightLogs"][number];
type WaterLog = Awaited<ReturnType<typeof getTrainerClientWaterLogs>>["waterLogs"][number];
type Mission = Awaited<ReturnType<typeof getTrainerClientMissions>>["missions"][number];
type BurnLog = Awaited<ReturnType<typeof getTrainerClientBurnLogs>>["burnLogs"][number];
type WeeklyReport = Awaited<ReturnType<typeof getTrainerClientWeeklyReport>>["report"];
type ProgressComparison = Awaited<ReturnType<typeof getTrainerClientProgressComparison>>["comparison"];
type CoachNutritionPlan = Awaited<ReturnType<typeof getTrainerClientNutritionPlan>>["coachPlan"];

function formatGoal(goal?: string | null) {
  if (goal === "fat_loss") return "Fat loss";
  if (goal === "muscle_gain") return "Muscle gain";
  if (goal === "maintenance") return "Maintenance";
  if (goal === "performance") return "Performance";
  return "Goal not set";
}

function asNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  return Number(value);
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

function isToday(value?: string | null) {
  return value ? localDateKey(value) === localDateKey() : false;
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

function SectionCard({
  eyebrow,
  title,
  children,
  action,
  tone = "default"
}: {
  eyebrow?: string;
  title: string;
  children: ReactNode;
  action?: ReactNode;
  tone?: "default" | "zoe" | "success" | "warning";
}) {
  const toneClass =
    tone === "zoe"
      ? "border-purple-400/30 bg-[radial-gradient(circle_at_top_right,rgba(139,92,246,0.18),transparent_14rem),linear-gradient(180deg,rgba(20,18,31,0.98),rgba(17,24,39,0.96))]"
      : tone === "success"
        ? "border-lime/30 bg-[radial-gradient(circle_at_top_right,rgba(61,230,209,0.12),transparent_13rem),var(--surface)]"
        : tone === "warning"
          ? "border-amber/35 bg-amber/10"
          : "border-line bg-surface";

  return (
    <section className={`rounded-2xl border p-4 shadow-soft ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow ? <p className="text-xs font-bold uppercase tracking-[0.18em] text-calm">{eyebrow}</p> : null}
          <h2 className="mt-1 text-lg font-semibold text-white">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function MetricTile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-ink/80 p-3">
      <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
      {detail ? <p className="mt-1 text-xs leading-5 text-zinc-400">{detail}</p> : null}
    </div>
  );
}

function HandoverItem({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/5 bg-ink/70 p-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-calm/15 text-calm">{icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white">{value}</p>
        <p className="text-xs text-zinc-500">{label}</p>
      </div>
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
        <MetricTile label="Duration" value={`${Number(workout.metadata?.durationMinutes ?? 0) || "--"} min`} />
        <MetricTile label="Focus" value={titleCase(workout.metadata?.workoutType ?? workout.metadata?.activityType)} />
        <MetricTile label="Difficulty" value={titleCase(workout.metadata?.workoutDifficultyLabel ?? workout.metadata?.workoutDifficulty)} />
        <MetricTile label="Estimated burn" value={`~${workoutCalories(workout)} kcal`} />
      </div>

      {exercises.length ? (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-semibold text-white">Exercises</p>
          {exercises.map((exercise, index) => (
            <article key={`${exercise.name ?? "exercise"}-${index}`} className="rounded-2xl border border-white/5 bg-surface p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-white">{exercise.name ?? `Exercise ${index + 1}`}</p>
                  <p className="mt-1 text-sm text-zinc-400">
                    {[exercise.sets ? `${exercise.sets} sets` : null, exercise.reps ? `${exercise.reps} reps` : null, exercise.duration, exercise.rest ? `${exercise.rest} rest` : null]
                      .filter(Boolean)
                      .join(" / ") || "Coach Zoe workout item"}
                  </p>
                  {exercise.note ? <p className="mt-2 text-xs leading-5 text-zinc-500">{exercise.note}</p> : null}
                </div>
                <CheckCircle2 className="shrink-0 text-lime" size={20} />
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-2xl bg-surface p-3 text-sm leading-6 text-zinc-400">
          Exercise detail was not saved with this older completion. New saved Coach Zoe workouts will appear here when exercise metadata is available.
        </p>
      )}

      {workout.metadata?.coachMessage ? (
        <div className="mt-4 rounded-2xl border border-calm/20 bg-calm/10 p-3">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-calm">Coach tip</p>
          <p className="mt-2 text-sm leading-6 text-zinc-200">{workout.metadata.coachMessage}</p>
        </div>
      ) : null}
      <p className="mt-3 text-xs text-zinc-500">
        Calories and momentum are from the saved workout completion. No workout is regenerated for trainer review.
      </p>
    </div>
  );
}

export function TrainerClientDetailClient({ clientId }: { clientId: string }) {
  const [client, setClient] = useState<ClientProfile | null>(null);
  const [foodLogs, setFoodLogs] = useState<FoodLog[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageBody, setMessageBody] = useState("");
  const [progressPhotos, setProgressPhotos] = useState<ProgressPhoto[]>([]);
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [waterLogs, setWaterLogs] = useState<WaterLog[]>([]);
  const [burnLogs, setBurnLogs] = useState<BurnLog[]>([]);
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReport>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [progressComparison, setProgressComparison] = useState<ProgressComparison | null>(null);
  const [coachNutritionPlan, setCoachNutritionPlan] = useState<CoachNutritionPlan>(null);
  const [coachPresence, setCoachPresence] = useState<{
    latest: CoachPresenceMessage | null;
    history: CoachPresenceMessage[];
    settings: CoachPresenceSettings;
  }>({ latest: null, history: [], settings: { style: "balanced", paused: false, pauseUntil: null } });
  const [ascendMemory, setAscendMemory] = useState<AscendMemoryResponse | null>(null);
  const [nutritionCalories, setNutritionCalories] = useState("");
  const [nutritionProtein, setNutritionProtein] = useState("");
  const [nutritionCarbs, setNutritionCarbs] = useState("");
  const [nutritionFat, setNutritionFat] = useState("");
  const [nutritionLabel, setNutritionLabel] = useState("");
  const [nutritionNote, setNutritionNote] = useState("");
  const [nutritionStatus, setNutritionStatus] = useState("");
  const [missionTitle, setMissionTitle] = useState("");
  const [missionDueDate, setMissionDueDate] = useState("");
  const [checkin, setCheckin] = useState("");
  const [status, setStatus] = useState("Loading client handover...");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isSavingMission, setIsSavingMission] = useState(false);
  const [isSendingPraise, setIsSendingPraise] = useState(false);
  const [isSavingNutrition, setIsSavingNutrition] = useState(false);
  const [showWorkout, setShowWorkout] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const profile = await getTrainerClient(clientId);

        if (!isMounted) return;
        setClient(profile.client);
        setStatus("");

        const [foods, nextMessages, progress, weights, waters, burns, nextMissions, comparison, nutritionPlan, presence, memory, report] = await Promise.allSettled([
          getTrainerClientFoodLogs(clientId, { range: "7d", order: "newest", limit: 50 }),
          getTrainerClientMessages(clientId),
          getTrainerClientProgressPhotos(clientId),
          getTrainerClientWeightLogs(clientId),
          getTrainerClientWaterLogs(clientId),
          getTrainerClientBurnLogs(clientId),
          getTrainerClientMissions(clientId),
          getTrainerClientProgressComparison(clientId),
          getTrainerClientNutritionPlan(clientId),
          getTrainerClientCoachPresence(clientId),
          getTrainerClientMemory(clientId),
          getTrainerClientWeeklyReport(clientId)
        ]);

        if (!isMounted) return;
        if (foods.status === "fulfilled") setFoodLogs(foods.value.foodLogs);
        if (nextMessages.status === "fulfilled") setMessages(nextMessages.value.messages);
        if (progress.status === "fulfilled") setProgressPhotos(progress.value.progressPhotos);
        if (weights.status === "fulfilled") setWeightLogs(weights.value.weightLogs);
        if (waters.status === "fulfilled") setWaterLogs(waters.value.waterLogs);
        if (burns.status === "fulfilled") setBurnLogs(burns.value.burnLogs);
        if (nextMissions.status === "fulfilled") setMissions(nextMissions.value.missions);
        if (comparison.status === "fulfilled") setProgressComparison(comparison.value.comparison);
        if (nutritionPlan.status === "fulfilled") {
          const plan = nutritionPlan.value.coachPlan;
          setCoachNutritionPlan(plan);
          if (plan) {
            setNutritionCalories(String(plan.calories));
            setNutritionProtein(String(plan.protein_g));
            setNutritionCarbs(String(plan.carbs_g));
            setNutritionFat(String(plan.fat_g));
            setNutritionLabel(plan.plan_label ?? "");
            setNutritionNote(plan.coach_note ?? "");
          }
        }
        if (presence.status === "fulfilled") setCoachPresence(presence.value);
        if (memory.status === "fulfilled") setAscendMemory(memory.value);
        if (report.status === "fulfilled") setWeeklyReport(report.value.report);

        if ([foods, nextMessages, progress, weights, waters, burns, nextMissions, report].some((result) => result.status === "rejected")) {
          setStatus("Some client sections could not load yet. The main handover is still available.");
        }
      } catch (error) {
        if (isMounted) setStatus(error instanceof Error ? error.message : "Could not load this client.");
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, [clientId]);

  const today = useMemo(() => localDateKey(), []);
  const todaysFood = foodLogs.filter((log) => localDateKey(log.logged_at) === today);
  const todaysNutrition = todaysFood.reduce(
    (total, log) => ({
      calories: total.calories + Number(log.calories ?? 0),
      proteinG: total.proteinG + asNumber(log.protein_g),
      carbsG: total.carbsG + asNumber(log.carbs_g),
      fatG: total.fatG + asNumber(log.fat_g)
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }
  );
  const todaysWaterMl = waterLogs.filter((log) => localDateKey(log.logged_at) === today).reduce((total, log) => total + log.amount_ml, 0);
  const latestWeight = weightLogs[0];
  const previousWeight = weightLogs[1];
  const weightDelta = latestWeight && previousWeight ? asNumber(latestWeight.weight_kg) - asNumber(previousWeight.weight_kg) : 0;
  const score = client?.compliance_score;
  const latestFood = foodLogs[0];
  const latestMessage = messages[messages.length - 1] ?? null;
  const unreadMessages = messages.filter((message) => message.sender_user_id === clientId && !message.read_at).length;
  const todaysCoachInsight = coachPresence.latest && isToday(coachPresence.latest.created_at) ? coachPresence.latest : null;
  const latestWorkout = burnLogs.find((log) => log.metadata?.source === "coach_zoe_workout_planner" || Boolean(log.metadata?.workoutTitle)) ?? null;
  const todaysWorkout = latestWorkout && isToday(latestWorkout.created_at) ? latestWorkout : null;
  const workoutsThisWeek = burnLogs.filter((log) => {
    const date = new Date(log.created_at);
    return Number.isFinite(date.getTime()) && Date.now() - date.getTime() <= 7 * 24 * 60 * 60 * 1000;
  });
  const completedMissions = missions.filter((mission) => mission.status === "completed");
  const openMissions = missions.filter((mission) => mission.status !== "completed");
  const memoryHero = ascendMemory?.timeline?.find((item) => item.reflection) ?? ascendMemory?.timeline?.[0] ?? null;
  const nutritionTargets = calculateAdaptiveNutritionTargets({
    goalType: client?.goal_type,
    sex: client?.gender === "female" || client?.gender === "male" ? client.gender : "prefer_not_to_say",
    ageYears: client?.age_years,
    heightCm: client?.height_cm,
    weightKg: latestWeight?.weight_kg ?? client?.starting_weight_kg,
    targetWeightKg: client?.target_weight_kg,
    activityLevel:
      client?.activity_level === "low" || client?.activity_level === "moderate" || client?.activity_level === "high"
        ? client.activity_level
        : "moderate",
    bodyComposition: client?.athlete_mode_enabled ? client.body_composition_nutrition ?? undefined : undefined
  }, weightLogs.map((log) => ({ weightKg: log.weight_kg, loggedAt: log.logged_at })));

  const timelineGroups = useMemo(() => buildCoachingTimelineGroups({
    foodLogs,
    waterLogs,
    burnLogs,
    coachPresenceHistory: coachPresence.history,
    missions,
    weeklyReport,
    latestWeight,
    previousWeight,
    weightDelta,
    goalType: client?.goal_type,
    proteinTargetG: nutritionTargets.proteinTargetG
  }, { maxDays: 3, maxItemsPerDay: 4 }), [burnLogs, client?.goal_type, coachPresence.history, foodLogs, latestWeight, missions, nutritionTargets.proteinTargetG, previousWeight, waterLogs, weeklyReport, weightDelta]);

  const suggestedDiscussion = useMemo(() => {
    if (todaysWorkout && todaysNutrition.proteinG < nutritionTargets.proteinTargetG * 0.6) {
      return "Review recovery from today's workout and agree on one high-protein meal.";
    }
    if ((score ?? 100) < 50) return "Keep the next conversation simple: one supportive check-in and one achievable action.";
    if (!todaysFood.length) return "Ask what made food logging difficult today and remove one friction point.";
    if (weightDelta > 0.5 && client?.goal_type === "fat_loss") return "Review the weight trend and compare it with recent food consistency.";
    if (todaysWorkout) return "Celebrate the completed workout, then align recovery, water, and protein.";
    return "Reinforce the strongest consistent behaviour and choose one focus for the next session.";
  }, [client?.goal_type, nutritionTargets.proteinTargetG, score, todaysFood.length, todaysNutrition.proteinG, todaysWorkout, weightDelta]);

  useEffect(() => {
    if (coachNutritionPlan) return;
    if (nutritionCalories || nutritionProtein || nutritionCarbs || nutritionFat) return;
    setNutritionCalories(String(nutritionTargets.calorieTarget));
    setNutritionProtein(String(nutritionTargets.proteinTargetG));
    setNutritionCarbs(String(nutritionTargets.carbsTargetG));
    setNutritionFat(String(nutritionTargets.fatTargetG));
  }, [coachNutritionPlan, nutritionCalories, nutritionProtein, nutritionCarbs, nutritionFat, nutritionTargets]);

  async function generateCheckin() {
    setIsGenerating(true);
    setCheckin("");

    try {
      const response = await createWeeklyCheckin(clientId);
      setCheckin(response.summary);
    } catch {
      setCheckin("Could not generate the coach draft yet. Try again when the AI provider is available.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = messageBody.trim();
    if (!trimmed) return;

    setIsSendingMessage(true);
    setMessageBody("");

    try {
      const response = await sendTrainerClientMessage(clientId, trimmed);
      setMessages((current) => [...current, response.message]);
      setClient((current) => (current ? { ...current, last_trainer_message_at: response.message.created_at } : current));
      setStatus("Check-in sent.");
    } catch {
      setMessageBody(trimmed);
      setStatus("Could not send message. Make sure this client is assigned to this trainer.");
    } finally {
      setIsSendingMessage(false);
    }
  }

  async function handleCreateMission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = missionTitle.trim();
    if (!trimmed) return;

    setIsSavingMission(true);
    setStatus("");

    try {
      const response = await createTrainerClientMission({
        clientId,
        title: trimmed,
        dueDate: missionDueDate || undefined
      });
      setMissions((current) => [response.mission, ...current]);
      setMissionTitle("");
      setMissionDueDate("");
      setStatus("Mission assigned.");
    } catch {
      setStatus("Could not assign mission. Make sure this client is assigned to this trainer.");
    } finally {
      setIsSavingMission(false);
    }
  }

  async function handleSendPraise() {
    setIsSendingPraise(true);
    setStatus("");

    try {
      await sendTrainerClientPraise(clientId);
      setStatus("Praise sent. The client will see it on their dashboard.");
    } catch {
      setStatus("Could not send praise yet. Make sure this client is assigned to this trainer.");
    } finally {
      setIsSendingPraise(false);
    }
  }

  async function handleSaveNutritionPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const calories = Number(nutritionCalories);
    const proteinG = Number(nutritionProtein);
    const carbsG = Number(nutritionCarbs);
    const fatG = Number(nutritionFat);

    if (![calories, proteinG, carbsG, fatG].every((value) => Number.isFinite(value) && value >= 0)) {
      setNutritionStatus("Enter valid numbers for calories, protein, carbs, and fat.");
      return;
    }

    setIsSavingNutrition(true);
    setNutritionStatus("Saving coach plan...");
    try {
      const response = await saveTrainerClientNutritionPlan(clientId, {
        calories,
        proteinG,
        carbsG,
        fatG,
        planLabel: nutritionLabel || null,
        coachNote: nutritionNote || null
      });
      setCoachNutritionPlan(response.coachPlan);
      setNutritionStatus("Coach plan saved. The client will see your targets.");
    } catch (error) {
      setNutritionStatus(error instanceof Error ? error.message : "Could not save coach plan.");
    } finally {
      setIsSavingNutrition(false);
    }
  }

  async function setCoachPresencePause(pauseHours: number | null) {
    setStatus(pauseHours ? "Pausing Coach Zoe support..." : "Resuming Coach Zoe support...");
    try {
      await pauseTrainerClientCoachPresence(clientId, pauseHours);
      const response = await getTrainerClientCoachPresence(clientId);
      setCoachPresence(response);
      setStatus(pauseHours ? "Coach Zoe support paused for this client." : "Coach Zoe support resumed for this client.");
    } catch {
      setStatus("Could not update Coach Zoe support for this client yet.");
    }
  }

  return (
    <>
      <section className="mt-3">
        <div className="mb-3">
          <BackButton fallbackHref="/trainer" />
        </div>
        <div className="flex items-center gap-3">
          <ProfileAvatar src={client?.profile_photo_url} name={client?.full_name} size="md" />
          <div className="min-w-0">
            <p className="text-sm text-zinc-400">Client profile</p>
            <h1 className="mt-1 truncate text-2xl font-semibold">{client?.full_name ?? "Client"}</h1>
            <p className="mt-1 text-sm text-zinc-400">{formatGoal(client?.goal_type)} / {client?.gym_name ?? "Gym not set"}</p>
          </div>
        </div>
        {client?.goal_achieved_at ? (
          <p className="mt-3 rounded-2xl border border-lime/40 bg-lime/10 p-3 text-sm font-semibold text-lime">
            Goal achieved. This is a great moment to celebrate and agree on the next goal.
          </p>
        ) : client?.goal_updated_at ? (
          <p className="mt-3 text-xs text-zinc-500">Goal last updated {new Date(client.goal_updated_at).toLocaleDateString()}</p>
        ) : null}
        {client?.id ? (
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Link
              href={`/messages?userId=${client.id}`}
              className="flex h-12 items-center justify-center rounded-2xl bg-lime font-semibold text-ink"
            >
              Open chat
            </Link>
            <a
              href="#trainer-message-card"
              className="flex h-12 items-center justify-center rounded-2xl border border-calm/50 bg-calm/10 font-semibold text-calm"
            >
              Check-In
            </a>
            <button
              type="button"
              disabled={isSendingPraise}
              onClick={handleSendPraise}
              className="h-12 rounded-2xl border border-lime/40 bg-lime/10 font-semibold text-lime disabled:opacity-60"
            >
              {isSendingPraise ? "Sending..." : "Send praise"}
            </button>
          </div>
        ) : null}
      </section>

      {status ? <p className="mt-4 rounded-2xl border border-line bg-surface p-3 text-sm text-zinc-300">{status}</p> : null}

      <section className="mt-4 rounded-[1.75rem] border border-purple-400/30 bg-[radial-gradient(circle_at_top_right,rgba(61,230,209,0.18),transparent_16rem),radial-gradient(circle_at_bottom_left,rgba(139,92,246,0.2),transparent_16rem),linear-gradient(180deg,rgba(18,22,35,0.98),rgba(8,13,24,0.98))] p-5 shadow-soft">
        <div className="flex items-start gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-purple-500/20 text-purple-200">
            <Brain size={24} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-purple-200">Coach Zoe Handover</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Since your last coaching session</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              The other 166 hours, summarized so you know what to discuss next.
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <HandoverItem icon={<Dumbbell size={18} />} label="workouts completed" value={String(workoutsThisWeek.length)} />
          <HandoverItem icon={<Utensils size={18} />} label="food logs this week" value={String(foodLogs.filter((log) => Date.now() - new Date(log.logged_at).getTime() <= 7 * 24 * 60 * 60 * 1000).length)} />
          <HandoverItem icon={<Sparkles size={18} />} label="today's insight" value={todaysCoachInsight ? "Delivered" : "Not yet"} />
          <HandoverItem icon={<Zap size={18} />} label="momentum" value={score === null || score === undefined ? "--" : `${score}/100`} />
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-ink/70 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-calm">Suggested discussion</p>
          <p className="mt-2 text-sm leading-6 text-zinc-200">{suggestedDiscussion}</p>
        </div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <SectionCard
          eyebrow="Today's Insight"
          title={todaysCoachInsight ? "What the client saw today" : "No insight delivered today"}
          tone="zoe"
          action={<Sparkles className="text-purple-200" size={22} />}
        >
          <p className="mt-3 rounded-2xl bg-ink/70 p-4 text-sm leading-6 text-zinc-200">
            {todaysCoachInsight?.message ?? "Coach Zoe has not delivered a new insight today. Use the latest activity below for context."}
          </p>
        </SectionCard>

        <SectionCard
          eyebrow="Coach Zoe Workout"
          title={latestWorkout ? workoutName(latestWorkout) : "No saved Coach Zoe workout yet"}
          tone={latestWorkout ? "success" : "default"}
          action={<Dumbbell className="text-lime" size={22} />}
        >
          {latestWorkout ? (
            <>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <MetricTile label="Status" value="Completed" detail={formatDateTime(latestWorkout.created_at)} />
                <MetricTile label="Duration" value={`${Number(latestWorkout.metadata?.durationMinutes ?? 0) || "--"} min`} />
                <MetricTile label="Difficulty" value={titleCase(latestWorkout.metadata?.workoutDifficultyLabel ?? latestWorkout.metadata?.workoutDifficulty)} />
                <MetricTile label="Estimated burn" value={`~${workoutCalories(latestWorkout)} kcal`} />
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-ink/70 p-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Momentum earned</p>
                  <p className="mt-1 text-lg font-semibold text-lime">+{Number(latestWorkout.metadata?.momentumEarned ?? 0) || 8}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowWorkout((current) => !current)}
                  className="rounded-2xl bg-lime px-4 py-3 text-sm font-bold text-ink"
                >
                  {showWorkout ? "Hide Workout" : "View Workout"}
                </button>
              </div>
              {showWorkout ? <WorkoutDetail workout={latestWorkout} /> : null}
            </>
          ) : (
            <p className="mt-3 rounded-2xl bg-ink/70 p-4 text-sm leading-6 text-zinc-400">
              When the client completes a Coach Zoe workout, the exact saved session appears here for review.
            </p>
          )}
        </SectionCard>
      </div>

      <AthleteCoachPanel clientId={clientId} />

      <SectionCard
        eyebrow="AI Activity Timeline"
        title="What happened between sessions"
        action={<CalendarClock className="text-calm" size={22} />}
      >
        <div className="mt-4 space-y-4">
          <CoachingTimelineGroups groups={timelineGroups} />
          {!timelineGroups.length ? (
            <p className="rounded-2xl bg-ink/70 p-4 text-sm leading-6 text-zinc-400">
              No coaching summary yet. Once the client logs nutrition, completes workouts, receives Coach Zoe support, or finishes missions, this will summarize what mattered between sessions.
            </p>
          ) : null}
          <Link
            href={`/trainer/clients/${clientId}/timeline`}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-calm/40 bg-calm/10 font-semibold text-calm"
          >
            View Full Coaching Timeline
            <ArrowRight size={18} />
          </Link>
        </div>
      </SectionCard>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <SectionCard eyebrow="Nutrition Snapshot" title="Today's intake" action={<Utensils className="text-lime" size={22} />}>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <MetricTile label="Calories" value={todaysNutrition.calories.toLocaleString()} detail={`${nutritionTargets.calorieTarget.toLocaleString()} kcal guide`} />
            <MetricTile label="Protein" value={`${Math.round(todaysNutrition.proteinG)}g`} detail={`${nutritionTargets.proteinTargetG}g guide`} />
            <MetricTile label="Carbs" value={`${Math.round(todaysNutrition.carbsG)}g`} detail={`${nutritionTargets.carbsTargetG}g guide`} />
            <MetricTile label="Fat" value={`${Math.round(todaysNutrition.fatG)}g`} detail={`${nutritionTargets.fatTargetG}g guide`} />
            <MetricTile label="Water" value={`${(todaysWaterMl / 1000).toFixed(1)}L`} detail="2.5L target" />
            <MetricTile label="Meals" value={String(todaysFood.length)} detail={latestFood ? `Last: ${latestFood.estimated_food_name}` : "No meals today"} />
          </div>
          <Link
            href={`/trainer/clients/${clientId}/meals`}
            className="mt-4 flex h-12 items-center justify-center rounded-2xl border border-lime/40 bg-lime/10 font-semibold text-lime"
          >
            View Full Meal History
          </Link>
        </SectionCard>

        <SectionCard eyebrow="Progress Snapshot" title="Direction of travel" action={<BarChart3 className="text-calm" size={22} />}>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <MetricTile label="Momentum" value={score === null || score === undefined ? "--" : `${score}/100`} detail={score === null || score === undefined ? "No score yet" : score < 50 ? "Needs support" : score < 70 ? "Watch closely" : "On track"} />
            <MetricTile label="Current weight" value={latestWeight ? `${asNumber(latestWeight.weight_kg).toFixed(1)}kg` : "--"} detail={weightDelta ? `${weightDelta > 0 ? "+" : ""}${weightDelta.toFixed(1)}kg vs previous` : "No trend yet"} />
            <MetricTile label="Check-ins" value={`${progressComparison?.current.checkinDays ?? "--"}/7`} detail="active days this week" />
            <MetricTile label="Workouts" value={String(workoutsThisWeek.length)} detail="logged in the last 7 days" />
          </div>
        </SectionCard>
      </div>

      {progressComparison ? (
        <div className="mt-4">
          <ProgressComparisonCard comparison={progressComparison} photoHref="#progress-photos" />
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <SectionCard
          eyebrow="Messages"
          title={latestMessage ? "Latest conversation" : "No conversation yet"}
          action={<MessageCircle className="text-calm" size={22} />}
        >
          <div id="trainer-message-card" className="mt-3 rounded-2xl bg-ink/70 p-4">
            {latestMessage ? (
              <>
                <p className="text-sm leading-6 text-zinc-200">{latestMessage.body}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                  <span>{latestMessage.sender_user_id === clientId ? "Client" : "Trainer"}</span>
                  <span>/</span>
                  <span>{formatDateTime(latestMessage.created_at)}</span>
                  {unreadMessages ? <span className="rounded-full bg-amber/20 px-2 py-1 font-semibold text-amber">{unreadMessages} unread</span> : null}
                </div>
              </>
            ) : (
              <p className="text-sm leading-6 text-zinc-400">Start with a short supportive message when the client needs a human touch.</p>
            )}
          </div>
          <form onSubmit={handleSendMessage} className="mt-3 flex gap-2">
            <textarea
              value={messageBody}
              onChange={(event) => setMessageBody(event.target.value)}
              rows={1}
              placeholder="Reply to client..."
              className="min-h-12 flex-1 resize-none rounded-2xl border border-line bg-ink px-3 py-3 text-sm outline-none focus:border-lime"
            />
            <button
              type="submit"
              disabled={!messageBody.trim() || isSendingMessage}
              className="grid h-12 w-12 place-items-center rounded-2xl bg-lime text-ink disabled:opacity-60"
              aria-label="Send message"
            >
              <Send size={18} />
            </button>
          </form>
          {client?.id ? (
            <Link
              href={`/messages?userId=${client.id}`}
              className="mt-3 flex h-12 items-center justify-center rounded-2xl border border-calm/40 bg-calm/10 font-semibold text-calm"
            >
              Open Conversation
            </Link>
          ) : null}
        </SectionCard>

        <SectionCard eyebrow="Ascend Memory" title={memoryHero ? "Coach Zoe remembers" : "No memories yet"} action={<NotebookText className="text-purple-200" size={22} />} tone="zoe">
          {memoryHero ? (
            <article className="mt-3 rounded-2xl bg-ink/70 p-4">
              <p className="text-sm font-semibold text-white">{memoryHero.title}</p>
              <p className="mt-1 text-xs text-zinc-500">{formatShortDate(memoryHero.occurredAt)}</p>
              <p className="mt-3 text-sm leading-6 text-zinc-200">{memoryHero.reflection ?? memoryHero.subtitle}</p>
            </article>
          ) : (
            <p className="mt-3 rounded-2xl bg-ink/70 p-4 text-sm leading-6 text-zinc-400">
              Meaningful milestones will appear here after the client builds enough history.
            </p>
          )}
          {ascendMemory?.timeline?.length ? (
            <div className="mt-3 grid gap-2">
              {ascendMemory.timeline.slice(0, 3).map((item) => (
                <div key={item.milestoneKey} className="flex items-center justify-between gap-3 rounded-2xl bg-ink/50 px-3 py-2">
                  <span className="truncate text-sm text-zinc-300">{item.title}</span>
                  <span className="shrink-0 text-xs text-zinc-500">{formatShortDate(item.occurredAt)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </SectionCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <SectionCard
          eyebrow="Weekly Report"
          title={weeklyReport ? "Latest report ready" : "Generate a coaching draft"}
          action={<ClipboardList className="text-calm" size={22} />}
        >
          <div className="mt-3 rounded-2xl bg-ink/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">{weeklyReport ? `Week of ${formatShortDate(weeklyReport.week_start)}` : "No report generated yet"}</p>
                <p className="mt-1 text-xs text-zinc-500">{weeklyReport ? `Last generated ${formatDateTime(weeklyReport.created_at)}` : "Use this when you want a quick trainer check-in draft."}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${weeklyReport ? "bg-lime text-ink" : "bg-surface text-zinc-300"}`}>
                {weeklyReport ? "Ready" : "Not ready"}
              </span>
            </div>
            {checkin ? (
              <div className="mt-4">
                <WeeklyReportSummary summary={checkin} audience="trainer" />
              </div>
            ) : weeklyReport?.summary ? (
              <p className="mt-4 line-clamp-5 text-sm leading-6 text-zinc-300">{weeklyReport.summary}</p>
            ) : null}
          </div>
          <button
            type="button"
            disabled={isGenerating}
            onClick={generateCheckin}
            className="mt-3 h-12 w-full rounded-2xl bg-lime font-semibold text-ink disabled:opacity-60"
          >
            {isGenerating ? "Generating..." : checkin ? "Refresh coach draft" : "Generate Weekly Report"}
          </button>
        </SectionCard>

        <SectionCard eyebrow="Coach Tools" title="Simple actions for next session" action={<Target className="text-lime" size={22} />}>
          <form onSubmit={handleCreateMission} className="mt-3 space-y-3">
            <textarea
              value={missionTitle}
              onChange={(event) => setMissionTitle(event.target.value)}
              rows={2}
              maxLength={180}
              placeholder="Assign one mission, e.g. Walk 20 minutes today"
              className="min-h-20 w-full resize-none rounded-2xl border border-line bg-ink px-3 py-3 text-sm outline-none focus:border-lime"
            />
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <input
                type="date"
                value={missionDueDate}
                onChange={(event) => setMissionDueDate(event.target.value)}
                className="h-12 rounded-2xl border border-line bg-ink px-3 text-sm outline-none focus:border-lime"
              />
              <button
                type="submit"
                disabled={!missionTitle.trim() || isSavingMission}
                className="h-12 rounded-2xl bg-lime px-4 font-semibold text-ink disabled:opacity-60"
              >
                {isSavingMission ? "Assigning..." : "Assign"}
              </button>
            </div>
          </form>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <MetricTile label="Open missions" value={String(openMissions.length)} />
            <MetricTile label="Completed" value={String(completedMissions.length)} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setCoachPresencePause(24)}
              className="h-11 rounded-2xl border border-amber/50 bg-amber/10 font-semibold text-amber"
            >
              Pause Zoe 24h
            </button>
            <button
              type="button"
              onClick={() => setCoachPresencePause(null)}
              className="h-11 rounded-2xl border border-calm/50 bg-calm/10 font-semibold text-calm"
            >
              Resume Zoe
            </button>
          </div>
        </SectionCard>
      </div>

      <SectionCard eyebrow="Coach Nutrition Plan" title={coachNutritionPlan ? "Custom plan active" : "Using Ascend recommendation"} action={<Flame className="text-lime" size={22} />}>
        <div className="mt-3 rounded-2xl border border-line bg-ink p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-lime">Ascend recommendation</p>
          <p className="mt-2 text-sm leading-6 text-zinc-300">
            {nutritionTargets.calorieTarget.toLocaleString()} kcal / Protein {nutritionTargets.proteinTargetG}g / Carbs {nutritionTargets.carbsTargetG}g / Fat {nutritionTargets.fatTargetG}g
          </p>
        </div>
        <form onSubmit={handleSaveNutritionPlan} className="mt-4 space-y-3">
          <input
            value={nutritionLabel}
            onChange={(event) => setNutritionLabel(event.target.value)}
            placeholder="Plan label, e.g. Fat Loss Phase"
            maxLength={80}
            className="h-12 w-full rounded-2xl border border-line bg-ink px-3 text-sm outline-none focus:border-lime"
          />
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-sm font-medium text-zinc-300">
              Calories
              <input value={nutritionCalories} onChange={(event) => setNutritionCalories(event.target.value)} inputMode="numeric" className="h-12 rounded-2xl border border-line bg-ink px-3 text-white outline-none focus:border-lime" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-zinc-300">
              Protein
              <input value={nutritionProtein} onChange={(event) => setNutritionProtein(event.target.value)} inputMode="numeric" className="h-12 rounded-2xl border border-line bg-ink px-3 text-white outline-none focus:border-lime" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-zinc-300">
              Carbohydrates
              <input value={nutritionCarbs} onChange={(event) => setNutritionCarbs(event.target.value)} inputMode="numeric" className="h-12 rounded-2xl border border-line bg-ink px-3 text-white outline-none focus:border-lime" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-zinc-300">
              Fat
              <input value={nutritionFat} onChange={(event) => setNutritionFat(event.target.value)} inputMode="numeric" className="h-12 rounded-2xl border border-line bg-ink px-3 text-white outline-none focus:border-lime" />
            </label>
          </div>
          <textarea
            value={nutritionNote}
            onChange={(event) => setNutritionNote(event.target.value)}
            rows={3}
            maxLength={800}
            placeholder="Optional coach note for the client plan."
            className="min-h-24 w-full resize-none rounded-2xl border border-line bg-ink px-3 py-3 text-sm outline-none focus:border-lime"
          />
          <button
            type="submit"
            disabled={isSavingNutrition}
            className="h-12 w-full rounded-2xl bg-lime font-semibold text-ink disabled:opacity-60"
          >
            {isSavingNutrition ? "Saving..." : "Save Coach Plan"}
          </button>
        </form>
        {coachNutritionPlan?.updated_at ? (
          <p className="mt-3 text-xs text-zinc-500">Last updated {new Date(coachNutritionPlan.updated_at).toLocaleString()}</p>
        ) : null}
        {nutritionStatus ? <p className="mt-3 rounded-2xl border border-line bg-ink p-3 text-sm text-zinc-300">{nutritionStatus}</p> : null}
      </SectionCard>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <SectionCard eyebrow="Food Evidence" title="Latest meals" action={<Utensils className="text-lime" size={22} />}>
          <div className="mt-3 space-y-2">
            {foodLogs.slice(0, 3).map((log) => (
              <article key={log.id} className="rounded-2xl bg-ink/70 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {log.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={log.image_url} alt={log.estimated_food_name} className="h-14 w-14 shrink-0 rounded-2xl object-cover" loading="lazy" decoding="async" />
                    ) : null}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">{log.estimated_food_name}</p>
                      <p className="mt-1 text-xs text-zinc-400">
                        P {Math.round(asNumber(log.protein_g))}g / C {Math.round(asNumber(log.carbs_g))}g / F {Math.round(asNumber(log.fat_g))}g
                      </p>
                    </div>
                  </div>
                  <p className="shrink-0 text-sm font-semibold">{log.calories} kcal</p>
                </div>
              </article>
            ))}
            {!foodLogs.length ? <p className="rounded-2xl bg-ink/70 p-3 text-sm text-zinc-400">No food logs yet.</p> : null}
          </div>
        </SectionCard>

        <SectionCard eyebrow="Progress Photos" title={progressPhotos.length ? `${progressPhotos.length} saved photos` : "No photos yet"} action={<Activity className="text-calm" size={22} />}>
          <div id="progress-photos" className="mt-3 grid grid-cols-3 gap-2">
            {progressPhotos.slice(0, 6).map((photo) => (
              <article key={photo.id} className="overflow-hidden rounded-2xl bg-ink">
                <div className="grid aspect-[3/4] place-items-center">
                  {photo.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo.image_url} alt={photo.photo_type} className="h-full w-full object-cover" loading="lazy" decoding="async" />
                  ) : (
                    <span className="text-xs text-zinc-500">No image</span>
                  )}
                </div>
                <div className="p-2">
                  <p className="truncate text-xs font-medium capitalize">{photo.photo_type}</p>
                  <p className="mt-1 text-xs text-zinc-500">{formatShortDate(photo.logged_at)}</p>
                </div>
              </article>
            ))}
            {!progressPhotos.length ? <p className="col-span-3 rounded-2xl bg-ink/70 p-3 text-sm text-zinc-400">Progress photos will appear here when the client uploads them.</p> : null}
          </div>
        </SectionCard>
      </div>

      <section className="mt-4 rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-center gap-3">
          {weightDelta < 0 ? <TrendingDown className="text-lime" size={20} /> : <TrendingUp className="text-calm" size={20} />}
          <p className="text-sm text-zinc-300">Food, water, workouts, messages, memory, reports, and progress come from existing Ascend records.</p>
          <ArrowRight className="ml-auto hidden text-zinc-600 sm:block" size={18} />
        </div>
      </section>
    </>
  );
}

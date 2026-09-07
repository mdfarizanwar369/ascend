"use client";

import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { calculateAdaptiveNutritionTargets } from "@ascend/shared";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Brain,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
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
import { TrainerHomeworkPanel } from "@/components/trainer/TrainerHomeworkPanel";
import { trainerSessionCaptureEnabled } from "@/lib/trainerSessionFlag";
import { useI18n } from "@/lib/i18n/I18nProvider";

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

type Translate = (key: string, values?: Record<string, string | number>) => string;

function formatGoal(goal: string | null | undefined, t: Translate) {
  if (goal === "fat_loss") return t("onboarding.goalFatLoss");
  if (goal === "muscle_gain") return t("onboarding.goalMuscleGain");
  if (goal === "maintenance") return t("onboarding.goalMaintenance");
  if (goal === "performance") return t("onboarding.goalPerformance");
  return t("trainer.goalNotShared");
}

function asNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

function formatShortDate(value: string | null | undefined, t: Translate) {
  if (!value) return t("trainer.notYet");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return t("trainer.notYet");
  return date.toLocaleDateString([], { day: "numeric", month: "short" });
}

function formatDateTime(value: string | null | undefined, t: Translate) {
  if (!value) return t("trainer.notYet");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return t("trainer.notYet");
  return date.toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function isToday(value?: string | null) {
  return value ? localDateKey(value) === localDateKey() : false;
}

function titleCase(value: string | null | undefined, t: Translate) {
  if (!value) return t("trainer.notSet");
  return value
    .replace(/[_-]/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function workoutName(log: BurnLog | null | undefined, t: Translate) {
  return log?.metadata?.workoutTitle ?? log?.metadata?.activityType ?? t("trainer.workout");
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

function CollapsibleSection({
  storageKey,
  title,
  preview,
  icon,
  children,
  onOpen
}: {
  storageKey: string;
  title: string;
  preview: string;
  icon: ReactNode;
  children: ReactNode;
  onOpen?: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);

  useEffect(() => {
    const saved = window.sessionStorage.getItem(`ascend:trainer-section:${storageKey}`) === "open";
    setOpen(saved);
    setHasOpened(saved);
    if (saved) void onOpen?.();
  }, [onOpen, storageKey]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      setHasOpened(true);
      void onOpen?.();
    }
    window.sessionStorage.setItem(`ascend:trainer-section:${storageKey}`, next ? "open" : "closed");
  }

  return (
    <section className="mt-4">
      <button type="button" onClick={toggle} aria-expanded={open} className="ascend-pressable flex min-h-20 w-full items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-left shadow-soft">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-ink text-calm">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-white">{title}</span>
          <span className="mt-1 block truncate text-sm text-zinc-400">{preview}</span>
        </span>
        <ChevronDown className={`shrink-0 text-zinc-400 transition-transform duration-300 motion-reduce:transition-none ${open ? "rotate-180" : ""}`} size={20} />
      </button>
      <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="overflow-hidden">
          <div className="pt-3">{hasOpened ? children : null}</div>
        </div>
      </div>
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

function WorkoutDetail({ workout, t }: { workout: BurnLog; t: Translate }) {
  const exercises = workout.metadata?.exercises ?? [];
  return (
    <div className="mt-4 rounded-2xl border border-purple-300/20 bg-ink/80 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-purple-200">{t("trainer.savedWorkout")}</p>
          <h3 className="mt-1 text-xl font-semibold text-white">{workoutName(workout, t)}</h3>
          <p className="mt-1 text-sm text-zinc-400">{t("trainer.workoutCompletedAt", { date: formatDateTime(workout.created_at, t) })}</p>
        </div>
        <span className="rounded-full bg-lime px-3 py-1 text-xs font-bold text-ink">{t("common.completed")}</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <MetricTile label={t("trainer.duration")} value={`${Number(workout.metadata?.durationMinutes ?? 0) || "--"} min`} />
        <MetricTile label={t("trainer.focus")} value={titleCase(workout.metadata?.workoutType ?? workout.metadata?.activityType, t)} />
        <MetricTile label={t("trainer.difficulty")} value={titleCase(workout.metadata?.workoutDifficultyLabel ?? workout.metadata?.workoutDifficulty, t)} />
        <MetricTile label={t("trainer.estimatedBurn")} value={`~${workoutCalories(workout)} kcal`} />
      </div>

      {exercises.length ? (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-semibold text-white">{t("trainer.exercises")}</p>
          {exercises.map((exercise, index) => (
            <article key={`${exercise.name ?? "exercise"}-${index}`} className="rounded-2xl border border-white/5 bg-surface p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-white">{exercise.name ?? t("trainer.exerciseNumber", { number: index + 1 })}</p>
                  <p className="mt-1 text-sm text-zinc-400">
                    {[exercise.sets ? t("trainer.setsCount", { count: exercise.sets }) : null, exercise.reps ? t("trainer.repsCount", { count: exercise.reps }) : null, exercise.duration, exercise.rest ? t("trainer.restValue", { value: exercise.rest }) : null]
                      .filter(Boolean)
                      .join(" / ") || t("trainer.coachZoeWorkoutItem")}
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
      <p className="mt-3 text-xs text-zinc-500">Saved exactly as the client completed it.</p>
    </div>
  );
}

export function TrainerClientDetailClient({ clientId }: { clientId: string }) {
  const { t } = useI18n();
  const sessionCaptureEnabled = trainerSessionCaptureEnabled();
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
  const [status, setStatus] = useState(t("common.loading"));
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isSavingMission, setIsSavingMission] = useState(false);
  const [isSendingPraise, setIsSendingPraise] = useState(false);
  const [isSavingNutrition, setIsSavingNutrition] = useState(false);
  const [showWorkout, setShowWorkout] = useState(false);
  const loadedSections = useRef(new Set<string>());

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const profile = await getTrainerClient(clientId);

        if (!isMounted) return;
        setClient(profile.client);
        setStatus("");

        const [foods, nextMessages, weights, waters, burns, nextMissions, presence] = await Promise.allSettled([
          getTrainerClientFoodLogs(clientId, { range: "7d", order: "newest", limit: 50 }),
          getTrainerClientMessages(clientId, { markRead: false }),
          getTrainerClientWeightLogs(clientId),
          getTrainerClientWaterLogs(clientId),
          getTrainerClientBurnLogs(clientId),
          getTrainerClientMissions(clientId),
          getTrainerClientCoachPresence(clientId)
        ]);

        if (!isMounted) return;
        if (foods.status === "fulfilled") setFoodLogs(foods.value.foodLogs);
        if (nextMessages.status === "fulfilled") setMessages(nextMessages.value.messages);
        if (weights.status === "fulfilled") setWeightLogs(weights.value.weightLogs);
        if (waters.status === "fulfilled") setWaterLogs(waters.value.waterLogs);
        if (burns.status === "fulfilled") setBurnLogs(burns.value.burnLogs);
        if (nextMissions.status === "fulfilled") setMissions(nextMissions.value.missions);
        if (presence.status === "fulfilled") setCoachPresence(presence.value);

        if ([foods, nextMessages, weights, waters, burns, nextMissions, presence].some((result) => result.status === "rejected")) {
          setStatus(t("trainer.loadClientPartial"));
        }
      } catch (error) {
        if (isMounted) setStatus(error instanceof Error ? error.message : t("trainer.loadClientError"));
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, [clientId, t]);

  const loadSection = useCallback(async (section: "messages" | "progress" | "memory" | "weekly" | "nutrition") => {
    if (loadedSections.current.has(section)) return;
    loadedSections.current.add(section);
    try {
      if (section === "messages") {
        const response = await getTrainerClientMessages(clientId, { markRead: true });
        const readAt = new Date().toISOString();
        setMessages(response.messages.map((message) => message.sender_user_id === clientId ? { ...message, read_at: message.read_at ?? readAt } : message));
      } else if (section === "progress") {
        const [photos, comparison] = await Promise.all([getTrainerClientProgressPhotos(clientId), getTrainerClientProgressComparison(clientId)]);
        setProgressPhotos(photos.progressPhotos);
        setProgressComparison(comparison.comparison);
      } else if (section === "memory") {
        setAscendMemory(await getTrainerClientMemory(clientId));
      } else if (section === "weekly") {
        const response = await getTrainerClientWeeklyReport(clientId);
        setWeeklyReport(response.report);
      } else if (section === "nutrition") {
        const response = await getTrainerClientNutritionPlan(clientId);
        const plan = response.coachPlan;
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
    } catch {
      loadedSections.current.delete(section);
      setStatus(t("trainer.loadSectionError", { section }));
    }
  }, [clientId, t]);
  const openMessages = useCallback(() => loadSection("messages"), [loadSection]);
  const openProgress = useCallback(() => loadSection("progress"), [loadSection]);
  const openMemory = useCallback(() => loadSection("memory"), [loadSection]);
  const openWeekly = useCallback(() => loadSection("weekly"), [loadSection]);
  const openNutrition = useCallback(() => loadSection("nutrition"), [loadSection]);

  useEffect(() => {
    if (!status || status === t("common.loading") || status === t("trainer.pauseZoe") || status === t("trainer.resumeZoe")) return;
    const timeout = window.setTimeout(() => setStatus(""), 6000);
    return () => window.clearTimeout(timeout);
  }, [status, t]);

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
  const momentumPillars = [
    { label: "Fuel", value: client?.fuel_score, max: client?.focus_active ? 35 : 40 },
    { label: "Move", value: client?.move_score, max: client?.focus_active ? 35 : 40 },
    { label: "Recover", value: client?.recover_score, max: 20 },
    ...(client?.focus_active ? [{ label: "Focus", value: client?.focus_score, max: 10 }] : [])
  ];
  const latestFood = foodLogs[0];
  const latestMessage = messages[messages.length - 1] ?? null;
  const unreadMessages = messages.filter((message) => message.sender_user_id === clientId && !message.read_at).length;
  const todaysCoachInsight = coachPresence.latest && isToday(coachPresence.latest.created_at) ? coachPresence.latest : null;
  const latestWorkout = burnLogs.find((log) => log.metadata?.source === "coach_zoe_workout_planner" || log.metadata?.source === "trainer_logged_session" || Boolean(log.metadata?.workoutTitle)) ?? null;
  const latestWorkoutIsCoached = latestWorkout?.metadata?.source === "trainer_logged_session";
  const latestWorkoutIsZoe = latestWorkout?.metadata?.source === "coach_zoe_workout_planner";
  const latestCoachedSession = burnLogs.find((log) => log.metadata?.source === "trainer_logged_session") ?? null;
  const latestCoachedSessionTime = latestCoachedSession ? new Date(latestCoachedSession.created_at).getTime() : 0;
  const recentCoachedSession = latestCoachedSession && Number.isFinite(latestCoachedSessionTime) && Date.now() - latestCoachedSessionTime <= 7 * 24 * 60 * 60 * 1000
    ? latestCoachedSession
    : null;
  const handoverBoundary = recentCoachedSession ? latestCoachedSessionTime : Date.now() - 7 * 24 * 60 * 60 * 1000;
  const todaysWorkout = latestWorkout && isToday(latestWorkout.created_at) ? latestWorkout : null;
  const workoutsThisWeek = burnLogs.filter((log) => {
    const date = new Date(log.created_at);
    return Number.isFinite(date.getTime()) && Date.now() - date.getTime() <= 7 * 24 * 60 * 60 * 1000;
  });
  const completedMissions = missions.filter((mission) => mission.status === "completed");
  const openMissions = missions.filter((mission) => mission.status !== "completed");
  const workoutsSinceHandover = burnLogs.filter((log) => new Date(log.created_at).getTime() > handoverBoundary && log.id !== recentCoachedSession?.id);
  const foodLogsSinceHandover = foodLogs.filter((log) => new Date(log.logged_at).getTime() > handoverBoundary);
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
  const effectiveCalorieTarget = client?.nutrition_targets?.calories ?? nutritionTargets.calorieTarget;
  const effectiveProteinTarget = client?.nutrition_targets?.proteinG ?? nutritionTargets.proteinTargetG;
  const effectiveCarbsTarget = client?.nutrition_targets?.carbsG ?? nutritionTargets.carbsTargetG;
  const effectiveFatTarget = client?.nutrition_targets?.fatG ?? nutritionTargets.fatTargetG;
  const effectiveWaterTargetMl = client?.nutrition_targets?.waterMl ?? nutritionTargets.waterTargetMl;

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
    proteinTargetG: effectiveProteinTarget
  }, { maxDays: 3, maxItemsPerDay: 4 }), [burnLogs, client?.goal_type, coachPresence.history, effectiveProteinTarget, foodLogs, latestWeight, missions, previousWeight, waterLogs, weeklyReport, weightDelta]);

  const suggestedDiscussion = useMemo(() => {
    if (todaysWorkout && todaysNutrition.proteinG < effectiveProteinTarget * 0.6) {
      return t("trainer.discussionRecoveryProtein");
    }
    if ((score ?? 100) < 50) return t("trainer.discussionSimpleCheckin");
    if (!todaysFood.length && new Date().getHours() >= 14) return t("trainer.discussionFoodLogging");
    if (weightDelta > 0.5 && client?.goal_type === "fat_loss") return t("trainer.discussionWeightTrend");
    if (todaysWorkout) return t("trainer.discussionWorkoutRecovery");
    return t("trainer.discussionConsistentBehaviour");
  }, [client?.goal_type, effectiveProteinTarget, score, t, todaysFood.length, todaysNutrition.proteinG, todaysWorkout, weightDelta]);

  useEffect(() => {
    if (coachNutritionPlan) return;
    if (nutritionCalories || nutritionProtein || nutritionCarbs || nutritionFat) return;
    setNutritionCalories(String(effectiveCalorieTarget));
    setNutritionProtein(String(effectiveProteinTarget));
    setNutritionCarbs(String(effectiveCarbsTarget));
    setNutritionFat(String(effectiveFatTarget));
  }, [coachNutritionPlan, effectiveCalorieTarget, effectiveCarbsTarget, effectiveFatTarget, effectiveProteinTarget, nutritionCalories, nutritionProtein, nutritionCarbs, nutritionFat]);

  async function generateCheckin() {
    setIsGenerating(true);
    setCheckin("");

    try {
      const response = await createWeeklyCheckin(clientId);
      setCheckin(response.summary);
    } catch {
      setCheckin(t("client360.zoeUnavailable"));
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
      setStatus(t("trainer.checkInSent"));
    } catch {
      setMessageBody(trimmed);
      setStatus(t("trainer.messageError"));
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
      setStatus(t("trainer.missionAssigned"));
    } catch {
      setStatus(t("trainer.missionError"));
    } finally {
      setIsSavingMission(false);
    }
  }

  async function handleSendPraise() {
    setIsSendingPraise(true);
    setStatus("");

    try {
      await sendTrainerClientPraise(clientId);
      setStatus(t("trainer.praiseSent"));
    } catch {
      setStatus(t("trainer.praiseError"));
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
      setNutritionStatus(t("trainer.nutritionNumberError"));
      return;
    }

    setIsSavingNutrition(true);
    setNutritionStatus(t("trainer.savingCoachPlan"));
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
      setNutritionStatus(t("trainer.coachPlanSaved"));
    } catch (error) {
      setNutritionStatus(error instanceof Error ? error.message : t("trainer.coachPlanError"));
    } finally {
      setIsSavingNutrition(false);
    }
  }

  async function setCoachPresencePause(pauseHours: number | null) {
    setStatus(pauseHours ? t("trainer.pauseZoe") : t("trainer.resumeZoe"));
    try {
      await pauseTrainerClientCoachPresence(clientId, pauseHours);
      const response = await getTrainerClientCoachPresence(clientId);
      setCoachPresence(response);
      setStatus(pauseHours ? t("trainer.zoePaused") : t("trainer.zoeResumed"));
    } catch {
      setStatus(t("trainer.zoeUpdateError"));
    }
  }

  return (
    <>
      <section className="sticky top-0 z-30 -mx-1 rounded-b-2xl border-b border-line bg-ink/95 px-1 pb-3 pt-3 backdrop-blur md:top-4 md:mx-0 md:rounded-2xl md:border md:px-4">
        <div className="mb-3">
          <BackButton fallbackHref="/trainer" />
        </div>
        <div className="flex items-center gap-3">
          <ProfileAvatar src={client?.profile_photo_url} name={client?.full_name} size="md" />
          <div className="min-w-0">
            <p className="text-sm text-zinc-400">{t("trainer.clientProfile")}</p>
            <h1 className="mt-1 truncate text-2xl font-semibold">{client?.full_name ?? t("trainer.client")}</h1>
            <p className="mt-1 text-sm text-zinc-400">{formatGoal(client?.goal_type, t)} / {client?.gym_name ?? t("trainer.gymNotSet")}</p>
          </div>
        </div>
        {client?.goal_achieved_at ? (
          <p className="mt-3 rounded-2xl border border-lime/40 bg-lime/10 p-3 text-sm font-semibold text-lime">
            {t("trainer.goalAchievedDetail")}
          </p>
        ) : client?.goal_updated_at ? (
          <p className="mt-3 text-xs text-zinc-500">{t("trainer.goalLastUpdated", { date: new Date(client.goal_updated_at).toLocaleDateString() })}</p>
        ) : null}
        {client?.id ? (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {sessionCaptureEnabled ? (
              <Link href={`/trainer/clients/${client.id}/session`} className="col-span-3 flex h-14 items-center justify-center gap-2 rounded-2xl bg-lime text-base font-bold text-ink">
                <Dumbbell size={19} /> {t("trainer.recordPtSession")}
              </Link>
            ) : null}
            <Link
              href={`/messages?userId=${client.id}`}
              className="flex h-12 items-center justify-center rounded-2xl bg-lime font-semibold text-ink"
            >
              {t("trainer.openChat")}
            </Link>
            <button
              type="button"
              disabled={isSendingPraise}
              onClick={handleSendPraise}
              className="col-span-2 h-12 rounded-2xl border border-lime/40 bg-lime/10 font-semibold text-lime disabled:opacity-60"
            >
              {isSendingPraise ? t("trainer.sending") : t("trainer.sendPraise")}
            </button>
          </div>
        ) : null}
      </section>

      {status ? (
        <p role="status" className="fixed bottom-24 left-1/2 z-50 w-[min(32rem,calc(100%-2rem))] -translate-x-1/2 rounded-2xl border border-line bg-ink/95 p-3 text-center text-sm text-zinc-200 shadow-xl backdrop-blur md:bottom-6">
          {status}
        </p>
      ) : null}

      <section className="mt-4 rounded-[1.75rem] border border-purple-400/30 bg-[radial-gradient(circle_at_top_right,rgba(61,230,209,0.18),transparent_16rem),radial-gradient(circle_at_bottom_left,rgba(139,92,246,0.2),transparent_16rem),linear-gradient(180deg,rgba(18,22,35,0.98),rgba(8,13,24,0.98))] p-5 shadow-soft">
        <div className="flex items-start gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-purple-500/20 text-purple-200">
            <Brain size={24} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-purple-200">{t("trainer.handover")}</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">{recentCoachedSession ? t("trainer.sinceSession") : t("trainer.recentActivity")}</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              {recentCoachedSession ? t("trainer.sinceSessionBody") : t("trainer.recentActivityBody")}
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <HandoverItem icon={<Dumbbell size={18} />} label={recentCoachedSession ? t("trainer.workoutsSinceSession") : t("trainer.workouts7d")} value={String(workoutsSinceHandover.length)} />
          <HandoverItem icon={<Utensils size={18} />} label={recentCoachedSession ? t("trainer.mealsSinceSession") : t("trainer.foodLogs7d")} value={String(foodLogsSinceHandover.length)} />
          <HandoverItem icon={<Sparkles size={18} />} label={t("trainer.todaysInsight")} value={todaysCoachInsight ? t("trainer.delivered") : t("trainer.notYet")} />
          <HandoverItem icon={<Zap size={18} />} label={t("trainer.momentum")} value={score === null || score === undefined ? "--" : `${score}/100`} />
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-ink/70 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-calm">{t("trainer.suggestedDiscussion")}</p>
          <p className="mt-2 text-sm leading-6 text-zinc-200">{suggestedDiscussion}</p>
        </div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <SectionCard
          eyebrow={t("trainer.todaysInsightTitle")}
          title={todaysCoachInsight ? t("trainer.whatClientSaw") : t("trainer.noInsightToday")}
          tone="zoe"
          action={<Sparkles className="text-purple-200" size={22} />}
        >
          <p className="mt-3 rounded-2xl bg-ink/70 p-4 text-sm leading-6 text-zinc-200">
            {todaysCoachInsight?.message ?? t("trainer.noInsightTodayBody")}
          </p>
        </SectionCard>

        <SectionCard
          eyebrow={latestWorkoutIsCoached ? t("trainer.coachedSession") : latestWorkoutIsZoe ? t("trainer.coachZoeWorkout") : t("trainer.loggedWorkout")}
          title={latestWorkout ? workoutName(latestWorkout, t) : t("trainer.noSavedWorkout")}
          tone={latestWorkout ? "success" : "default"}
          action={<Dumbbell className="text-lime" size={22} />}
        >
          {latestWorkout ? (
            <>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <MetricTile label={t("trainer.status")} value={t("common.completed")} detail={formatDateTime(latestWorkout.created_at, t)} />
                <MetricTile label={t("trainer.duration")} value={`${Number(latestWorkout.metadata?.durationMinutes ?? 0) || "--"} min`} />
                <MetricTile label={t("trainer.difficulty")} value={titleCase(latestWorkout.metadata?.workoutDifficultyLabel ?? latestWorkout.metadata?.workoutDifficulty, t)} />
                <MetricTile label={t("trainer.estimatedBurn")} value={`~${workoutCalories(latestWorkout)} kcal`} />
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-ink/70 p-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">{t("trainer.momentumEarned")}</p>
                  <p className="mt-1 text-lg font-semibold text-lime">
                    {latestWorkout.metadata?.momentumEarned === null || latestWorkout.metadata?.momentumEarned === undefined
                      ? t("trainer.notRecorded")
                      : `+${Number(latestWorkout.metadata.momentumEarned)}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowWorkout((current) => !current)}
                  className="rounded-2xl bg-lime px-4 py-3 text-sm font-bold text-ink"
                >
                  {showWorkout ? t("trainer.hideWorkout") : t("trainer.viewWorkout")}
                </button>
              </div>
              {showWorkout ? <WorkoutDetail workout={latestWorkout} t={t} /> : null}
            </>
          ) : (
            <p className="mt-3 rounded-2xl bg-ink/70 p-4 text-sm leading-6 text-zinc-400">
              {t("trainer.noWorkoutDetail")}
            </p>
          )}
        </SectionCard>
      </div>

      <CollapsibleSection
        storageKey={`${clientId}:homework`}
        title={t("trainer.coachHomework")}
        preview={t("trainer.coachHomeworkPreview")}
        icon={<ClipboardList size={20} />}
      >
        <TrainerHomeworkPanel clientId={clientId} />
      </CollapsibleSection>

      {client?.athlete_mode_enabled ? <AthleteCoachPanel clientId={clientId} /> : null}

      <CollapsibleSection
        storageKey={`${clientId}:timeline`}
        title={t("trainer.coachingTimeline")}
        preview={timelineGroups.length ? t("trainer.recentDaysSummarized", { count: timelineGroups.length }) : t("trainer.recentActivityPlaceholder")}
        icon={<CalendarClock size={20} />}
      >
        <SectionCard eyebrow={t("trainer.aiActivityTimeline")} title={t("trainer.betweenSessionsTitle")} action={<CalendarClock className="text-calm" size={22} />}>
          <div className="mt-4 space-y-4">
            <CoachingTimelineGroups groups={timelineGroups} />
            {!timelineGroups.length ? (
              <p className="rounded-2xl bg-ink/70 p-4 text-sm leading-6 text-zinc-400">
                {t("trainer.timelineEmptyDetail")}
              </p>
            ) : null}
            <Link href={`/trainer/clients/${clientId}/timeline`} className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-calm/40 bg-calm/10 font-semibold text-calm">
              {t("trainer.viewFullTimeline")} <ArrowRight size={18} />
            </Link>
          </div>
        </SectionCard>
      </CollapsibleSection>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <SectionCard eyebrow={t("trainer.nutritionSnapshot")} title={t("trainer.todaysIntake")} action={<Utensils className="text-lime" size={22} />}>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <MetricTile label={t("client360.calories")} value={todaysNutrition.calories.toLocaleString()} detail={t("trainer.kcalGuide", { value: effectiveCalorieTarget.toLocaleString() })} />
            <MetricTile label={t("client360.protein")} value={`${Math.round(todaysNutrition.proteinG)}g`} detail={t("trainer.gramsGuide", { value: effectiveProteinTarget })} />
            <MetricTile label={t("trainer.carbs")} value={`${Math.round(todaysNutrition.carbsG)}g`} detail={t("trainer.gramsGuide", { value: effectiveCarbsTarget })} />
            <MetricTile label={t("trainer.fat")} value={`${Math.round(todaysNutrition.fatG)}g`} detail={t("trainer.gramsGuide", { value: effectiveFatTarget })} />
            <MetricTile label={t("trainer.water")} value={`${(todaysWaterMl / 1000).toFixed(1)}L`} detail={t("trainer.literTarget", { value: (effectiveWaterTargetMl / 1000).toFixed(1) })} />
            <MetricTile label={t("trainer.meals")} value={String(todaysFood.length)} detail={latestFood ? t("trainer.lastMeal", { meal: latestFood.estimated_food_name }) : t("trainer.noMealsToday")} />
          </div>
          <Link
            href={`/trainer/clients/${clientId}/meals`}
            className="mt-4 flex h-12 items-center justify-center rounded-2xl border border-lime/40 bg-lime/10 font-semibold text-lime"
          >
            {t("trainer.viewFullMealHistory")}
          </Link>
        </SectionCard>

        <SectionCard eyebrow={t("trainer.progressSnapshot")} title={t("trainer.recentProgress")} action={<BarChart3 className="text-calm" size={22} />}>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <MetricTile label={t("trainer.momentum")} value={score === null || score === undefined ? "--" : `${score}/100`} detail={score === null || score === undefined ? t("trainer.noScoreYet") : score < 50 ? t("trainer.needsSupport") : score < 70 ? t("trainer.building") : t("trainer.onTrack")} />
            <MetricTile label={t("client360.currentWeight")} value={latestWeight ? `${asNumber(latestWeight.weight_kg).toFixed(1)}kg` : "--"} detail={weightDelta ? t("trainer.weightVsPrevious", { value: `${weightDelta > 0 ? "+" : ""}${weightDelta.toFixed(1)}` }) : t("trainer.noTrendYet")} />
            <MetricTile label={t("trainer.openMissions")} value={String(openMissions.length)} detail={openMissions.length === 1 ? t("trainer.oneActionToFollowUp") : t("trainer.actionsToFollowUp")} />
            <MetricTile label={t("trainer.workouts")} value={String(workoutsThisWeek.length)} detail={t("trainer.loggedLast7Days")} />
          </div>
          {momentumPillars.some((pillar) => pillar.value !== null && pillar.value !== undefined) ? (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {momentumPillars.map((pillar) => (
                <div key={pillar.label} className="rounded-xl border border-white/5 bg-ink p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">{pillar.label}</p>
                  <p className="mt-1 text-base font-semibold text-white">{pillar.value ?? 0}/{pillar.max}</p>
                </div>
              ))}
            </div>
          ) : null}
        </SectionCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <CollapsibleSection
          storageKey={`${clientId}:messages`}
          title={t("common.messages")}
          preview={unreadMessages ? t("trainer.unreadMessages", { count: unreadMessages }) : latestMessage ? t("trainer.latestMessage", { body: latestMessage.body }) : t("trainer.noConversation")}
          icon={<MessageCircle size={20} />}
          onOpen={openMessages}
        >
        <SectionCard
          eyebrow={t("common.messages")}
          title={latestMessage ? t("trainer.latestConversation") : t("trainer.noConversation")}
          action={<MessageCircle className="text-calm" size={22} />}
        >
          <div id="trainer-message-card" className="mt-3 rounded-2xl bg-ink/70 p-4">
            {latestMessage ? (
              <>
                <p className="text-sm leading-6 text-zinc-200">{latestMessage.body}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                  <span>{latestMessage.sender_user_id === clientId ? t("trainer.client") : t("common.trainer")}</span>
                  <span>/</span>
                  <span>{formatDateTime(latestMessage.created_at, t)}</span>
                  {unreadMessages ? <span className="rounded-full bg-amber/20 px-2 py-1 font-semibold text-amber">{t("trainer.unreadCount", { count: unreadMessages })}</span> : null}
                </div>
              </>
            ) : (
              <p className="text-sm leading-6 text-zinc-400">{t("trainer.messageEmptyDetail")}</p>
            )}
          </div>
          <form onSubmit={handleSendMessage} className="mt-3 flex gap-2">
            <textarea
              value={messageBody}
              onChange={(event) => setMessageBody(event.target.value)}
              rows={1}
              placeholder={t("trainer.replyPlaceholder")}
              className="min-h-12 flex-1 resize-none rounded-2xl border border-line bg-ink px-3 py-3 text-sm outline-none focus:border-lime"
            />
            <button
              type="submit"
              disabled={!messageBody.trim() || isSendingMessage}
              className="grid h-12 w-12 place-items-center rounded-2xl bg-lime text-ink disabled:opacity-60"
              aria-label={t("trainer.sendMessage")}
            >
              <Send size={18} />
            </button>
          </form>
          {client?.id ? (
            <Link
              href={`/messages?userId=${client.id}`}
              className="mt-3 flex h-12 items-center justify-center rounded-2xl border border-calm/40 bg-calm/10 font-semibold text-calm"
            >
              {t("trainer.openConversation")}
            </Link>
          ) : null}
        </SectionCard>
        </CollapsibleSection>

        <CollapsibleSection
          storageKey={`${clientId}:memory`}
          title={t("trainer.ascendMemory")}
          preview={memoryHero ? memoryHero.title : t("trainer.memoryPreview")}
          icon={<NotebookText size={20} />}
          onOpen={openMemory}
        >
        <SectionCard eyebrow={t("trainer.ascendMemory")} title={memoryHero ? t("trainer.zoeRemembers") : t("trainer.noMemories")} action={<NotebookText className="text-purple-200" size={22} />} tone="zoe">
          {memoryHero ? (
            <article className="mt-3 rounded-2xl bg-ink/70 p-4">
              <p className="text-sm font-semibold text-white">{memoryHero.title}</p>
              <p className="mt-1 text-xs text-zinc-500">{formatShortDate(memoryHero.occurredAt, t)}</p>
              <p className="mt-3 text-sm leading-6 text-zinc-200">{memoryHero.reflection ?? memoryHero.subtitle}</p>
            </article>
          ) : (
            <p className="mt-3 rounded-2xl bg-ink/70 p-4 text-sm leading-6 text-zinc-400">
              {t("trainer.memoryEmptyDetail")}
            </p>
          )}
          {ascendMemory?.timeline?.length ? (
            <div className="mt-3 grid gap-2">
              {ascendMemory.timeline.slice(0, 3).map((item) => (
                <div key={item.milestoneKey} className="flex items-center justify-between gap-3 rounded-2xl bg-ink/50 px-3 py-2">
                  <span className="truncate text-sm text-zinc-300">{item.title}</span>
                  <span className="shrink-0 text-xs text-zinc-500">{formatShortDate(item.occurredAt, t)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </SectionCard>
        </CollapsibleSection>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <CollapsibleSection
          storageKey={`${clientId}:weekly`}
          title={t("trainer.weeklyReport")}
          preview={weeklyReport ? t("trainer.latestWeekOf", { date: formatShortDate(weeklyReport.week_start, t) }) : t("trainer.generateWeeklySummary")}
          icon={<ClipboardList size={20} />}
          onOpen={openWeekly}
        >
        <SectionCard
          eyebrow={t("trainer.weeklyReport")}
          title={weeklyReport ? t("trainer.latestReportReady") : t("trainer.generateCoachingDraft")}
          action={<ClipboardList className="text-calm" size={22} />}
        >
          <div className="mt-3 rounded-2xl bg-ink/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">{weeklyReport ? t("trainer.weekOf", { date: formatShortDate(weeklyReport.week_start, t) }) : t("trainer.noReportGenerated")}</p>
                <p className="mt-1 text-xs text-zinc-500">{weeklyReport ? t("trainer.lastGenerated", { date: formatDateTime(weeklyReport.created_at, t) }) : t("trainer.weeklySummaryHelp")}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${weeklyReport ? "bg-lime text-ink" : "bg-surface text-zinc-300"}`}>
                {weeklyReport ? t("trainer.ready") : t("trainer.notReady")}
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
            {isGenerating ? t("trainer.generating") : checkin ? t("trainer.refreshCoachDraft") : t("trainer.generateWeeklyReport")}
          </button>
        </SectionCard>
        </CollapsibleSection>

        <CollapsibleSection
          storageKey={`${clientId}:tools`}
          title={t("trainer.coachTools")}
          preview={t("trainer.coachToolsPreview", { count: openMissions.length, state: coachPresence.settings.paused ? t("trainer.paused") : t("trainer.active") })}
          icon={<Target size={20} />}
        >
        <SectionCard eyebrow={t("trainer.coachTools")} title={t("trainer.simpleActionsNextSession")} action={<Target className="text-lime" size={22} />}>
          <form onSubmit={handleCreateMission} className="mt-3 space-y-3">
            <textarea
              value={missionTitle}
              onChange={(event) => setMissionTitle(event.target.value)}
              rows={2}
              maxLength={180}
              placeholder={t("trainer.missionPlaceholder")}
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
                {isSavingMission ? t("trainer.assigning") : t("trainer.assign")}
              </button>
            </div>
          </form>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <MetricTile label={t("trainer.openMissions")} value={String(openMissions.length)} />
            <MetricTile label={t("common.completed")} value={String(completedMissions.length)} />
          </div>
          <button
            type="button"
            onClick={() => setCoachPresencePause(coachPresence.settings.paused ? null : 24)}
            className={`mt-3 h-11 w-full rounded-2xl border font-semibold ${coachPresence.settings.paused ? "border-calm/50 bg-calm/10 text-calm" : "border-amber/50 bg-amber/10 text-amber"}`}
          >
            {coachPresence.settings.paused ? t("trainer.resumeInsights") : t("trainer.pauseInsights24h")}
          </button>
        </SectionCard>
        </CollapsibleSection>
      </div>

      <CollapsibleSection
        storageKey={`${clientId}:nutrition-plan`}
        title={t("trainer.coachNutritionPlan")}
        preview={coachNutritionPlan ? t("trainer.planActive", { label: coachNutritionPlan.plan_label || t("trainer.customPlan") }) : t("trainer.kcalAscendGuide", { value: effectiveCalorieTarget.toLocaleString() })}
        icon={<Flame size={20} />}
        onOpen={openNutrition}
      >
      <SectionCard eyebrow={t("trainer.coachNutritionPlan")} title={coachNutritionPlan ? t("trainer.customPlanActive") : t("trainer.usingAscendRecommendation")} action={<Flame className="text-lime" size={22} />}>
        <div className="mt-3 rounded-2xl border border-line bg-ink p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-lime">{t("trainer.ascendRecommendation")}</p>
          <p className="mt-2 text-sm leading-6 text-zinc-300">
            {t("trainer.nutritionRecommendationLine", {
              calories: effectiveCalorieTarget.toLocaleString(),
              protein: effectiveProteinTarget,
              carbs: effectiveCarbsTarget,
              fat: effectiveFatTarget
            })}
          </p>
        </div>
        <form onSubmit={handleSaveNutritionPlan} className="mt-4 space-y-3">
          <input
            value={nutritionLabel}
            onChange={(event) => setNutritionLabel(event.target.value)}
            placeholder={t("trainer.planLabelPlaceholder")}
            maxLength={80}
            className="h-12 w-full rounded-2xl border border-line bg-ink px-3 text-sm outline-none focus:border-lime"
          />
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-sm font-medium text-zinc-300">
              {t("client360.calories")}
              <input value={nutritionCalories} onChange={(event) => setNutritionCalories(event.target.value)} inputMode="numeric" className="h-12 rounded-2xl border border-line bg-ink px-3 text-white outline-none focus:border-lime" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-zinc-300">
              {t("client360.protein")}
              <input value={nutritionProtein} onChange={(event) => setNutritionProtein(event.target.value)} inputMode="numeric" className="h-12 rounded-2xl border border-line bg-ink px-3 text-white outline-none focus:border-lime" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-zinc-300">
              {t("trainer.carbohydrates")}
              <input value={nutritionCarbs} onChange={(event) => setNutritionCarbs(event.target.value)} inputMode="numeric" className="h-12 rounded-2xl border border-line bg-ink px-3 text-white outline-none focus:border-lime" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-zinc-300">
              {t("trainer.fat")}
              <input value={nutritionFat} onChange={(event) => setNutritionFat(event.target.value)} inputMode="numeric" className="h-12 rounded-2xl border border-line bg-ink px-3 text-white outline-none focus:border-lime" />
            </label>
          </div>
          <textarea
            value={nutritionNote}
            onChange={(event) => setNutritionNote(event.target.value)}
            rows={3}
            maxLength={800}
            placeholder={t("trainer.coachNotePlaceholder")}
            className="min-h-24 w-full resize-none rounded-2xl border border-line bg-ink px-3 py-3 text-sm outline-none focus:border-lime"
          />
          <button
            type="submit"
            disabled={isSavingNutrition}
            className="h-12 w-full rounded-2xl bg-lime font-semibold text-ink disabled:opacity-60"
          >
            {isSavingNutrition ? t("common.saving") : t("trainer.saveCoachPlan")}
          </button>
        </form>
        {coachNutritionPlan?.updated_at ? (
          <p className="mt-3 text-xs text-zinc-500">{t("trainer.lastUpdated", { date: new Date(coachNutritionPlan.updated_at).toLocaleString() })}</p>
        ) : null}
        {nutritionStatus ? <p className="mt-3 rounded-2xl border border-line bg-ink p-3 text-sm text-zinc-300">{nutritionStatus}</p> : null}
      </SectionCard>
      </CollapsibleSection>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <CollapsibleSection
          storageKey={`${clientId}:food-evidence`}
          title={t("trainer.foodLogs")}
          preview={foodLogs.length ? t("trainer.recentFoodLogs", { count: foodLogs.length }) : t("trainer.noFoodLogs")}
          icon={<Utensils size={20} />}
        >
        <SectionCard eyebrow={t("trainer.foodEvidence")} title={t("trainer.latestMeals")} action={<Utensils className="text-lime" size={22} />}>
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
            {!foodLogs.length ? <p className="rounded-2xl bg-ink/70 p-3 text-sm text-zinc-400">{t("trainer.noFoodLogs")}</p> : null}
          </div>
        </SectionCard>
        </CollapsibleSection>

        <CollapsibleSection
          storageKey={`${clientId}:progress`}
          title={t("premium.progressPhotos")}
          preview={progressPhotos.length ? t("trainer.savedPhotos", { count: progressPhotos.length }) : t("trainer.photosComparison")}
          icon={<Activity size={20} />}
          onOpen={openProgress}
        >
        {progressComparison ? <ProgressComparisonCard comparison={progressComparison} photoHref="#progress-photos" /> : null}
        <SectionCard eyebrow={t("premium.progressPhotos")} title={progressPhotos.length ? t("trainer.savedPhotos", { count: progressPhotos.length }) : t("trainer.noPhotos")} action={<Activity className="text-calm" size={22} />}>
          <div id="progress-photos" className="mt-3 grid grid-cols-3 gap-2">
            {progressPhotos.slice(0, 6).map((photo) => (
              <article key={photo.id} className="overflow-hidden rounded-2xl bg-ink">
                <div className="grid aspect-[3/4] place-items-center">
                  {photo.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo.image_url} alt={photo.photo_type} className="h-full w-full object-cover" loading="lazy" decoding="async" />
                  ) : (
                    <span className="text-xs text-zinc-500">{t("trainer.noImage")}</span>
                  )}
                </div>
                <div className="p-2">
                  <p className="truncate text-xs font-medium capitalize">{photo.photo_type}</p>
                  <p className="mt-1 text-xs text-zinc-500">{formatShortDate(photo.logged_at, t)}</p>
                </div>
              </article>
            ))}
            {!progressPhotos.length ? <p className="col-span-3 rounded-2xl bg-ink/70 p-3 text-sm text-zinc-400">{t("trainer.progressPhotosEmpty")}</p> : null}
          </div>
        </SectionCard>
        </CollapsibleSection>
      </div>

      <section className="ascend-workspace-section mt-4 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          {weightDelta < 0 ? <TrendingDown className="text-lime" size={20} /> : <TrendingUp className="text-calm" size={20} />}
          <p className="text-sm text-zinc-300">{t("trainer.sharedClientFooter")}</p>
          <ArrowRight className="ml-auto hidden text-zinc-600 sm:block" size={18} />
        </div>
      </section>
    </>
  );
}

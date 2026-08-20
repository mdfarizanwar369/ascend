"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Check, CheckCircle2, ChevronDown, ChevronUp, Dumbbell, MessageCircle, RotateCcw, Send, Sparkles, UtensilsCrossed, Zap } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { StaggerItem, ZoeAvatar } from "@/components/ExperienceVisuals";
import {
  CoachChatMode,
  GeneratedWorkout,
  WorkoutPlannerGoal,
  WorkoutPlannerLocation,
  getAscendMemory,
  generateTodayWorkout,
  getBurnLogs,
  getCoachPresence,
  getFoodLogs,
  getGoalStatus,
  getHealthSyncStatus,
  getMyStreak,
  getTodayPriorityRecommendation,
  saveCompletedWorkout,
  sendCoachMessage
} from "@/lib/ascendApi";
import { loadAccountProfile } from "@/lib/accountSession";
import { rememberDashboardRecord } from "@/lib/dataSync";

type ChatMessage = {
  role: "assistant" | "user";
  text: string;
};

type WorkoutAnswers = {
  location?: WorkoutPlannerLocation;
  timeAvailable?: "20" | "30" | "45" | "60";
  goal?: WorkoutPlannerGoal;
  equipment?: string;
};

type WorkoutSaveSuccess = {
  workoutTitle: string;
  durationMinutes: number;
  workoutType: string;
  difficulty: string;
  estimatedCaloriesBurned: number;
  caloriesLabel: string;
  coachMessage: string;
  momentumEarned: number;
};

type WorkoutPlannerTime = NonNullable<WorkoutAnswers["timeAvailable"]>;

const starterMessages: ChatMessage[] = [
  {
    role: "assistant",
    text: "Ask about meals, workouts, recovery, habits, or how to make today easier to follow through on."
  }
];

const locationOptions: Array<{ value: WorkoutPlannerLocation; label: string }> = [
  { value: "gym", label: "Gym" },
  { value: "home", label: "Home" },
  { value: "hotel", label: "Hotel" },
  { value: "outdoors", label: "Outdoors" }
];

const timeOptions: Array<{ value: WorkoutPlannerTime; label: string }> = [
  { value: "20", label: "20 minutes" },
  { value: "30", label: "30 minutes" },
  { value: "45", label: "45 minutes" },
  { value: "60", label: "60+ minutes" }
];

const goalOptions: Array<{ value: WorkoutPlannerGoal; label: string }> = [
  { value: "fat_loss", label: "Fat Loss" },
  { value: "muscle_gain", label: "Muscle Gain" },
  { value: "strength", label: "Strength" },
  { value: "general_fitness", label: "General Fitness" },
  { value: "recovery", label: "Recovery" },
  { value: "mobility", label: "Mobility" }
];

const equipmentByLocation: Record<WorkoutPlannerLocation, string[]> = {
  gym: ["Full Gym", "Limited Gym"],
  home: ["Bodyweight", "Dumbbells", "Resistance Bands"],
  hotel: ["Bodyweight", "Dumbbells", "Resistance Bands"],
  outdoors: ["Bodyweight", "Walking or Running Route", "Park Bench or Bars"]
};

const locationVisuals: Record<WorkoutPlannerLocation, string> = {
  gym: "/workouts/location-gym.jpg",
  home: "/workouts/location-home.jpg",
  hotel: "/workouts/location-hotel.jpg",
  outdoors: "/workouts/location-outdoors.jpg"
};

const goalVisuals: Record<WorkoutPlannerGoal, string> = {
  fat_loss: "/workouts/goal-fat-loss.jpg",
  muscle_gain: "/workouts/goal-muscle-gain.jpg",
  strength: "/workouts/goal-strength.jpg",
  general_fitness: "/workouts/goal-general-fitness.jpg",
  recovery: "/workouts/goal-recovery.jpg",
  mobility: "/workouts/goal-mobility.jpg"
};

function workoutHeroImage(answers: WorkoutAnswers) {
  if (answers.goal) return goalVisuals[answers.goal];
  if (answers.location) return locationVisuals[answers.location];
  return locationVisuals.gym;
}

function asNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function buildTodaysInsight({
  coachPresence,
  foodCountToday,
  totalWorkoutLogs,
  hasJourneyHistory,
  latestWorkoutToday,
  latestWorkoutYesterday,
  streak,
  todaySteps,
  averageSteps7d,
  goalAchieved
}: {
  coachPresence?: string | null;
  foodCountToday: number;
  totalWorkoutLogs: number;
  hasJourneyHistory: boolean;
  latestWorkoutToday: boolean;
  latestWorkoutYesterday: boolean;
  streak: number;
  todaySteps: number;
  averageSteps7d: number;
  goalAchieved: boolean;
}) {
  if (!hasJourneyHistory && totalWorkoutLogs === 0 && foodCountToday === 0 && streak === 0 && todaySteps === 0 && averageSteps7d === 0 && !goalAchieved) {
    return "Welcome to Ascend. Give me one honest check-in today and I'll start coaching from something real.";
  }
  if (!hasJourneyHistory && (foodCountToday + totalWorkoutLogs) >= 1 && streak <= 1 && !goalAchieved) {
    return "Great start. One real check-in is enough to begin building momentum.";
  }
  if (goalAchieved) return "You already hit an important milestone. Today is about protecting the win.";
  if (coachPresence) return coachPresence;
  if (latestWorkoutToday) return "You already trained today. Recovery, water, and protein matter most now.";
  if (latestWorkoutYesterday) return "You trained yesterday. Recovery matters today.";
  if (foodCountToday === 0) return "Protein is your biggest opportunity today.";
  if (streak >= 7) return "One workout today keeps your streak feeling real.";
  if (averageSteps7d > 0 && todaySteps < averageSteps7d) return "A short walk would already move you closer to your usual rhythm.";
  return "One honest action is enough to keep today moving.";
}

function OptionButton({ imageUrl, label, onClick }: { imageUrl?: string; label: string; onClick: () => void }) {
  if (imageUrl) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="ascend-pressable group relative aspect-[1.45/1] overflow-hidden rounded-xl border border-line bg-ink text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime"
      >
        <Image src={imageUrl} alt="" fill sizes="(max-width: 480px) 44vw, 210px" className="object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        <span className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/15 to-transparent" />
        <span className="absolute inset-x-0 bottom-0 px-3 pb-3 text-sm font-semibold text-white">{label}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-line bg-ink/80 px-4 py-3 text-left text-sm font-semibold text-zinc-100 hover:border-lime/60 hover:bg-lime/10"
    >
      {label}
    </button>
  );
}

function WorkoutPlannerCard({
  answers,
  checkedExercises,
  isGenerating,
  onAnswer,
  onCancel,
  onGenerate,
  onToggleExercise,
  onRegenerate,
  setMessage,
  showExistingChoice,
  workoutSaved,
  workout
}: {
  answers: WorkoutAnswers;
  checkedExercises: Set<number>;
  isGenerating: boolean;
  onAnswer: (next: Partial<WorkoutAnswers>) => void;
  onCancel: () => void;
  onGenerate: (finalEquipment: string) => void;
  onToggleExercise: (index: number) => void;
  onRegenerate: () => void;
  setMessage: (message: string) => void;
  showExistingChoice: boolean;
  workoutSaved: boolean;
  workout: GeneratedWorkout | null;
}) {
  const nextStep = !answers.location ? "location" : !answers.timeAvailable ? "time" : !answers.goal ? "goal" : !answers.equipment ? "equipment" : "done";
  const equipmentOptions = answers.location ? equipmentByLocation[answers.location] : [];
  const [expandedExerciseIndex, setExpandedExerciseIndex] = useState<number | null>(0);
  const completionPercent = workout?.exercises.length ? Math.round((checkedExercises.size / workout.exercises.length) * 100) : 0;

  if (showExistingChoice && workout) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet/20 text-purple-200">
            <Dumbbell size={19} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">You already have today&apos;s workout.</h2>
            <p className="mt-1 text-sm leading-6 text-zinc-400">Keep it, regenerate it, or ask Zoe to adjust it in chat.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-2">
          <button type="button" onClick={onCancel} className="rounded-xl bg-lime px-4 py-3 text-sm font-bold text-ink">
            Keep current workout
          </button>
          <button
            type="button"
            onClick={onRegenerate}
            className="rounded-xl border border-line bg-ink px-4 py-3 text-sm font-semibold text-zinc-100"
          >
            Regenerate
          </button>
          <button
            type="button"
            onClick={() => {
              setMessage("Can you modify today's workout to be ");
              onCancel();
            }}
            className="rounded-xl border border-line bg-ink px-4 py-3 text-sm font-semibold text-zinc-100"
          >
            Modify in chat
          </button>
        </div>
      </section>
    );
  }

  if (workout) {
    return (
      <section className="overflow-hidden rounded-2xl border border-lime/25 bg-surface shadow-soft">
        <div className="relative aspect-[16/9] overflow-hidden bg-ink">
          <Image src={workoutHeroImage(answers)} alt={`${answers.location ?? "Personalized"} workout setting`} fill sizes="(max-width: 480px) 100vw, 448px" className="object-cover" priority />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-4">
            <div className="flex flex-wrap items-center gap-2 text-lime">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-lime text-ink"><Dumbbell size={17} /></span>
              <p className="text-xs font-bold uppercase tracking-[0.24em]">Today&apos;s workout</p>
              {answers.location ? (
                <span className="rounded-full border border-white/20 bg-black/35 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/80 backdrop-blur-sm">
                  Built for {answers.location}
                </span>
              ) : null}
            </div>
            <h2 className="mt-2 text-2xl font-semibold leading-tight text-white">{workout.title}</h2>
          </div>
        </div>

        <div className="p-4">
        <p className="text-sm leading-6 text-zinc-300">{workout.intro}</p>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-xl border border-line bg-ink/70 p-3">
            <p className="text-zinc-500">Duration</p>
            <p className="mt-1 font-bold text-zinc-100">{workout.estimatedDurationMinutes} min</p>
          </div>
          <div className="rounded-xl border border-line bg-ink/70 p-3">
            <p className="text-zinc-500">Focus</p>
            <p className="mt-1 font-bold text-zinc-100">{workout.focus}</p>
          </div>
          <div className="rounded-xl border border-line bg-ink/70 p-3">
            <p className="text-zinc-500">Effort</p>
            <p className="mt-1 font-bold capitalize text-zinc-100">{workout.intensity}</p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <p className="text-sm font-semibold text-zinc-100">Warm-up</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {workout.warmup.map((item) => (
                <span key={item} className="rounded-full border border-line bg-ink/70 px-3 py-2 text-xs text-zinc-300">
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-zinc-100">Your session</p>
                <p className="mt-1 text-xs text-zinc-500">Tap an exercise for coaching details.</p>
              </div>
              <p className="text-sm font-semibold text-lime">{checkedExercises.size}/{workout.exercises.length}</p>
            </div>
            <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-ink">
              <div className="h-full rounded-full bg-lime transition-[width] duration-500" style={{ width: `${completionPercent}%` }} />
            </div>
            <div className="space-y-2">
            {workout.exercises.map((exercise, index) => {
              const complete = checkedExercises.has(index);
              const expanded = expandedExerciseIndex === index;
              return (
                <article
                  key={`${exercise.name}-${index}`}
                  className={`ascend-stagger-enter rounded-xl border p-3 transition-colors ${
                    complete ? "border-lime/50 bg-lime/10" : "border-line bg-ink/75"
                  }`}
                  style={{ animationDelay: `${Math.min(index, 7) * 45}ms` }}
                >
                  <div className="flex items-start gap-3">
                  <button
                    type="button"
                    disabled={workoutSaved}
                    onClick={() => onToggleExercise(index)}
                    aria-label={`${complete ? "Mark incomplete" : "Mark complete"}: ${exercise.name}`}
                    className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border ${
                      complete ? "border-lime bg-lime text-ink" : "border-line text-zinc-500"
                    }`}
                  >
                    {complete ? <Check size={17} /> : index + 1}
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpandedExerciseIndex(expanded ? null : index)}
                    aria-expanded={expanded}
                    className="flex min-w-0 flex-1 items-start justify-between gap-2 text-left"
                  >
                    <span className="min-w-0">
                    <span className="block text-sm font-semibold text-zinc-100">{exercise.name}</span>
                    <span className="mt-1 block text-xs leading-5 text-zinc-400">
                      {[exercise.sets ? `${exercise.sets} sets` : null, exercise.reps, exercise.duration, exercise.rest ? `${exercise.rest} rest` : null]
                        .filter(Boolean)
                        .join(" / ")}
                    </span>
                    </span>
                    {expanded ? <ChevronUp className="mt-1 shrink-0 text-zinc-500" size={18} /> : <ChevronDown className="mt-1 shrink-0 text-zinc-500" size={18} />}
                  </button>
                  </div>
                  {expanded && exercise.note ? <p className="ascend-soft-enter ml-[52px] mt-2 text-xs leading-5 text-zinc-400">{exercise.note}</p> : null}
                </article>
              );
            })}
            </div>
          </div>

          <div className="rounded-xl border border-line bg-ink/70 p-3">
            <p className="text-sm font-semibold text-zinc-100">Cooldown</p>
            <p className="mt-2 text-sm leading-6 text-zinc-400">{workout.cooldown.join(" / ")}</p>
          </div>

          <div className="rounded-xl border border-violet/30 bg-violet/10 p-3">
            <p className="text-sm font-semibold text-purple-200">Coach tip</p>
            <p className="mt-2 text-sm leading-6 text-zinc-300">{workout.coachTip}</p>
          </div>
          <p className="text-xs leading-5 text-zinc-500">{workout.disclaimer}</p>
        </div>
        </div>
      </section>
    );
  }

  if (isGenerating) {
    return (
      <section className="rounded-2xl border border-lime/25 bg-surface p-4 shadow-soft">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-lime text-ink">
            <Sparkles size={18} />
          </span>
          <div>
            <h2 className="text-lg font-semibold">Building today&apos;s workout...</h2>
            <p className="mt-1 text-sm text-zinc-400">Coach Zoe is matching the session to your setup and recent activity.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-lime text-ink">
          <Dumbbell size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">Generate Today&apos;s Workout</h2>
          <p className="mt-1 text-sm leading-6 text-zinc-400">A quick session for today, based on where you are and how much time you have.</p>
        </div>
      </div>

      {nextStep === "done" ? null : (
        <div className="mt-4">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-purple-300">
            {nextStep === "location"
              ? "Where are you training?"
              : nextStep === "time"
                ? "How much time do you have?"
                : nextStep === "goal"
                  ? "Today's goal?"
                  : "Equipment available?"}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {nextStep === "location"
              ? locationOptions.map((option) => (
                  <OptionButton key={option.value} imageUrl={locationVisuals[option.value]} label={option.label} onClick={() => onAnswer({ location: option.value })} />
                ))
              : null}
            {nextStep === "time"
              ? timeOptions.map((option) => (
                  <OptionButton key={option.value} label={option.label} onClick={() => onAnswer({ timeAvailable: option.value })} />
                ))
              : null}
            {nextStep === "goal"
              ? goalOptions.map((option) => (
                  <OptionButton key={option.value} imageUrl={goalVisuals[option.value]} label={option.label} onClick={() => onAnswer({ goal: option.value })} />
                ))
              : null}
            {nextStep === "equipment"
              ? equipmentOptions.map((option) => <OptionButton key={option} label={option} onClick={() => onGenerate(option)} />)
              : null}
          </div>
        </div>
      )}

      {Object.keys(answers).length ? (
        <button type="button" onClick={onCancel} className="mt-4 text-sm font-semibold text-zinc-400">
          Cancel
        </button>
      ) : null}
    </section>
  );
}

export function CoachHubClient() {
  const [messages, setMessages] = useState<ChatMessage[]>(starterMessages);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [showExistingChoice, setShowExistingChoice] = useState(false);
  const [answers, setAnswers] = useState<WorkoutAnswers>({});
  const [workout, setWorkout] = useState<GeneratedWorkout | null>(null);
  const [checkedExercises, setCheckedExercises] = useState<Set<number>>(new Set());
  const [isGeneratingWorkout, setIsGeneratingWorkout] = useState(false);
  const [isSavingWorkout, setIsSavingWorkout] = useState(false);
  const [savedWorkoutSummary, setSavedWorkoutSummary] = useState<WorkoutSaveSuccess | null>(null);
  const [workoutCompletionKey, setWorkoutCompletionKey] = useState<string | null>(null);
  const [todaysInsight, setTodaysInsight] = useState("One honest action is enough to keep today moving.");
  const saveWorkoutLockRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const completedCount = useMemo(() => checkedExercises.size, [checkedExercises]);
  const allExercisesCompleted = Boolean(workout && workout.exercises.length > 0 && completedCount === workout.exercises.length);

  useEffect(() => {
    let active = true;
    const priorityRequest = loadAccountProfile()
      .then((profile) => profile.isPlatformOwner ? getTodayPriorityRecommendation() : null)
      .catch(() => null);

    Promise.all([getCoachPresence(), getMyStreak(), getBurnLogs(), getFoodLogs({ range: "today", order: "newest", limit: 12 }), getHealthSyncStatus(), getGoalStatus(), getAscendMemory(), priorityRequest])
      .then(([coachPresenceResponse, streakResponse, burnResponse, foodResponse, healthResponse, goalResponse, memoryResponse, priorityResponse]) => {
        if (!active) return;
        const todayKey = new Date().toDateString();
        const latestWorkoutToday = burnResponse.burnLogs.some((log) => new Date(log.created_at).toDateString() === todayKey);
        const latestWorkoutYesterday = burnResponse.burnLogs.some((log) => {
          const date = new Date();
          date.setDate(date.getDate() - 1);
          return new Date(log.created_at).toDateString() === date.toDateString();
        });
        setTodaysInsight(
          priorityResponse?.decision?.active
            ? priorityResponse.decision.insight.body
            : buildTodaysInsight({
            coachPresence: coachPresenceResponse.latest?.message ?? null,
            foodCountToday: foodResponse.foodLogs.length,
            totalWorkoutLogs: burnResponse.burnLogs.length,
            hasJourneyHistory: memoryResponse.timeline.length > 0,
            latestWorkoutToday,
            latestWorkoutYesterday,
            streak: streakResponse.streak.current,
            todaySteps: healthResponse.status.summary?.todaySteps ?? 0,
            averageSteps7d: healthResponse.status.summary?.averageSteps7d ?? 0,
            goalAchieved: Boolean(goalResponse.goalStatus?.achieved_at)
          })
        );
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  function nextWorkoutCompletionKey() {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
      const random = Math.floor(Math.random() * 16);
      const value = character === "x" ? random : (random & 0x3) | 0x8;
      return value.toString(16);
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || isSending) return;

    setMessage("");
    setStatus("");
    setIsSending(true);
    setMessages((current) => [...current, { role: "user", text: trimmed }]);

    try {
      const response = await sendCoachMessage(trimmed, "general");
      setMessages((current) => [...current, { role: "assistant", text: response.reply }]);
    } catch (error) {
      const nextStatus = error instanceof Error ? error.message : "AI coach is temporarily busy.";
      const limitReached = /free coaching sessions|ascend plus/i.test(nextStatus);
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: limitReached
            ? nextStatus
            : "The coach is having a short connection issue. Keep today simple: one useful meal, one useful movement, and one useful check-in."
        }
      ]);
      setStatus(nextStatus);
    } finally {
      setIsSending(false);
    }
  }

  async function sendPresetPrompt(input: { label: string; prompt: string; mode: CoachChatMode }) {
    if (isSending) return;
    setMessage("");
    setStatus("");
    setIsSending(true);
    setMessages((current) => [...current, { role: "user", text: input.label }]);
    try {
      const response = await sendCoachMessage(input.prompt, input.mode);
      setMessages((current) => [...current, { role: "assistant", text: response.reply }]);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Coach Zoe is temporarily busy.");
    } finally {
      setIsSending(false);
    }
  }

  function startWorkoutPlanner() {
    setStatus("");
    if (workout) {
      setShowExistingChoice(true);
      setPlannerOpen(true);
      return;
    }
    setAnswers({});
    setPlannerOpen(true);
  }

  function closeWorkoutPlanner() {
    setShowExistingChoice(false);
    if (!workout) setAnswers({});
    setPlannerOpen(Boolean(workout));
  }

  async function generateWorkout(finalEquipment: string) {
    const nextAnswers = { ...answers, equipment: finalEquipment };
    if (!nextAnswers.location || !nextAnswers.timeAvailable || !nextAnswers.goal || !nextAnswers.equipment || isGeneratingWorkout) return;

    setAnswers(nextAnswers);
    setStatus("");
    setIsGeneratingWorkout(true);
    setShowExistingChoice(false);

    try {
      const response = await generateTodayWorkout({
        location: nextAnswers.location,
        timeAvailable: nextAnswers.timeAvailable,
        goal: nextAnswers.goal,
        equipment: nextAnswers.equipment
      });
      setWorkout(response.workout);
      setCheckedExercises(new Set());
      setSavedWorkoutSummary(null);
      setWorkoutCompletionKey(nextWorkoutCompletionKey());
      setMessages((current) => [...current, { role: "assistant", text: response.workout.intro }]);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Coach Zoe could not build the workout yet.");
    } finally {
      setIsGeneratingWorkout(false);
    }
  }

  async function saveWorkoutCompletion() {
    if (!workout || !allExercisesCompleted || !workoutCompletionKey || saveWorkoutLockRef.current) return;
    saveWorkoutLockRef.current = true;
    setIsSavingWorkout(true);
    setStatus("");

    try {
      const response = await saveCompletedWorkout({
        workoutCompletionKey,
        workoutTitle: workout.title,
        workoutType: workout.focus,
        workoutDifficulty: workout.intensity,
        durationMinutes: workout.estimatedDurationMinutes,
        completedAt: new Date().toISOString(),
        exercises: workout.exercises
      });

      rememberDashboardRecord("burn", response.burnLog);
      setSavedWorkoutSummary(response.summary);
      setStatus("");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? `${error.message} Your workout is still here, so you can retry saving in a moment.`
          : "Could not save the workout yet. Your workout is still here, so you can try again."
      );
    } finally {
      saveWorkoutLockRef.current = false;
      setIsSavingWorkout(false);
    }
  }

  function focusCoachInput() {
    inputRef.current?.focus();
  }

  const quickActions = [
    { label: "Ask Zoe", icon: MessageCircle, action: "focus" },
    { label: "Generate Today's Workout", icon: Dumbbell, action: "workout" },
    { label: "Meal Advice", icon: UtensilsCrossed, action: "meal" },
    { label: "Explain my progress", icon: Zap, action: "progress" },
    { label: "Help me stay consistent", icon: Sparkles, action: "consistency" }
  ] as const;

  return (
    <main className="ascend-page px-4 py-3 text-white sm:py-5">
      <div className="ascend-member-frame flex min-h-screen flex-col">
        <header className="flex items-center gap-3 py-3">
          <BackButton fallbackHref="/dashboard" />
          <ZoeAvatar />
          <div>
            <h1 className="text-xl font-semibold">Coach Zoe</h1>
            <p className="text-xs text-zinc-400">A steady voice between sessions</p>
          </div>
        </header>

        {status ? <p className="mt-3 rounded-lg border border-amber/40 bg-amber/10 p-3 text-sm text-amber">{status}</p> : null}

        <section className="ascend-stagger-enter ascend-branded-surface mt-4 rounded-2xl border border-purple-400/20 bg-[linear-gradient(145deg,rgba(139,92,246,0.13),rgba(18,23,33,0.98)_52%,rgba(61,230,209,0.06))] p-5 shadow-soft">
          <div className="flex items-center gap-3"><ZoeAvatar size="lg" /><div><p className="ascend-eyebrow text-purple-200">Today&apos;s Insight</p><p className="mt-1 text-sm font-semibold text-white">Zoe noticed something useful</p></div></div>
          <h2 className="mt-4 text-2xl font-semibold leading-tight text-white">{todaysInsight}</h2>
          <p className="mt-3 text-sm leading-6 text-zinc-400">One useful observation, based on what you&apos;ve logged.</p>
        </section>

        <section className="ascend-stagger-enter mt-5 border-t border-line pt-5" style={{ animationDelay: "70ms" }}>
          <div className="flex items-center gap-2">
            <Sparkles className="text-calm" size={18} />
            <div>
              <p className="text-sm font-semibold text-white">Quick Coach Actions</p>
              <p className="text-xs text-zinc-400">Practical help without the guesswork.</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => {
                    if (action.action === "focus") {
                      focusCoachInput();
                      return;
                    }
                    if (action.action === "workout") {
                      startWorkoutPlanner();
                      return;
                    }
                    if (action.action === "meal") {
                      void sendPresetPrompt({
                        label: "Meal Advice",
                        prompt: "Use my recent history and give me meal advice for today.",
                        mode: "meal_advice"
                      });
                      return;
                    }
                    if (action.action === "progress") {
                      void sendPresetPrompt({
                        label: "Explain my progress",
                        prompt: "Explain my recent progress using my actual data and tell me what matters most today.",
                        mode: "progress"
                      });
                      return;
                    }
                    void sendPresetPrompt({
                      label: "Help me stay consistent",
                      prompt: "Help me stay consistent today using my recent patterns.",
                      mode: "consistency"
                    });
                  }}
                  className="ascend-pressable ascend-surface-subtle flex min-h-16 items-center gap-3 px-3 py-3 text-left"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface text-calm">
                    <Icon size={17} />
                  </span>
                  <span className="text-sm font-semibold text-zinc-100">{action.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        <div className="space-y-3 py-4">
          {plannerOpen ? (
            <WorkoutPlannerCard
              answers={answers}
              checkedExercises={checkedExercises}
              isGenerating={isGeneratingWorkout}
              onAnswer={(next) => setAnswers((current) => ({ ...current, ...next }))}
              onCancel={closeWorkoutPlanner}
              onGenerate={generateWorkout}
              onRegenerate={() => {
                setWorkout(null);
                setCheckedExercises(new Set());
                setAnswers({});
                setShowExistingChoice(false);
                setSavedWorkoutSummary(null);
                setWorkoutCompletionKey(null);
              }}
              onToggleExercise={(index) =>
                setCheckedExercises((current) => {
                  const next = new Set(current);
                  if (next.has(index)) next.delete(index);
                  else next.add(index);
                  return next;
                })
              }
              setMessage={setMessage}
              showExistingChoice={showExistingChoice}
              workoutSaved={Boolean(savedWorkoutSummary)}
              workout={workout}
            />
          ) : null}

          {workout ? (
            <div className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2 text-zinc-300">
                  <CheckCircle2 className="text-lime" size={18} />
                  {completedCount}/{workout.exercises.length} exercises checked
                </span>
                <button
                  type="button"
                  onClick={() => setShowExistingChoice(true)}
                  className="flex items-center gap-1 text-xs font-semibold text-purple-300"
                >
                  <RotateCcw size={14} />
                  Options
                </button>
              </div>

              {savedWorkoutSummary ? (
                <div className="ascend-success-reveal mt-4 overflow-hidden rounded-2xl border border-lime/30 bg-ink">
                  <div className="relative aspect-[16/8] overflow-hidden">
                    <Image src={workoutHeroImage(answers)} alt="Completed workout" fill sizes="(max-width: 480px) 100vw, 416px" className="object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-4">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-lime text-ink shadow-[0_0_32px_rgba(61,230,209,0.28)]">
                        <Check size={20} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-[0.22em] text-lime">Workout complete</p>
                        <h3 className="mt-1 truncate text-xl font-semibold text-white">{savedWorkoutSummary.workoutTitle}</h3>
                      </div>
                    </div>
                  </div>
                  <div className="p-4">
                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-zinc-200">
                        <div className="rounded-xl border border-white/10 bg-ink/60 px-3 py-3">
                          <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Duration</p>
                          <p className="mt-1 font-semibold">{savedWorkoutSummary.durationMinutes} min</p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-ink/60 px-3 py-3">
                          <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">{savedWorkoutSummary.caloriesLabel}</p>
                          <p className="mt-1 font-semibold">~{savedWorkoutSummary.estimatedCaloriesBurned} kcal</p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-ink/60 px-3 py-3">
                          <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Momentum Earned</p>
                          <p className="mt-1 font-semibold text-lime">+{savedWorkoutSummary.momentumEarned}</p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-ink/60 px-3 py-3">
                          <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Workout Type</p>
                          <p className="mt-1 font-semibold">{savedWorkoutSummary.workoutType}</p>
                        </div>
                      </div>
                      <div className="mt-4 flex items-start gap-2 rounded-xl border border-purple-300/15 bg-purple-400/8 p-3"><ZoeAvatar size="sm" /><p className="text-sm leading-6 text-zinc-200">{savedWorkoutSummary.coachMessage}</p></div>
                  </div>
                </div>
              ) : allExercisesCompleted ? (
                <button
                  type="button"
                  onClick={saveWorkoutCompletion}
                  disabled={isSavingWorkout}
                  className="mt-4 flex h-14 w-full items-center justify-center rounded-2xl bg-[linear-gradient(135deg,rgba(61,230,209,1),rgba(109,246,220,0.92))] text-base font-bold text-ink shadow-[0_18px_44px_rgba(61,230,209,0.24)] transition-transform duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSavingWorkout ? "Saving workout..." : "Complete & Save Workout"}
                </button>
              ) : (
                <div className="mt-4 rounded-xl border border-white/5 bg-ink/55 px-4 py-3 text-sm text-zinc-400">
                  Check off every exercise to unlock workout save.
                </div>
              )}
            </div>
          ) : null}
        </div>

        <section aria-label="Conversation" className="mt-2 flex-1 space-y-3 border-t border-line py-5">
          {messages.map((item, index) => (
            <StaggerItem key={`${item.role}-${index}`} index={Math.min(index, 5)} className={item.role === "user" ? "ml-auto max-w-[86%]" : "max-w-[92%]"}>
              <div className={`flex items-start gap-2 ${item.role === "user" ? "justify-end" : ""}`}>
                {item.role === "assistant" ? <ZoeAvatar size="sm" className="mt-0.5" /> : null}
                <div className={`rounded-xl p-3 text-sm leading-6 ${item.role === "user" ? "bg-lime text-ink" : "ascend-surface-subtle text-zinc-200"}`}>{item.text}</div>
              </div>
            </StaggerItem>
          ))}
          {isSending ? <p className="rounded-lg bg-surface p-3 text-sm text-zinc-400">Coach is thinking...</p> : null}
        </section>

        <form className="sticky bottom-0 flex gap-2 border-t border-line bg-ink/95 pb-4 pt-3 backdrop-blur" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            className="h-12 flex-1 rounded-xl border border-line bg-surface px-3 outline-none focus:border-lime"
            placeholder="Ask Coach Zoe"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
          <button
            type="submit"
            disabled={isSending || !message.trim()}
            className="ascend-pressable grid h-12 w-12 place-items-center rounded-xl bg-lime text-ink disabled:opacity-60"
            aria-label="Send message"
          >
            <Send size={19} />
          </button>
        </form>
      </div>
    </main>
  );
}

"use client";

import { FormEvent, useMemo, useState } from "react";
import { Check, CheckCircle2, Dumbbell, RotateCcw, Send, Sparkles } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import {
  GeneratedWorkout,
  WorkoutPlannerGoal,
  WorkoutPlannerLocation,
  generateTodayWorkout,
  sendCoachMessage
} from "@/lib/ascendApi";

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

type WorkoutPlannerTime = NonNullable<WorkoutAnswers["timeAvailable"]>;

const starterMessages: ChatMessage[] = [
  {
    role: "assistant",
    text:
      "Tell me what you ate, what you are about to eat, or ask for today's workout. I will keep it practical and fit it to your goal."
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

function OptionButton({ label, onClick }: { label: string; onClick: () => void }) {
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
  workout: GeneratedWorkout | null;
}) {
  const nextStep = !answers.location ? "location" : !answers.timeAvailable ? "time" : !answers.goal ? "goal" : !answers.equipment ? "equipment" : "done";
  const equipmentOptions = answers.location ? equipmentByLocation[answers.location] : [];

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
      <section className="rounded-2xl border border-lime/25 bg-[radial-gradient(circle_at_top_right,rgba(53,242,208,0.16),transparent_18rem),linear-gradient(180deg,rgba(18,23,33,0.98),rgba(7,9,13,0.98))] p-4 shadow-soft">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-lime text-ink">
            <Dumbbell size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-lime">Today&apos;s workout</p>
            <h2 className="mt-2 text-2xl font-semibold leading-tight">{workout.title}</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-300">{workout.intro}</p>
          </div>
        </div>

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

          <div className="space-y-2">
            {workout.exercises.map((exercise, index) => {
              const complete = checkedExercises.has(index);
              return (
                <button
                  key={`${exercise.name}-${index}`}
                  type="button"
                  onClick={() => onToggleExercise(index)}
                  className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left ${
                    complete ? "border-lime/50 bg-lime/10" : "border-line bg-ink/75"
                  }`}
                >
                  <span
                    className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border ${
                      complete ? "border-lime bg-lime text-ink" : "border-line text-zinc-500"
                    }`}
                  >
                    {complete ? <Check size={15} /> : index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-zinc-100">{exercise.name}</span>
                    <span className="mt-1 block text-xs text-zinc-400">
                      {[exercise.sets ? `${exercise.sets} sets` : null, exercise.reps, exercise.duration, exercise.rest ? `${exercise.rest} rest` : null]
                        .filter(Boolean)
                        .join(" / ")}
                    </span>
                    {exercise.note ? <span className="mt-2 block text-xs leading-5 text-zinc-500">{exercise.note}</span> : null}
                  </span>
                </button>
              );
            })}
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
          <h2 className="text-lg font-semibold">Coach Zoe Workout Planner</h2>
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
              ? locationOptions.map((option) => <OptionButton key={option.value} label={option.label} onClick={() => onAnswer({ location: option.value })} />)
              : null}
            {nextStep === "time"
              ? timeOptions.map((option) => (
                  <OptionButton key={option.value} label={option.label} onClick={() => onAnswer({ timeAvailable: option.value })} />
                ))
              : null}
            {nextStep === "goal"
              ? goalOptions.map((option) => <OptionButton key={option.value} label={option.label} onClick={() => onAnswer({ goal: option.value })} />)
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

export function CoachClient() {
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

  const completedCount = useMemo(() => checkedExercises.size, [checkedExercises]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || isSending) return;

    setMessage("");
    setStatus("");
    setIsSending(true);
    setMessages((current) => [...current, { role: "user", text: trimmed }]);

    try {
      const response = await sendCoachMessage(trimmed);
      setMessages((current) => [...current, { role: "assistant", text: response.reply }]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text:
            "The coach is having a short connection issue. For now, make the next choice simple: pick one protein source, add fruit or vegetables if you can, and keep the portion comfortable. Try sending your question again in a minute."
        }
      ]);
      setStatus(error instanceof Error ? error.message : "AI coach is temporarily busy.");
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
      setMessages((current) => [...current, { role: "assistant", text: response.workout.intro }]);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Coach Zoe could not build the workout yet.");
    } finally {
      setIsGeneratingWorkout(false);
    }
  }

  return (
    <main className="min-h-screen bg-ink px-4 py-5 text-white">
      <div className="mx-auto flex min-h-screen max-w-md flex-col">
        <header className="flex items-center gap-3 py-3">
          <BackButton fallbackHref="/dashboard" />
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-calm text-white">
            <Sparkles size={20} />
          </span>
          <div>
            <h1 className="text-xl font-semibold">Coach Zoe</h1>
            <p className="text-xs text-zinc-400">Meals and workouts between sessions</p>
          </div>
        </header>

        {status ? <p className="mt-3 rounded-lg border border-amber/40 bg-amber/10 p-3 text-sm text-amber">{status}</p> : null}

        <div className="space-y-3 py-4">
          {!plannerOpen ? (
            <button
              type="button"
              onClick={startWorkoutPlanner}
              className="flex w-full items-center justify-between rounded-2xl border border-lime/25 bg-[radial-gradient(circle_at_top_right,rgba(53,242,208,0.18),transparent_14rem),linear-gradient(180deg,rgba(18,23,33,0.98),rgba(7,9,13,0.98))] p-4 text-left shadow-soft"
            >
              <span>
                <span className="block text-xs font-bold uppercase tracking-[0.24em] text-lime">New</span>
                <span className="mt-2 block text-lg font-semibold text-zinc-100">Generate Today&apos;s Workout</span>
                <span className="mt-1 block text-sm text-zinc-400">Four quick answers. One practical session.</span>
              </span>
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-lime text-ink">
                <Dumbbell size={20} />
              </span>
            </button>
          ) : (
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
              workout={workout}
            />
          )}

          {workout ? (
            <div className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3 text-sm">
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
          ) : null}
        </div>

        <section className="flex-1 space-y-3 py-4">
          {messages.map((item, index) => (
            <div
              key={`${item.role}-${index}`}
              className={`max-w-[86%] rounded-lg p-3 text-sm leading-6 ${
                item.role === "user" ? "ml-auto bg-lime text-ink" : "bg-surface text-zinc-200"
              }`}
            >
              {item.text}
            </div>
          ))}
          {isSending ? <p className="rounded-lg bg-surface p-3 text-sm text-zinc-400">Coach is thinking...</p> : null}
        </section>

        <form className="sticky bottom-0 flex gap-2 bg-ink pb-4 pt-2" onSubmit={handleSubmit}>
          <input
            className="h-12 flex-1 rounded-lg border border-line bg-surface px-3 outline-none focus:border-lime"
            placeholder="Ask Coach Zoe"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
          <button
            type="submit"
            disabled={isSending || !message.trim()}
            className="grid h-12 w-12 place-items-center rounded-lg bg-lime text-ink disabled:opacity-60"
            aria-label="Send message"
          >
            <Send size={19} />
          </button>
        </form>
      </div>
    </main>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  Dumbbell,
  Plus,
  RefreshCcw,
  Sparkles,
  Trash2
} from "lucide-react";
import { createRepeatWorkoutCaptureDraft } from "@ascend/shared";
import type {
  WorkoutCaptureDifficulty,
  WorkoutCaptureDraft,
  WorkoutCaptureExercise
} from "@ascend/shared";
import { analyzeWorkoutCapture, getRecentDetailedWorkouts, getWorkoutProgressionHistory, saveCapturedWorkout } from "@/lib/ascendApi";
import { inputClass, selectClass } from "@/components/Field";
import { workoutProgressionEnabled } from "@/lib/workoutProgressionFlag";
import { workoutProgressionV3Enabled } from "@/lib/workoutProgressionV3Flag";

type RecentWorkout = Awaited<ReturnType<typeof getRecentDetailedWorkouts>>["workouts"][number];
type SavedSummary = NonNullable<Awaited<ReturnType<typeof saveCapturedWorkout>>["summary"]>;
type ProgressionHistoryItem = Awaited<ReturnType<typeof getWorkoutProgressionHistory>>["history"][number];

type WorkoutCapturePanelProps = {
  onBusyChange?: (busy: boolean) => void;
  onSaved: (burnLog: { id: string; metadata: Record<string, unknown>; created_at: string }, calories: number) => void;
};

function optionalNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function optionalInteger(value: string) {
  const parsed = optionalNumber(value);
  return parsed === null ? null : Math.round(parsed);
}

function metadataText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function blankExercise(): WorkoutCaptureExercise {
  return {
    name: "",
    originalText: null,
    sets: null,
    reps: null,
    load: null,
    loadUnit: "kg",
    durationMinutes: null,
    restSeconds: null,
    note: null,
    movementPattern: "other",
    confidence: 1,
    needsConfirmation: false
  };
}

function newCompletionKey() {
  return globalThis.crypto.randomUUID();
}

export function WorkoutCapturePanel({ onBusyChange, onSaved }: WorkoutCapturePanelProps) {
  const [workoutText, setWorkoutText] = useState("");
  const [draft, setDraft] = useState<WorkoutCaptureDraft | null>(null);
  const [completionKey, setCompletionKey] = useState<string | null>(null);
  const [recentWorkouts, setRecentWorkouts] = useState<RecentWorkout[]>([]);
  const [progressionHistory, setProgressionHistory] = useState<ProgressionHistoryItem[]>([]);
  const [isLoadingRecent, setIsLoadingRecent] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [savedSummary, setSavedSummary] = useState<SavedSummary | null>(null);
  const saveLockRef = useRef(false);

  const busy = isAnalyzing || isSaving;
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  useEffect(() => {
    let mounted = true;
    getRecentDetailedWorkouts(3)
      .then((response) => {
        if (mounted && response.enabled) setRecentWorkouts(response.workouts);
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setIsLoadingRecent(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!workoutProgressionV3Enabled()) return;
    let mounted = true;
    getWorkoutProgressionHistory(5)
      .then((response) => {
        if (mounted && response.enabled) setProgressionHistory(response.history);
      })
      .catch(() => undefined);
    return () => { mounted = false; };
  }, []);

  const canSave = useMemo(() => {
    return Boolean(
      draft &&
      draft.title.trim().length >= 2 &&
      draft.workoutType.trim().length >= 2 &&
      Number(draft.durationMinutes) >= 5 && Number(draft.durationMinutes) <= 300 &&
      draft.exercises.length > 0 &&
      draft.exercises.every((exercise) =>
        exercise.name.trim().length > 0 &&
        (exercise.sets === null || (exercise.sets >= 1 && exercise.sets <= 10)) &&
        (exercise.load === null || (exercise.load >= 0 && exercise.load <= 1_000)) &&
        (exercise.durationMinutes === null || (exercise.durationMinutes >= 1 && exercise.durationMinutes <= 300)) &&
        (exercise.restSeconds === null || (exercise.restSeconds >= 0 && exercise.restSeconds <= 600))
      )
    );
  }, [draft]);

  const activeUncertainties = useMemo(() => {
    if (!draft) return [];
    return draft.uncertainties.filter((uncertainty) => {
      const lower = uncertainty.toLowerCase();
      if (lower.includes("duration") && Number(draft.durationMinutes) >= 5) return false;
      if (lower.includes("confirm the details")) {
        return draft.exercises.some((exercise) => exercise.needsConfirmation && lower.includes(exercise.name.toLowerCase()));
      }
      return true;
    });
  }, [draft]);

  function resetCapture() {
    setWorkoutText("");
    setDraft(null);
    setCompletionKey(null);
    setSavedSummary(null);
    setStatus("");
  }

  async function analyze() {
    if (!workoutText.trim() || isAnalyzing) return;
    setIsAnalyzing(true);
    setStatus("Reading your workout...");
    setSavedSummary(null);
    try {
      const response = await analyzeWorkoutCapture({ text: workoutText, sourceMode: "text" });
      if (!response.enabled || !response.draft) {
        setStatus("Detailed Workout is not enabled in this test build.");
        return;
      }
      setDraft(response.draft);
      setCompletionKey(newCompletionKey());
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Ascend could not read that workout. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  function chooseRecentWorkout(workout: RecentWorkout) {
    const nextDraft = createRepeatWorkoutCaptureDraft(workout.metadata ?? {});
    if (!nextDraft) {
      setStatus("That workout does not contain enough detail to repeat.");
      return;
    }
    setWorkoutText("");
    setDraft(nextDraft);
    setCompletionKey(newCompletionKey());
    setSavedSummary(null);
    setStatus("");
  }

  function updateDraft(patch: Partial<WorkoutCaptureDraft>) {
    setDraft((current) => current ? { ...current, ...patch } : current);
  }

  function updateExercise(index: number, patch: Partial<WorkoutCaptureExercise>) {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        exercises: current.exercises.map((exercise, exerciseIndex) => exerciseIndex === index
          ? { ...exercise, ...patch, needsConfirmation: false, confidence: 1 }
          : exercise)
      };
    });
  }

  function removeExercise(index: number) {
    setDraft((current) => current ? {
      ...current,
      exercises: current.exercises.filter((_, exerciseIndex) => exerciseIndex !== index)
    } : current);
  }

  async function save() {
    if (!draft || !canSave || !completionKey || saveLockRef.current) return;
    saveLockRef.current = true;
    setIsSaving(true);
    setStatus("Saving your workout...");
    try {
      const response = await saveCapturedWorkout({
        workoutCompletionKey: completionKey,
        userConfirmed: true,
        captureVersion: draft.version,
        sourceMode: draft.sourceMode,
        captureConfidence: draft.confidence,
        uncertaintyCount: activeUncertainties.length,
        workoutTitle: draft.title.trim(),
        workoutType: draft.workoutType.trim(),
        workoutDifficulty: draft.difficulty,
        durationMinutes: Number(draft.durationMinutes),
        exercises: draft.exercises
      });
      if (!response.enabled || !response.burnLog || !response.summary) {
        setStatus("Detailed Workout is not enabled in this test build.");
        return;
      }
      onSaved(response.burnLog, response.summary.estimatedCaloriesBurned);
      setSavedSummary(response.summary);
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Your workout was not saved. Please check your connection and try again.");
    } finally {
      saveLockRef.current = false;
      setIsSaving(false);
    }
  }

  if (savedSummary) {
    return (
      <section className="mt-4 rounded-lg border border-lime/40 bg-surface p-5" aria-live="polite">
        <div className="flex items-start gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-lime text-ink">
            <CheckCircle2 size={25} />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-lime">Workout saved</p>
            <h2 className="mt-1 text-xl font-semibold text-white">{savedSummary.workoutTitle}</h2>
            <p className="mt-1 text-sm text-zinc-300">
              {savedSummary.durationMinutes} min / ~{savedSummary.estimatedCaloriesBurned} kcal
            </p>
          </div>
        </div>
        <p className="mt-4 rounded-lg bg-ink p-3 text-sm leading-6 text-zinc-300">{savedSummary.coachMessage}</p>
        {workoutProgressionV3Enabled() && savedSummary.progressionV3 ? (
          <div className="mt-3 rounded-lg border border-purple-400/35 bg-purple-400/10 p-3">
            <div className="flex items-center gap-2 text-purple-200">
              <Sparkles size={17} aria-hidden="true" />
              <p className="text-xs font-bold uppercase tracking-[0.14em]">
                {savedSummary.progressionV3.overallStatus === "personal_best" ? "Personal best" : "Progress intelligence"}
              </p>
            </div>
            <p className="mt-2 text-sm font-semibold leading-6 text-white">{savedSummary.progressionV3.headline}</p>
            {(savedSummary.progressionV3.achievements[0] ?? savedSummary.progressionV3.reviewNotes[0]) ? (
              <p className="mt-1 text-sm leading-6 text-zinc-300">{savedSummary.progressionV3.achievements[0] ?? savedSummary.progressionV3.reviewNotes[0]}</p>
            ) : null}
            {savedSummary.progressionV3.nextSessionFocus ? (
              <div className="mt-3 border-t border-purple-300/15 pt-3">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-400">Next time</p>
                <p className="mt-1 text-sm leading-6 text-zinc-200">{savedSummary.progressionV3.nextSessionFocus}</p>
              </div>
            ) : null}
          </div>
        ) : workoutProgressionEnabled() && savedSummary.progression ? (
          <div className="mt-3 rounded-lg border border-purple-400/35 bg-purple-400/10 p-3">
            <div className="flex items-center gap-2 text-purple-200">
              <Sparkles size={17} aria-hidden="true" />
              <p className="text-xs font-bold uppercase tracking-[0.14em]">
                {savedSummary.progression.overallStatus === "progressed" ? "Progress detected" : "Performance saved"}
              </p>
            </div>
            <p className="mt-2 text-sm font-semibold leading-6 text-white">{savedSummary.progression.headline}</p>
            {savedSummary.progression.highlights[0] ? (
              <p className="mt-1 text-sm leading-6 text-zinc-300">{savedSummary.progression.highlights[0]}</p>
            ) : null}
          </div>
        ) : null}
        <button
          type="button"
          onClick={resetCapture}
          className="mt-4 flex h-12 w-full items-center justify-center rounded-lg border border-line bg-ink font-semibold text-white active:scale-[0.99]"
        >
          Log another workout
        </button>
      </section>
    );
  }

  if (!draft) {
    return (
      <section className="mt-4 space-y-4 rounded-lg border border-line bg-surface p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-lime/15 text-lime">
            <Dumbbell size={22} />
          </span>
          <div>
            <h2 className="font-semibold text-white">Capture the whole session</h2>
            <p className="mt-1 text-sm leading-6 text-zinc-400">Type, paste, or use your keyboard microphone. Short notes are enough.</p>
          </div>
        </div>

        <div>
          <label htmlFor="workout-capture-text" className="text-sm font-medium text-zinc-200">What did you do?</label>
          <textarea
            id="workout-capture-text"
            value={workoutText}
            onChange={(event) => {
              setWorkoutText(event.target.value);
              setStatus("");
            }}
            maxLength={2_000}
            rows={5}
            placeholder={"Bench 60kg 3x10\nLat pulldown 45kg 3x12\n45 minutes total"}
            className="ascend-field mt-2 w-full resize-none rounded-lg border px-3 py-3 text-base leading-6 outline-none focus:border-lime"
          />
          <p className="mt-2 text-xs leading-5 text-zinc-500">Ascend creates a review first. Nothing is saved automatically.</p>
        </div>

        {status ? <p className="rounded-lg border border-line bg-ink p-3 text-sm text-zinc-300" role="status">{status}</p> : null}

        <button
          type="button"
          onClick={analyze}
          disabled={isAnalyzing || workoutText.trim().length < 2}
          className="flex h-12 w-full items-center justify-center rounded-lg bg-lime font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.99]"
        >
          <Sparkles className="mr-2" size={18} />
          {isAnalyzing ? "Reading workout..." : "Create Workout Receipt"}
        </button>

        {!isLoadingRecent && recentWorkouts.length ? (
          <div className="border-t border-line pt-4">
            <p className="text-sm font-semibold text-white">Repeat a recent workout</p>
            <div className="mt-2 space-y-2">
              {recentWorkouts.map((workout) => (
                <button
                  key={workout.id}
                  type="button"
                  onClick={() => chooseRecentWorkout(workout)}
                  className="flex min-h-12 w-full items-center justify-between rounded-lg border border-line bg-ink px-3 py-2 text-left active:scale-[0.99]"
                >
                  <span>
                    <span className="block font-medium text-white">{metadataText(workout.metadata.workoutTitle) ?? "Saved workout"}</span>
                    <span className="mt-0.5 block text-xs text-zinc-500">Use as today&apos;s starting point</span>
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-zinc-400" />
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {workoutProgressionV3Enabled() && progressionHistory.length ? (
          <div className="border-t border-line pt-4">
            <p className="text-sm font-semibold text-white">Recent progression</p>
            <div className="mt-2 space-y-2">
              {progressionHistory.slice(0, 3).map((item) => (
                <div key={item.workoutEventId} className="rounded-lg border border-line bg-ink p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-white">{item.workoutTitle}</p>
                    <span className="text-xs text-zinc-500">{new Date(item.completedAt).toLocaleDateString([], { day: "numeric", month: "short" })}</span>
                  </div>
                  <p className="mt-1 text-sm leading-5 text-zinc-300">{item.intelligence.headline}</p>
                  {item.intelligence.nextSessionFocus ? <p className="mt-1 text-xs leading-5 text-zinc-500">Next: {item.intelligence.nextSessionFocus}</p> : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="mt-4 space-y-4 rounded-lg border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-lime">Workout receipt</p>
          <h2 className="mt-1 text-xl font-semibold text-white">Review before saving</h2>
          <p className="mt-1 text-sm text-zinc-400">Only change what Ascend did not understand.</p>
        </div>
        <button
          type="button"
          onClick={resetCapture}
          disabled={busy}
          aria-label="Start workout capture again"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-line bg-ink text-zinc-300 disabled:opacity-50"
        >
          <RefreshCcw size={18} />
        </button>
      </div>

      {activeUncertainties.length ? (
        <div className="rounded-lg border border-amber-400/35 bg-amber-400/10 p-3">
          <p className="text-sm font-semibold text-amber-200">A few details need a look</p>
          <ul className="mt-2 space-y-1 text-sm leading-5 text-amber-100/80">
            {activeUncertainties.slice(0, 4).map((uncertainty) => <li key={uncertainty}>- {uncertainty}</li>)}
          </ul>
        </div>
      ) : (
        <p className="rounded-lg border border-lime/25 bg-lime/10 p-3 text-sm text-zinc-200">Ascend found the key details. Give them a quick check.</p>
      )}

      <div className="space-y-3">
        <label className="block">
          <span className="text-sm font-medium text-zinc-200">Workout name</span>
          <input className={`${inputClass} mt-2`} value={draft.title} onChange={(event) => updateDraft({ title: event.target.value })} maxLength={120} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium text-zinc-200">Type</span>
            <input className={`${inputClass} mt-2`} value={draft.workoutType} onChange={(event) => updateDraft({ workoutType: event.target.value })} maxLength={80} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-zinc-200">Total minutes</span>
            <input
              className={`${inputClass} mt-2`}
              inputMode="numeric"
              value={draft.durationMinutes ?? ""}
              onChange={(event) => updateDraft({ durationMinutes: optionalInteger(event.target.value) })}
              placeholder="45"
            />
          </label>
        </div>
        <label className="block">
          <span className="text-sm font-medium text-zinc-200">Effort</span>
          <select className={`${selectClass} mt-2`} value={draft.difficulty} onChange={(event) => updateDraft({ difficulty: event.target.value as WorkoutCaptureDifficulty })}>
            <option value="easy">Easy</option>
            <option value="moderate">Moderate</option>
            <option value="challenging">Challenging</option>
          </select>
        </label>
      </div>

      <div className="space-y-3">
        {draft.exercises.map((exercise, index) => (
          <article
            key={`${index}-${exercise.originalText ?? "exercise"}`}
            className={`rounded-lg border p-3 ${exercise.needsConfirmation ? "border-amber-400/40 bg-amber-400/5" : "border-line bg-ink"}`}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-zinc-300">Exercise {index + 1}</p>
              <button
                type="button"
                onClick={() => removeExercise(index)}
                disabled={busy}
                aria-label={`Remove exercise ${index + 1}`}
                className="grid h-11 w-11 place-items-center rounded-lg text-zinc-400 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
              >
                <Trash2 size={18} />
              </button>
            </div>
            <input
              aria-label={`Exercise ${index + 1} name`}
              className={`${inputClass} mt-2`}
              value={exercise.name}
              onChange={(event) => updateExercise(index, { name: event.target.value })}
              placeholder="Exercise name"
              maxLength={120}
            />
            {exercise.needsConfirmation && exercise.originalText ? (
              <p className="mt-2 text-xs leading-5 text-amber-200/80">From your note: &quot;{exercise.originalText}&quot;</p>
            ) : null}
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label>
                <span className="text-xs text-zinc-500">Sets</span>
                <input className={`${inputClass} mt-1`} inputMode="numeric" value={exercise.sets ?? ""} onChange={(event) => updateExercise(index, { sets: optionalInteger(event.target.value) })} placeholder="3" />
              </label>
              <label>
                <span className="text-xs text-zinc-500">Reps</span>
                <input className={`${inputClass} mt-1`} value={exercise.reps ?? ""} onChange={(event) => updateExercise(index, { reps: event.target.value || null })} placeholder="10 or 8-10" maxLength={40} />
              </label>
              <label>
                <span className="text-xs text-zinc-500">Weight</span>
                <input
                  className={`${inputClass} mt-1`}
                  inputMode="decimal"
                  value={exercise.load ?? ""}
                  onChange={(event) => {
                    const load = optionalNumber(event.target.value);
                    updateExercise(index, { load, loadUnit: load !== null ? exercise.loadUnit ?? "kg" : exercise.loadUnit });
                  }}
                  placeholder="Optional"
                />
              </label>
              <label>
                <span className="text-xs text-zinc-500">Unit</span>
                <select className={`${selectClass} mt-1`} value={exercise.loadUnit ?? "kg"} onChange={(event) => updateExercise(index, { loadUnit: event.target.value as "kg" | "lb" })}>
                  <option value="kg">kg</option>
                  <option value="lb">lb</option>
                </select>
              </label>
              <label>
                <span className="text-xs text-zinc-500">Minutes</span>
                <input className={`${inputClass} mt-1`} inputMode="numeric" value={exercise.durationMinutes ?? ""} onChange={(event) => updateExercise(index, { durationMinutes: optionalInteger(event.target.value) })} placeholder="Optional" />
              </label>
              <label>
                <span className="text-xs text-zinc-500">Rest seconds</span>
                <input className={`${inputClass} mt-1`} inputMode="numeric" value={exercise.restSeconds ?? ""} onChange={(event) => updateExercise(index, { restSeconds: optionalInteger(event.target.value) })} placeholder="Optional" />
              </label>
            </div>
            <label className="mt-3 block">
              <span className="text-xs text-zinc-500">Note</span>
              <input
                className={`${inputClass} mt-1`}
                value={exercise.note ?? ""}
                onChange={(event) => updateExercise(index, { note: event.target.value || null })}
                placeholder="Optional"
                maxLength={160}
              />
            </label>
          </article>
        ))}
      </div>

      <button
        type="button"
        onClick={() => updateDraft({ exercises: [...draft.exercises, blankExercise()] })}
        disabled={busy || draft.exercises.length >= 30}
        className="flex h-11 w-full items-center justify-center rounded-lg border border-line bg-ink font-semibold text-zinc-200 disabled:opacity-50"
      >
        <Plus className="mr-2" size={17} />
        Add exercise
      </button>

      {!canSave ? <p className="text-sm text-amber-200">Add the workout name, total time, and at least one exercise to save.</p> : null}
      {status ? <p className="rounded-lg border border-line bg-ink p-3 text-sm text-zinc-300" role="status">{status}</p> : null}

      <button
        type="button"
        onClick={save}
        disabled={!canSave || busy}
        className="flex h-12 w-full items-center justify-center rounded-lg bg-lime font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.99]"
      >
        <CheckCircle2 className="mr-2" size={19} />
        {isSaving ? "Saving workout..." : "Confirm & Save Workout"}
      </button>
    </section>
  );
}

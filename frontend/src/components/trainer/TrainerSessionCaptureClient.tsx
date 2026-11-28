"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatTrainerSessionPackageProgress, TRAINER_SESSION_FOCUSES, TRAINER_SESSION_RESPONSES, type TrainerCoachingSession, type TrainerSessionNarratives, type TrainerSessionWorksheet, type WorkoutCaptureDraft, type WorkoutCaptureExercise } from "@ascend/shared";
import { Bookmark, CalendarPlus, Check, ChevronDown, ChevronUp, RotateCcw, Save, Sparkles, Trash2 } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { ptBookingEnabled } from "@/lib/ptBookingFlag";
import {
  cancelTrainerCoachingSession,
  completeTrainerCoachingSession,
  getTrainerSessionOverview,
  interpretTrainerCoachingSession,
  startTrainerCoachingSession,
  updateTrainerCoachingSession
} from "@/lib/ascendApi";

type Phase = "loading" | "unavailable" | "start" | "capture" | "review" | "success";

const inputClass = "h-12 w-full rounded-xl border border-line bg-ink px-3 text-base text-white outline-none focus:border-lime";
const noteClass = "mt-2 w-full rounded-xl border border-line bg-ink p-3 text-base text-white outline-none focus:border-lime";
const emptyNarratives: TrainerSessionNarratives = { clientRecap: "", betweenSessionFocus: "", trainerNextSessionNote: "" };

function blankExercise(): WorkoutCaptureExercise {
  return {
    name: "", sets: null, reps: null, load: null, loadUnit: null, note: null,
    durationMinutes: null, restSeconds: null, movementPattern: "other",
    originalText: null, confidence: 1, needsConfirmation: false
  };
}

function elapsedMinutes(startedAt: string) {
  return Math.max(5, Math.round((Date.now() - new Date(startedAt).getTime()) / 60_000));
}

function exerciseSummary(exercise: WorkoutCaptureExercise) {
  return [exercise.sets ? `${exercise.sets} sets` : null, exercise.reps ? `${exercise.reps} reps` : null, exercise.load !== null ? `${exercise.load}${exercise.loadUnit ?? ""}` : null, exercise.durationMinutes ? `${exercise.durationMinutes} min` : null]
    .filter(Boolean)
    .join(" / ") || "Details not captured";
}

function localDraftKey(clientId: string, sessionId: string) {
  return `ascend:trainer-session-draft:${clientId}:${sessionId}`;
}

function readLocalDraft(clientId: string, sessionId: string, version: number) {
  try {
    const raw = window.localStorage.getItem(localDraftKey(clientId, sessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { version?: number; rawInput?: unknown; durationMinutes?: unknown };
    if ((parsed.version ?? 1) !== version) return null;
    return {
      rawInput: typeof parsed.rawInput === "string" ? parsed.rawInput : "",
      durationMinutes: Number.isFinite(Number(parsed.durationMinutes)) ? Math.max(5, Number(parsed.durationMinutes)) : null
    };
  } catch {
    return null;
  }
}

export function TrainerSessionCaptureClient({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [resumedDraft, setResumedDraft] = useState(false);
  const [session, setSession] = useState<TrainerCoachingSession | null>(null);
  const [previousWorkout, setPreviousWorkout] = useState<WorkoutCaptureDraft | null>(null);
  const [lastSession, setLastSession] = useState<TrainerCoachingSession | null>(null);
  const [rawInput, setRawInput] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [draft, setDraft] = useState<WorkoutCaptureDraft | null>(null);
  const [narratives, setNarratives] = useState(emptyNarratives);
  const [worksheet, setWorksheet] = useState<TrainerSessionWorksheet>({});
  const [shareClientRecap, setShareClientRecap] = useState(false);
  const [shorthandOpen, setShorthandOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [expandedExercise, setExpandedExercise] = useState<number | null>(null);
  const completeLock = useRef(false);

  const resumeSession = useCallback((active: TrainerCoachingSession) => {
    const local = readLocalDraft(clientId, active.id, active.version);
    const input = local?.rawInput ?? active.rawInput;
    const pendingShorthand = input.trim() && input.trim() !== (active.workoutDraft?.originalInput ?? "").trim();
    setSession(active);
    setRawInput(input);
    setDurationMinutes(local?.durationMinutes ?? active.durationMinutes ?? (input ? elapsedMinutes(active.startedAt) : 45));
    setDraft(active.workoutDraft);
    setNarratives(active.narratives ?? emptyNarratives);
    setWorksheet(active.worksheet ?? {});
    setShareClientRecap(active.shareClientRecap ?? false);
    setShorthandOpen(Boolean(pendingShorthand));
    setPhase(active.workoutDraft && !pendingShorthand ? "review" : "capture");
  }, [clientId]);

  useEffect(() => {
    let mounted = true;
    getTrainerSessionOverview(clientId)
      .then((overview) => {
        if (!mounted) return;
        setPreviousWorkout(overview.previousWorkout);
        setLastSession(overview.recentSessions[0] ?? null);
        if (!overview.enabled) {
          setStatus("Session capture is not available in this build.");
          setPhase("unavailable");
          return;
        }
        if (overview.activeSession) {
          setResumedDraft(true);
          resumeSession(overview.activeSession);
        } else setPhase("start");
      })
      .catch((error) => {
        if (!mounted) return;
        setStatus(error instanceof Error ? error.message : "Could not load session capture.");
        setPhase("unavailable");
      });
    return () => { mounted = false; };
  }, [clientId, resumeSession]);

  useEffect(() => {
    if (!session || phase !== "capture") return;
    try {
      window.localStorage.setItem(localDraftKey(clientId, session.id), JSON.stringify({ version: session.version, rawInput, durationMinutes }));
    } catch {
      // Save draft & exit also works when device storage is unavailable.
    }
  }, [clientId, durationMinutes, phase, rawInput, session]);

  const title = session?.clientName || lastSession?.clientName || "PT Session";
  const priorNote = lastSession?.narratives?.trainerNextSessionNote;
  const priorPriority = previousWorkout?.exercises.find((exercise) => exercise.name.toLowerCase() === lastSession?.worksheet?.priority?.toLowerCase()) ?? previousWorkout?.exercises[0];
  const priorPackageProgress = formatTrainerSessionPackageProgress(lastSession?.worksheet);
  const lastPackageTotal = lastSession?.worksheet?.sessionsPurchased;
  const packageProgress = formatTrainerSessionPackageProgress(worksheet);
  const { sessionNumber, sessionsPurchased } = worksheet;
  const validPackageNumbers = [sessionNumber, sessionsPurchased].every((value) => value === undefined || Number.isSafeInteger(value) && value > 0);
  const sessionWithinPackage = sessionNumber === undefined || sessionsPurchased === undefined || sessionNumber <= sessionsPurchased;
  const packageError = !validPackageNumbers ? "Enter whole numbers greater than zero." : !sessionWithinPackage ? "The session number must be within the package." : "";
  const recapReady = !shareClientRecap || Boolean(narratives.clientRecap.trim() || narratives.betweenSessionFocus.trim() || packageProgress);
  const canSave = !packageError && recapReady && Boolean(draft?.title.trim() && draft.workoutType.trim() && draft.exercises.length && draft.exercises.every((exercise) => exercise.name.trim() && !exercise.needsConfirmation));

  async function start(mode: "repeat_last" | "blank") {
    setBusy(true);
    setStatus(mode === "repeat_last" ? "Preparing the last session..." : "Starting session...");
    try {
      const response = await startTrainerCoachingSession(clientId, mode);
      resumeSession(response.session);
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not start the session.");
    } finally { setBusy(false); }
  }

  function saveDraftSnapshot(active: TrainerCoachingSession) {
    return updateTrainerCoachingSession(clientId, active.id, {
      version: active.version, rawInput: phase === "review" && draft ? draft.originalInput : rawInput,
      durationMinutes: phase === "review" ? draft?.durationMinutes ?? null : durationMinutes,
      workoutDraft: draft, narratives, worksheet, shareClientRecap
    });
  }

  async function saveDraftAndExit() {
    if (!session || busy || !validPackageNumbers) return;
    setBusy(true);
    setStatus("Saving your draft…");
    try {
      const saved = await saveDraftSnapshot(session);
      clearLocalDraft(session.id);
      setSession(saved.session);
      router.push(`/trainer/clients/${clientId}?ptDraft=saved`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save your draft. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function finishAndReview() {
    if (!session || rawInput.trim().length < 2 || !validPackageNumbers) return;
    setBusy(true);
    setStatus("Turning your notes into a clean session...");
    try {
      const saved = await saveDraftSnapshot(session);
      setSession(saved.session);
      const result = await interpretTrainerCoachingSession(clientId, session.id, { version: saved.session.version, rawInput, durationMinutes, sourceMode: "dictation" });
      setSession({ ...saved.session, version: result.version });
      setDraft(result.draft);
      setNarratives(result.narratives);
      setPhase("review");
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Ascend could not read these notes. Your draft is still saved.");
    } finally { setBusy(false); }
  }

  function enterExercises() {
    setDraft((current) => current ?? {
      version: "workout_capture_v1", sourceMode: "text", originalInput: "",
      title: "PT Session", workoutType: "Training", difficulty: "moderate", durationMinutes,
      exercises: [blankExercise()], confidence: 1, uncertainties: [], requiresReview: true
    });
    setExpandedExercise(0);
    setPhase("review");
    setStatus("");
  }

  function updateExercise(index: number, changes: Partial<WorkoutCaptureExercise>) {
    if (!draft) return;
    const resolvedFields = Object.keys(changes);
    setDraft({
      ...draft,
      exercises: draft.exercises.map((exercise, current) => {
        if (current !== index) return exercise;
        const uncertainFields = (exercise.uncertainFields ?? []).filter((field) => !resolvedFields.includes(field));
        const fieldConfidence = { ...exercise.fieldConfidence };
        resolvedFields.forEach((field) => {
          if (field in fieldConfidence || (exercise.uncertainFields ?? []).includes(field)) {
            fieldConfidence[field as keyof typeof fieldConfidence] = 1;
          }
        });
        const editsPerformance = resolvedFields.some((field) => ["sets", "reps", "load", "loadUnit"].includes(field));
        const changedExercise = {
          ...exercise, ...changes, uncertainFields, fieldConfidence,
          needsConfirmation: changes.needsConfirmation ?? (resolvedFields.includes("name") || editsPerformance || "durationMinutes" in changes ? uncertainFields.length > 0 : exercise.needsConfirmation)
        };
        if (editsPerformance) {
          changedExercise.setDetails = undefined;
          changedExercise.loadSteps = undefined;
          if ("sets" in changes) changedExercise.completedSets = undefined;
          if ("reps" in changes) {
            changedExercise.repRangeMin = undefined;
            changedExercise.repRangeMax = undefined;
            changedExercise.approximateReps = undefined;
          }
          if ("load" in changes || "loadUnit" in changes) {
            changedExercise.topLoad = undefined;
            changedExercise.workingLoad = undefined;
            changedExercise.startingLoad = undefined;
            changedExercise.backoffLoad = undefined;
            changedExercise.loadText = undefined;
          }
        }
        return changedExercise;
      })
    });
  }

  async function complete() {
    if (!session || !draft || !canSave || completeLock.current) return;
    completeLock.current = true;
    setBusy(true);
    setStatus("Saving the session…");
    try {
      const response = await completeTrainerCoachingSession(clientId, session.id, { userConfirmed: true, version: session.version, draft, narratives, worksheet, shareClientRecap });
      clearLocalDraft(session.id);
      setSession(response.session);
      setPhase("success");
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save the session. Please try again.");
      completeLock.current = false;
    } finally { setBusy(false); }
  }

  function clearLocalDraft(sessionId: string) {
    try {
      window.localStorage.removeItem(localDraftKey(clientId, sessionId));
    } catch {
      // Session state is already saved on the server.
    }
  }

  async function discard() {
    if (!session || busy || !window.confirm("Discard this session draft?")) return;
    setBusy(true);
    try {
      const result = await cancelTrainerCoachingSession(clientId, session.id, session.version);
      if (!result.cancelled) throw new Error("This session changed elsewhere. Reopen it to continue.");
      clearLocalDraft(session.id);
      setSession(null); setDraft(null); setRawInput(""); setNarratives(emptyNarratives);
      setWorksheet({}); setShareClientRecap(false); setExpandedExercise(null); setShorthandOpen(false); setResumedDraft(false);
      setPhase("start"); setStatus("Draft discarded.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Could not discard the draft."); }
    finally { setBusy(false); }
  }

  return (
    <main className="ascend-page px-4 py-3 text-white sm:py-5">
      <div className="ascend-workspace-frame space-y-4">
        <header className="flex items-center gap-3 py-3">
          <BackButton fallbackHref={`/trainer/clients/${clientId}`} disabled={busy} />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-zinc-400">PT session{session ? ` · ${new Date(session.startedAt).toLocaleDateString()}` : ""}</p>
            <h1 className="truncate text-2xl font-semibold">{title}</h1>
          </div>
          {resumedDraft && (phase === "capture" || phase === "review") ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-lime/25 bg-lime/10 px-2.5 py-1.5 text-xs font-semibold text-lime">
              <Bookmark size={13} aria-hidden="true" /> Draft resumed
            </span>
          ) : null}
        </header>

        {status ? <p role="status" className="rounded-xl border border-line bg-surface p-3 text-sm text-zinc-300">{status}</p> : null}
        {phase === "loading" ? <div className="h-40 animate-pulse rounded-2xl bg-surface" /> : null}

        {["start", "capture", "review"].includes(phase) && (priorNote || priorPackageProgress || lastSession?.worksheet?.response || previousWorkout) ? (
          <section className="ascend-workspace-section p-4 sm:p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 className="text-lg font-semibold">From the last session</h2>
              {lastSession?.completedAt ? <p className="text-sm text-zinc-400">{new Date(lastSession.completedAt).toLocaleDateString(undefined, { dateStyle: "medium" })}</p> : null}
            </div>
            {priorPackageProgress ? <p className="mt-1 text-sm text-calm">{priorPackageProgress}</p> : null}
            {priorNote ? <p className="mt-2 whitespace-pre-wrap text-zinc-100">{priorNote}</p> : null}
            {priorPriority ? <p className="mt-2 text-sm text-zinc-300">{priorPriority.name} · {exerciseSummary(priorPriority)}</p> : null}
            {lastSession?.worksheet?.response ? <p className="mt-1 text-sm text-zinc-400">Client response · {lastSession.worksheet.response}</p> : null}
            {previousWorkout?.exercises.length ? (
              <details className="mt-3 text-sm text-zinc-300">
                <summary className="cursor-pointer text-calm">Previous exercises</summary>
                <ul className="mt-2 space-y-2">
                  {previousWorkout.exercises.map((exercise, index) => (
                    <li key={index}>{exercise.name} · {exerciseSummary(exercise)}{exercise.note ? <span className="block text-zinc-400">{exercise.note}</span> : null}</li>
                  ))}
                </ul>
              </details>
            ) : null}
          </section>
        ) : null}

        {phase === "start" ? (
          <section className="ascend-workspace-section grid gap-3 p-4 sm:grid-cols-2">
            {previousWorkout ? <button disabled={busy} onClick={() => start("repeat_last")} className="min-h-12 rounded-xl bg-lime px-4 font-bold text-ink disabled:opacity-40"><RotateCcw className="mr-2 inline" size={18} />Repeat last session</button> : null}
            <button disabled={busy} onClick={() => start("blank")} className="min-h-12 rounded-xl border border-line bg-ink px-4 font-semibold text-white disabled:opacity-40">Start fresh</button>
          </section>
        ) : null}

        {phase === "capture" && session ? (
          <section className="ascend-workspace-section p-4 sm:p-5">
            <h2 className="text-xl font-semibold">Record exercises</h2>
            <button type="button" disabled={busy} onClick={enterExercises} className="mt-3 min-h-12 rounded-xl bg-lime px-4 font-semibold text-ink disabled:opacity-40">
              {draft ? "Edit exercise list" : "Enter exercises"}
            </button>
            <details className="mt-4 rounded-xl border border-line p-3" open={shorthandOpen} onToggle={(event) => setShorthandOpen(event.currentTarget.open)}>
              <summary className="cursor-pointer font-semibold">Use shorthand or dictation</summary>
              <label className="mt-3 block text-sm">
                Workout shorthand
                <textarea value={rawInput} maxLength={5000} onChange={(event) => setRawInput(event.target.value)} rows={4} placeholder={"Bench 60kg 10,10,8\nBike 8 min"} className={noteClass} />
              </label>
              <label className="mt-2 block text-sm">
                Duration in minutes
                <input type="number" min={5} max={300} value={durationMinutes} onChange={(event) => setDurationMinutes(Math.max(5, Math.min(300, Number(event.target.value) || 5)))} className={`${inputClass} mt-2 block max-w-28`} />
              </label>
              <button disabled={busy || !validPackageNumbers || rawInput.trim().length < 2} onClick={finishAndReview} className="mt-3 min-h-12 rounded-xl border border-line px-4 font-semibold disabled:opacity-40">
                <Sparkles className="mr-2 inline" size={17} />Review shorthand
              </button>
            </details>
            <div className="mt-3 flex flex-wrap gap-x-5">
              <button type="button" disabled={busy || !validPackageNumbers} onClick={saveDraftAndExit} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-calm disabled:opacity-40"><Bookmark size={16} aria-hidden="true" /> Save draft & exit</button>
              <button type="button" disabled={busy} onClick={discard} className="min-h-11 text-sm text-zinc-400"><Trash2 className="mr-2 inline" size={16} />Discard draft</button>
            </div>
          </section>
        ) : null}

        {phase === "review" && draft ? (
          <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <section className="ascend-workspace-section p-4 sm:p-5">
              <h2 className="text-xl font-semibold">Today’s session</h2>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="text-sm">Session number
                  <input type="number" min={1} step={1} inputMode="numeric" className={`${inputClass} mt-2`} value={sessionNumber ?? ""}
                    aria-invalid={Boolean(packageError)} aria-describedby={packageError ? "pt-package-error" : undefined}
                    onChange={(e) => setWorksheet({ ...worksheet, sessionNumber: e.target.value === "" ? undefined : e.target.valueAsNumber })} />
                </label>
                <label className="text-sm">Sessions purchased
                  <input type="number" min={1} step={1} inputMode="numeric" className={`${inputClass} mt-2`} value={sessionsPurchased ?? ""}
                    aria-invalid={Boolean(packageError)} aria-describedby={packageError ? "pt-package-error" : undefined}
                    onChange={(e) => setWorksheet({ ...worksheet, sessionsPurchased: e.target.value === "" ? undefined : e.target.valueAsNumber })} />
                </label>
              </div>
              {lastPackageTotal !== undefined && sessionsPurchased === undefined ? (
                <button type="button" disabled={busy} onClick={() => setWorksheet((current) => ({ ...current, sessionsPurchased: lastPackageTotal }))} className="mt-1 min-h-11 text-sm font-semibold text-calm">Use last package total of {lastPackageTotal}</button>
              ) : null}
              {packageError ? <p id="pt-package-error" className="mt-2 text-sm text-amber">{packageError}</p> : null}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-sm">Focus
                  <select className={`${inputClass} mt-2`} value={worksheet.focus ?? ""} onChange={(e) => setWorksheet({ ...worksheet, focus: (e.target.value || undefined) as TrainerSessionWorksheet["focus"] })}>
                    <option value="">Choose focus</option>
                    {TRAINER_SESSION_FOCUSES.map((focus) => <option key={focus}>{focus}</option>)}
                  </select>
                </label>
                <label className="text-sm">Main movement or priority
                  <input className={`${inputClass} mt-2`} maxLength={160} value={worksheet.priority ?? ""} onChange={(e) => setWorksheet({ ...worksheet, priority: e.target.value })} />
                </label>
              </div>
              <div className="mt-4 space-y-2">
                {draft.exercises.map((exercise, index) => {
                  const earlier = previousWorkout?.exercises.filter((previous) => previous.name.trim().toLowerCase() === exercise.name.trim().toLowerCase());
                  return (
                    <article key={index} className={`rounded-xl border p-3 ${exercise.needsConfirmation ? "border-amber/50 bg-amber/5" : "border-line bg-ink"}`}>
                      <button type="button" aria-expanded={expandedExercise === index} onClick={() => setExpandedExercise(expandedExercise === index ? null : index)} className="flex min-h-11 w-full items-center justify-between gap-3 text-left">
                        <div>
                          <p className="font-semibold">{exercise.name || "New exercise"}</p>
                          <p className="text-sm text-zinc-400">{exerciseSummary(exercise)}</p>
                        </div>
                        {expandedExercise === index ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>
                      {expandedExercise === index ? (
                        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {earlier?.length === 1 ? <p className="col-span-full text-sm text-zinc-400">Last session · {exerciseSummary(earlier[0])}</p> : null}
                          <label className="col-span-2 text-sm sm:col-span-4">Exercise name
                            <input value={exercise.name} maxLength={120} onChange={(e) => updateExercise(index, { name: e.target.value })} className={`${inputClass} mt-1`} />
                          </label>
                          <label className="text-sm">Sets
                            <input type="number" min={1} max={100} value={exercise.sets ?? ""} onChange={(e) => updateExercise(index, { sets: e.target.value ? Number(e.target.value) : null })} className={`${inputClass} mt-1`} />
                          </label>
                          <label className="text-sm">Reps
                            <input value={exercise.reps ?? ""} maxLength={80} onChange={(e) => updateExercise(index, { reps: e.target.value || null })} className={`${inputClass} mt-1`} />
                          </label>
                          <label className="text-sm">Load
                            <input type="number" min={0} max={2000} step="any" value={exercise.load ?? ""} onChange={(e) => updateExercise(index, { load: e.target.value ? Number(e.target.value) : null, loadUnit: e.target.value ? exercise.loadUnit ?? "kg" : null })} className={`${inputClass} mt-1`} />
                          </label>
                          <label className="text-sm">Unit
                            <select value={exercise.loadUnit ?? "kg"} onChange={(e) => updateExercise(index, { loadUnit: e.target.value as "kg" | "lb" })} className={`${inputClass} mt-1`}><option value="kg">kg</option><option value="lb">lb</option></select>
                          </label>
                          <label className="text-sm">Minutes
                            <input type="number" min={1} max={300} value={exercise.durationMinutes ?? ""} onChange={(e) => updateExercise(index, { durationMinutes: e.target.value ? Number(e.target.value) : null, durationValue: undefined, durationUnit: undefined })} className={`${inputClass} mt-1`} />
                          </label>
                          <label className="col-span-2 text-sm sm:col-span-3">Coaching cue
                            <input maxLength={500} value={exercise.note ?? ""} onChange={(e) => updateExercise(index, { note: e.target.value || null })} className={`${inputClass} mt-1`} />
                          </label>
                          {exercise.needsConfirmation ? <button type="button" onClick={() => updateExercise(index, { needsConfirmation: false, uncertainFields: [] })} className="col-span-2 min-h-11 rounded-xl border border-amber/40 text-sm text-amber">Confirm exercise details</button> : null}
                          <button type="button" onClick={() => { setDraft({ ...draft, exercises: draft.exercises.filter((_, item) => item !== index) }); setExpandedExercise(null); }} className="col-span-2 min-h-11 text-left text-sm text-zinc-400">Remove exercise</button>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
              <button type="button" disabled={busy || draft.exercises.length >= 30} onClick={() => { setExpandedExercise(draft.exercises.length); setDraft({ ...draft, exercises: [...draft.exercises, blankExercise()] }); }} className="mt-3 min-h-11 rounded-xl border border-line px-4 text-sm font-semibold disabled:opacity-40">Add exercise</button>
              <details className="mt-3 rounded-xl border border-line p-3 text-sm">
                <summary className="cursor-pointer font-semibold">Session details</summary>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <label>Workout title<input value={draft.title} maxLength={120} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className={`${inputClass} mt-1`} /></label>
                  <label>Workout type<input value={draft.workoutType} maxLength={80} onChange={(e) => setDraft({ ...draft, workoutType: e.target.value })} className={`${inputClass} mt-1`} /></label>
                  <label>Difficulty<select value={draft.difficulty} onChange={(e) => setDraft({ ...draft, difficulty: e.target.value as WorkoutCaptureDraft["difficulty"] })} className={`${inputClass} mt-1`}><option value="easy">Easy</option><option value="moderate">Moderate</option><option value="challenging">Challenging</option></select></label>
                  <label>Duration in minutes<input type="number" min={5} max={300} value={draft.durationMinutes ?? ""} onChange={(e) => setDraft({ ...draft, durationMinutes: e.target.value ? Number(e.target.value) : null })} className={`${inputClass} mt-1`} /></label>
                </div>
              </details>
              <button type="button" disabled={busy} onClick={() => setPhase("capture")} className="mt-2 min-h-11 text-sm text-calm">Shorthand or draft options</button>
            </section>

            <section className="ascend-workspace-section space-y-3 p-4 sm:p-5">
              <h2 className="text-xl font-semibold">Finish session</h2>
              <label className="block text-sm">How did the client feel?
                <select className={`${inputClass} mt-2`} value={worksheet.response ?? ""} onChange={(e) => setWorksheet({ ...worksheet, response: (e.target.value || undefined) as TrainerSessionWorksheet["response"] })}>
                  <option value="">Choose response</option>
                  {TRAINER_SESSION_RESPONSES.map((response) => <option key={response}>{response}</option>)}
                </select>
              </label>
              <label className="block text-sm">Win today
                <input className={`${inputClass} mt-2`} maxLength={400} value={worksheet.win ?? ""} onChange={(e) => setWorksheet({ ...worksheet, win: e.target.value })} />
              </label>
              <label className="block text-sm">Plan for next session
                <textarea rows={2} maxLength={600} value={narratives.trainerNextSessionNote} onChange={(e) => setNarratives({ ...narratives, trainerNextSessionNote: e.target.value })} className={noteClass} />
              </label>
              <p className="text-xs text-zinc-400">Coaching notes are visible to the assigned trainer and authorized gym managers.</p>
              <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={shareClientRecap} onChange={(e) => setShareClientRecap(e.target.checked)} className="h-4 w-4 accent-lime" />
                Share a recap with the client
              </label>
              <p className="text-xs text-zinc-400">The client can see their completed exercises. The recap and between-session focus are shared when you choose to send them.</p>
              {shareClientRecap ? (
                <div className="space-y-3 rounded-xl border border-line p-3">
                  {packageProgress && !packageError ? <p className="text-sm text-calm">Package progress shared with client · {packageProgress}</p> : null}
                  <label className="block text-sm">Client recap
                    <textarea rows={2} maxLength={600} value={narratives.clientRecap} onChange={(e) => setNarratives({ ...narratives, clientRecap: e.target.value })} className={noteClass} />
                  </label>
                  <label className="block text-sm">Between-session focus
                    <textarea rows={2} maxLength={400} value={narratives.betweenSessionFocus} onChange={(e) => setNarratives({ ...narratives, betweenSessionFocus: e.target.value })} className={noteClass} />
                  </label>
                </div>
              ) : null}
              {draft.exercises.some((exercise) => exercise.needsConfirmation) ? <p className="text-sm text-amber">Confirm the highlighted exercises before saving.</p> : null}
              {!recapReady ? <p className="text-sm text-zinc-400">Add a recap, between-session focus, or package progress to share.</p> : null}
              <button disabled={busy || !canSave} onClick={complete} className="min-h-12 w-full rounded-xl bg-lime px-4 font-bold text-ink disabled:opacity-40">
                <Save className="mr-2 inline" size={17} />{shareClientRecap ? "Save & share recap" : "Save session"}
              </button>
              <button type="button" disabled={busy || !validPackageNumbers} onClick={saveDraftAndExit} className={`ascend-pressable flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold disabled:opacity-40 ${canSave ? "border-line bg-ink text-white" : "border-lime bg-lime text-ink"}`}><Bookmark size={17} aria-hidden="true" /> Save draft & exit</button>
            </section>
          </div>
        ) : null}

        {phase === "success" ? (
          <section className="rounded-2xl border border-lime/40 bg-lime/10 p-6 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-lime text-ink"><Check size={26} /></span>
            <h2 className="mt-3 text-xl font-semibold">Session saved</h2>
            <p className="mt-2 text-zinc-300">{session?.shareClientRecap ? "The recap is available to the client." : "The next-session plan is ready for the coach."}</p>
            {ptBookingEnabled && <Link href={`/trainer/schedule?clientId=${clientId}`} prefetch={false} className="mx-auto mt-4 flex min-h-12 max-w-md items-center justify-center gap-2 rounded-xl bg-lime font-bold text-ink">
              <CalendarPlus size={19} aria-hidden="true" /> Book next session
            </Link>}
            <Link href={`/trainer/clients/${clientId}`} className={`mx-auto mt-3 flex min-h-12 max-w-md items-center justify-center rounded-xl font-bold ${ptBookingEnabled ? "border border-lime/30 text-lime" : "bg-lime text-ink"}`}>Return to client</Link>
          </section>
        ) : null}
      </div>
    </main>
  );
}

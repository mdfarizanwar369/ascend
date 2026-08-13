"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TrainerCoachingSession, TrainerSessionIntelligence, TrainerSessionNarratives, WorkoutCaptureDraft, WorkoutCaptureExercise } from "@ascend/shared";
import { Check, ChevronDown, ChevronUp, Clock3, Dumbbell, RotateCcw, Save, Sparkles, Trash2 } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import {
  cancelTrainerCoachingSession,
  completeTrainerCoachingSession,
  getTrainerSessionOverview,
  interpretTrainerCoachingSession,
  startTrainerCoachingSession,
  updateTrainerCoachingSession
} from "@/lib/ascendApi";

type Phase = "loading" | "start" | "capture" | "review" | "success";

const inputClass = "h-12 w-full rounded-xl border border-line bg-ink px-3 text-base text-white outline-none focus:border-lime";

function elapsedMinutes(startedAt: string) {
  return Math.max(5, Math.round((Date.now() - new Date(startedAt).getTime()) / 60_000));
}

function exerciseSummary(exercise: WorkoutCaptureExercise) {
  return [exercise.sets ? `${exercise.sets} sets` : null, exercise.reps ? `${exercise.reps} reps` : null, exercise.load !== null ? `${exercise.load}${exercise.loadUnit ?? ""}` : null]
    .filter(Boolean)
    .join(" / ") || "Details not captured";
}

export function TrainerSessionCaptureClient({ clientId }: { clientId: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [session, setSession] = useState<TrainerCoachingSession | null>(null);
  const [previousWorkout, setPreviousWorkout] = useState<WorkoutCaptureDraft | null>(null);
  const [rawInput, setRawInput] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [draft, setDraft] = useState<WorkoutCaptureDraft | null>(null);
  const [narratives, setNarratives] = useState<TrainerSessionNarratives | null>(null);
  const [intelligence, setIntelligence] = useState<TrainerSessionIntelligence | null>(null);
  const [estimatedCalories, setEstimatedCalories] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [expandedExercise, setExpandedExercise] = useState<number | null>(null);
  const [completion, setCompletion] = useState<{ calories: number; momentum: number } | null>(null);
  const completeLock = useRef(false);

  useEffect(() => {
    let mounted = true;
    getTrainerSessionOverview(clientId)
      .then((overview) => {
        if (!mounted) return;
        setPreviousWorkout(overview.previousWorkout);
        if (!overview.enabled) {
          setStatus("Session capture is not available in this build.");
          setPhase("start");
          return;
        }
        if (overview.activeSession) {
          setSession(overview.activeSession);
          setRawInput(overview.activeSession.rawInput);
          setDurationMinutes(overview.activeSession.durationMinutes ?? elapsedMinutes(overview.activeSession.startedAt));
          setDraft(overview.activeSession.workoutDraft);
          setNarratives(overview.activeSession.narratives);
          setIntelligence(overview.activeSession.intelligence);
          setPhase(overview.activeSession.rawInput.trim() && overview.activeSession.workoutDraft?.sourceMode !== "repeat" && overview.activeSession.narratives ? "review" : "capture");
        } else {
          setPhase("start");
        }
      })
      .catch((error) => {
        if (!mounted) return;
        setStatus(error instanceof Error ? error.message : "Could not load session capture.");
        setPhase("start");
      });
    return () => { mounted = false; };
  }, [clientId]);

  const canInterpret = rawInput.trim().length >= 2 || Boolean(session?.workoutDraft?.exercises.length);
  const title = session?.clientName ? `Session with ${session.clientName}` : "Record PT Session";
  const previousSummary = useMemo(() => previousWorkout ? `${previousWorkout.title} / ${previousWorkout.exercises.length} exercises` : "No earlier detailed session", [previousWorkout]);

  async function start(mode: "repeat_last" | "blank") {
    setBusy(true);
    setStatus(mode === "repeat_last" ? "Preparing the last session..." : "Starting session...");
    try {
      const response = await startTrainerCoachingSession(clientId, mode);
      setSession(response.session);
      setRawInput(response.session.rawInput);
      setDraft(response.session.workoutDraft);
      setDurationMinutes(response.session.durationMinutes ?? 45);
      setPhase("capture");
      setStatus("Session started. Type shorthand or use your keyboard microphone.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not start the session.");
    } finally { setBusy(false); }
  }

  async function finishAndReview() {
    if (!session || !canInterpret) return;
    setBusy(true);
    setStatus("Turning your notes into a clean session...");
    try {
      let currentSession = session;
      if (rawInput.trim()) {
        const saved = await updateTrainerCoachingSession(clientId, session.id, { version: session.version, rawInput, durationMinutes });
        currentSession = saved.session;
        setSession(saved.session);
      }
      if (!rawInput.trim() && currentSession.workoutDraft) {
        setDraft({ ...currentSession.workoutDraft, durationMinutes });
        setNarratives(currentSession.narratives);
        setIntelligence(currentSession.intelligence);
        setPhase("review");
      } else {
        const result = await interpretTrainerCoachingSession(clientId, session.id, { rawInput, durationMinutes, sourceMode: "dictation" });
        setDraft(result.draft);
        setNarratives(result.narratives);
        setIntelligence(result.intelligence);
        setEstimatedCalories(result.estimatedCaloriesBurned);
        setPhase("review");
      }
      setStatus("Review only what needs changing, then share it with the client.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Ascend could not read these notes. Your draft is still saved.");
    } finally { setBusy(false); }
  }

  function updateExercise(index: number, changes: Partial<WorkoutCaptureExercise>) {
    if (!draft) return;
    setDraft({ ...draft, exercises: draft.exercises.map((exercise, current) => current === index ? { ...exercise, ...changes } : exercise) });
  }

  async function complete() {
    if (!session || !draft || !narratives || completeLock.current) return;
    completeLock.current = true;
    setBusy(true);
    setStatus("Saving and sharing the session...");
    try {
      const response = await completeTrainerCoachingSession(clientId, session.id, { userConfirmed: true, draft, narratives });
      setCompletion({ calories: response.completion.summary.estimatedCaloriesBurned, momentum: response.completion.summary.momentumEarned });
      setSession(response.session);
      setPhase("success");
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save the session. Please try again.");
      completeLock.current = false;
    } finally { setBusy(false); }
  }

  async function discard() {
    if (!session || busy) return;
    setBusy(true);
    try {
      await cancelTrainerCoachingSession(clientId, session.id);
      setSession(null); setDraft(null); setRawInput(""); setPhase("start"); setStatus("Draft discarded.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Could not discard the draft."); }
    finally { setBusy(false); }
  }

  return (
    <main className="ascend-page px-4 py-3 text-white sm:py-5">
      <div className="ascend-workspace-frame">
        <header className="flex items-center gap-3 py-3">
          <BackButton fallbackHref={`/trainer/clients/${clientId}`} disabled={busy} />
          <div><p className="text-sm text-zinc-400">Coached workout</p><h1 className="text-2xl font-semibold">{title}</h1></div>
        </header>

        {status ? <p role="status" className="mt-3 rounded-xl border border-line bg-surface p-3 text-sm text-zinc-300">{status}</p> : null}

        <ol className="mt-4 grid grid-cols-3 gap-2" aria-label="Session capture progress">
          {["Capture", "Review", "Save"].map((label, index) => {
            const activeIndex = phase === "review" ? 1 : phase === "success" ? 2 : 0;
            const complete = index < activeIndex;
            const active = index === activeIndex;
            return <li key={label} className={`rounded-xl border px-3 py-2 text-center text-xs font-semibold ${complete ? "border-lime/30 bg-lime/10 text-lime" : active ? "border-calm/40 bg-calm/10 text-calm" : "border-line bg-surface text-zinc-500"}`}>{complete ? "Done" : label}</li>;
          })}
        </ol>

        {phase === "loading" ? <div className="mt-5 h-56 animate-pulse rounded-2xl bg-surface" /> : null}

        {phase === "start" ? (
          <section className="ascend-workspace-section mt-5 p-5">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-lime text-ink"><Dumbbell /></span>
            <h2 className="mt-5 text-2xl font-semibold">Capture the session without slowing it down.</h2>
            <p className="mt-2 max-w-xl leading-7 text-zinc-400">Use quick shorthand during training. Ascend will organize it before anything reaches the client.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button disabled={busy || !previousWorkout} onClick={() => start("repeat_last")} className="min-h-14 rounded-xl bg-lime px-4 font-bold text-ink disabled:opacity-40"><RotateCcw className="mr-2 inline" size={18} />Repeat last session</button>
              <button disabled={busy} onClick={() => start("blank")} className="min-h-14 rounded-xl border border-line bg-ink px-4 font-semibold text-white disabled:opacity-40">Start fresh</button>
            </div>
            <p className="mt-4 text-sm text-zinc-500">Last session: {previousSummary}</p>
          </section>
        ) : null}

        {phase === "capture" && session ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-[0.7fr_1.3fr]">
            <aside className="ascend-workspace-section p-4 sm:p-5">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-calm">Last session</p>
              <h2 className="mt-2 text-lg font-semibold">{previousWorkout?.title ?? "A clean starting point"}</h2>
              <p className="mt-2 text-sm text-zinc-400">{previousSummary}</p>
              {session.workoutDraft?.exercises.slice(0, 6).map((exercise) => <p key={exercise.name} className="mt-3 rounded-xl bg-ink p-3 text-sm">{exercise.name}<span className="block text-zinc-500">{exerciseSummary(exercise)}</span></p>)}
            </aside>
            <section className="rounded-2xl border border-lime/30 bg-surface p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-lime">Live session</p><h2 className="mt-1 text-xl font-semibold">Add what happened</h2></div><Clock3 className="text-lime" /></div>
              <label className="mt-5 block text-sm font-semibold">Session notes</label>
              <textarea value={rawInput} onChange={(event) => setRawInput(event.target.value)} rows={9} autoFocus placeholder={'Bench 60kg 10,10,8\nLat pulldown 45kg 3x12\nBike 8 min'} className="mt-2 w-full resize-none rounded-xl border border-line bg-ink p-4 text-lg leading-8 text-white outline-none focus:border-lime" />
              <p className="mt-2 text-sm text-zinc-500">Fastest option: tap your phone keyboard microphone and speak naturally.</p>
              <label className="mt-4 block text-sm font-semibold">Duration</label>
              <div className="mt-2 flex items-center gap-2"><input type="number" min={5} max={300} value={durationMinutes} onChange={(event) => setDurationMinutes(Math.max(5, Number(event.target.value) || 5))} className={`${inputClass} max-w-28`} /><span className="text-zinc-400">minutes</span></div>
              <button disabled={busy || !canInterpret} onClick={finishAndReview} className="mt-5 min-h-14 w-full rounded-xl bg-lime px-4 text-lg font-bold text-ink disabled:opacity-40"><Sparkles className="mr-2 inline" size={19} />{busy ? "Preparing..." : "Finish & Review"}</button>
              <button disabled={busy} onClick={discard} className="mt-3 min-h-12 w-full text-sm text-zinc-400"><Trash2 className="mr-2 inline" size={16} />Discard draft</button>
            </section>
          </div>
        ) : null}

        {phase === "review" && draft && narratives ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
            <section className="ascend-workspace-section p-4 sm:p-5">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-calm">Review receipt</p>
              <input aria-label="Workout title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className="mt-3 w-full bg-transparent text-2xl font-semibold outline-none" />
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <input aria-label="Workout type" value={draft.workoutType} onChange={(event) => setDraft({ ...draft, workoutType: event.target.value })} className={inputClass} />
                <select aria-label="Difficulty" value={draft.difficulty} onChange={(event) => setDraft({ ...draft, difficulty: event.target.value as WorkoutCaptureDraft["difficulty"] })} className={inputClass}><option value="easy">Easy</option><option value="moderate">Moderate</option><option value="challenging">Challenging</option></select>
                <input aria-label="Duration in minutes" type="number" min={5} max={300} value={draft.durationMinutes ?? durationMinutes} onChange={(event) => setDraft({ ...draft, durationMinutes: Number(event.target.value) })} className={inputClass} />
              </div>
              <div className="mt-5 space-y-2">
                {draft.exercises.map((exercise, index) => (
                  <article key={`${exercise.name}-${index}`} className={`rounded-xl border p-3 ${exercise.needsConfirmation ? "border-amber/50 bg-amber/5" : "border-line bg-ink"}`}>
                    <button type="button" onClick={() => setExpandedExercise(expandedExercise === index ? null : index)} className="flex min-h-11 w-full items-center justify-between gap-3 text-left">
                      <div><p className="font-semibold">{exercise.name}</p><p className="text-sm text-zinc-400">{exerciseSummary(exercise)}</p></div>{expandedExercise === index ? <ChevronUp /> : <ChevronDown />}
                    </button>
                    {expandedExercise === index ? <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"><input aria-label="Exercise name" value={exercise.name} onChange={(e) => updateExercise(index, { name: e.target.value })} className={`${inputClass} col-span-2 sm:col-span-4`} /><input aria-label="Sets" type="number" placeholder="Sets" value={exercise.sets ?? ""} onChange={(e) => updateExercise(index, { sets: e.target.value ? Number(e.target.value) : null })} className={inputClass} /><input aria-label="Reps" placeholder="Reps" value={exercise.reps ?? ""} onChange={(e) => updateExercise(index, { reps: e.target.value || null })} className={inputClass} /><input aria-label="Load" type="number" placeholder="Load" value={exercise.load ?? ""} onChange={(e) => updateExercise(index, { load: e.target.value ? Number(e.target.value) : null })} className={inputClass} /><select aria-label="Load unit" value={exercise.loadUnit ?? "kg"} onChange={(e) => updateExercise(index, { loadUnit: e.target.value as "kg" | "lb" })} className={inputClass}><option value="kg">kg</option><option value="lb">lb</option></select></div> : null}
                  </article>
                ))}
              </div>
            </section>
            <aside className="space-y-4">
              {intelligence ? <section className="rounded-2xl border border-calm/30 bg-calm/10 p-4"><div className="flex items-center gap-2 text-calm"><Sparkles size={18} /><p className="text-xs font-bold uppercase tracking-[0.16em]">Session Copilot</p></div><h3 className="mt-2 text-lg font-semibold">{intelligence.headline}</h3>{intelligence.highlights.length ? <div className="mt-3 space-y-2">{intelligence.highlights.map((highlight) => <p key={highlight} className="rounded-xl bg-ink/70 p-3 text-sm text-zinc-200"><Check className="mr-2 inline text-lime" size={16} />{highlight}</p>)}</div> : null}{intelligence.watchouts.length ? <div className="mt-3 rounded-xl border border-amber/30 bg-amber/10 p-3"><p className="text-xs font-bold uppercase tracking-[0.14em] text-amber">Check next time</p>{intelligence.watchouts.map((watchout) => <p key={watchout} className="mt-2 text-sm leading-6 text-zinc-200">{watchout}</p>)}</div> : null}<div className="mt-3 rounded-xl bg-ink/70 p-3"><p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">Next-session starting point</p><p className="mt-2 text-sm leading-6 text-zinc-200">{intelligence.nextSessionStartingPoint}</p></div></section> : null}
              <section className="ascend-workspace-section p-4"><p className="text-sm text-zinc-400">Estimated Calories Burned</p><p className="mt-1 text-3xl font-semibold">~{estimatedCalories ?? "--"} kcal</p><p className="mt-2 text-xs text-zinc-500">Estimated from session type, effort, duration and client weight when available.</p></section>
              <section className="rounded-2xl border border-purple-400/30 bg-purple-500/10 p-4"><p className="text-xs font-bold uppercase tracking-[0.16em] text-purple-200">Client recap</p><textarea value={narratives.clientRecap} onChange={(e) => setNarratives({ ...narratives, clientRecap: e.target.value })} rows={4} className="mt-2 w-full resize-none bg-transparent text-sm leading-6 outline-none" /><p className="mt-3 text-xs font-bold uppercase tracking-[0.16em] text-calm">Between-session focus</p><textarea value={narratives.betweenSessionFocus} onChange={(e) => setNarratives({ ...narratives, betweenSessionFocus: e.target.value })} rows={3} className="mt-2 w-full resize-none bg-transparent text-sm leading-6 outline-none" /></section>
              <button disabled={busy || !draft.title.trim()} onClick={complete} className="sticky bottom-[calc(1rem+env(safe-area-inset-bottom))] z-20 min-h-14 w-full rounded-xl bg-lime px-4 text-lg font-bold text-ink shadow-[0_16px_40px_rgba(0,0,0,0.45)] disabled:opacity-40"><Save className="mr-2 inline" size={19} />{busy ? "Saving..." : "Confirm & Share"}</button>
              <button disabled={busy} onClick={() => setPhase("capture")} className="min-h-12 w-full rounded-xl border border-line bg-ink font-semibold">Back to notes</button>
            </aside>
          </div>
        ) : null}

        {phase === "success" ? <section className="mt-5 rounded-2xl border border-lime/40 bg-lime/10 p-6 text-center"><span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-lime text-ink"><Check size={34} /></span><h2 className="mt-4 text-2xl font-semibold">Session shared</h2><p className="mt-2 text-zinc-300">The client can now see what they completed and what to focus on next.</p><div className="mx-auto mt-5 grid max-w-md grid-cols-2 gap-3"><div className="rounded-xl bg-ink p-3"><p className="text-sm text-zinc-500">Estimated burn</p><p className="text-xl font-semibold">~{completion?.calories ?? 0} kcal</p></div><div className="rounded-xl bg-ink p-3"><p className="text-sm text-zinc-500">Momentum</p><p className="text-xl font-semibold text-lime">+{completion?.momentum ?? 0}</p></div></div><a href={`/trainer/clients/${clientId}`} className="mx-auto mt-5 flex min-h-14 max-w-md items-center justify-center rounded-xl bg-lime font-bold text-ink">Return to client</a></section> : null}
      </div>
    </main>
  );
}

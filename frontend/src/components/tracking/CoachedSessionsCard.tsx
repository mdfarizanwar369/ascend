"use client";

import { useEffect, useState } from "react";
import type { ClientCoachedSession } from "@ascend/shared";
import { CheckCircle2, ChevronDown, ChevronUp, Dumbbell } from "lucide-react";
import { getMyCoachedSessions } from "@/lib/ascendApi";

export function CoachedSessionsCard() {
  const [sessions, setSessions] = useState<ClientCoachedSession[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getMyCoachedSessions(5).then((response) => {
      if (mounted && response.enabled) setSessions(response.sessions);
    }).catch(() => undefined);
    return () => { mounted = false; };
  }, []);

  if (!sessions.length) return null;

  return (
    <section className="mt-4 rounded-lg border border-line bg-surface p-4">
      <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-calm/15 text-calm"><Dumbbell size={21} /></span><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-calm">With your coach</p><h2 className="text-lg font-semibold">Coached sessions</h2></div></div>
      <div className="mt-4 space-y-2">
        {sessions.slice(0, 3).map((session) => (
          <article key={session.id} className="rounded-xl border border-white/5 bg-ink p-3">
            <button type="button" onClick={() => setExpanded(expanded === session.id ? null : session.id)} className="flex min-h-12 w-full items-center justify-between gap-3 text-left">
              <div className="min-w-0"><p className="truncate font-semibold">{session.title}</p><p className="mt-1 text-sm text-zinc-400">{session.durationMinutes} min / ~{session.estimatedCaloriesBurned} kcal / {new Date(session.completedAt).toLocaleDateString([], { day: "numeric", month: "short" })}</p></div>{expanded === session.id ? <ChevronUp /> : <ChevronDown />}
            </button>
            {expanded === session.id ? <div className="mt-3 border-t border-line pt-3"><p className="rounded-xl border border-lime/20 bg-lime/10 p-3 text-sm font-medium leading-6 text-zinc-100">{session.clientCelebration}</p><p className="mt-3 text-sm leading-6 text-zinc-300">{session.clientRecap}</p>{session.progressHighlights.length ? <div className="mt-3 space-y-2">{session.progressHighlights.map((highlight) => <p key={highlight} className="flex items-start gap-2 rounded-xl bg-surface p-3 text-sm"><CheckCircle2 className="mt-0.5 shrink-0 text-lime" size={18} />{highlight}</p>)}</div> : null}<div className="mt-3 space-y-2">{session.exercises.map((exercise, index) => <div key={`${exercise.name}-${index}`} className="flex items-start gap-2 rounded-xl bg-surface p-3"><CheckCircle2 className="mt-0.5 shrink-0 text-lime" size={18} /><div><p className="font-medium">{exercise.name}</p><p className="text-sm text-zinc-500">{[exercise.sets ? `${exercise.sets} sets` : null, exercise.reps ? `${exercise.reps} reps` : null, exercise.load !== null ? `${exercise.load}${exercise.loadUnit ?? ""}` : null].filter(Boolean).join(" / ")}</p></div></div>)}</div><div className="mt-3 rounded-xl border border-calm/20 bg-calm/10 p-3"><p className="text-xs font-bold uppercase tracking-[0.14em] text-calm">Next focus</p><p className="mt-1 text-sm leading-6 text-zinc-200">{session.betweenSessionFocus}</p></div></div> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

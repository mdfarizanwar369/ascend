"use client";

import { useEffect, useState } from "react";
import { getGymClientCoachingSessions } from "@/lib/ascendApi";

type Sessions = Awaited<ReturnType<typeof getGymClientCoachingSessions>>["sessions"];

export function GymCoachingSessions({ clientId }: { clientId: string }) {
  const [sessions, setSessions] = useState<Sessions | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let current = true;
    getGymClientCoachingSessions(clientId).then((result) => {
      if (!current) return;
      setSessions(result.sessions);
      if (!result.enabled) setStatus("Session history is unavailable.");
    }).catch((error: unknown) => {
      if (current) setStatus(error instanceof Error ? error.message : "Could not load coaching sessions.");
    });
    return () => { current = false; };
  }, [clientId]);

  if (status) return <p role="status" className="mt-3 text-sm text-zinc-400">{status}</p>;
  if (!sessions) return <p role="status" className="mt-3 text-sm text-zinc-400">Loading coaching sessions…</p>;
  if (!sessions.length) return <p className="mt-3 text-sm text-zinc-400">No completed coaching sessions for this client at this gym.</p>;

  return (
    <div className="mt-3 space-y-2">
      {sessions.map((session, index) => (
        <details key={session.id} open={index === 0 ? true : undefined} className="rounded-xl border border-line bg-ink p-3">
          <summary className="cursor-pointer text-sm font-semibold">
            {session.title ?? "PT session"} · {session.trainerName} · {new Date(session.completedAt).toLocaleDateString()}
          </summary>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            {([
              ["Focus", session.worksheet?.focus],
              ["Main movement or priority", session.worksheet?.priority],
              ["Client response", session.worksheet?.response],
              ["Win", session.worksheet?.win],
              ["Plan for next session", session.narratives?.trainerNextSessionNote]
            ] as const).filter(([, value]) => Boolean(value)).map(([label, value]) => (
              <div key={label} className={label === "Plan for next session" ? "sm:col-span-2" : undefined}>
                <dt className="text-zinc-400">{label}</dt>
                <dd className="whitespace-pre-wrap break-words">{value}</dd>
              </div>
            ))}
          </dl>
          {session.exercises.length ? (
            <ul className="mt-3 space-y-2 text-sm">
              {session.exercises.map((exercise, exerciseIndex) => {
                const details = [
                  exercise.sets ? `${exercise.sets} sets` : null,
                  exercise.reps ? `${exercise.reps} reps` : null,
                  exercise.load !== null ? `${exercise.load} ${exercise.loadUnit ?? ""}`.trim() : null,
                  exercise.durationMinutes ? `${exercise.durationMinutes} min` : null
                ].filter(Boolean).join(" · ");
                return <li key={exerciseIndex}><span className="font-medium">{exercise.name}</span>{details ? <span className="text-zinc-400"> · {details}</span> : null}{exercise.note ? <p className="whitespace-pre-wrap text-zinc-300">{exercise.note}</p> : null}</li>;
              })}
            </ul>
          ) : null}
          {session.shareClientRecap && (session.narratives?.clientRecap || session.narratives?.betweenSessionFocus) ? (
            <div className="mt-3 border-t border-line pt-3 text-sm">
              <p className="font-semibold">Shared with client</p>
              <p className="whitespace-pre-wrap text-zinc-300">{session.narratives.clientRecap}</p>
              {session.narratives.betweenSessionFocus ? <p className="mt-1 whitespace-pre-wrap text-zinc-300">{session.narratives.betweenSessionFocus}</p> : null}
            </div>
          ) : null}
        </details>
      ))}
    </div>
  );
}

"use client";

import type { AscendCoachClientListItem } from "@ascend/shared";
import { AlertCircle, ChevronRight, RefreshCw, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AscendHeroPanel, BusinessSigil } from "@/components/AscendVisualIdentity";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { SkeletonCardList } from "@/components/PerceivedLoading";
import { getAscendCoachClients } from "@/lib/ascendCoachApi";

function relativeTime(value?: string | null) {
  if (!value) return "No workouts recorded yet";
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
  if (days === 0) return "Last workout today";
  if (days === 1) return "Last workout yesterday";
  return `Last workout ${days} days ago`;
}

function goalLabel(goal?: string | null) {
  return goal ? goal.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : null;
}

export function AscendCoachClientList() {
  const [clients, setClients] = useState<AscendCoachClientListItem[] | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const platformOwnerMode = clients?.some((client) => client.accessMode === "platform_owner") === true;

  useEffect(() => {
    let mounted = true;
    setClients(null);
    setError(false);
    getAscendCoachClients()
      .then((result) => mounted && setClients(result.clients))
      .catch(() => mounted && setError(true));
    return () => { mounted = false; };
  }, [retry]);

  return (
    <div className="pb-4">
      <AscendHeroPanel
        eyebrow="Ascend Coach"
        title="Clients"
        body={platformOwnerMode ? "Platform Owner access to every active Ascend client. All opens are audited." : "Open a client to see the coaching evidence Ascend can currently support."}
        tone="trainer"
        visual={<BusinessSigil status={clients ? `${clients.length} active` : "Coach"} />}
      />

      <section className="mt-5" aria-labelledby="coach-client-list-title">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="ascend-eyebrow text-calm">Client 360</p>
            <h2 id="coach-client-list-title" className="mt-1 text-xl font-semibold">{platformOwnerMode ? "All active clients" : "Authorized clients"}</h2>
          </div>
        </div>

        {!clients && !error ? <SkeletonCardList count={3} compact /> : null}

        {error ? (
          <div className="rounded-2xl border border-amber/35 bg-amber/10 p-5" role="alert">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 shrink-0 text-amber" size={20} />
              <div>
                <h3 className="font-semibold">Client list unavailable</h3>
                <p className="mt-1 text-sm leading-6 text-zinc-300">Ascend Coach may be disabled, or the client list could not be loaded.</p>
              </div>
            </div>
            <button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-lime font-semibold text-ink">
              <RefreshCw size={18} /> Try again
            </button>
          </div>
        ) : null}

        {clients?.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface p-6 text-center">
            <Users className="mx-auto text-calm" size={28} />
            <h3 className="mt-3 font-semibold">No active clients</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-400">Accepted, active coaching relationships will appear here.</p>
          </div>
        ) : null}

        {clients?.length ? (
          <div className="space-y-3">
            {clients.map((client) => {
              const visibleName = client.displayName ?? "Client profile not shared";
              const hasTraining = Object.prototype.hasOwnProperty.call(client, "lastWorkoutAt");
              return (
                <Link key={`${client.accessMode}:${client.clientId}`} href={`/trainer/clients/${client.clientId}/360`} className="ascend-pressable flex min-h-20 items-center gap-3 rounded-2xl border border-line bg-surface p-4 shadow-soft hover:border-calm/45">
                  <ProfileAvatar name={client.displayName} />
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-semibold text-white">{visibleName}</p>
                    <p className="mt-1 text-sm capitalize text-zinc-400">{goalLabel(client.goal) ?? "Goal not shared"}</p>
                    <p className="mt-2 text-xs text-zinc-500">{hasTraining ? relativeTime(client.lastWorkoutAt) : "Training data not shared"}{client.accessMode === "platform_owner" ? " · Platform Owner access" : ""}</p>
                  </div>
                  <ChevronRight className="shrink-0 text-zinc-500" size={20} aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        ) : null}
      </section>
    </div>
  );
}

"use client";

import { useEffect,useState } from "react";
import Link from "next/link";
import { Activity,ArrowRight,X } from "lucide-react";
import { getHealthActivityStatus } from "@/lib/ascendApi";
import { AppleHealth,hasAppleHealthBridge } from "@/lib/appleHealth";

export const APPLE_HEALTH_INVITATION_VERSION = "v1";

type InvitationState = "checking" | "invitation" | "reminder" | "hidden";

export function appleHealthInvitationStorageKey(accountId: string) {
  return `ascend:apple-health-invitation:${APPLE_HEALTH_INVITATION_VERSION}:${accountId}`;
}

export function useAppleHealthInvitation(accountId: string | null) {
  const [state,setState] = useState<InvitationState>("checking");

  useEffect(() => {
    let active = true;
    if (!accountId || !hasAppleHealthBridge()) {
      setState("hidden");
      return () => { active = false; };
    }

    setState("checking");
    const storageKey = appleHealthInvitationStorageKey(accountId);
    void Promise.all([AppleHealth.status(),getHealthActivityStatus()])
      .then(([native,server]) => {
        if (!active) return;
        const eligible = native.available && native.capability === "appleHealthReadV1" && server.status.enabled;
        // Any current or former connection is a deliberate choice. Keep the
        // invitation from returning after disconnect or imported-history deletion.
        const hasConnectionHistory = native.connected || server.status.connections.length > 0;
        if (!eligible || hasConnectionHistory) {
          setState("hidden");
          return;
        }
        let postponed = false;
        try { postponed = window.localStorage.getItem(storageKey) === "later"; }
        catch { /* A blocked local store should not prevent the optional offer. */ }
        setState(postponed ? "reminder" : "invitation");
      })
      .catch(() => { if (active) setState("hidden"); });

    return () => { active = false; };
  },[accountId]);

  function postpone() {
    if (!accountId) return;
    try { window.localStorage.setItem(appleHealthInvitationStorageKey(accountId),"later"); }
    catch { /* Keep the in-session choice even if device storage is unavailable. */ }
    setState("reminder");
  }

  return { state,postpone };
}

export function AppleHealthInvitation({ state,onPostpone }: { state: InvitationState; onPostpone: () => void }) {
  if (state !== "invitation") return null;

  return <section aria-labelledby="apple-health-invitation-title" className="relative mt-3 overflow-hidden rounded-2xl border border-rose-300/20 bg-[linear-gradient(135deg,rgba(244,63,94,0.12),rgba(255,255,255,0.035))] p-4 shadow-soft">
    <button type="button" onClick={onPostpone} aria-label="Connect Apple Health later" className="absolute right-2 top-2 grid h-11 w-11 place-items-center rounded-full text-zinc-400 hover:bg-white/[0.05] hover:text-white">
      <X size={18} />
    </button>
    <div className="flex items-start gap-3 pr-9">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-rose-400/15 text-rose-200">
        <Activity size={21} />
      </span>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-rose-200">Optional connection</p>
        <h2 id="apple-health-invitation-title" className="mt-1 text-lg font-semibold text-white">Keep your activity up to date</h2>
      </div>
    </div>
    <p className="mt-3 text-sm leading-6 text-zinc-300">Connect Apple Health to bring your steps, active calories and workouts into Ascend automatically. Your food target won&apos;t change.</p>
    <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
      <Link href="/profile/health-sync" className="ascend-pressable flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-3 text-sm font-semibold text-ink">
        Connect Apple Health <ArrowRight size={16} />
      </Link>
      <button type="button" onClick={onPostpone} className="min-h-12 rounded-xl border border-white/10 px-3 text-sm font-semibold text-zinc-300 hover:border-white/20 hover:text-white">Maybe later</button>
    </div>
    <p className="mt-3 text-[11px] leading-5 text-zinc-500">Read only. You choose what Ascend can read on Apple&apos;s permission screen.</p>
  </section>;
}

export function AppleHealthReminder({ state }: { state: InvitationState }) {
  if (state !== "reminder") return null;

  return <Link href="/profile/health-sync" className="ascend-pressable mt-3 flex min-h-12 items-center gap-3 rounded-xl border border-rose-300/15 bg-rose-400/[0.045] px-3 text-left">
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-rose-400/10 text-rose-200"><Activity size={16} /></span>
    <span className="min-w-0 flex-1">
      <span className="block text-xs font-semibold text-white">Connect Apple Health</span>
      <span className="mt-0.5 block text-[11px] leading-4 text-zinc-500">Fill Move with steps, active calories and workouts.</span>
    </span>
    <ArrowRight className="shrink-0 text-rose-200" size={16} />
  </Link>;
}

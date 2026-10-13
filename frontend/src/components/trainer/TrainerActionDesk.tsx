"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import QRCode from "qrcode";
import { ArrowRight, Check, ChevronRight, CircleAlert, CircleCheck, Clock3, Copy, MessageCircle, Search, Share2, Sparkles, TrendingUp, Users, X } from "lucide-react";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { TrainerClientInsightsPanel } from "@/components/trainer/TrainerClientInsights";
import {
  createTrainerReferralCode,
  getMe,
  getMySubscription,
  getTrainerClients,
  getTrainerOnboardingStatus,
  getTrainerRiskAlerts,
  getTrainerWorkQueueDispositions,
  putTrainerWorkQueueDisposition,
  sendTrainerClientPraise,
  updateTrainerRiskAlert,
  type TrainerWorkQueueDisposition
} from "@/lib/ascendApi";
import { buildTrainerActionQueue, type TrainerAction, type TrainerQueueAlert, type TrainerQueueClient } from "@/lib/trainerActionQueue";
import { trainerInsightsEnabled } from "@/lib/trainerInsightsFlag";

type View = "today" | "clients" | "insights";
type Bucket = "followups" | "messages" | "wins";

const buckets = [
  { key: "followups", label: "Follow-ups", title: "Follow up", icon: CircleAlert, color: "text-purple-200" },
  { key: "messages", label: "Messages", title: "Reply to messages", icon: MessageCircle, color: "text-lime" },
  { key: "wins", label: "Wins", title: "Celebrate wins", icon: TrendingUp, color: "text-calm" }
] as const;

function queueActionText(task: TrainerAction) {
  if (task.kind === "message") return "Open conversation";
  if (task.kind === "win") return "Send praise";
  return task.alertId ? "Review client" : "Open conversation";
}

export function TrainerActionDesk() {
  const [clients, setClients] = useState<TrainerQueueClient[]>([]);
  const [alerts, setAlerts] = useState<TrainerQueueAlert[]>([]);
  const [dispositions, setDispositions] = useState<TrainerWorkQueueDisposition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [pendingApproval, setPendingApproval] = useState(false);
  const [view, setView] = useState<View>("today");
  const [bucket, setBucket] = useState<Bucket>("followups");
  const [visibleLimit, setVisibleLimit] = useState(2);
  const [search, setSearch] = useState("");
  const [selectedTask, setSelectedTask] = useState<TrainerAction | null>(null);
  const [selectedInsightsClientId, setSelectedInsightsClientId] = useState("");
  const [busy, setBusy] = useState(false);
  const [referralCode, setReferralCode] = useState("");
  const [referralQr, setReferralQr] = useState("");
  const [clientLimit, setClientLimit] = useState<number | null>(5);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const me = await getMe();
        if (!active) return;
        if (me.roles.includes("trainer") && !me.roles.some((role) => role === "owner" || role === "admin") && me.user.trainer_status && me.user.trainer_status !== "active") {
          setPendingApproval(true);
          setLoading(false);
          return;
        }
        const [clientData, alertData, dispositionData, onboardingData, subscriptionData] = await Promise.all([
          getTrainerClients(),
          getTrainerRiskAlerts(),
          getTrainerWorkQueueDispositions(),
          getTrainerOnboardingStatus().catch(() => null),
          getMySubscription().catch(() => null)
        ]);
        if (!active) return;
        setClients(clientData.clients);
        setAlerts(alertData.alerts);
        setDispositions(dispositionData.dispositions);
        setReferralCode(onboardingData?.onboarding?.referral_code ?? "");
        setClientLimit(me.roles.some((role) => role === "owner" || role === "admin") ? null : subscriptionData?.subscription?.status === "trialing" ? 2 : 5);
        const firstQueue = buildTrainerActionQueue(clientData.clients, alertData.alerts, dispositionData.dispositions);
        setBucket(firstQueue.followups.length ? "followups" : firstQueue.messages.length ? "messages" : "wins");
        setError("");
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load the trainer workspace.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    if (!referralCode) { setReferralQr(""); return; }
    void QRCode.toDataURL(`https://www.getascend.fit/?trainer=${encodeURIComponent(referralCode)}`, {
      width: 160,
      margin: 2,
      color: { dark: "#07111B", light: "#FFFFFF" }
    }).then((url) => { if (active) setReferralQr(url); }).catch(() => { if (active) setReferralQr(""); });
    return () => { active = false; };
  }, [referralCode]);

  const queue = useMemo(() => buildTrainerActionQueue(clients, alerts, dispositions), [clients, alerts, dispositions]);
  const current = queue[bucket];
  const visibleTasks = current.slice(0, visibleLimit);
  const workCount = queue.followups.length + queue.messages.length;
  const query = search.trim().toLocaleLowerCase();
  const searchResults = useMemo(() => query ? clients.filter((client) => `${client.full_name} ${client.email}`.toLocaleLowerCase().includes(query)).slice(0, 8) : [], [clients, query]);
  const insightsClient = clients.find((client) => client.id === selectedInsightsClientId) ?? queue.followups[0]?.client ?? clients[0];

  function switchView(next: View) {
    setView(next);
    setSelectedTask(null);
    setStatus("");
  }

  async function saveDisposition(task: TrainerAction, disposition: "handled" | "snoozed") {
    if (task.kind === "message") return;
    setBusy(true);
    setStatus("");
    try {
      if (disposition === "handled" && task.alertId) {
        await updateTrainerRiskAlert(task.alertId, "resolved");
        const remainingAlerts = alerts.filter((alert) => alert.id !== task.alertId);
        setAlerts(remainingAlerts);
        setClients((currentClients) => currentClients.map((client) => client.id === task.client.id ? {
          ...client,
          open_alerts: Math.max(0, Number(client.open_alerts ?? 0) - 1),
          risk_severity: remainingAlerts.some((alert) => alert.user_id === client.id && alert.severity === "high") ? "high"
            : remainingAlerts.find((alert) => alert.user_id === client.id)?.severity ?? null
        } : client));
      }
      const result = await putTrainerWorkQueueDisposition(task.client.id, { kind: task.kind, signalKey: task.signalKey, disposition });
      setDispositions((currentDispositions) => [...currentDispositions.filter((item) => !(item.client_user_id === task.client.id && item.kind === task.kind)), result.disposition]);
      setStatus(disposition === "handled" ? `${task.client.full_name} marked handled. We'll check again next week if the signal remains.` : `Reminder set for tomorrow for ${task.client.full_name}.`);
      setSelectedTask(null);
    } catch {
      setStatus("Could not save this action. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function praise(task: TrainerAction) {
    setBusy(true);
    setStatus("");
    try {
      await sendTrainerClientPraise(task.client.id);
      const result = await putTrainerWorkQueueDisposition(task.client.id, { kind: "win", signalKey: task.signalKey, disposition: "handled" });
      setDispositions((currentDispositions) => [...currentDispositions.filter((item) => !(item.client_user_id === task.client.id && item.kind === "win")), result.disposition]);
      setStatus(`Praise sent to ${task.client.full_name}.`);
      setSelectedTask(null);
    } catch {
      setStatus("Could not complete the praise action. Please check the conversation before trying again.");
    } finally {
      setBusy(false);
    }
  }

  async function shareReferral() {
    try {
      const code = referralCode || (await createTrainerReferralCode()).referral.code;
      setReferralCode(code);
      const url = `https://www.getascend.fit/?trainer=${encodeURIComponent(code)}`;
      if (navigator.share) await navigator.share({ title: "Train with me on Ascend", url });
      else {
        await navigator.clipboard.writeText(`${url}\nTrainer code: ${code}`);
        setStatus("Referral link copied.");
      }
    } catch {
      setStatus("Could not share the referral link.");
    }
  }

  if (pendingApproval) return <section className="ascend-workspace-section mt-4 p-5"><h1 className="text-xl font-semibold">Trainer approval pending</h1><p className="mt-2 text-sm text-zinc-300">An owner needs to approve your trainer account before clients are assigned.</p><Link href="/subscription" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-lime px-4 font-semibold text-ink">View plan</Link></section>;
  if (loading) return <section className="ascend-workspace-section mt-4 animate-pulse p-5" aria-label="Loading trainer workspace"><div className="h-7 w-40 rounded-lg bg-white/10" /><div className="mt-6 grid grid-cols-3 gap-2">{[0, 1, 2].map((item) => <div key={item} className="h-20 rounded-xl bg-white/5" />)}</div><div className="mt-6 h-20 rounded-xl bg-white/5" /><div className="mt-3 h-20 rounded-xl bg-white/5" /></section>;
  if (error) return <section className="ascend-workspace-section mt-4 p-5"><h1 className="text-xl font-semibold">Trainer workspace unavailable</h1><p role="alert" className="mt-2 text-sm text-zinc-300">{error}</p><button type="button" onClick={() => window.location.reload()} className="mt-4 min-h-11 rounded-xl bg-lime px-4 font-semibold text-ink">Try again</button></section>;

  return <div className="mt-4 max-w-4xl pb-8">
    <header className="flex items-end justify-between gap-3">
      <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-purple-300">Trainer workspace</p><h1 className="mt-2 text-[1.75rem] font-semibold leading-tight tracking-tight text-white">{view === "today" ? "Your day" : view === "clients" ? "Your clients" : "Insights"}</h1><p className="mt-1 text-sm text-zinc-400">{view === "today" ? `${workCount} ${workCount === 1 ? "client needs" : "clients need"} you · ${clients.length} assigned` : view === "clients" ? "Find the client you need" : "Keep the coaching picture in view"}</p></div>
      {view === "today" ? <button type="button" onClick={() => switchView("clients")} aria-label="Find a client" className="ascend-pressable grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line bg-surface text-white"><Search size={19} /></button> : null}
    </header>

    <div className="mt-5 flex gap-6 border-b border-line" role="tablist" aria-label="Trainer workspace views">
      {(["today", "clients", "insights"] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={view === item} onClick={() => switchView(item)} className={`min-h-11 border-b-2 px-1 text-sm font-semibold ${view === item ? "border-lime text-white" : "border-transparent text-zinc-400"}`}>{item === "today" ? "Today" : item === "clients" ? "Clients" : "Insights"}</button>)}
    </div>

    {status ? <p role="status" className="mt-4 rounded-xl border border-calm/30 bg-calm/10 px-3 py-2 text-sm text-zinc-200">{status}</p> : null}

    {view === "today" ? <section className="mt-4" aria-label="Today's work queue">
      <div className="grid grid-cols-3 gap-2">
        {buckets.map((item) => { const Icon = item.icon; const count = queue[item.key].length; return <button key={item.key} type="button" aria-pressed={bucket === item.key} onClick={() => { setBucket(item.key); setVisibleLimit(2); }} className={`ascend-pressable min-w-0 rounded-2xl border p-3 text-left ${bucket === item.key ? "border-calm/70 bg-calm/15" : "border-line bg-surface"}`}><span className="flex items-center gap-2"><Icon size={18} className={item.color} /><strong className="text-xl tabular-nums text-white">{count}</strong></span><span className="mt-1 block truncate text-[11px] text-zinc-300">{item.label}</span></button>; })}
      </div>
      <div className="mt-7 flex items-end justify-between gap-2"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-purple-300">Your work queue</p><h2 className="mt-1 text-xl font-semibold">{buckets.find((item) => item.key === bucket)?.title}</h2></div><span className="pb-1 text-xs text-zinc-400">Showing {visibleTasks.length} of {current.length}</span></div>
      <div className="mt-3 grid gap-2">
        {visibleTasks.map((task) => <button key={`${task.kind}:${task.client.id}`} type="button" onClick={() => setSelectedTask(task)} className="ascend-pressable flex min-h-[4.75rem] items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-left hover:border-calm/50"><ProfileAvatar src={task.client.profile_photo_url} name={task.client.full_name} size="sm" /><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-white">{task.client.full_name}</strong><span className="mt-1 block truncate text-xs text-zinc-400">{task.reason}{task.kind === "followup" && task.unreadCount ? ` · ${task.unreadCount} unread` : ""}</span></span><ChevronRight className="shrink-0 text-zinc-400" size={17} /></button>)}
        {!current.length ? <div className="flex min-h-28 items-center gap-3 rounded-2xl border border-lime/20 bg-lime/5 p-4"><CircleCheck className="text-lime" size={22} /><span className="text-sm text-zinc-200">Nothing to handle in this group right now.</span></div> : null}
      </div>
      {current.length > visibleLimit ? <button type="button" onClick={() => setVisibleLimit((value) => value + 5)} className="ascend-pressable mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-calm/40 bg-calm/10 text-sm font-semibold text-purple-200">Show next {Math.min(5, current.length - visibleLimit)} <ArrowRight size={16} /></button> : visibleLimit > 2 ? <button type="button" onClick={() => setVisibleLimit(2)} className="ascend-pressable mt-3 min-h-11 w-full rounded-xl border border-line text-sm font-semibold text-zinc-300">Show fewer</button> : null}
      <p className="mt-5 flex items-center gap-2 text-xs text-zinc-500"><Check size={15} className="text-lime" /> Prioritized by urgency, then recency.</p>
    </section> : null}

    {view === "clients" ? <section className="mt-5" aria-label="Find clients"><h2 className="text-lg font-semibold">Find any client</h2><p className="mt-1 text-sm text-zinc-400">Search your {clients.length} assigned clients by name or email.</p><label className="mt-4 flex h-12 items-center gap-2 rounded-xl border border-line bg-ink px-3 focus-within:border-calm"><Search size={18} className="text-zinc-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search client name" aria-label="Search client name" className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none" /></label>
      {query ? <div className="mt-3 grid gap-2">{searchResults.map((client) => <div key={client.id} className="flex min-h-14 items-center gap-3 rounded-xl border border-line bg-surface p-2.5"><ProfileAvatar src={client.profile_photo_url} name={client.full_name} size="sm" /><span className="min-w-0 flex-1 truncate text-sm font-semibold">{client.full_name}</span><button type="button" onClick={() => { setSelectedInsightsClientId(client.id); switchView("insights"); }} className="ascend-pressable min-h-10 rounded-lg border border-line px-2 text-xs text-zinc-200">Graph</button><Link href={`/trainer/clients/${client.id}`} className="ascend-pressable grid h-10 w-10 place-items-center rounded-lg bg-lime text-ink" aria-label={`Open ${client.full_name}`}><ChevronRight size={17} /></Link></div>)}{!searchResults.length ? <p className="rounded-xl border border-line bg-surface p-4 text-sm text-zinc-400">No matching client. Try another name.</p> : null}{searchResults.length === 8 ? <p className="text-xs text-zinc-400">Keep typing to narrow the results.</p> : null}</div> : <div className="mt-16 flex flex-col items-center text-center"><span className="grid h-14 w-14 place-items-center rounded-2xl bg-calm/15 text-purple-200"><Users size={23} /></span><p className="mt-3 text-sm font-semibold">Search your clients</p><p className="mt-1 text-xs text-zinc-400">Type a name to open a profile or graph.</p></div>}
      <details className="mt-16 rounded-2xl border border-line bg-surface p-4"><summary className="cursor-pointer text-sm font-semibold">Invite a client</summary><p className="mt-3 text-xs leading-5 text-zinc-400">Clients confirm your trainer connection before their fitness information is shared.</p><p className="mt-2 text-xs text-zinc-400">{clientLimit === null ? `${clients.length} assigned clients` : `${clients.length} of ${clientLimit} active client places used`}</p>{referralCode ? <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-ink p-3"><p className="min-w-0 break-all text-lg font-semibold tracking-wider text-lime">{referralCode}</p>{referralQr ? <Image src={referralQr} alt={`QR code for trainer referral ${referralCode}`} width={80} height={80} unoptimized className="shrink-0 rounded-lg bg-white p-1" /> : null}</div> : null}<div className="mt-3 flex gap-2"><button type="button" onClick={() => void (referralCode ? navigator.clipboard.writeText(referralCode).then(() => setStatus("Referral code copied.")).catch(() => setStatus("Could not copy code.")) : createTrainerReferralCode().then((result) => setReferralCode(result.referral.code)).catch(() => setStatus("Could not create a referral code.")))} className="ascend-pressable flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-line text-xs font-semibold"><Copy size={15} />{referralCode ? "Copy code" : "Create code"}</button><button type="button" onClick={() => void shareReferral()} className="ascend-pressable flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-lime text-xs font-semibold text-ink"><Share2 size={15} />Share link</button></div></details>
    </section> : null}

    {view === "insights" ? <section className="mt-5" aria-label="Client insight graph"><div className="flex items-center gap-2"><Sparkles size={18} className="text-purple-200" /><h2 className="text-lg font-semibold">Client graph</h2></div><p className="mt-1 text-sm text-zinc-400">Training, food, and recovery records for one client.</p>{insightsClient ? <div className="mt-4 flex items-center gap-3 rounded-xl border border-line bg-surface p-3"><ProfileAvatar src={insightsClient.profile_photo_url} name={insightsClient.full_name} size="sm" /><strong className="min-w-0 flex-1 truncate text-sm">{insightsClient.full_name}</strong><button type="button" onClick={() => switchView("clients")} className="ascend-pressable min-h-10 rounded-lg border border-line px-3 text-xs font-semibold">Change</button></div> : null}{insightsClient && trainerInsightsEnabled() ? <><TrainerClientInsightsPanel clientId={insightsClient.id} /><Link href={`/trainer/clients/${insightsClient.id}`} className="ascend-pressable mt-4 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-surface text-sm font-semibold">Open {insightsClient.full_name}&apos;s profile <ArrowRight size={16} /></Link></> : <p className="mt-6 rounded-xl border border-line bg-surface p-4 text-sm text-zinc-400">{clients.length ? "Client graphs are unavailable right now." : "Your client graphs will appear here when clients are assigned."}</p>}</section> : null}

    {selectedTask ? <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center" onClick={() => !busy && setSelectedTask(null)}><section role="dialog" aria-modal="true" aria-label={`Action for ${selectedTask.client.full_name}`} onClick={(event) => event.stopPropagation()} className="w-full max-w-md rounded-t-[1.75rem] border border-line bg-surface p-5 pb-8 shadow-2xl sm:rounded-[1.75rem]"><div className="flex items-start justify-between"><ProfileAvatar src={selectedTask.client.profile_photo_url} name={selectedTask.client.full_name} size="sm" /><button type="button" onClick={() => setSelectedTask(null)} disabled={busy} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-lg bg-ink text-zinc-300"><X size={18} /></button></div><h2 className="mt-4 text-xl font-semibold">{selectedTask.client.full_name}</h2><p className="mt-1 text-sm text-zinc-300">{selectedTask.reason}{selectedTask.kind === "followup" && selectedTask.unreadCount ? ` · ${selectedTask.unreadCount} unread` : ""}</p><p className="mt-3 text-xs leading-5 text-zinc-400">{selectedTask.action}</p>{selectedTask.kind === "win" ? <button type="button" onClick={() => void praise(selectedTask)} disabled={busy} className="ascend-pressable mt-5 flex min-h-11 w-full items-center justify-center rounded-xl bg-lime text-sm font-semibold text-ink disabled:opacity-60">{busy ? "Sending…" : "Send praise"}</button> : <Link href={selectedTask.kind === "message" || !selectedTask.alertId ? `/messages?userId=${selectedTask.client.id}` : `/trainer/clients/${selectedTask.client.id}`} className="ascend-pressable mt-5 flex min-h-11 items-center justify-center rounded-xl bg-lime text-sm font-semibold text-ink">{queueActionText(selectedTask)}</Link>}{selectedTask.kind === "followup" && selectedTask.unreadCount > 0 && selectedTask.alertId ? <Link href={`/messages?userId=${selectedTask.client.id}`} className="ascend-pressable mt-2 flex min-h-11 items-center justify-center rounded-xl border border-line bg-ink text-sm font-semibold">Reply to {selectedTask.unreadCount} unread</Link> : null}<button type="button" onClick={() => { setSelectedInsightsClientId(selectedTask.client.id); switchView("insights"); }} className="ascend-pressable mt-2 flex min-h-11 w-full items-center justify-center rounded-xl border border-line bg-ink text-sm font-semibold">View insights graph</button>{selectedTask.kind !== "message" ? <div className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-3"><button type="button" onClick={() => void saveDisposition(selectedTask, "snoozed")} disabled={busy} className="flex min-h-11 items-center justify-center gap-1 rounded-xl text-xs font-semibold text-zinc-300 disabled:opacity-60"><Clock3 size={15} /> Remind tomorrow</button><button type="button" onClick={() => void saveDisposition(selectedTask, "handled")} disabled={busy} className="flex min-h-11 items-center justify-center gap-1 rounded-xl text-xs font-semibold text-lime disabled:opacity-60"><Check size={15} /> Mark handled</button></div> : null}</section></div> : null}
  </div>;
}

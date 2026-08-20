"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { calculateNutritionTargets } from "@ascend/shared";
import { AlertTriangle, Check, MessageSquare, Search, TrendingUp } from "lucide-react";
import { getMe, getTrainerClients, getTrainerRiskAlerts, sendTrainerClientPraise, updateTrainerRiskAlert } from "@/lib/ascendApi";
import { MetricCard } from "@/components/MetricCard";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { DelightEmptyState } from "@/components/Delight";
import { AscendHeroPanel, PrioritySigil } from "@/components/AscendVisualIdentity";
import { buildAthleteCoachInsights, daysSince } from "@/lib/coachIntelligence";
import { DashboardHeroSkeleton, SectionShell, SkeletonCardList, SkeletonStatGrid, SkeletonText } from "@/components/PerceivedLoading";

type TrainerClient = Awaited<ReturnType<typeof getTrainerClients>>["clients"][number];
type RiskAlert = Awaited<ReturnType<typeof getTrainerRiskAlerts>>["alerts"][number];

function formatGoal(goal?: string | null) {
  if (goal === "fat_loss") return "Fat loss";
  if (goal === "muscle_gain") return "Muscle gain";
  if (goal === "maintenance") return "Maintenance";
  return "Goal not set";
}

export function riskLabel(client: TrainerClient) {
  if (client.risk_severity === "high") return "High risk";
  if (client.risk_severity) return "Watch";
  if (client.compliance_score === null || client.compliance_score === undefined) return "No score";
  const score = Number(client.compliance_score);
  if (score < 50) return "High risk";
  if (score < 70) return "Watch";
  return "On track";
}

function riskClass(label: string) {
  if (label === "High risk") return "bg-amber text-ink";
  if (label === "Watch") return "bg-calm text-ink";
  return "bg-lime text-ink";
}

function daysAgo(value?: string | null) {
  if (!value) return "No check-in yet";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "No check-in yet";
  const days = Math.floor((Date.now() - time) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

function isRecent(value?: string | null, days = 7) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && Date.now() - time <= days * 24 * 60 * 60 * 1000;
}

function asNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

function nutritionSummary(client: TrainerClient) {
  const calories = asNumber(client.calories_today);
  if (!calories) return "No food logged yet";

  const targets = calculateNutritionTargets({
    goalType: client.goal_type,
    sex: client.gender === "female" || client.gender === "male" ? client.gender : "prefer_not_to_say",
    ageYears: client.age_years,
    heightCm: client.height_cm,
    weightKg: client.latest_weight_kg ?? client.starting_weight_kg,
    targetWeightKg: client.target_weight_kg,
    activityLevel:
      client.activity_level === "low" || client.activity_level === "moderate" || client.activity_level === "high"
        ? client.activity_level
        : "moderate",
    bodyComposition: client.athlete_mode_enabled ? client.body_composition_nutrition ?? undefined : undefined
  });
  const labels: string[] = [];
  if (calories > targets.calorieTarget * 1.08) labels.push("Over calories");
  if (asNumber(client.protein_g_today) < targets.proteinTargetG * 0.55 && calories > targets.calorieTarget * 0.35) labels.push("Low protein");
  if (asNumber(client.fat_g_today) > targets.fatTargetG * 0.75) labels.push("High fat");
  if (asNumber(client.carbs_g_today) > targets.carbsTargetG * 0.8) labels.push("High carbs");
  return labels.length ? labels.slice(0, 2).join(", ") : "On track";
}

function nutritionSummaryClass(summary: string) {
  if (summary === "On track") return "text-lime";
  if (summary === "No food logged yet") return "text-zinc-500";
  return "text-amber";
}

type PriorityCard = {
  client: TrainerClient;
  badge: "Premium" | "Athlete";
  reason: string;
  action: string;
  lastActivity: string;
  score: number;
  alertId?: string;
};

function maxDate(...values: Array<string | null | undefined>) {
  const times = values.map((value) => (value ? new Date(value).getTime() : 0)).filter((value) => Number.isFinite(value) && value > 0);
  if (!times.length) return null;
  return new Date(Math.max(...times)).toISOString();
}

function membershipBadge(client: TrainerClient): "Premium" | "Athlete" | null {
  if (client.athlete_mode_enabled) return "Athlete";
  return client.current_plan === "premium" || client.current_plan === "trainer_pro" ? "Premium" : null;
}

export function lastActivityFor(client: TrainerClient) {
  return client.last_activity_at ?? maxDate(client.last_food_logged_at, client.last_weight_logged_at, client.last_water_logged_at, client.last_client_message_at);
}

function premiumNeedsAttention(client: TrainerClient) {
  const score = Number(client.compliance_score ?? 100);
  const lastFood = daysSince(client.last_food_logged_at);
  const lastWater = daysSince(client.last_water_logged_at);
  const lastWeight = daysSince(client.last_weight_logged_at);
  const openAlerts = Number(client.open_alerts ?? 0);

  if (client.risk_severity === "high" || score < 50 || openAlerts > 0) {
    return { reason: "Momentum needs attention", action: "Send a quick supportive check-in.", score: 95 };
  }
  if (lastFood === null || lastFood >= 5) {
    return { reason: "No food logs for 5+ days", action: "Ask what made logging harder this week.", score: 85 };
  }
  if (lastWeight !== null && lastWeight >= 10) {
    return { reason: "Weight update is overdue", action: "Ask for a simple weight check-in.", score: 70 };
  }
  if (lastWater !== null && lastWater >= 5) {
    return { reason: "Water tracking has dropped", action: "Prompt one easy water target today.", score: 60 };
  }
  return null;
}

function premiumGreatProgress(client: TrainerClient) {
  const score = Number(client.compliance_score ?? 0);
  const streak = Number(client.consistency_streak ?? 0);
  const nutrition = nutritionSummary(client);

  if (client.goal_achieved_at) return { reason: "Goal achieved", action: "Celebrate the win and plan maintenance.", score: 100 };
  if (streak >= 5) return { reason: `${streak}-day consistency streak`, action: "Send praise to reinforce the habit.", score: 80 };
  if (score >= 80 && nutrition === "On track") return { reason: "Consistent nutrition and momentum", action: "Keep the current plan steady.", score: 70 };
  return null;
}

export function trainerPriorityCards(clients: TrainerClient[], alerts: RiskAlert[] = []) {
  const eligible = clients.filter((client) => membershipBadge(client));
  const needsAttention: PriorityCard[] = [];
  const greatProgress: PriorityCard[] = [];
  const alertByClient = new Map<string, RiskAlert>();
  for (const alert of alerts) {
    if (!alertByClient.has(alert.user_id)) alertByClient.set(alert.user_id, alert);
  }

  for (const client of eligible) {
    const badge = membershipBadge(client)!;
    const athleteInsight = client.athlete_mode_enabled
      ? buildAthleteCoachInsights({
          athlete: {
            profile: {
              user_id: client.id,
              enabled: true,
              goal_weight_kg: client.target_weight_kg,
              current_weight_kg: client.latest_weight_kg ?? client.starting_weight_kg
            }
          },
          summary: client.body_composition_summary ?? null
        })[0]
      : null;
    const premiumAttention = premiumNeedsAttention(client);
    const premiumProgress = premiumGreatProgress(client);
    const lastActivity = daysAgo(lastActivityFor(client));
    const riskAlert = alertByClient.get(client.id);

    if (riskAlert) {
      needsAttention.push({
        client,
        badge,
        reason: riskAlert.message,
        action: riskAlert.severity === "high" ? "Review this signal and contact the client today." : "Review the signal at the next useful touchpoint.",
        lastActivity,
        score: riskAlert.severity === "high" ? 120 : riskAlert.severity === "medium" ? 100 : 80,
        alertId: riskAlert.id
      });
      continue;
    }

    if (athleteInsight && ["red", "orange", "yellow"].includes(athleteInsight.tone)) {
      needsAttention.push({ client, badge, reason: athleteInsight.title, action: athleteInsight.action, lastActivity, score: athleteInsight.priority + 10 });
      continue;
    }
    if (premiumAttention) {
      needsAttention.push({ client, badge, reason: premiumAttention.reason, action: premiumAttention.action, lastActivity, score: premiumAttention.score });
      continue;
    }
    if (athleteInsight && ["green", "blue"].includes(athleteInsight.tone)) {
      greatProgress.push({ client, badge, reason: athleteInsight.title, action: athleteInsight.action, lastActivity, score: athleteInsight.priority + 10 });
      continue;
    }
    if (premiumProgress) {
      greatProgress.push({ client, badge, reason: premiumProgress.reason, action: premiumProgress.action, lastActivity, score: premiumProgress.score });
    }
  }

  return {
    eligible,
    needsAttention: needsAttention.sort((a, b) => b.score - a.score),
    greatProgress: greatProgress.sort((a, b) => b.score - a.score)
  };
}

function weeklyClientSummary(clients: TrainerClient[], priorities = trainerPriorityCards(clients)) {
  const athleteClients = clients.filter((client) => client.athlete_mode_enabled);
  const bodyScansDue = athleteClients.filter((client) => {
    const latestScanDate = client.body_composition_summary?.latestScan?.scanDate ?? null;
    const age = daysSince(latestScanDate);
    return age === null || age > 28;
  }).length;
  const checkInsDue = priorities.needsAttention.filter((item) => item.reason.includes("No food") || item.reason.includes("Momentum") || item.reason.includes("Water")).length;
  const plateaued = priorities.needsAttention.filter((item) => item.reason.toLowerCase().includes("plateau")).length;
  const goalAchievements = clients.filter((client) => client.goal_achieved_at).length;

  return {
    improving: priorities.greatProgress.length,
    plateaued,
    atRisk: priorities.needsAttention.length,
    checkInsDue,
    bodyScansDue,
    goalAchievements
  };
}

export function countActiveToday(clients: TrainerClient[]) {
  return clients.filter((client) => client.active_today === true).length;
}

export function countHighRiskClients(clients: TrainerClient[], alerts: RiskAlert[]) {
  const eligibleIds = new Set(clients.filter((client) => membershipBadge(client)).map((client) => client.id));
  const clientIds = new Set(clients.filter((client) => eligibleIds.has(client.id) && riskLabel(client) === "High risk").map((client) => client.id));
  alerts.filter((alert) => alert.severity === "high" && eligibleIds.has(alert.user_id)).forEach((alert) => clientIds.add(alert.user_id));
  return clientIds.size;
}

function PriorityClientCard({
  item,
  type,
  onResolve,
  resolving
}: {
  item: PriorityCard;
  type: "attention" | "progress";
  onResolve?: (item: PriorityCard) => void;
  resolving?: boolean;
}) {
  const border = type === "attention" ? "border-line border-l-4 border-l-amber bg-ink/55" : "border-line border-l-4 border-l-lime bg-ink/55";
  const badgeClass = item.badge === "Athlete" ? "border-purple-400/50 bg-purple-400/10 text-purple-100" : "border-teal-400/50 bg-teal-400/10 text-teal-100";
  return (
    <article className={`rounded-xl border p-4 ${border}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <ProfileAvatar src={item.client.profile_photo_url} name={item.client.full_name} size="sm" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-semibold text-white">{item.client.full_name}</p>
              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badgeClass}`}>{item.badge}</span>
            </div>
            <p className="mt-2 text-sm font-semibold text-white">{item.reason}</p>
            <p className="mt-1 text-xs leading-5 text-zinc-300">Suggested action: {item.action}</p>
            <p className="mt-1 text-xs text-zinc-500">Last activity: {item.lastActivity}</p>
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link href={`/trainer/clients/${item.client.id}`} className="ascend-pressable flex h-11 items-center justify-center rounded-xl border border-line bg-surface text-sm font-semibold">
          View
        </Link>
        <Link href={`/messages?userId=${item.client.id}`} className="ascend-pressable flex h-11 items-center justify-center rounded-xl bg-lime text-sm font-semibold text-ink">
          Message
        </Link>
        {item.alertId && onResolve ? (
          <button
            type="button"
            disabled={resolving}
            onClick={() => onResolve(item)}
            className="ascend-pressable col-span-2 flex h-11 items-center justify-center gap-1 rounded-xl border border-lime/40 bg-lime/10 text-sm font-semibold text-lime disabled:opacity-60"
          >
            <Check size={15} /> Handled
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function TrainerDashboardClient() {
  const [clients, setClients] = useState<TrainerClient[]>([]);
  const [alerts, setAlerts] = useState<RiskAlert[]>([]);
  const [status, setStatus] = useState("Loading assigned clients...");
  const [isPendingApproval, setIsPendingApproval] = useState(false);
  const [praisingClientId, setPraisingClientId] = useState("");
  const [resolvingAlertId, setResolvingAlertId] = useState("");
  const [trainerName, setTrainerName] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [clientFilter, setClientFilter] = useState<"all" | "attention" | "unread" | "on_track">("all");

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const profile = await getMe();
        if (isMounted) setTrainerName(profile.user.full_name || profile.user.email || "Coach");
        const isTrainerOnly = profile.roles.includes("trainer") && !profile.roles.some((role) => role === "owner" || role === "admin");
        if (isTrainerOnly && profile.user.trainer_status && profile.user.trainer_status !== "active") {
          if (!isMounted) return;
          setIsPendingApproval(true);
          setStatus("");
          return;
        }

        const [clientResponse, alertResponse] = await Promise.all([
          getTrainerClients(),
          getTrainerRiskAlerts().catch(() => null)
        ]);
        if (!isMounted) return;
        setClients(clientResponse.clients);
        setStatus("");

        if (alertResponse) {
          setAlerts(alertResponse.alerts);
        }
      } catch (error) {
        if (isMounted) {
          setStatus(error instanceof Error ? error.message : "Could not load trainer dashboard. Please log in again.");
        }
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, []);

  const activeToday = useMemo(() => countActiveToday(clients), [clients]);
  const highRisk = useMemo(() => countHighRiskClients(clients, alerts), [alerts, clients]);
  const averageScore = useMemo(() => {
    const scored = clients.map((client) => Number(client.compliance_score)).filter((score) => Number.isFinite(score));
    if (!scored.length) return "--";
    return String(Math.round(scored.reduce((total, score) => total + score, 0) / scored.length));
  }, [clients]);
  const sortedClients = useMemo(
    () =>
      [...clients].sort((a, b) => {
        const aRisk = riskLabel(a) === "High risk" ? 0 : riskLabel(a) === "Watch" ? 1 : 2;
        const bRisk = riskLabel(b) === "High risk" ? 0 : riskLabel(b) === "Watch" ? 1 : 2;
        if (aRisk !== bRisk) return aRisk - bRisk;
        return Number(a.compliance_score ?? 999) - Number(b.compliance_score ?? 999);
      }),
    [clients]
  );
  const nutritionSummaryMap = useMemo(
    () =>
      new Map(
        clients.map((client) => [client.id, nutritionSummary(client)])
      ),
    [clients]
  );
  const priorities = useMemo(() => trainerPriorityCards(clients, alerts), [alerts, clients]);
  const weeklySummary = useMemo(() => weeklyClientSummary(clients, priorities), [clients, priorities]);
  const athleteAttention = useMemo(() => priorities.needsAttention.filter((item) => item.badge === "Athlete").length, [priorities.needsAttention]);
  const premiumAttention = useMemo(() => priorities.needsAttention.filter((item) => item.badge === "Premium").length, [priorities.needsAttention]);
  const excellentProgress = priorities.greatProgress.length;
  const needsCheckIn = priorities.needsAttention.length;
  const unreadMessages = useMemo(() => clients.reduce((total, client) => total + Number(client.unread_messages ?? 0), 0), [clients]);
  const visibleClients = useMemo(() => {
    const query = clientSearch.trim().toLowerCase();
    const attentionIds = new Set(priorities.needsAttention.map((item) => item.client.id));
    return sortedClients.filter((client) => {
      if (query && !`${client.full_name} ${client.email}`.toLowerCase().includes(query)) return false;
      if (clientFilter === "attention") return attentionIds.has(client.id);
      if (clientFilter === "unread") return Number(client.unread_messages ?? 0) > 0;
      if (clientFilter === "on_track") return riskLabel(client) === "On track";
      return true;
    });
  }, [clientFilter, clientSearch, priorities.needsAttention, sortedClients]);
  const isInitialLoading = !clients.length && !alerts.length && !trainerName && status.startsWith("Loading");

  async function sendPraise(clientId: string, clientName: string) {
    setPraisingClientId(clientId);
    setStatus("");

    try {
      await sendTrainerClientPraise(clientId);
      setStatus(`Praise sent to ${clientName}.`);
    } catch {
      setStatus("Could not send praise yet. Make sure this client is assigned to you.");
    } finally {
      setPraisingClientId("");
    }
  }

  async function resolveAlert(item: PriorityCard) {
    if (!item.alertId) return;
    setResolvingAlertId(item.alertId);
    setStatus("");
    try {
      await updateTrainerRiskAlert(item.alertId, "resolved");
      setAlerts((current) => current.filter((alert) => alert.id !== item.alertId));
      setStatus(`${item.client.full_name}'s alert marked handled.`);
    } catch {
      setStatus("Could not update this alert yet. Please try again.");
    } finally {
      setResolvingAlertId("");
    }
  }

  if (isPendingApproval) {
    return (
      <section className="ascend-workspace-section mt-4 border-amber/40 bg-amber/10 p-4">
        <p className="text-sm font-semibold text-amber">Trainer approval pending</p>
        <p className="mt-2 text-sm leading-6 text-zinc-300">
          Your trainer account is created. An owner needs to approve it before clients are assigned.
        </p>
        <Link href="/subscription" className="ascend-pressable mt-4 flex h-11 items-center justify-center rounded-xl bg-lime font-semibold text-ink">
          View plan
        </Link>
      </section>
    );
  }

  if (isInitialLoading) {
    return (
      <>
        <DashboardHeroSkeleton bodyLines={2} />
        <section className="ascend-workspace-section mt-4 p-4">
          <SkeletonStatGrid count={4} />
          <div className="mt-4">
            <SkeletonText lines={1} />
            <div className="mt-3">
              <SkeletonCardList count={2} compact />
            </div>
          </div>
        </section>
        <SectionShell title="Client work queue">
          <SkeletonCardList count={3} compact />
        </SectionShell>
        <p className="ascend-workspace-inset mt-4 p-3 text-sm text-zinc-300">{status}</p>
      </>
    );
  }

  return (
    <>
      <AscendHeroPanel
        eyebrow={`${new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening"}${trainerName ? `, ${trainerName}` : ""}`}
        title="Today's Priorities"
        body="See who needs you, take one useful action, and move on with your coaching day."
        tone="trainer"
        visual={<PrioritySigil count={priorities.needsAttention.length} />}
      />

      {status ? <p className="ascend-workspace-inset mt-4 p-3 text-sm text-zinc-300">{status}</p> : null}

      <section className="ascend-workspace-section mt-4 p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-3">
          <MetricCard label="Needs attention" value={String(needsCheckIn)} detail={`${premiumAttention} Premium / ${athleteAttention} Athlete`} tone={needsCheckIn ? "warning" : "success"} />
          <MetricCard label="Wins to celebrate" value={String(excellentProgress)} detail="Praise opportunities" tone="success" />
          <MetricCard label="Active today" value={String(activeToday)} detail={`of ${clients.length} assigned clients`} />
          <MetricCard label="Unread messages" value={String(unreadMessages)} detail={unreadMessages ? "Waiting for a reply" : "Inbox is clear"} tone={unreadMessages ? "warning" : "success"} />
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(20rem,.75fr)]">
          <div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="text-amber" size={19} />
                <h2 className="text-lg font-semibold">Needs Attention</h2>
              </div>
              {highRisk ? <span className="rounded-full border border-amber/40 bg-amber/10 px-3 py-1 text-xs font-semibold text-amber">{highRisk} high priority</span> : null}
            </div>
            <div className="mt-3 space-y-3">
              {priorities.needsAttention.slice(0, 5).map((item) => (
                <PriorityClientCard key={item.client.id} item={item} type="attention" onResolve={resolveAlert} resolving={resolvingAlertId === item.alertId} />
              ))}
              {!priorities.needsAttention.length ? (
                <p className="rounded-xl border border-lime/40 bg-lime/10 p-3 text-sm leading-6 text-zinc-200">No urgent Premium or Athlete client priorities right now.</p>
              ) : null}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <TrendingUp className="text-teal-300" size={19} />
              <h2 className="text-lg font-semibold">Great Progress</h2>
            </div>
            <div className="mt-3 space-y-3">
              {priorities.greatProgress.slice(0, 3).map((item) => <PriorityClientCard key={item.client.id} item={item} type="progress" />)}
              {!priorities.greatProgress.length ? (
                <DelightEmptyState tone="lime" title="No wins missed." body="Ascend will surface the next moment worth celebrating as clients build consistency." />
              ) : null}
            </div>
          </div>
        </div>

        <details className="ascend-workspace-inset mt-4 p-4">
          <summary className="cursor-pointer list-none text-sm font-semibold text-zinc-200">Weekly overview</summary>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
            <p className="ascend-workspace-stat min-h-0 p-3"><span className="block text-lg font-semibold text-teal-200">{weeklySummary.improving}</span>Improving</p>
            <p className="ascend-workspace-stat min-h-0 p-3"><span className="block text-lg font-semibold text-amber">{weeklySummary.plateaued}</span>Plateaued</p>
            <p className="ascend-workspace-stat min-h-0 p-3"><span className="block text-lg font-semibold text-amber">{weeklySummary.checkInsDue}</span>Check-ins due</p>
            <p className="ascend-workspace-stat min-h-0 p-3"><span className="block text-lg font-semibold text-purple-200">{weeklySummary.bodyScansDue}</span>Scans due</p>
            <p className="ascend-workspace-stat min-h-0 p-3"><span className="block text-lg font-semibold text-lime">{weeklySummary.goalAchievements}</span>Goals reached</p>
            <p className="ascend-workspace-stat min-h-0 p-3"><span className="block text-lg font-semibold text-white">{averageScore}</span>Avg Momentum</p>
          </div>
        </details>
      </section>

      <section className="ascend-workspace-section mt-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">All Clients</h2>
            <p className="mt-1 text-xs text-zinc-500">Search or filter without losing today&apos;s priority order.</p>
          </div>
          <Link href="/messages" className="ascend-pressable flex h-11 items-center gap-2 rounded-xl border border-calm/40 bg-calm/10 px-4 text-sm font-semibold text-calm">
            <MessageSquare size={17} /> Messages
          </Link>
        </div>
        <label className="mt-4 flex h-12 items-center gap-2 rounded-xl border border-line bg-ink px-3 focus-within:border-calm/50">
          <Search size={18} className="text-zinc-500" />
          <input value={clientSearch} onChange={(event) => setClientSearch(event.target.value)} placeholder="Search clients" className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none" />
        </label>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {([['all', 'All'], ['attention', 'Attention'], ['unread', 'Unread'], ['on_track', 'On track']] as const).map(([value, label]) => (
            <button key={value} type="button" onClick={() => setClientFilter(value)} className={`h-10 shrink-0 rounded-full border px-4 text-sm font-semibold ${clientFilter === value ? "border-lime bg-lime text-ink" : "border-line bg-ink text-zinc-300"}`}>{label}</button>
          ))}
        </div>
        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          {visibleClients.length ? (
            visibleClients.map((client) => {
              const score = client.compliance_score;
              const label = riskLabel(client);
              return (
                <article key={client.id} className="ascend-workspace-inset p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 gap-3">
                      <ProfileAvatar src={client.profile_photo_url} name={client.full_name} size="sm" />
                      <div className="min-w-0">
                      <p className="font-medium">{client.full_name}</p>
                      <p className="mt-1 text-xs text-zinc-400">{formatGoal(client.goal_type)}</p>
                      {Number(client.unread_messages ?? 0) > 0 ? <p className="mt-2 inline-flex rounded-full bg-calm/15 px-2 py-1 text-xs font-semibold text-calm">{Number(client.unread_messages)} unread</p> : null}
                      {client.goal_achieved_at ? (
                        <p className="mt-2 inline-flex rounded bg-lime px-2 py-1 text-xs font-semibold text-ink">Goal achieved</p>
                      ) : isRecent(client.goal_updated_at) ? (
                        <p className="mt-2 inline-flex rounded bg-calm/15 px-2 py-1 text-xs font-semibold text-calm">Goal updated</p>
                      ) : null}
                      {Number(client.consistency_streak ?? 0) >= 2 ? (
                        <p className="mt-2 inline-flex rounded bg-lime/10 px-2 py-1 text-xs font-semibold text-lime">
                          {Number(client.consistency_streak)}-day streak
                        </p>
                      ) : null}
                      <p className={`mt-2 text-xs font-semibold ${nutritionSummaryClass(nutritionSummaryMap.get(client.id) ?? "No food logged yet")}`}>
                        Nutrition: {nutritionSummaryMap.get(client.id) ?? "No food logged yet"}
                      </p>
                      <p className="mt-2 text-xs text-zinc-500">Last activity: {daysAgo(lastActivityFor(client))}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={(score ?? 100) < 50 ? "font-semibold text-amber" : "font-semibold text-lime"}>
                        {score ?? "--"}/100
                      </p>
                      <span className={`mt-2 inline-block rounded px-2 py-1 text-xs ${riskClass(label)}`}>{label}</span>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <Link href={`/trainer/clients/${client.id}`} className="ascend-pressable flex h-11 items-center justify-center rounded-xl border border-line bg-surface text-sm font-semibold">
                      View
                    </Link>
                    <Link href={`/messages?userId=${client.id}`} className="ascend-pressable flex h-11 items-center justify-center rounded-xl bg-lime text-sm font-semibold text-ink">
                      Message
                    </Link>
                    <button
                      type="button"
                      disabled={praisingClientId === client.id}
                      onClick={() => sendPraise(client.id, client.full_name)}
                      className="ascend-pressable h-11 rounded-xl border border-lime/40 bg-lime/10 text-sm font-semibold text-lime disabled:opacity-60"
                    >
                      Praise
                    </button>
                  </div>
                </article>
              );
            })
          ) : (
            <DelightEmptyState
              tone="purple"
              title={clients.length ? "No clients match this view." : "Your coaching list is ready when clients are."}
              body={clients.length ? "Clear the search or choose another filter." : "Once an owner assigns members to this trainer, today's priorities will appear here."}
            />
          )}
        </div>
      </section>
    </>
  );
}

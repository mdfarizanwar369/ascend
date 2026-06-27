"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { calculateNutritionTargets } from "@ascend/shared";
import { AlertTriangle, CheckCircle2, MessageSquare, Sparkles, Target, TrendingUp } from "lucide-react";
import { getMe, getTrainerAttention, getTrainerClients, getTrainerRiskAlerts, sendTrainerClientPraise } from "@/lib/ascendApi";
import { MetricCard } from "@/components/MetricCard";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { DelightEmptyState } from "@/components/Delight";
import { buildAthleteCoachInsights, daysSince } from "@/lib/coachIntelligence";

type TrainerClient = Awaited<ReturnType<typeof getTrainerClients>>["clients"][number];
type RiskAlert = Awaited<ReturnType<typeof getTrainerRiskAlerts>>["alerts"][number];
type TrainerAttention = Awaited<ReturnType<typeof getTrainerAttention>>;

function formatGoal(goal?: string | null) {
  if (goal === "fat_loss") return "Fat loss";
  if (goal === "muscle_gain") return "Muscle gain";
  if (goal === "maintenance") return "Maintenance";
  return "Goal not set";
}

function riskLabel(client: TrainerClient) {
  if (client.compliance_score === null || client.compliance_score === undefined) return "No score";
  const score = Number(client.compliance_score);
  if (client.risk_severity === "high" || score < 50) return "High risk";
  if (client.risk_severity || score < 70) return "Watch";
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

function lastActivityFor(client: TrainerClient) {
  return maxDate(client.last_food_logged_at, client.last_weight_logged_at, client.last_water_logged_at, client.last_client_message_at);
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

function trainerPriorityCards(clients: TrainerClient[]) {
  const eligible = clients.filter((client) => membershipBadge(client));
  const needsAttention: PriorityCard[] = [];
  const greatProgress: PriorityCard[] = [];

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

function weeklyClientSummary(clients: TrainerClient[]) {
  const priorities = trainerPriorityCards(clients);
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

function PriorityClientCard({ item, type }: { item: PriorityCard; type: "attention" | "progress" }) {
  const border = type === "attention" ? "border-amber/40 bg-amber/10" : "border-teal-400/40 bg-teal-400/10";
  const badgeClass = item.badge === "Athlete" ? "border-purple-400/50 bg-purple-400/10 text-purple-100" : "border-teal-400/50 bg-teal-400/10 text-teal-100";
  return (
    <article className={`rounded-lg border p-3 ${border}`}>
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
        <Link href={`/trainer/clients/${item.client.id}`} className="flex h-10 items-center justify-center rounded-lg border border-line bg-surface text-sm font-semibold">
          View Client
        </Link>
        <Link href={`/messages?userId=${item.client.id}`} className="flex h-10 items-center justify-center rounded-lg bg-lime text-sm font-semibold text-ink">
          Message Client
        </Link>
      </div>
    </article>
  );
}

export function TrainerDashboardClient() {
  const [clients, setClients] = useState<TrainerClient[]>([]);
  const [alerts, setAlerts] = useState<RiskAlert[]>([]);
  const [attention, setAttention] = useState<TrainerAttention | null>(null);
  const [status, setStatus] = useState("Loading assigned clients...");
  const [isPendingApproval, setIsPendingApproval] = useState(false);
  const [praisingClientId, setPraisingClientId] = useState("");
  const [trainerName, setTrainerName] = useState("");

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

        const [clientResponse, attentionResponse] = await Promise.all([getTrainerClients(), getTrainerAttention().catch(() => null)]);
        if (!isMounted) return;
        setClients(clientResponse.clients);
        if (attentionResponse) setAttention(attentionResponse);
        setStatus("");

        const alertResponse = await getTrainerRiskAlerts().catch(() => null);
        if (!isMounted) return;
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

  const activeToday = useMemo(() => clients.filter((client) => Number(client.compliance_score ?? 0) > 0).length, [clients]);
  const highRisk = useMemo(
    () => clients.filter((client) => riskLabel(client) === "High risk").length + alerts.filter((alert) => alert.severity === "high").length,
    [alerts, clients]
  );
  const averageScore = useMemo(() => {
    const scored = clients.map((client) => Number(client.compliance_score)).filter((score) => Number.isFinite(score));
    if (!scored.length) return "--";
    return String(Math.round(scored.reduce((total, score) => total + score, 0) / scored.length));
  }, [clients]);
  const needsCheckIn = useMemo(
    () => attention?.summary.needsAttention ?? clients.filter((client) => riskLabel(client) !== "On track" || !client.last_food_logged_at).length,
    [attention?.summary.needsAttention, clients]
  );
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
  const priorities = useMemo(() => trainerPriorityCards(clients), [clients]);
  const weeklySummary = useMemo(() => weeklyClientSummary(clients), [clients]);
  const athleteAttention = useMemo(() => priorities.needsAttention.filter((item) => item.badge === "Athlete").length, [priorities.needsAttention]);
  const premiumAttention = useMemo(() => priorities.needsAttention.filter((item) => item.badge === "Premium").length, [priorities.needsAttention]);
  const excellentProgress = priorities.greatProgress.length;

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

  if (isPendingApproval) {
    return (
      <section className="mt-4 rounded-lg border border-amber/40 bg-amber/10 p-4">
        <p className="text-sm font-semibold text-amber">Trainer approval pending</p>
        <p className="mt-2 text-sm leading-6 text-zinc-300">
          Your trainer account is created. An owner needs to approve it before clients are assigned.
        </p>
        <Link href="/subscription" className="mt-4 flex h-11 items-center justify-center rounded-lg bg-lime font-semibold text-ink">
          View plan
        </Link>
      </section>
    );
  }

  return (
    <>
      <section className="mt-3">
        <p className="text-sm text-zinc-400">Good morning{trainerName ? `, ${trainerName}` : ""}</p>
        <h1 className="text-2xl font-semibold">Today's Priorities</h1>
        <p className="mt-2 text-sm text-zinc-400">The fastest view of who needs attention and who deserves recognition.</p>
      </section>

      {status ? <p className="mt-4 rounded-lg border border-line bg-surface p-3 text-sm text-zinc-300">{status}</p> : null}

      <section className="mt-4 rounded-lg border border-teal-400/40 bg-gradient-to-br from-teal-400/15 via-surface to-purple-400/10 p-4">
        <div className="grid grid-cols-2 gap-3">
          <MetricCard label="Premium attention" value={String(premiumAttention)} detail="Need check-in" tone={premiumAttention ? "warning" : "success"} />
          <MetricCard label="Athlete attention" value={String(athleteAttention)} detail="Coach intelligence" tone={athleteAttention ? "warning" : "success"} />
          <MetricCard label="Great progress" value={String(excellentProgress)} detail="Praise opportunities" tone="success" />
          <MetricCard label="Tracked clients" value={String(priorities.eligible.length)} detail="Premium + Athlete" />
        </div>

        <div className="mt-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="text-amber" size={19} />
            <h2 className="text-lg font-semibold">Needs Attention</h2>
          </div>
          <div className="mt-3 space-y-3">
            {priorities.needsAttention.slice(0, 5).map((item) => <PriorityClientCard key={item.client.id} item={item} type="attention" />)}
            {!priorities.needsAttention.length ? (
              <p className="rounded-lg border border-lime/40 bg-lime/10 p-3 text-sm leading-6 text-zinc-200">No urgent Premium or Athlete client priorities right now.</p>
            ) : null}
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="text-teal-300" size={19} />
            <h2 className="text-lg font-semibold">Great Progress</h2>
          </div>
          <div className="mt-3 space-y-3">
            {priorities.greatProgress.slice(0, 4).map((item) => <PriorityClientCard key={item.client.id} item={item} type="progress" />)}
            {!priorities.greatProgress.length ? (
            <DelightEmptyState
              tone="lime"
              title="No wins missed."
              body="As clients log meals, weight, water, workouts, or Body Scans, Ascend will surface the moments worth celebrating."
            />
            ) : null}
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-line bg-ink p-3">
          <div className="flex items-center gap-2">
            <Target className="text-purple-300" size={18} />
            <h2 className="text-sm font-semibold">Today's Summary</h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-zinc-300">
            {priorities.needsAttention.length
              ? `${priorities.needsAttention.length} client${priorities.needsAttention.length === 1 ? "" : "s"} need a trainer touchpoint.`
              : "No urgent follow-ups. Keep the tone positive and reinforce consistency."}
          </p>
        </div>

        <div className="mt-4 rounded-lg border border-line bg-ink p-3">
          <h2 className="text-sm font-semibold">Weekly Client Summary</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <p className="rounded-lg bg-surface p-3"><span className="block text-lg font-semibold text-teal-200">{weeklySummary.improving}</span>Clients improving</p>
            <p className="rounded-lg bg-surface p-3"><span className="block text-lg font-semibold text-amber">{weeklySummary.plateaued}</span>Clients plateaued</p>
            <p className="rounded-lg bg-surface p-3"><span className="block text-lg font-semibold text-amber">{weeklySummary.atRisk}</span>Clients at risk</p>
            <p className="rounded-lg bg-surface p-3"><span className="block text-lg font-semibold text-amber">{weeklySummary.checkInsDue}</span>Check-ins due</p>
            <p className="rounded-lg bg-surface p-3"><span className="block text-lg font-semibold text-purple-200">{weeklySummary.bodyScansDue}</span>Body Scans due</p>
            <p className="rounded-lg bg-surface p-3"><span className="block text-lg font-semibold text-lime">{weeklySummary.goalAchievements}</span>Goal achievements</p>
          </div>
        </div>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3">
        <MetricCard label="Clients" value={String(clients.length)} detail={`${activeToday} active today`} />
        <MetricCard label="Avg score" value={averageScore} detail="Momentum" tone={averageScore !== "--" && Number(averageScore) < 60 ? "warning" : "success"} />
        <MetricCard label="Check-ins" value={String(needsCheckIn)} detail="Need attention" tone={needsCheckIn ? "warning" : "success"} />
        <MetricCard label="Alerts" value={String(alerts.length || highRisk)} detail={`${highRisk} high priority`} tone={highRisk ? "warning" : "success"} />
      </section>

      {attention ? (
        <section className={`mt-4 rounded-lg border p-4 ${attention.summary.allClear ? "border-lime/40 bg-lime/10" : "border-amber/40 bg-amber/10"}`}>
          <div className="flex items-start gap-3">
            {attention.summary.allClear ? (
              <CheckCircle2 className="mt-0.5 text-lime" size={22} />
            ) : (
              <AlertTriangle className="mt-0.5 text-amber" size={22} />
            )}
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-semibold ${attention.summary.allClear ? "text-lime" : "text-amber"}`}>
                {attention.summary.allClear ? "All clear today" : "Clients needing attention today"}
              </p>
              <p className="mt-2 text-sm leading-6 text-zinc-300">
                {attention.summary.allClear
                  ? "No urgent client check-ins. Your client group is staying connected."
                  : `${attention.summary.needsAttention} client${attention.summary.needsAttention === 1 ? "" : "s"} may need a quick check-in.`}
              </p>
            </div>
          </div>

          {attention.attention.length ? (
            <div className="mt-4 space-y-3">
              {attention.attention.map((client) => (
                <article key={client.id} className="rounded-lg bg-ink p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 gap-3">
                      <ProfileAvatar src={client.profile_photo_url} name={client.full_name} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{client.full_name}</p>
                        <p className="mt-1 text-sm text-amber">{client.reason}</p>
                        <p className="mt-1 text-xs leading-5 text-zinc-400">{client.detail}</p>
                      </div>
                    </div>
                    <span className="shrink-0 rounded bg-surface px-2 py-1 text-xs text-zinc-300">
                      {client.current_score ?? "--"}/100
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <Link href={`/messages?userId=${client.id}`} className="flex h-10 items-center justify-center rounded-lg bg-lime text-sm font-semibold text-ink">
                      Message
                    </Link>
                    <Link href={`/trainer/clients/${client.id}`} className="flex h-10 items-center justify-center rounded-lg border border-line bg-surface text-sm font-semibold">
                      View
                    </Link>
                    <button
                      type="button"
                      disabled={praisingClientId === client.id}
                      onClick={() => sendPraise(client.id, client.full_name)}
                      className="h-10 rounded-lg border border-lime/40 bg-lime/10 text-sm font-semibold text-lime disabled:opacity-60"
                    >
                      Praise
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {alerts[0] ? (
        <section className="mt-4 rounded-lg border border-amber/40 bg-amber/10 p-4">
          <div className="flex items-start gap-3">
            <ProfileAvatar src={alerts[0].profile_photo_url} name={alerts[0].full_name} size="sm" />
            <div>
              <p className="text-sm font-semibold text-amber">Client risk alert</p>
              {alerts[0].full_name ? <p className="mt-1 text-sm font-medium text-white">{alerts[0].full_name}</p> : null}
              <p className="mt-1 text-sm leading-6 text-zinc-300">{alerts[0].message}</p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="mt-4 rounded-lg border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Client work queue</h2>
          <span className="rounded bg-ink px-3 py-1 text-xs text-zinc-300">Risk first</span>
        </div>
        <div className="mt-3 space-y-3">
          {sortedClients.length ? (
            sortedClients.map((client) => {
              const score = client.compliance_score;
              const label = riskLabel(client);
              return (
                <article key={client.id} className="rounded-lg bg-ink p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 gap-3">
                      <ProfileAvatar src={client.profile_photo_url} name={client.full_name} size="sm" />
                      <div className="min-w-0">
                      <p className="font-medium">{client.full_name}</p>
                      <p className="mt-1 text-xs text-zinc-400">{formatGoal(client.goal_type)}</p>
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
                      <p className={`mt-2 text-xs font-semibold ${nutritionSummaryClass(nutritionSummary(client))}`}>
                        Nutrition: {nutritionSummary(client)}
                      </p>
                      <p className="mt-2 text-xs text-zinc-500">Food: {daysAgo(client.last_food_logged_at)} / Weight: {daysAgo(client.last_weight_logged_at)}</p>
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
                    <Link href={`/trainer/clients/${client.id}`} className="flex h-10 items-center justify-center rounded-lg border border-line bg-surface text-sm font-semibold">
                      View
                    </Link>
                    <Link href={`/messages?userId=${client.id}`} className="flex h-10 items-center justify-center rounded-lg bg-lime text-sm font-semibold text-ink">
                      Message
                    </Link>
                    <button
                      type="button"
                      disabled={praisingClientId === client.id}
                      onClick={() => sendPraise(client.id, client.full_name)}
                      className="h-10 rounded-lg border border-lime/40 bg-lime/10 text-sm font-semibold text-lime disabled:opacity-60"
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
              title="Your coaching list is ready when clients are."
              body="Once an owner assigns members to this trainer, today's priorities will appear here."
            />
          )}
        </div>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3">
        <Link
          href={clients[0] ? `/trainer/clients/${clients[0].id}` : "/trainer"}
          className="rounded-lg border border-line bg-surface p-4 text-left"
        >
          <Sparkles className="text-calm" size={20} />
          <span className="mt-3 block text-sm font-medium">AI check-ins</span>
        </Link>
        <Link href={clients[0] ? `/messages?userId=${clients[0].id}` : "/messages"} className="rounded-lg border border-line bg-surface p-4 text-left">
          <MessageSquare className="text-lime" size={20} />
          <span className="mt-3 block text-sm font-medium">Messages</span>
        </Link>
      </section>
    </>
  );
}

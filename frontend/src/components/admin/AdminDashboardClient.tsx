"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BadgeDollarSign,
  Bell,
  Bot,
  Building2,
  CheckCircle2,
  Lightbulb,
  QrCode,
  ShieldCheck,
  Target,
  TrendingUp,
  Users
} from "lucide-react";
import {
  getAdminAiUsage,
  getAdminCompliance,
  getAdminNotifications,
  getAdminPilotMetrics,
  getAdminRevenue,
  getAdminTrainers,
  getAdminUsage,
  getAdminUsers
} from "@/lib/ascendApi";

type Revenue = Awaited<ReturnType<typeof getAdminRevenue>>;
type UsageRow = Awaited<ReturnType<typeof getAdminUsage>>["usage"][number];
type ComplianceRow = Awaited<ReturnType<typeof getAdminCompliance>>["compliance"][number];
type AdminUser = Awaited<ReturnType<typeof getAdminUsers>>["users"][number];
type AdminTrainer = Awaited<ReturnType<typeof getAdminTrainers>>["trainers"][number];
type AiUsage = Awaited<ReturnType<typeof getAdminAiUsage>>;
type PilotMetrics = Awaited<ReturnType<typeof getAdminPilotMetrics>>;
type AdminNotifications = Awaited<ReturnType<typeof getAdminNotifications>>;

type HealthStatus = "Excellent" | "Good" | "Watch" | "Needs Attention";
type Priority = {
  title: string;
  detail: string;
  action: string;
  href?: string;
  tone: "critical" | "warning" | "success" | "info";
};

function money(cents: string | number | null | undefined) {
  return `RM ${(Number(cents ?? 0) / 100).toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function asNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function safeArray<T>(value: T[] | undefined | null) {
  return Array.isArray(value) ? value : [];
}

function percent(value: string | number | null | undefined) {
  return `${Math.round(asNumber(value))}%`;
}

function trendChange(values: number[]) {
  if (values.length < 2) return 0;
  return values[values.length - 1] - values[0];
}

function healthFromScore(score: number): HealthStatus {
  if (score >= 82) return "Excellent";
  if (score >= 65) return "Good";
  if (score >= 45) return "Watch";
  return "Needs Attention";
}

function healthTone(status: HealthStatus) {
  if (status === "Excellent") return "border-lime/40 bg-lime/10 text-lime";
  if (status === "Good") return "border-calm/40 bg-calm/10 text-calm";
  if (status === "Watch") return "border-amber/40 bg-amber/10 text-amber";
  return "border-red-400/40 bg-red-500/10 text-red-300";
}

function cardTone(tone: Priority["tone"]) {
  if (tone === "critical") return "border-red-400/40 bg-red-500/10";
  if (tone === "warning") return "border-amber/40 bg-amber/10";
  if (tone === "success") return "border-lime/40 bg-lime/10";
  return "border-calm/40 bg-calm/10";
}

function StatusPill({ status }: { status: HealthStatus }) {
  return <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${healthTone(status)}`}>{status}</span>;
}

function ExecutiveCard({
  title,
  status,
  value,
  detail
}: {
  title: string;
  status: HealthStatus;
  value: string;
  detail: string;
}) {
  return (
    <article className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-zinc-400">{title}</p>
        <StatusPill status={status} />
      </div>
      <p className="mt-4 text-2xl font-semibold">{value}</p>
      <p className="mt-2 text-sm leading-6 text-zinc-300">{detail}</p>
    </article>
  );
}

function OpportunityCard({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <article className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-sm text-zinc-400">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-lime">{value}</p>
      <p className="mt-2 text-sm leading-6 text-zinc-300">{detail}</p>
    </article>
  );
}

function MiniBar({ value }: { value: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-ink">
      <div className="h-full rounded-full bg-lime" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function AdminDashboardClient() {
  const [revenue, setRevenue] = useState<Revenue>({ byGym: [], byTrainer: [] });
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [compliance, setCompliance] = useState<ComplianceRow[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [trainers, setTrainers] = useState<AdminTrainer[]>([]);
  const [aiUsage, setAiUsage] = useState<AiUsage | null>(null);
  const [pilotMetrics, setPilotMetrics] = useState<PilotMetrics | null>(null);
  const [notifications, setNotifications] = useState<AdminNotifications | null>(null);
  const [status, setStatus] = useState("Loading owner command center...");

  useEffect(() => {
    let isMounted = true;

    async function load() {
      const failures: string[] = [];

      try {
        const revenueResponse = await getAdminRevenue();
        if (!isMounted) return;
        setRevenue({
          byGym: safeArray(revenueResponse.byGym),
          byTrainer: safeArray(revenueResponse.byTrainer)
        });
      } catch (error) {
        failures.push(error instanceof Error ? `Revenue: ${error.message}` : "Revenue failed");
      }

      try {
        const usageResponse = await getAdminUsage();
        if (!isMounted) return;
        setUsage(safeArray(usageResponse.usage));
      } catch (error) {
        failures.push(error instanceof Error ? `Usage: ${error.message}` : "Usage failed");
      }

      try {
        const complianceResponse = await getAdminCompliance();
        if (!isMounted) return;
        setCompliance(safeArray(complianceResponse.compliance));
      } catch (error) {
        failures.push(error instanceof Error ? `Momentum: ${error.message}` : "Momentum failed");
      }

      try {
        const aiUsageResponse = await getAdminAiUsage();
        if (!isMounted) return;
        setAiUsage(aiUsageResponse);
      } catch (error) {
        failures.push(error instanceof Error ? `AI usage: ${error.message}` : "AI usage failed");
      }

      try {
        const pilotMetricsResponse = await getAdminPilotMetrics();
        if (!isMounted) return;
        setPilotMetrics(pilotMetricsResponse);
      } catch (error) {
        failures.push(error instanceof Error ? `Business metrics: ${error.message}` : "Business metrics failed");
      }

      try {
        const notificationsResponse = await getAdminNotifications();
        if (!isMounted) return;
        setNotifications(notificationsResponse);
      } catch (error) {
        failures.push(error instanceof Error ? `Notifications: ${error.message}` : "Notifications failed");
      }

      try {
        const [userResponse, trainerResponse] = await Promise.all([getAdminUsers(), getAdminTrainers()]);
        if (!isMounted) return;
        setUsers(safeArray(userResponse.users));
        setTrainers(safeArray(trainerResponse.trainers));
      } catch (error) {
        failures.push(error instanceof Error ? `Users: ${error.message}` : "Users failed");
      }

      if (!isMounted) return;
      setStatus(failures.length ? `Some business signals did not load. ${failures.join(" / ")}` : "");
    }

    load();
    return () => {
      isMounted = false;
    };
  }, []);

  const byGym = safeArray(revenue.byGym);
  const byTrainer = safeArray(revenue.byTrainer);
  const notificationList = safeArray(notifications?.notifications);
  const totalRevenueCents = byGym.reduce((total, row) => total + asNumber(row.revenue_cents), 0);
  const activeSubscriptions = byGym.reduce((total, row) => total + asNumber(row.active_subscriptions), 0);
  const clientUsers = users.filter((user) => user.primary_role === "client");
  const activeClientUsers = clientUsers.filter((user) => user.status === "active");
  const premiumUsers = clientUsers.filter((user) => user.current_plan === "premium" || user.current_plan === "trainer_pro");
  const athleteUsers = clientUsers.filter((user) => user.athlete_mode_enabled);
  const unassignedClients = activeClientUsers.filter((user) => !user.assigned_trainer_id).length;
  const pendingTrainers = trainers.filter((trainer) => trainer.status !== "active").length;
  const activeTrainers = trainers.filter((trainer) => trainer.status === "active").length;
  const aiSummary = aiUsage?.summary;
  const aiWarning = aiSummary?.warning_level;
  const trends = safeArray(pilotMetrics?.trends);
  const activeTrend = trends.map((item) => asNumber(item.active_users));
  const foodTrend = trends.map((item) => asNumber(item.food_logs));
  const complianceTrend = trends.map((item) => asNumber(item.average_compliance_score));
  const activeChange = trendChange(activeTrend);
  const foodChange = trendChange(foodTrend);
  const averageCompliance = useMemo(() => {
    const scores = compliance.map((row) => asNumber(row.average_compliance)).filter(Boolean);
    if (!scores.length) return pilotMetrics?.clients.averageComplianceScore ?? 0;
    return Math.round(scores.reduce((total, score) => total + score, 0) / scores.length);
  }, [compliance, pilotMetrics?.clients.averageComplianceScore]);

  const memberHealthScore = Math.round(
    (Math.min(100, pilotMetrics?.clients.foodLoggingRate ?? 0) * 0.25) +
    (Math.min(100, pilotMetrics?.clients.waterLoggingRate ?? 0) * 0.15) +
    (Math.min(100, pilotMetrics?.clients.weightLoggingRate ?? 0) * 0.15) +
    (Math.min(100, averageCompliance) * 0.25) +
    (Math.min(100, (pilotMetrics?.clients.weeklyActiveUsers ?? 0) * 10) * 0.2)
  );
  const trainerHealthScore = Math.round(
    (Math.min(100, pilotMetrics?.trainers.trainerResponseRate ?? 0) * 0.45) +
    (activeTrainers ? Math.min(100, ((pilotMetrics?.trainers.dailyTrainerLogins ?? 0) / activeTrainers) * 100) * 0.25 : 0) +
    (unassignedClients ? 35 : 85) * 0.3
  );
  const revenueHealthScore = Math.round(
    (activeSubscriptions ? 75 : 45) +
    Math.min(15, activeSubscriptions * 2) -
    Math.min(20, pilotMetrics?.business.churnRate ?? 0)
  );
  const aiHealthScore = aiWarning ? (aiWarning >= 90 ? 35 : aiWarning >= 75 ? 50 : 65) : 88;
  const overallHealthScore = Math.round((memberHealthScore + trainerHealthScore + revenueHealthScore + aiHealthScore) / 4);

  const memberHealth = healthFromScore(memberHealthScore);
  const trainerHealth = healthFromScore(trainerHealthScore);
  const revenueHealth = healthFromScore(revenueHealthScore);
  const aiHealth = healthFromScore(aiHealthScore);
  const overallHealth = healthFromScore(overallHealthScore);

  const businessBrief = (() => {
    const positives: string[] = [];
    const concerns: string[] = [];
    if (activeChange > 0) positives.push("member activity is improving");
    if (foodChange > 0) positives.push("nutrition logging is increasing");
    if (!aiWarning) positives.push("AI costs remain healthy");
    if (unassignedClients) concerns.push(`${unassignedClients} clients need trainer assignment`);
    if (pendingTrainers) concerns.push(`${pendingTrainers} trainers need approval`);
    if ((pilotMetrics?.trainers.trainerResponseRate ?? 0) < 50 && activeTrainers) concerns.push("trainer follow-up needs attention");
    if (aiWarning) concerns.push("AI spend is approaching its limit");

    if (!positives.length && !concerns.length) return "Your clubs are stable. No urgent action is waiting, so the next best move is to keep building member activity and trainer consistency.";
    return `Your clubs are ${overallHealth === "Needs Attention" ? "showing pressure" : "performing steadily"}. ${positives.length ? positives.join(", ") : "Core operating signals are available"}. ${concerns.length ? `Today, focus on ${concerns.join(", ")}.` : "No major owner intervention is needed today."}`;
  })();

  const priorityItems: Priority[] = [];
  for (const notification of notificationList) {
    priorityItems.push({
      title: notification.title,
      detail: notification.body,
      action: notification.type === "trainer_approval" ? "Review and approve trainer access." : "Open the item and clear the blocker.",
      href: notification.href,
      tone: notification.severity === "critical" ? "critical" : "warning"
    });
  }
  if (unassignedClients > 0) {
    priorityItems.push({
      title: `${unassignedClients} clients waiting for trainer assignment`,
      detail: "Unassigned clients are less likely to get timely follow-up.",
      action: "Assign them to an active trainer today.",
      href: "/admin/users",
      tone: "critical"
    });
  }
  if ((pilotMetrics?.trainers.trainerResponseRate ?? 0) < 50 && activeTrainers > 0) {
    priorityItems.push({
      title: "Trainer follow-up is low",
      detail: "Member accountability weakens when trainers do not respond consistently.",
      action: "Ask trainers to clear their priority list before end of day.",
      href: "/trainer",
      tone: "warning"
    });
  }
  if ((pilotMetrics?.clients.foodLoggingRate ?? 0) >= 60) {
    priorityItems.push({
      title: "Nutrition engagement is strong",
      detail: "Members are using one of Ascend's highest-value daily habits.",
      action: "Use this proof when inviting the next pilot group.",
      href: "/admin/referrals",
      tone: "success"
    });
  }
  if (aiWarning) {
    priorityItems.push({
      title: "AI spend needs monitoring",
      detail: `Projected AI usage has reached the ${aiWarning}% warning level.`,
      action: "Review food scan usage and cache performance.",
      tone: "warning"
    });
  }
  if (!priorityItems.length) {
    priorityItems.push({
      title: "No urgent owner actions",
      detail: "The system is stable today.",
      action: "Review referral performance and invite the next small member group.",
      href: "/admin/referrals",
      tone: "success"
    });
  }
  const priorities = priorityItems.slice(0, 5);

  const opportunities = [
    {
      title: "Premium upgrades",
      value: money(Math.max(0, activeClientUsers.length - premiumUsers.length) * 1999),
      detail: `${Math.max(0, activeClientUsers.length - premiumUsers.length)} active free clients could upgrade to Premium.`
    },
    {
      title: "Athlete upgrades",
      value: money(Math.max(0, premiumUsers.length - athleteUsers.length) * 4990),
      detail: `${Math.max(0, premiumUsers.length - athleteUsers.length)} Premium clients could be offered Athlete Mode.`
    },
    {
      title: "Trainer follow-up value",
      value: money(Math.max(0, unassignedClients) * 1999),
      detail: "Assigning clients faster protects accountability and upgrade potential."
    },
    {
      title: "Referral growth",
      value: money(safeArray(pilotMetrics?.business.referralPerformance).reduce((total, item) => total + asNumber(item.revenue_cents), 0)),
      detail: "Revenue already attributed through referral codes."
    }
  ];

  const clubCards = byGym.map((gym) => {
    const usageRow = usage.find((row) => row.gym_name === gym.gym_name);
    const complianceRow = compliance.find((row) => row.gym_name === gym.gym_name);
    const clients = asNumber(usageRow?.clients);
    const engagementScore = Math.min(100, clients ? ((asNumber(usageRow?.food_logs) + asNumber(usageRow?.water_logs) + asNumber(usageRow?.weight_logs)) / Math.max(clients, 1)) * 8 : 0);
    const trainerEngagement = activeTrainers ? Math.min(100, (pilotMetrics?.trainers.trainerResponseRate ?? 0)) : 0;
    const clubScore = Math.round((engagementScore * 0.35) + (asNumber(complianceRow?.average_compliance) * 0.35) + (asNumber(gym.active_subscriptions) ? 80 : 40) * 0.2 + trainerEngagement * 0.1);
    const status = healthFromScore(clubScore);
    return {
      name: gym.gym_name ?? "Unknown club",
      score: clubScore,
      status,
      revenue: money(gym.revenue_cents),
      subscriptions: asNumber(gym.active_subscriptions),
      memberEngagement: Math.round(engagementScore),
      trainerEngagement: Math.round(trainerEngagement),
      retention: healthFromScore(asNumber(complianceRow?.average_compliance)),
      risk: asNumber(complianceRow?.low_compliance_clients),
      recommendation: asNumber(complianceRow?.low_compliance_clients)
        ? "Ask trainers to contact low-momentum clients."
        : asNumber(gym.active_subscriptions)
          ? "Keep referral activity running while engagement is stable."
          : "Invite a small Premium pilot group for this club."
    };
  });

  const trainerRows = byTrainer.map((trainer) => {
    const record = trainers.find((item) => item.full_name === trainer.trainer_name);
    const subscriptions = asNumber(trainer.active_subscriptions);
    const score = Math.round(Math.min(100, subscriptions * 18 + (record?.status === "active" ? 35 : 0) + (pilotMetrics?.trainers.trainerResponseRate ?? 0) * 0.35));
    return {
      name: trainer.trainer_name ?? "Unknown trainer",
      revenue: money(trainer.revenue_cents),
      subscriptions,
      score,
      status: healthFromScore(score),
      action: score >= 75 ? "Use as a benchmark for other trainers." : "Support with client follow-up and referral habits."
    };
  }).sort((a, b) => b.score - a.score);

  const insights = [
    activeChange > 0 ? `Members staying active increased by ${activeChange} over the trend window.` : "Member activity is steady; look for ways to increase weekly check-ins.",
    foodChange > 0 ? `Food logging increased by ${foodChange} logs across the trend window.` : "Nutrition consistency has room to grow.",
    (pilotMetrics?.trainers.trainerResponseRate ?? 0) >= 70 ? "Trainer response is supporting accountability." : "Trainer response should be watched because it directly affects member retention.",
    athleteUsers.length ? `${athleteUsers.length} clients are already in Athlete Mode.` : "Athlete Mode is ready to be introduced to serious transformation clients.",
    safeArray(pilotMetrics?.business.referralPerformance).length ? "Referral attribution is active, so growth can be traced by gym and trainer." : "Referral codes are available but not producing visible activity yet."
  ];

  return (
    <>
      <section className="mt-3 rounded-3xl border border-calm/30 bg-gradient-to-br from-calm/15 via-surface to-purple-500/10 p-5 shadow-soft">
        <p className="text-sm text-zinc-400">Good morning</p>
        <h1 className="mt-1 text-3xl font-semibold">Owner</h1>
        <p className="mt-1 text-sm font-semibold text-calm">Today&apos;s Business Brief</p>
        <p className="mt-4 text-base leading-7 text-zinc-200">{businessBrief}</p>
      </section>

      {status ? <p className="mt-4 rounded-lg border border-line bg-surface p-3 text-sm text-zinc-300">{status}</p> : null}

      <section className="mt-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-lime" size={20} />
          <h2 className="text-xl font-semibold">Business Health</h2>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ExecutiveCard title="Overall Club Health" status={overallHealth} value={`${overallHealthScore}/100`} detail="Combined view of member activity, trainer follow-up, revenue, and AI cost." />
          <ExecutiveCard title="Revenue Health" status={revenueHealth} value={money(totalRevenueCents)} detail={`${activeSubscriptions} active paid subscriptions across your clubs.`} />
          <ExecutiveCard title="Member Health" status={memberHealth} value={String(pilotMetrics?.clients.weeklyActiveUsers ?? 0)} detail="Members staying active this week." />
          <ExecutiveCard title="Trainer Health" status={trainerHealth} value={`${activeTrainers} active`} detail={`${pendingTrainers} pending approvals, ${unassignedClients} unassigned clients.`} />
          <ExecutiveCard title="AI Health" status={aiHealth} value={money(aiSummary?.projected_monthly_cost_cents ?? 0)} detail={aiWarning ? `Projected spend has reached the ${aiWarning}% warning level.` : "AI cost is within the safe operating range."} />
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Bell className="text-calm" size={20} />
            <h2 className="text-xl font-semibold">Today&apos;s Priorities</h2>
          </div>
          <span className="rounded-full bg-ink px-3 py-1 text-xs font-semibold text-zinc-300">Top {priorities.length}</span>
        </div>
        <div className="mt-4 space-y-3">
          {priorities.map((priority) => {
            const content = (
              <article className={`rounded-xl border p-4 ${cardTone(priority.tone)}`}>
                <div className="flex items-start gap-3">
                  {priority.tone === "success" ? <CheckCircle2 className="mt-0.5 shrink-0 text-lime" size={20} /> : <AlertTriangle className="mt-0.5 shrink-0 text-amber" size={20} />}
                  <div>
                    <p className="font-semibold">{priority.title}</p>
                    <p className="mt-1 text-sm leading-6 text-zinc-300">{priority.detail}</p>
                    <p className="mt-2 text-sm font-semibold text-white">Suggested action: {priority.action}</p>
                  </div>
                </div>
              </article>
            );
            return priority.href ? <Link key={`${priority.title}-${priority.action}`} href={priority.href}>{content}</Link> : <div key={`${priority.title}-${priority.action}`}>{content}</div>;
          })}
        </div>
      </section>

      <section className="mt-4">
        <div className="flex items-center gap-2">
          <Target className="text-lime" size={20} />
          <h2 className="text-xl font-semibold">Business Opportunities</h2>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {opportunities.map((opportunity) => (
            <OpportunityCard key={opportunity.title} {...opportunity} />
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-center gap-2">
          <Building2 className="text-lime" size={20} />
          <h2 className="text-xl font-semibold">Club Performance</h2>
        </div>
        <div className="mt-4 space-y-3">
          {clubCards.length ? clubCards.map((club) => (
            <article key={club.name} className="rounded-xl bg-ink p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{club.name}</p>
                  <p className="mt-1 text-sm text-zinc-400">{club.revenue} revenue / {club.subscriptions} paid members</p>
                </div>
                <StatusPill status={club.status} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-zinc-400">Member engagement</p>
                  <p className="mt-1 font-semibold">{club.memberEngagement}/100</p>
                  <MiniBar value={club.memberEngagement} />
                </div>
                <div>
                  <p className="text-zinc-400">Trainer engagement</p>
                  <p className="mt-1 font-semibold">{club.trainerEngagement}/100</p>
                  <MiniBar value={club.trainerEngagement} />
                </div>
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-300">Risk level: {club.risk ? `${club.risk} low-momentum clients` : "Low"}. Recommendation: {club.recommendation}</p>
            </article>
          )) : <p className="rounded-xl bg-ink p-4 text-sm leading-6 text-zinc-400">Club performance will appear here once members, trainers, and subscriptions start generating activity.</p>}
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-center gap-2">
          <Users className="text-calm" size={20} />
          <h2 className="text-xl font-semibold">Trainer Performance</h2>
        </div>
        <div className="mt-4 space-y-3">
          {trainerRows.length ? trainerRows.slice(0, 6).map((trainer, index) => (
            <article key={trainer.name} className="rounded-xl bg-ink p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{index + 1}. {trainer.name}</p>
                  <p className="mt-1 text-sm text-zinc-400">{trainer.revenue} / {trainer.subscriptions} attributed subscriptions</p>
                </div>
                <StatusPill status={trainer.status} />
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-300">Suggested coaching action: {trainer.action}</p>
            </article>
          )) : <p className="rounded-xl bg-ink p-4 text-sm leading-6 text-zinc-400">Trainer attribution will appear here once subscriptions and referrals are connected to trainers.</p>}
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="text-lime" size={20} />
          <h2 className="text-xl font-semibold">Member Engagement</h2>
        </div>
        <p className="mt-2 text-sm leading-6 text-zinc-300">Plain-language signals that show whether members are staying connected between sessions.</p>
        <div className="mt-4 grid gap-4">
          {[
            ["Members staying active", `${pilotMetrics?.clients.weeklyActiveUsers ?? 0} this week`, Math.min(100, (pilotMetrics?.clients.weeklyActiveUsers ?? 0) * 10)],
            ["Nutrition consistency", percent(pilotMetrics?.clients.foodLoggingRate ?? 0), pilotMetrics?.clients.foodLoggingRate ?? 0],
            ["Workout consistency", `${pilotMetrics?.trainers.clientsMonitored ?? 0} clients monitored`, Math.min(100, (pilotMetrics?.trainers.clientsMonitored ?? 0) * 10)],
            ["Body Scan adoption", `${athleteUsers.length} Athlete clients`, Math.min(100, athleteUsers.length * 20)],
            ["Coach interaction", percent(pilotMetrics?.trainers.trainerResponseRate ?? 0), pilotMetrics?.trainers.trainerResponseRate ?? 0],
            ["Retention outlook", healthFromScore(averageCompliance), averageCompliance]
          ].map(([label, value, bar]) => (
            <div key={label as string}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-zinc-300">{label}</span>
                <span className="font-semibold text-white">{value}</span>
              </div>
              <div className="mt-2"><MiniBar value={Number(bar)} /></div>
            </div>
          ))}
        </div>
      </section>

      <section className={`mt-4 rounded-2xl border p-4 ${aiWarning ? "border-amber/40 bg-amber/10" : "border-calm/30 bg-calm/10"}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Bot className={aiWarning ? "text-amber" : "text-calm"} size={20} />
            <h2 className="text-xl font-semibold">AI Business Monitor</h2>
          </div>
          <StatusPill status={aiHealth} />
        </div>
        <p className="mt-3 text-sm leading-6 text-zinc-300">
          {aiWarning ? `AI spend has reached the ${aiWarning}% warning level. Review usage before adding more pilot users.` : "AI cost is healthy. No owner action required right now."}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-ink p-3">
            <p className="text-zinc-400">Projected spend</p>
            <p className="mt-1 text-lg font-semibold">{money(aiSummary?.projected_monthly_cost_cents ?? 0)}</p>
          </div>
          <div className="rounded-xl bg-ink p-3">
            <p className="text-zinc-400">Failures</p>
            <p className="mt-1 text-lg font-semibold">{asNumber(aiSummary?.monthly_errors)}</p>
          </div>
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-center gap-2">
          <Lightbulb className="text-amber" size={20} />
          <h2 className="text-xl font-semibold">Executive Insights</h2>
        </div>
        <div className="mt-4 space-y-2">
          {insights.map((insight) => (
            <p key={insight} className="rounded-xl bg-ink p-3 text-sm leading-6 text-zinc-300">{insight}</p>
          ))}
        </div>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3">
        <Link href="/admin/users" className="rounded-2xl border border-line bg-surface p-4 text-left">
          <Users className="text-lime" size={20} />
          <span className="mt-3 block text-sm font-medium">Users</span>
        </Link>
        <Link href="/admin/subscriptions" className="rounded-2xl border border-line bg-surface p-4 text-left">
          <BadgeDollarSign className="text-calm" size={20} />
          <span className="mt-3 block text-sm font-medium">Subscriptions</span>
        </Link>
        <Link href="/admin/referrals" className="rounded-2xl border border-line bg-surface p-4 text-left">
          <QrCode className="text-lime" size={20} />
          <span className="mt-3 block text-sm font-medium">Referral codes</span>
        </Link>
      </section>
    </>
  );
}

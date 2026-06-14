"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, BadgeDollarSign, Bot, Building2, QrCode, TrendingUp, Users } from "lucide-react";
import { getAdminAiUsage, getAdminCompliance, getAdminPilotMetrics, getAdminRevenue, getAdminTrainers, getAdminUsage, getAdminUsers } from "@/lib/ascendApi";
import { MetricCard } from "@/components/MetricCard";

type Revenue = Awaited<ReturnType<typeof getAdminRevenue>>;
type UsageRow = Awaited<ReturnType<typeof getAdminUsage>>["usage"][number];
type ComplianceRow = Awaited<ReturnType<typeof getAdminCompliance>>["compliance"][number];
type AdminUser = Awaited<ReturnType<typeof getAdminUsers>>["users"][number];
type AdminTrainer = Awaited<ReturnType<typeof getAdminTrainers>>["trainers"][number];
type AiUsage = Awaited<ReturnType<typeof getAdminAiUsage>>;
type PilotMetrics = Awaited<ReturnType<typeof getAdminPilotMetrics>>;

function money(cents: string | number) {
  return `RM ${(Number(cents) / 100).toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function asNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

function safeArray<T>(value: T[] | undefined | null) {
  return Array.isArray(value) ? value : [];
}

function percent(value: string | number | null | undefined) {
  return `${Math.round(asNumber(value))}%`;
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex h-12 items-end gap-1">
      {values.map((value, index) => (
        <div
          key={`${value}-${index}`}
          className="flex-1 rounded-t bg-lime"
          style={{ height: `${Math.max(8, (value / max) * 48)}px`, opacity: 0.35 + (value / max) * 0.65 }}
        />
      ))}
    </div>
  );
}

function RateBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-zinc-300">{label}</span>
        <span className="font-semibold text-white">{percent(value)}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink">
        <div className="h-full rounded-full bg-lime" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
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
  const [status, setStatus] = useState("Loading owner dashboard...");

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
        failures.push(error instanceof Error ? `Pilot metrics: ${error.message}` : "Pilot metrics failed");
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
      setStatus(failures.length ? `Some admin analytics did not load. ${failures.join(" / ")}` : "");
    }

    load();
    return () => {
      isMounted = false;
    };
  }, []);

  const byGym = safeArray(revenue.byGym);
  const byTrainer = safeArray(revenue.byTrainer);
  const totalRevenueCents = byGym.reduce((total, row) => total + asNumber(row.revenue_cents), 0);
  const activeSubscriptions = byGym.reduce((total, row) => total + asNumber(row.active_subscriptions), 0);
  const totalClients = usage.reduce((total, row) => total + asNumber(row.clients), 0);
  const unassignedClients = users.filter((user) => user.primary_role === "client" && !user.assigned_trainer_id).length;
  const pendingTrainers = trainers.filter((trainer) => trainer.status !== "active").length;
  const activeTrainers = trainers.filter((trainer) => trainer.status === "active").length;
  const averageCompliance = useMemo(() => {
    const scores = compliance.map((row) => asNumber(row.average_compliance)).filter(Boolean);
    if (!scores.length) return 0;
    return Math.round(scores.reduce((total, score) => total + score, 0) / scores.length);
  }, [compliance]);
  const aiSummary = aiUsage?.summary;
  const aiWarning = aiSummary?.warning_level;
  const activeTrend = safeArray(pilotMetrics?.trends).map((item) => asNumber(item.active_users));
  const complianceTrend = safeArray(pilotMetrics?.trends).map((item) => asNumber(item.average_compliance_score));
  const aiCostTrend = safeArray(pilotMetrics?.trends).map((item) => asNumber(item.ai_cost_cents));

  return (
    <>
      <section className="mt-3">
        <h1 className="text-2xl font-semibold">Owner dashboard</h1>
        <p className="mt-2 text-sm text-zinc-400">Multi-gym revenue, trainer attribution, and client accountability.</p>
      </section>

      {status ? <p className="mt-4 rounded-lg border border-line bg-surface p-3 text-sm text-zinc-300">{status}</p> : null}

      <section className="mt-4 grid grid-cols-2 gap-3">
        <MetricCard label="Revenue" value={money(totalRevenueCents)} detail="Active subscriptions" tone="success" />
        <MetricCard label="Premium" value={String(activeSubscriptions)} detail="Active members" />
        <MetricCard label="Clients" value={String(totalClients || users.filter((user) => user.primary_role === "client").length)} detail={`${unassignedClients} unassigned`} tone={unassignedClients ? "warning" : "success"} />
        <MetricCard label="Trainers" value={String(activeTrainers)} detail={`${pendingTrainers} pending`} tone={pendingTrainers ? "warning" : "success"} />
        <MetricCard label="Avg score" value={averageCompliance ? String(averageCompliance) : "--"} detail="Momentum" />
      </section>

      <section className="mt-4 rounded-lg border border-calm/30 bg-calm/10 p-4">
        <div className="flex items-center gap-2">
          <Activity size={19} className="text-calm" />
          <h2 className="text-base font-semibold">Pilot metrics dashboard</h2>
        </div>
        <p className="mt-2 text-sm leading-6 text-zinc-300">Signals for retention, trainer value, business viability, and AI cost control.</p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <MetricCard label="DAU" value={String(pilotMetrics?.clients.dailyActiveUsers ?? 0)} detail="Active today" tone="success" />
          <MetricCard label="WAU" value={String(pilotMetrics?.clients.weeklyActiveUsers ?? 0)} detail="Active this week" />
          <MetricCard label="Avg score" value={String(pilotMetrics?.clients.averageComplianceScore ?? 0)} detail="Client momentum" />
          <MetricCard label="MRR" value={money(pilotMetrics?.business.monthlyRecurringRevenueCents ?? 0)} detail="Active plans" tone="success" />
        </div>

        <div className="mt-4 rounded-lg bg-ink p-3">
          <div className="flex items-center gap-2">
            <TrendingUp size={17} className="text-lime" />
            <p className="text-sm font-semibold">Active user trend</p>
          </div>
          <div className="mt-3">
            <Sparkline values={activeTrend.length ? activeTrend : [0]} />
          </div>
        </div>

        <div className="mt-4 grid gap-3">
          <RateBar label="Food logging rate" value={pilotMetrics?.clients.foodLoggingRate ?? 0} />
          <RateBar label="Weight logging rate" value={pilotMetrics?.clients.weightLoggingRate ?? 0} />
          <RateBar label="Water logging rate" value={pilotMetrics?.clients.waterLoggingRate ?? 0} />
          <RateBar label="Habit completion rate" value={pilotMetrics?.clients.habitCompletionRate ?? 0} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <MetricCard label="Trainer replies" value={percent(pilotMetrics?.trainers.trainerResponseRate ?? 0)} detail="Response rate" />
          <MetricCard label="Clients monitored" value={String(pilotMetrics?.trainers.clientsMonitored ?? 0)} detail="Assigned clients" />
          <MetricCard label="Risk alerts" value={String(pilotMetrics?.trainers.riskAlertsGenerated ?? 0)} detail={`${pilotMetrics?.trainers.riskAlertsResolved ?? 0} resolved`} tone={(pilotMetrics?.trainers.riskAlertsGenerated ?? 0) ? "warning" : "default"} />
          <MetricCard label="Trainer activity" value={String(pilotMetrics?.trainers.dailyTrainerLogins ?? 0)} detail="Today" />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <MetricCard label="Free users" value={String(pilotMetrics?.business.freeUsers ?? 0)} detail="Current users" />
          <MetricCard label="Premium users" value={String(pilotMetrics?.business.premiumUsers ?? 0)} detail={`${pilotMetrics?.business.trialConversions ?? 0} conversions`} />
          <MetricCard label="Churn" value={percent(pilotMetrics?.business.churnRate ?? 0)} detail="Paid plans" tone={(pilotMetrics?.business.churnRate ?? 0) ? "warning" : "success"} />
          <MetricCard label="AI / active" value={money(pilotMetrics?.ai.costPerActiveUserCents ?? 0)} detail="Cost per WAU" />
        </div>

        <div className="mt-4 rounded-lg bg-ink p-3">
          <p className="text-sm font-semibold">AI cost trend</p>
          <div className="mt-3">
            <Sparkline values={aiCostTrend.length ? aiCostTrend : [0]} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-zinc-300">
            <div>Spend: <span className="font-semibold text-white">{money(pilotMetrics?.ai.aiSpendCents ?? 0)}</span></div>
            <div>Projected: <span className="font-semibold text-white">{money(pilotMetrics?.ai.estimatedMonthlyCostCents ?? 0)}</span></div>
            <div>Cache hit rate: <span className="font-semibold text-white">{percent(pilotMetrics?.ai.cacheHitRate ?? 0)}</span></div>
            <div>Compliance trend: <span className="font-semibold text-white">{complianceTrend.at(-1) ?? 0}</span></div>
          </div>
        </div>

        <div className="mt-4 rounded-lg bg-ink p-3">
          <p className="text-sm font-semibold">Referral performance</p>
          <div className="mt-3 space-y-2">
            {safeArray(pilotMetrics?.business.referralPerformance).slice(0, 4).map((item) => (
              <div key={item.code} className="flex items-center justify-between gap-3 rounded-lg bg-surface p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.code}</p>
                  <p className="mt-1 text-xs text-zinc-400">{item.trainer_name ?? item.gym_name ?? item.type}</p>
                </div>
                <div className="text-right text-sm">
                  <p className="font-semibold text-lime">{asNumber(item.referred_users)} users</p>
                  <p className="text-xs text-zinc-400">{asNumber(item.converted_users)} converted</p>
                </div>
              </div>
            ))}
            {safeArray(pilotMetrics?.business.referralPerformance).length ? null : (
              <p className="rounded-lg bg-surface p-3 text-sm text-zinc-400">No referral activity yet.</p>
            )}
          </div>
        </div>
      </section>

      {(pendingTrainers || unassignedClients) ? (
        <section className="mt-4 rounded-lg border border-amber/40 bg-amber/10 p-4">
          <p className="text-sm font-semibold text-amber">Needs attention</p>
          <p className="mt-2 text-sm leading-6 text-zinc-300">
            {pendingTrainers ? `${pendingTrainers} trainer${pendingTrainers === 1 ? "" : "s"} waiting for approval. ` : ""}
            {unassignedClients ? `${unassignedClients} client${unassignedClients === 1 ? "" : "s"} need trainer assignment.` : ""}
          </p>
          <Link href="/admin/users" className="mt-3 flex h-11 items-center justify-center rounded-lg bg-lime font-semibold text-ink">
            Open users
          </Link>
        </section>
      ) : null}

      <section className={`mt-4 rounded-lg border p-4 ${aiWarning ? "border-amber/40 bg-amber/10" : "border-line bg-surface"}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Bot size={19} className={aiWarning ? "text-amber" : "text-calm"} />
            <h2 className="text-base font-semibold">AI usage monitor</h2>
          </div>
          {aiWarning ? <span className="rounded bg-amber px-2 py-1 text-xs font-semibold text-ink">{aiWarning}% warning</span> : null}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <MetricCard
            label="Projected AI spend"
            value={money(aiSummary?.projected_monthly_cost_cents ?? 0)}
            detail={`${asNumber(aiSummary?.spend_percent)}% of ${money(aiSummary?.spend_limit_cents ?? 0)} limit`}
            tone={aiWarning ? "warning" : "success"}
          />
          <MetricCard
            label="Food AI"
            value={String(asNumber(aiSummary?.monthly_food_image_analyses))}
            detail={`${asNumber(aiSummary?.monthly_cache_hits)} cache hits`}
          />
          <MetricCard label="AI chat" value={String(asNumber(aiSummary?.monthly_ai_chat_messages))} detail="This month" />
          <MetricCard label="Reports" value={String(asNumber(aiSummary?.monthly_weekly_reports))} detail="This month" />
        </div>
        <div className="mt-3 rounded-lg bg-ink p-3 text-sm leading-6 text-zinc-300">
          Estimated cost this month: <span className="font-semibold text-white">{money(aiSummary?.monthly_estimated_cost_cents ?? 0)}</span>.
          {asNumber(aiSummary?.monthly_errors) ? ` ${asNumber(aiSummary?.monthly_errors)} AI errors recorded.` : " No AI errors recorded this month."}
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-line bg-surface p-4">
        <div className="flex items-center gap-2">
          <Building2 size={19} className="text-lime" />
          <h2 className="text-base font-semibold">Revenue by gym</h2>
        </div>
        <div className="mt-3 space-y-3">
          {byGym.length ? (
            byGym.map((item) => (
              <div key={item.gym_name ?? "Unknown gym"} className="flex items-center justify-between rounded-lg bg-ink p-3">
                <div>
                  <p className="text-sm font-medium">{item.gym_name ?? "Unknown gym"}</p>
                  <p className="mt-1 text-xs text-zinc-400">{item.active_subscriptions} active subscriptions</p>
                </div>
                <p className="font-semibold text-lime">{money(item.revenue_cents)}</p>
              </div>
            ))
          ) : (
            <p className="rounded-lg bg-ink p-3 text-sm text-zinc-400">No active revenue yet.</p>
          )}
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-line bg-surface p-4">
        <div className="flex items-center gap-2">
          <BadgeDollarSign size={19} className="text-amber" />
          <h2 className="text-base font-semibold">Revenue by trainer</h2>
        </div>
        <div className="mt-3 space-y-3">
          {byTrainer.length ? (
            byTrainer.map((item) => (
              <div key={item.trainer_name ?? "Unknown trainer"} className="flex items-center justify-between rounded-lg bg-ink p-3">
                <div>
                  <p className="text-sm font-medium">{item.trainer_name ?? "Unknown trainer"}</p>
                  <p className="mt-1 text-xs text-zinc-400">{item.active_subscriptions} active subscriptions</p>
                </div>
                <p className="font-semibold text-amber">{money(item.revenue_cents)}</p>
              </div>
            ))
          ) : (
            <p className="rounded-lg bg-ink p-3 text-sm text-zinc-400">No trainer revenue yet.</p>
          )}
        </div>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3">
        <Link href="/admin/users" className="rounded-lg border border-line bg-surface p-4 text-left">
          <Users className="text-lime" size={20} />
          <span className="mt-3 block text-sm font-medium">Users</span>
        </Link>
        <Link href="/admin/subscriptions" className="rounded-lg border border-line bg-surface p-4 text-left">
          <Users className="text-calm" size={20} />
          <span className="mt-3 block text-sm font-medium">Subscriptions</span>
        </Link>
        <Link href="/admin/referrals" className="rounded-lg border border-line bg-surface p-4 text-left">
          <QrCode className="text-lime" size={20} />
          <span className="mt-3 block text-sm font-medium">Referral codes</span>
        </Link>
      </section>
    </>
  );
}

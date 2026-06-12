"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, MessageSquare, Sparkles } from "lucide-react";
import { getMe, getTrainerClients, getTrainerRiskAlerts } from "@/lib/ascendApi";
import { MetricCard } from "@/components/MetricCard";

type TrainerClient = Awaited<ReturnType<typeof getTrainerClients>>["clients"][number];
type RiskAlert = Awaited<ReturnType<typeof getTrainerRiskAlerts>>["alerts"][number];

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
  if (!value) return "No log yet";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "No log yet";
  const days = Math.floor((Date.now() - time) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

export function TrainerDashboardClient() {
  const [clients, setClients] = useState<TrainerClient[]>([]);
  const [alerts, setAlerts] = useState<RiskAlert[]>([]);
  const [status, setStatus] = useState("Loading assigned clients...");
  const [isPendingApproval, setIsPendingApproval] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const profile = await getMe();
        const isTrainerOnly = profile.roles.includes("trainer") && !profile.roles.some((role) => role === "owner" || role === "admin");
        if (isTrainerOnly && profile.user.trainer_status && profile.user.trainer_status !== "active") {
          if (!isMounted) return;
          setIsPendingApproval(true);
          setStatus("");
          return;
        }

        const clientResponse = await getTrainerClients();
        if (!isMounted) return;
        setClients(clientResponse.clients);
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
    () => clients.filter((client) => riskLabel(client) !== "On track" || !client.last_food_logged_at).length,
    [clients]
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
        <h1 className="text-2xl font-semibold">Trainer dashboard</h1>
        <p className="mt-2 text-sm text-zinc-400">Client momentum, sorted by who may need support first.</p>
      </section>

      {status ? <p className="mt-4 rounded-lg border border-line bg-surface p-3 text-sm text-zinc-300">{status}</p> : null}

      <section className="mt-4 grid grid-cols-2 gap-3">
        <MetricCard label="Clients" value={String(clients.length)} detail={`${activeToday} active today`} />
        <MetricCard label="Avg score" value={averageScore} detail="Momentum" tone={averageScore !== "--" && Number(averageScore) < 60 ? "warning" : "success"} />
        <MetricCard label="Check-ins" value={String(needsCheckIn)} detail="Need attention" tone={needsCheckIn ? "warning" : "success"} />
        <MetricCard label="Alerts" value={String(alerts.length || highRisk)} detail={`${highRisk} high priority`} tone={highRisk ? "warning" : "success"} />
      </section>

      {alerts[0] ? (
        <section className="mt-4 rounded-lg border border-amber/40 bg-amber/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 text-amber" size={20} />
            <div>
              <p className="text-sm font-semibold text-amber">Client risk alert</p>
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
                    <div className="min-w-0">
                      <p className="font-medium">{client.full_name}</p>
                      <p className="mt-1 text-xs text-zinc-400">{formatGoal(client.goal_type)}</p>
                      <p className="mt-2 text-xs text-zinc-500">Food: {daysAgo(client.last_food_logged_at)} / Weight: {daysAgo(client.last_weight_logged_at)}</p>
                    </div>
                    <div className="text-right">
                      <p className={(score ?? 100) < 50 ? "font-semibold text-amber" : "font-semibold text-lime"}>
                        {score ?? "--"}/100
                      </p>
                      <span className={`mt-2 inline-block rounded px-2 py-1 text-xs ${riskClass(label)}`}>{label}</span>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Link href={`/trainer/clients/${client.id}`} className="flex h-10 items-center justify-center rounded-lg border border-line bg-surface text-sm font-semibold">
                      View
                    </Link>
                    <Link href={`/messages?userId=${client.id}`} className="flex h-10 items-center justify-center rounded-lg bg-lime text-sm font-semibold text-ink">
                      Message
                    </Link>
                  </div>
                </article>
              );
            })
          ) : (
            <p className="rounded-lg bg-ink p-3 text-sm text-zinc-400">No assigned clients found for this trainer account yet.</p>
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

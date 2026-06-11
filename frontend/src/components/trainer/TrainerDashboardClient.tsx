"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, MessageSquare, Sparkles, Users } from "lucide-react";
import { getTrainerClients, getTrainerRiskAlerts } from "@/lib/ascendApi";
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

export function TrainerDashboardClient() {
  const [clients, setClients] = useState<TrainerClient[]>([]);
  const [alerts, setAlerts] = useState<RiskAlert[]>([]);
  const [status, setStatus] = useState("Loading assigned clients...");

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const [clientResponse, alertResponse] = await Promise.all([getTrainerClients(), getTrainerRiskAlerts()]);
        if (!isMounted) return;
        setClients(clientResponse.clients);
        setAlerts(alertResponse.alerts);
        setStatus("");
      } catch (error) {
        if (isMounted) {
          setStatus(
            error instanceof Error && error.message.includes("403")
              ? "This login is a client account. Log in with a trainer, owner, or admin account to view assigned clients."
              : "Could not load trainer dashboard. Please log in again."
          );
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

  return (
    <>
      <section className="mt-3">
        <h1 className="text-2xl font-semibold">Trainer dashboard</h1>
        <p className="mt-2 text-sm text-zinc-400">Client accountability, sorted by what needs attention first.</p>
      </section>

      {status ? <p className="mt-4 rounded-lg border border-line bg-surface p-3 text-sm text-zinc-300">{status}</p> : null}

      <section className="mt-4 grid grid-cols-2 gap-3">
        <MetricCard label="Clients" value={String(clients.length)} detail={`${activeToday} active today`} />
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
        <h2 className="text-base font-semibold">Assigned clients</h2>
        <div className="mt-3 space-y-3">
          {clients.length ? (
            clients.map((client) => {
              const score = client.compliance_score;
              const label = riskLabel(client);
              return (
                <Link key={client.id} href={`/trainer/clients/${client.id}`} className="block rounded-lg bg-ink p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{client.full_name}</p>
                      <p className="mt-1 text-xs text-zinc-400">{formatGoal(client.goal_type)}</p>
                    </div>
                    <div className="text-right">
                      <p className={(score ?? 100) < 50 ? "font-semibold text-amber" : "font-semibold text-lime"}>
                        {score ?? "--"}/100
                      </p>
                      <p className="mt-1 text-xs text-zinc-400">{label}</p>
                    </div>
                  </div>
                </Link>
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

      <section className="mt-4 rounded-lg border border-line bg-surface p-4">
        <div className="flex items-center gap-3">
          <Users className="text-lime" size={20} />
          <p className="text-sm text-zinc-300">Trainer view now uses live PostgreSQL assignments and compliance data.</p>
        </div>
      </section>
    </>
  );
}

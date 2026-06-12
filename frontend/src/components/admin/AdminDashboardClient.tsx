"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BadgeDollarSign, Building2, QrCode, Users } from "lucide-react";
import { getAdminCompliance, getAdminRevenue, getAdminTrainers, getAdminUsage, getAdminUsers } from "@/lib/ascendApi";
import { MetricCard } from "@/components/MetricCard";

type Revenue = Awaited<ReturnType<typeof getAdminRevenue>>;
type UsageRow = Awaited<ReturnType<typeof getAdminUsage>>["usage"][number];
type ComplianceRow = Awaited<ReturnType<typeof getAdminCompliance>>["compliance"][number];
type AdminUser = Awaited<ReturnType<typeof getAdminUsers>>["users"][number];
type AdminTrainer = Awaited<ReturnType<typeof getAdminTrainers>>["trainers"][number];

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

export function AdminDashboardClient() {
  const [revenue, setRevenue] = useState<Revenue>({ byGym: [], byTrainer: [] });
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [compliance, setCompliance] = useState<ComplianceRow[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [trainers, setTrainers] = useState<AdminTrainer[]>([]);
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
        failures.push(error instanceof Error ? `Accountability: ${error.message}` : "Accountability failed");
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
        <MetricCard label="Avg score" value={averageCompliance ? String(averageCompliance) : "--"} detail="Accountability" />
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

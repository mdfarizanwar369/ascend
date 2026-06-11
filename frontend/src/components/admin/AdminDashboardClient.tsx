"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BadgeDollarSign, Building2, QrCode, Users } from "lucide-react";
import { getAdminCompliance, getAdminRevenue, getAdminUsage } from "@/lib/ascendApi";
import { MetricCard } from "@/components/MetricCard";

type Revenue = Awaited<ReturnType<typeof getAdminRevenue>>;
type UsageRow = Awaited<ReturnType<typeof getAdminUsage>>["usage"][number];
type ComplianceRow = Awaited<ReturnType<typeof getAdminCompliance>>["compliance"][number];

function money(cents: string | number) {
  return `RM ${(Number(cents) / 100).toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function asNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

export function AdminDashboardClient() {
  const [revenue, setRevenue] = useState<Revenue>({ byGym: [], byTrainer: [] });
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [compliance, setCompliance] = useState<ComplianceRow[]>([]);
  const [status, setStatus] = useState("Loading owner dashboard...");

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const [revenueResponse, usageResponse, complianceResponse] = await Promise.all([
          getAdminRevenue(),
          getAdminUsage(),
          getAdminCompliance()
        ]);

        if (!isMounted) return;
        setRevenue(revenueResponse);
        setUsage(usageResponse.usage);
        setCompliance(complianceResponse.compliance);
        setStatus("");
      } catch (error) {
        if (isMounted) {
          setStatus(
            error instanceof Error && error.message.includes("403")
              ? "This login does not have owner/admin access yet."
              : "Could not load admin dashboard. Please log in again."
          );
        }
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, []);

  const totalRevenueCents = revenue.byGym.reduce((total, row) => total + asNumber(row.revenue_cents), 0);
  const activeSubscriptions = revenue.byGym.reduce((total, row) => total + asNumber(row.active_subscriptions), 0);
  const totalClients = usage.reduce((total, row) => total + asNumber(row.clients), 0);
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
        <MetricCard label="Clients" value={String(totalClients)} detail="Across gyms" />
        <MetricCard label="Avg score" value={averageCompliance ? String(averageCompliance) : "--"} detail="Compliance" />
      </section>

      <section className="mt-4 rounded-lg border border-line bg-surface p-4">
        <div className="flex items-center gap-2">
          <Building2 size={19} className="text-lime" />
          <h2 className="text-base font-semibold">Revenue by gym</h2>
        </div>
        <div className="mt-3 space-y-3">
          {revenue.byGym.length ? (
            revenue.byGym.map((item) => (
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
          {revenue.byTrainer.length ? (
            revenue.byTrainer.map((item) => (
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

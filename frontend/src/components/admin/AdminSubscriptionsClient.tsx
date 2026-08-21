"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, CircleDollarSign, Search } from "lucide-react";
import { getAdminSubscriptions } from "@/lib/ascendApi";
import { BackButton } from "@/components/BackButton";
import { inputClass, selectClass } from "@/components/Field";

type Subscription = Awaited<ReturnType<typeof getAdminSubscriptions>>["subscriptions"][number];

function formatPlan(plan: string) {
  if (plan === "trainer_pro") return "Trainer Pro";
  if (plan === "premium") return "Premium";
  return "Free";
}

function money(subscription: Subscription) {
  try {
    return new Intl.NumberFormat("en-MY", { style: "currency", currency: subscription.currency.toUpperCase(), maximumFractionDigits: 0 }).format(Number(subscription.amount_cents) / 100);
  } catch {
    return `${subscription.currency} ${(Number(subscription.amount_cents) / 100).toLocaleString("en-MY")}`;
  }
}

function statusTone(status: string) {
  if (status === "active" || status === "trialing") return "bg-lime text-ink";
  if (status === "past_due") return "bg-red-400 text-ink";
  return "bg-amber text-ink";
}

export function AdminSubscriptionsClient() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [status, setStatus] = useState("Loading subscriptions...");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("current");
  const [providerFilter, setProviderFilter] = useState("all");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState({ current: 0, trials: 0, pastDue: 0 });
  const [pagination, setPagination] = useState({ page: 1, pageSize: 50, total: 0, totalPages: 1 });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let mounted = true;
    setStatus("Loading subscriptions...");
    getAdminSubscriptions({ page, pageSize: 50, status: statusFilter, provider: providerFilter === "all" ? "" : providerFilter, q: debouncedSearch })
      .then((response) => {
        if (!mounted) return;
        setSubscriptions(Array.isArray(response.subscriptions) ? response.subscriptions : []);
        setSummary(response.summary ?? { current: response.subscriptions.length, trials: 0, pastDue: 0 });
        setPagination(response.pagination ?? { page: 1, pageSize: 50, total: response.subscriptions.length, totalPages: 1 });
        setStatus("");
      })
      .catch(() => mounted && setStatus("Subscription records could not be loaded. Other owner tools remain available."));
    return () => { mounted = false; };
  }, [debouncedSearch, page, providerFilter, statusFilter]);

  return (
    <>
      <section className="mt-3 flex items-start gap-3">
        <BackButton fallbackHref="/admin" />
        <div>
          <p className="text-sm text-zinc-400">Owner tools</p>
          <h1 className="mt-1 text-2xl font-semibold">Subscriptions</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">Review access state and billing source. Values below are subscription records, not recognized revenue.</p>
        </div>
      </section>

      {status ? <p className="ascend-workspace-inset mt-4 p-3 text-sm text-zinc-300">{status}</p> : null}

      <section className="mt-4 grid grid-cols-3 gap-3">
        <div className="ascend-workspace-stat p-4"><p className="text-xs uppercase text-zinc-400">Current access</p><p className="mt-2 text-2xl font-semibold">{summary.current}</p></div>
        <div className="ascend-workspace-stat p-4"><p className="text-xs uppercase text-zinc-400">Trials</p><p className="mt-2 text-2xl font-semibold">{summary.trials}</p></div>
        <div className="ascend-workspace-stat p-4"><p className="text-xs uppercase text-zinc-400">Past due</p><p className={`mt-2 text-2xl font-semibold ${summary.pastDue ? "text-red-300" : "text-lime"}`}>{summary.pastDue}</p></div>
      </section>

      <section className="ascend-workspace-section mt-4 p-4">
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_180px_180px]">
          <label className="relative block"><span className="sr-only">Search subscriptions</span><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} /><input className={`${inputClass} pl-10`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search member, email, or gym" /></label>
          <label><span className="sr-only">Filter subscription status</span><select className={selectClass} value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}><option value="current">Current access</option><option value="all">All records</option><option value="active">Active</option><option value="trialing">Trialing</option><option value="past_due">Past due</option><option value="canceled">Canceled</option><option value="expired">Expired</option></select></label>
          <label><span className="sr-only">Filter billing provider</span><select className={selectClass} value={providerFilter} onChange={(event) => { setProviderFilter(event.target.value); setPage(1); }}><option value="all">All providers</option><option value="manual">Manual</option><option value="stripe">Stripe</option><option value="google_play">Google Play</option><option value="lemon_squeezy">Lemon Squeezy</option></select></label>
        </div>
      </section>

      <section className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line">
        {subscriptions.map((item) => (
          <article key={item.id} className="bg-surface p-4 md:grid md:grid-cols-[minmax(0,1.2fr)_minmax(12rem,0.8fr)_auto] md:items-center md:gap-4">
            <div className="flex items-start justify-between gap-3 md:contents">
              <div><p className="font-semibold">{item.full_name}</p><p className="mt-1 text-sm text-zinc-400">{item.email}</p><p className="mt-1 text-xs text-zinc-500">{item.referred_gym_name ?? "No gym attribution"} · {item.referred_trainer_name ?? "No trainer attribution"}</p></div>
              <span className={`rounded-lg px-3 py-1 text-xs ${statusTone(item.status)}`}>{item.status.replaceAll("_", " ")}</span>
            </div>
            <div className="mt-4 flex items-center justify-between gap-4 rounded-lg bg-ink p-3 md:mt-0 md:contents">
              <div className="text-sm text-zinc-300 md:justify-self-end"><span className="flex items-center gap-2"><CircleDollarSign size={18} className="text-lime" />{formatPlan(item.plan)} · {money(item)}</span>{item.current_period_end ? <p className="mt-1 text-xs text-zinc-500">Access through {new Date(item.current_period_end).toLocaleDateString()}</p> : null}</div>
              <div className="flex items-center gap-2 text-sm text-zinc-300"><BadgeCheck size={18} className="text-calm" />{item.provider}</div>
            </div>
          </article>
        ))}
        {!subscriptions.length && !status ? <p className="ascend-workspace-section p-4 text-sm leading-6 text-zinc-400">No subscription records match these filters.</p> : null}
      </section>
      {pagination.totalPages > 1 ? <nav aria-label="Subscription pages" className="mt-4 flex items-center justify-between gap-3"><button type="button" disabled={pagination.page <= 1 || Boolean(status)} onClick={() => setPage((current) => Math.max(1, current - 1))} className="h-11 rounded-lg border border-line px-4 text-sm font-semibold disabled:opacity-40">Previous</button><span className="text-sm text-zinc-400">Page {pagination.page} of {pagination.totalPages} · {pagination.total} records</span><button type="button" disabled={pagination.page >= pagination.totalPages || Boolean(status)} onClick={() => setPage((current) => current + 1)} className="h-11 rounded-lg border border-line px-4 text-sm font-semibold disabled:opacity-40">Next</button></nav> : null}
    </>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, QrCode, TrendingUp } from "lucide-react";
import { getAdminReferrals } from "@/lib/ascendApi";
import { BackButton } from "@/components/BackButton";

type Referral = Awaited<ReturnType<typeof getAdminReferrals>>["referrals"][number];

function money(cents: string | number) {
  return `RM ${(Number(cents) / 100).toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function ReferralCard({ item, onCopy }: { item: Referral; onCopy: (code: string) => void }) {
  return (
    <article className="rounded-lg border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-lime">{item.code}</p>
          <p className="mt-1 text-sm text-zinc-400">
            {item.type === "trainer" ? item.trainer_name ?? "Unknown trainer" : item.gym_name ?? "Unknown gym"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onCopy(item.code)}
          className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-ink"
          aria-label={`Copy ${item.code}`}
        >
          <Copy size={17} />
        </button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-ink p-3">
          <QrCode className="text-calm" size={18} />
          <p className="mt-2 text-lg font-semibold">{item.referred_users}</p>
          <p className="text-xs text-zinc-400">Referred users</p>
        </div>
        <div className="rounded-lg bg-ink p-3">
          <TrendingUp className="text-amber" size={18} />
          <p className="mt-2 text-lg font-semibold">{money(item.active_revenue_cents)}</p>
          <p className="text-xs text-zinc-400">Active revenue</p>
        </div>
      </div>
    </article>
  );
}

export function AdminReferralsClient() {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [status, setStatus] = useState("Loading referral codes...");

  useEffect(() => {
    let isMounted = true;

    getAdminReferrals()
      .then((response) => {
        if (!isMounted) return;
        setReferrals(response.referrals);
        setStatus("");
      })
      .catch(() => {
        if (isMounted) setStatus("Could not load referrals. Make sure this login has owner/admin access.");
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function copyCode(code: string) {
    await navigator.clipboard?.writeText(code);
    setStatus(`${code} copied.`);
  }

  const gymReferrals = useMemo(() => referrals.filter((referral) => referral.type === "gym"), [referrals]);
  const trainerReferrals = useMemo(() => referrals.filter((referral) => referral.type === "trainer"), [referrals]);
  const gymRevenue = gymReferrals.reduce((total, item) => total + Number(item.active_revenue_cents), 0);
  const trainerRevenue = trainerReferrals.reduce((total, item) => total + Number(item.active_revenue_cents), 0);

  return (
    <>
      <section className="mt-3 flex items-start gap-3">
        <BackButton fallbackHref="/admin" />
        <div>
          <p className="text-sm text-zinc-400">Referral attribution</p>
          <h1 className="mt-1 text-2xl font-semibold">Gym and trainer codes</h1>
        </div>
      </section>

      {status ? <p className="mt-4 rounded-lg border border-line bg-surface p-3 text-sm text-zinc-300">{status}</p> : null}

      <section className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="text-xs uppercase text-zinc-400">Gym revenue</p>
          <p className="mt-2 text-2xl font-semibold text-lime">{money(gymRevenue)}</p>
          <p className="mt-1 text-xs text-zinc-400">{gymReferrals.length} codes</p>
        </div>
        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="text-xs uppercase text-zinc-400">Trainer revenue</p>
          <p className="mt-2 text-2xl font-semibold text-lime">{money(trainerRevenue)}</p>
          <p className="mt-1 text-xs text-zinc-400">{trainerReferrals.length} codes</p>
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-line bg-surface p-4">
        <div>
          <h2 className="text-base font-semibold">Gym referral codes</h2>
          <p className="mt-1 text-sm leading-6 text-zinc-400">
            Use these when the gym itself brings in a member. Revenue is credited to the gym.
          </p>
        </div>
        <div className="mt-4 space-y-3">
          {gymReferrals.map((item) => (
            <ReferralCard key={item.code} item={item} onCopy={copyCode} />
          ))}
          {!gymReferrals.length && !status ? <p className="rounded-lg bg-ink p-3 text-sm text-zinc-400">No gym referral codes found.</p> : null}
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-line bg-surface p-4">
        <div>
          <h2 className="text-base font-semibold">Trainer referral codes</h2>
          <p className="mt-1 text-sm leading-6 text-zinc-400">
            Use these when a trainer brings in a member. Revenue is credited to that trainer.
          </p>
        </div>
        <div className="mt-4 space-y-3">
          {trainerReferrals.map((item) => (
            <ReferralCard key={item.code} item={item} onCopy={copyCode} />
          ))}
          {!trainerReferrals.length && !status ? <p className="rounded-lg bg-ink p-3 text-sm text-zinc-400">No trainer referral codes found.</p> : null}
        </div>
      </section>
    </>
  );
}

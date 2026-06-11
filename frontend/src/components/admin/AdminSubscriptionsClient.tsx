"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, CircleDollarSign } from "lucide-react";
import { getAdminSubscriptions } from "@/lib/ascendApi";
import { BackButton } from "@/components/BackButton";

type Subscription = Awaited<ReturnType<typeof getAdminSubscriptions>>["subscriptions"][number];

function formatPlan(plan: string) {
  if (plan === "trainer_pro") return "Trainer Pro";
  if (plan === "premium") return "Premium";
  return "Free";
}

function money(subscription: Subscription) {
  return `${subscription.currency} ${(Number(subscription.amount_cents) / 100).toLocaleString("en-MY", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  })}`;
}

export function AdminSubscriptionsClient() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [status, setStatus] = useState("Loading subscriptions...");

  useEffect(() => {
    let isMounted = true;

    getAdminSubscriptions()
      .then((response) => {
        if (!isMounted) return;
        setSubscriptions(response.subscriptions);
        setStatus("");
      })
      .catch(() => {
        if (isMounted) setStatus("Could not load subscriptions. Make sure this login has owner/admin access.");
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <>
      <section className="mt-3 flex items-start gap-3">
        <BackButton fallbackHref="/admin" />
        <div>
          <p className="text-sm text-zinc-400">Subscriptions</p>
          <h1 className="mt-1 text-2xl font-semibold">Revenue attribution</h1>
        </div>
      </section>

      {status ? <p className="mt-4 rounded-lg border border-line bg-surface p-3 text-sm text-zinc-300">{status}</p> : null}

      <section className="mt-4 space-y-3">
        {subscriptions.map((item) => (
          <article key={item.id} className="rounded-lg border border-line bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{item.full_name}</p>
                <p className="mt-1 text-sm text-zinc-400">
                  {item.referred_gym_name ?? "No gym"} / {item.referred_trainer_name ?? "No trainer"}
                </p>
              </div>
              <span className={`rounded-lg px-3 py-1 text-xs ${item.status === "active" ? "bg-lime text-ink" : "bg-amber text-ink"}`}>
                {item.status}
              </span>
            </div>
            <div className="mt-4 flex items-center justify-between rounded-lg bg-ink p-3">
              <div className="flex items-center gap-2 text-sm text-zinc-300">
                <CircleDollarSign size={18} className="text-lime" />
                {formatPlan(item.plan)} / {money(item)}
              </div>
              <div className="flex items-center gap-2 text-sm text-zinc-300">
                <BadgeCheck size={18} className="text-calm" />
                {item.provider}
              </div>
            </div>
          </article>
        ))}
        {!subscriptions.length && !status ? (
          <p className="rounded-lg border border-line bg-surface p-4 text-sm text-zinc-400">No subscriptions found yet.</p>
        ) : null}
      </section>
    </>
  );
}

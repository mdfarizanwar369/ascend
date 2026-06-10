import { BadgeCheck, CircleDollarSign } from "lucide-react";
import { AppShell } from "@/components/AppShell";

const subscriptions = [
  { name: "Ahmad Rahman", plan: "Premium", gym: "Austin Green", trainer: "Jason Tan", status: "Active" },
  { name: "Mei Ling", plan: "Premium", gym: "Austin Green", trainer: "Jason Tan", status: "Active" },
  { name: "Kumar Raj", plan: "Premium", gym: "Kulai Indahpura", trainer: "Siti Aminah", status: "Past due" }
];

export default function AdminSubscriptionsPage() {
  return (
    <AppShell active="admin">
      <section className="mt-3">
        <p className="text-sm text-zinc-400">Subscriptions</p>
        <h1 className="mt-1 text-2xl font-semibold">Revenue attribution</h1>
      </section>

      <section className="mt-4 space-y-3">
        {subscriptions.map((item) => (
          <article key={item.name} className="rounded-lg border border-line bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{item.name}</p>
                <p className="mt-1 text-sm text-zinc-400">
                  {item.gym} · {item.trainer}
                </p>
              </div>
              <span className={`rounded-lg px-3 py-1 text-xs ${item.status === "Active" ? "bg-lime text-ink" : "bg-amber text-ink"}`}>
                {item.status}
              </span>
            </div>
            <div className="mt-4 flex items-center justify-between rounded-lg bg-ink p-3">
              <div className="flex items-center gap-2 text-sm text-zinc-300">
                <CircleDollarSign size={18} className="text-lime" />
                {item.plan}
              </div>
              <div className="flex items-center gap-2 text-sm text-zinc-300">
                <BadgeCheck size={18} className="text-calm" />
                ToyyibPay
              </div>
            </div>
          </article>
        ))}
      </section>
    </AppShell>
  );
}


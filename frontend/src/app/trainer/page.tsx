import { AlertTriangle, MessageSquare, Sparkles, TrendingDown } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { MetricCard } from "@/components/MetricCard";

const clients = [
  { name: "Ahmad Rahman", score: 42, status: "High risk", goal: "Fat loss" },
  { name: "Mei Ling", score: 81, status: "On track", goal: "Maintenance" },
  { name: "Kumar Raj", score: 63, status: "Watch", goal: "Muscle gain" }
];

export default function TrainerPage() {
  return (
    <AppShell active="trainer">
      <section className="mt-3">
        <h1 className="text-2xl font-semibold">Trainer dashboard</h1>
        <p className="mt-2 text-sm text-zinc-400">Client accountability, sorted by what needs attention first.</p>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3">
        <MetricCard label="Clients" value="24" detail="18 active today" />
        <MetricCard label="Alerts" value="3" detail="1 high priority" tone="warning" />
      </section>

      <section className="mt-4 rounded-lg border border-amber/40 bg-amber/10 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 text-amber" size={20} />
          <div>
            <p className="text-sm font-semibold text-amber">Client risk alert</p>
            <p className="mt-1 text-sm leading-6 text-zinc-300">Ahmad has no food logs for 3 days and compliance is below 50.</p>
          </div>
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-line bg-surface p-4">
        <h2 className="text-base font-semibold">Assigned clients</h2>
        <div className="mt-3 space-y-3">
          {clients.map((client) => (
            <Link key={client.name} href="/trainer/clients/demo-client" className="block rounded-lg bg-ink p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{client.name}</p>
                  <p className="mt-1 text-xs text-zinc-400">{client.goal}</p>
                </div>
                <div className="text-right">
                  <p className={client.score < 50 ? "font-semibold text-amber" : "font-semibold text-lime"}>{client.score}/100</p>
                  <p className="mt-1 text-xs text-zinc-400">{client.status}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3">
        <button className="rounded-lg border border-line bg-surface p-4 text-left">
          <Sparkles className="text-calm" size={20} />
          <span className="mt-3 block text-sm font-medium">AI check-ins</span>
        </button>
        <button className="rounded-lg border border-line bg-surface p-4 text-left">
          <MessageSquare className="text-lime" size={20} />
          <span className="mt-3 block text-sm font-medium">Messages</span>
        </button>
      </section>

      <section className="mt-4 rounded-lg border border-line bg-surface p-4">
        <div className="flex items-center gap-3">
          <TrendingDown className="text-lime" size={20} />
          <p className="text-sm text-zinc-300">Average client compliance improved 8 points this week.</p>
        </div>
      </section>
    </AppShell>
  );
}

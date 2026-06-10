import { Check, Droplets, Flame, Plus, Scale, Utensils } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { MetricCard } from "@/components/MetricCard";
import { ProgressRing } from "@/components/ProgressRing";

export default function DashboardPage() {
  return (
    <AppShell active="client">
      <section className="mt-3 rounded-lg border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-zinc-400">Today</p>
            <h1 className="mt-1 text-2xl font-semibold">Stay on track, Ahmad</h1>
            <p className="mt-2 text-sm leading-6 text-zinc-400">Small logs, better coaching, clearer progress.</p>
          </div>
          <ProgressRing score={78} />
        </div>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3">
        <MetricCard label="Calories" value="1,420" detail="620 left" tone="success" />
        <MetricCard label="Protein" value="92g" detail="28g left" />
        <MetricCard label="Water" value="1.8L" detail="2.5L target" />
        <MetricCard label="Weight" value="81.2kg" detail="-0.6kg this week" tone="success" />
      </section>

      <Link href="/food-log" className="mt-4 block rounded-lg border border-line bg-surface p-4">
        <p className="text-sm font-semibold">Latest food log</p>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          Log a food photo to estimate calories, protein, carbs, and fat.
        </p>
      </Link>

      <section className="mt-4 rounded-lg border border-line bg-surface p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Quick log</h2>
          <Link href="/food-log" className="grid h-9 w-9 place-items-center rounded-lg bg-lime text-ink" aria-label="Add log">
            <Plus size={19} />
          </Link>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2">
          {[
            { label: "Food", icon: Utensils },
            { label: "Weight", icon: Scale },
            { label: "Water", icon: Droplets },
            { label: "Burn", icon: Flame }
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.label} className="grid h-20 place-items-center rounded-lg border border-line bg-ink text-xs text-zinc-300">
                <Icon size={20} />
                {item.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-line bg-surface p-4">
        <h2 className="text-base font-semibold">Habits</h2>
        <div className="mt-3 space-y-2">
          {["8,000 steps", "No sugary drinks", "Protein at breakfast"].map((habit, index) => (
            <Link key={habit} href="/habits" className="flex items-center justify-between rounded-lg bg-ink px-3 py-3">
              <span className="text-sm">{habit}</span>
              <span className={`grid h-6 w-6 place-items-center rounded ${index < 2 ? "bg-lime text-ink" : "border border-line"}`}>
                {index < 2 ? <Check size={15} /> : null}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <Link href="/coach" className="mt-4 block rounded-lg border border-calm/40 bg-calm/10 p-4">
        <p className="text-sm font-medium text-calm">AI nutrition coach</p>
        <p className="mt-2 text-sm leading-6 text-zinc-300">Your lunch looks fine. For dinner, keep rice moderate and add a palm-sized protein.</p>
      </Link>
    </AppShell>
  );
}

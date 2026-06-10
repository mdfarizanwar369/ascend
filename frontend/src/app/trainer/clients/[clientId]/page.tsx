import { AlertTriangle, Camera, MessageSquare, Sparkles, TrendingDown, Utensils } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { MetricCard } from "@/components/MetricCard";

export default function TrainerClientDetailPage() {
  return (
    <AppShell active="trainer">
      <section className="mt-3">
        <p className="text-sm text-zinc-400">Client profile</p>
        <h1 className="mt-1 text-2xl font-semibold">Ahmad Rahman</h1>
        <p className="mt-2 text-sm text-zinc-400">Fat loss · Anytime Fitness Austin Green</p>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3">
        <MetricCard label="Compliance" value="42" detail="High risk" tone="warning" />
        <MetricCard label="Weight" value="81.2kg" detail="+0.4kg this week" tone="warning" />
      </section>

      <section className="mt-4 rounded-lg border border-amber/40 bg-amber/10 p-4">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 text-amber" size={20} />
          <p className="text-sm leading-6 text-zinc-300">No food logs for 3 days. Send a quick check-in today.</p>
        </div>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3">
        {[
          { label: "Food logs", icon: Utensils, detail: "Last: Nasi Lemak" },
          { label: "Photos", icon: Camera, detail: "4 this month" },
          { label: "Trend", icon: TrendingDown, detail: "Moving away" },
          { label: "Message", icon: MessageSquare, detail: "Send check-in" }
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.label} className="rounded-lg border border-line bg-surface p-4 text-left">
              <Icon className="text-lime" size={20} />
              <span className="mt-3 block text-sm font-medium">{item.label}</span>
              <span className="mt-1 block text-xs text-zinc-400">{item.detail}</span>
            </button>
          );
        })}
      </section>

      <section className="mt-4 rounded-lg border border-calm/40 bg-calm/10 p-4">
        <div className="flex gap-3">
          <Sparkles className="mt-0.5 text-calm" size={20} />
          <div>
            <p className="text-sm font-semibold text-calm">AI weekly check-in</p>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              Ahmad needs a low-friction reset: ask for one food photo today and suggest a simple chicken rice dinner with water.
            </p>
          </div>
        </div>
      </section>
    </AppShell>
  );
}


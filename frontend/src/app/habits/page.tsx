import { Check, Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";

const habits = ["8,000 steps", "No sugary drinks", "Protein at breakfast", "Sleep before midnight"];

export default function HabitsPage() {
  return (
    <AppShell active="client">
      <section className="mt-3 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-zinc-400">Daily accountability</p>
          <h1 className="mt-1 text-2xl font-semibold">Habits</h1>
        </div>
        <button className="grid h-10 w-10 place-items-center rounded-lg bg-lime text-ink" aria-label="Add habit">
          <Plus size={19} />
        </button>
      </section>

      <section className="mt-4 space-y-3">
        {habits.map((habit, index) => (
          <article key={habit} className="flex items-center justify-between rounded-lg border border-line bg-surface p-4">
            <div>
              <p className="font-medium">{habit}</p>
              <p className="mt-1 text-xs text-zinc-400">Daily</p>
            </div>
            <span className={`grid h-8 w-8 place-items-center rounded-lg ${index < 2 ? "bg-lime text-ink" : "border border-line"}`}>
              {index < 2 ? <Check size={18} /> : null}
            </span>
          </article>
        ))}
      </section>
    </AppShell>
  );
}


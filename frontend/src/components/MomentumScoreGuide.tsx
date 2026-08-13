import { BackButton } from "@/components/BackButton";
import { BrandMark } from "@/components/BrandMark";

const items = [
  {
    title: "Fuel",
    points: "35-40 points",
    detail: "Meals, calories and protein build this pillar. Ascend looks at your recent week, not one perfect day."
  },
  {
    title: "Move",
    points: "35-40 points",
    detail: "Workouts, movement logs and Health Connect activity count. A sensible recovery day does not erase your progress."
  },
  {
    title: "Recover",
    points: "20 points",
    detail: "Hydration, optional sleep check-ins and training balance help Ascend understand how well you are recovering."
  },
  {
    title: "Personal Focus",
    points: "Up to 10 points",
    detail: "A personal habit or coach mission can add focus. If none is active, its points move to Fuel and Move automatically."
  }
];

export function MomentumScoreGuide() {
  return (
    <main className="min-h-screen bg-ink px-4 py-5 text-white">
      <div className="mx-auto max-w-md">
        <header className="flex items-center gap-3 py-3">
          <BackButton fallbackHref="/dashboard" />
          <BrandMark size="sm" />
          <div>
            <p className="text-sm text-zinc-400">Momentum Score</p>
            <h1 className="text-2xl font-semibold">How points work</h1>
          </div>
        </header>

        <section className="mt-4 rounded-lg border border-lime/40 bg-lime/10 p-4">
          <p className="text-sm font-semibold text-lime">This is a seven-day consistency signal, not a body score.</p>
          <p className="mt-2 text-sm leading-6 text-zinc-300">
            Recent actions count most. Weight remains useful progress context, but weighing yourself never earns or removes Momentum points.
          </p>
        </section>

        <section className="mt-4 grid grid-cols-3 gap-2">
          {[
            ["80-100", "Strong"],
            ["60-79", "Building"],
            ["0-59", "Start small"]
          ].map(([range, label]) => (
            <div key={range} className="rounded-lg border border-line bg-surface p-3 text-center">
              <p className="text-lg font-semibold text-lime">{range}</p>
              <p className="mt-1 text-xs text-zinc-400">{label}</p>
            </div>
          ))}
        </section>

        <section className="mt-4 space-y-3">
          {items.map((item) => (
            <article key={item.title} className="rounded-lg border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-base font-semibold">{item.title}</h2>
                <span className="rounded bg-ink px-3 py-1 text-xs font-semibold text-lime">{item.points}</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-zinc-400">{item.detail}</p>
            </article>
          ))}
        </section>

        <section className="mt-4 rounded-lg border border-line bg-surface p-4">
          <h2 className="text-base font-semibold">For trainers</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Read the Fuel, Move and Recover pillars before acting. A low score is a coaching signal, not a judgement of the client.
          </p>
        </section>
      </div>
    </main>
  );
}

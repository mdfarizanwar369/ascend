import { BackButton } from "@/components/BackButton";
import { BrandMark } from "@/components/BrandMark";

const items = [
  {
    title: "Food logging",
    points: "35 points",
    detail: "Log 2 meals in a day to earn the full food score. One meal gives partial credit."
  },
  {
    title: "Weight logging",
    points: "25 points",
    detail: "Log weight up to 3 times per week. Consistent weigh-ins help your trainer see trends."
  },
  {
    title: "Water tracking",
    points: "20 points",
    detail: "Track water toward the daily 2.5L target. Partial water tracking earns partial points."
  },
  {
    title: "Habits",
    points: "20 points",
    detail: "Complete your active habits for the day. If no habits are set yet, this part does not punish you."
  }
];

export default function AccountabilityScorePage() {
  return (
    <main className="min-h-screen bg-ink px-4 py-5 text-white">
      <div className="mx-auto max-w-md">
        <header className="flex items-center gap-3 py-3">
          <BackButton fallbackHref="/dashboard" />
          <BrandMark size="sm" />
          <div>
            <p className="text-sm text-zinc-400">Accountability Score</p>
            <h1 className="text-2xl font-semibold">How points work</h1>
          </div>
        </header>

        <section className="mt-4 rounded-lg border border-lime/40 bg-lime/10 p-4">
          <p className="text-sm font-semibold text-lime">This is a check-in score, not a body score.</p>
          <p className="mt-2 text-sm leading-6 text-zinc-300">
            The score helps you and your trainer see whether you checked in today. It goes up when you log useful information and goes down when there is nothing to review.
          </p>
        </section>

        <section className="mt-4 grid grid-cols-3 gap-2">
          {[
            ["80-100", "On track"],
            ["60-79", "Needs attention"],
            ["0-59", "Check in today"]
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
            Use the score to decide who needs a check-in first. A low score usually means the client has not logged enough information today, not that their progress is bad.
          </p>
        </section>
      </div>
    </main>
  );
}

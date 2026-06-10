/* eslint-disable @next/next/no-html-link-for-pages */

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-ink pb-24 text-white">
      <div className="mx-auto min-h-screen w-full max-w-md px-4 pt-4">
        <header className="flex items-center justify-between py-3">
          <a href="/" className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-lime text-ink font-bold">A</span>
            <span>
              <span className="block text-lg font-semibold leading-5">Ascend</span>
              <span className="text-xs text-zinc-400">Client dashboard</span>
            </span>
          </a>
          <a href="/coach" className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-surface" aria-label="Open coach">
            AI
          </a>
        </header>

        <section className="mt-3 rounded-lg border border-line bg-surface p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-zinc-400">Today</p>
              <h1 className="mt-1 text-2xl font-semibold">Stay on track, Ahmad</h1>
              <p className="mt-2 text-sm leading-6 text-zinc-400">Small logs, better coaching, clearer progress.</p>
            </div>
            <div className="grid h-28 w-28 shrink-0 place-items-center rounded-full border-4 border-lime">
              <div className="text-center">
                <p className="text-3xl font-semibold">78</p>
                <p className="text-xs text-zinc-400">score</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-4 grid grid-cols-2 gap-3">
          {[
            ["Calories", "1,420", "620 left"],
            ["Protein", "92g", "28g left"],
            ["Water", "1.8L", "2.5L target"],
            ["Weight", "81.2kg", "-0.6kg this week"]
          ].map(([label, value, detail]) => (
            <div key={label} className="rounded-lg border border-line bg-surface p-4">
              <p className="text-xs uppercase text-zinc-400">{label}</p>
              <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
              <p className="mt-1 text-sm text-zinc-400">{detail}</p>
            </div>
          ))}
        </section>

        <a href="/food-log" className="mt-4 block rounded-lg border border-line bg-surface p-4">
          <p className="text-sm font-semibold">Latest food log</p>
          <p className="mt-2 text-sm leading-6 text-zinc-400">Log a food photo to estimate calories, protein, carbs, and fat.</p>
        </a>

        <section className="mt-4 rounded-lg border border-line bg-surface p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Quick log</h2>
            <a href="/food-log" className="grid h-9 w-9 place-items-center rounded-lg bg-lime text-ink font-bold" aria-label="Add log">
              +
            </a>
          </div>
          <div className="mt-4 grid grid-cols-4 gap-2">
            {["Food", "Weight", "Water", "Burn"].map((item) => (
              <a key={item} href={item === "Food" ? "/food-log" : "/dashboard"} className="grid h-20 place-items-center rounded-lg border border-line bg-ink text-xs text-zinc-300">
                {item}
              </a>
            ))}
          </div>
        </section>

        <section className="mt-4 rounded-lg border border-line bg-surface p-4">
          <h2 className="text-base font-semibold">Habits</h2>
          <div className="mt-3 space-y-2">
            {["8,000 steps", "No sugary drinks", "Protein at breakfast"].map((habit, index) => (
              <a key={habit} href="/habits" className="flex items-center justify-between rounded-lg bg-ink px-3 py-3">
                <span className="text-sm">{habit}</span>
                <span className={`grid h-6 w-6 place-items-center rounded ${index < 2 ? "bg-lime text-ink" : "border border-line"}`}>
                  {index < 2 ? "✓" : ""}
                </span>
              </a>
            ))}
          </div>
        </section>

        <a href="/coach" className="mt-4 block rounded-lg border border-calm/40 bg-calm/10 p-4">
          <p className="text-sm font-medium text-calm">AI nutrition coach</p>
          <p className="mt-2 text-sm leading-6 text-zinc-300">Your lunch looks fine. For dinner, keep rice moderate and add a palm-sized protein.</p>
        </a>
      </div>

      <nav className="fixed inset-x-0 bottom-0 border-t border-line bg-ink/95 px-4 pb-3 pt-2 backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-3 gap-2">
          <a href="/dashboard" className="flex h-14 flex-col items-center justify-center gap-1 rounded-lg bg-lime text-xs text-ink">
            Home
          </a>
          <a href="/trainer" className="flex h-14 flex-col items-center justify-center gap-1 rounded-lg text-xs text-zinc-400">
            Trainer
          </a>
          <a href="/admin" className="flex h-14 flex-col items-center justify-center gap-1 rounded-lg text-xs text-zinc-400">
            Admin
          </a>
        </div>
      </nav>
    </main>
  );
}

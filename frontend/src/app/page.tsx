import { AlertTriangle, ArrowRight, CheckCircle2, TrendingUp } from "lucide-react";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";

const appLoginUrl = "https://www.getascend.fit/login";

export default function HomePage() {
  const previewSignals = [
    { label: "Member", value: "Next: log lunch and drink 500ml water.", icon: CheckCircle2, color: "text-lime" },
    { label: "Trainer", value: "Sally needs attention: no food logs for 3 days.", icon: AlertTriangle, color: "text-amber" },
    { label: "Gym", value: "Engagement is up this week across active members.", icon: TrendingUp, color: "text-calm" }
  ];

  return (
    <main className="min-h-screen overflow-hidden bg-ink text-white">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_50%_-8%,rgba(53,242,208,0.16),transparent_34rem),radial-gradient(circle_at_10%_22%,rgba(139,92,246,0.14),transparent_28rem)]" />

      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-5 sm:px-8 lg:py-7">
        <header className="flex items-center justify-between">
          <Link href="https://www.getascend.fit" className="flex items-center gap-3" aria-label="Ascend homepage">
            <BrandMark size="sm" />
            <span className="text-xl font-semibold tracking-tight">Ascend</span>
          </Link>
          <Link href={appLoginUrl} className="rounded-lg border border-line bg-surface/80 px-4 py-2 text-sm font-semibold text-zinc-100 shadow-lg shadow-black/20">
            Login
          </Link>
        </header>

        <section className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[1.03fr_0.97fr] lg:py-14">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.24em] text-calm">The accountability layer for fitness results</p>
            <h1 className="mt-5 max-w-4xl text-4xl font-semibold uppercase leading-[1.02] tracking-normal text-white sm:text-6xl lg:text-7xl">
              The missing link between training and results.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-zinc-300 sm:text-xl">
              Most people do not need another tracker. They need support when the workout ends. Ascend keeps members, trainers, and gyms aligned between sessions.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href={appLoginUrl} className="flex h-14 items-center justify-center gap-2 rounded-lg bg-calm px-6 font-bold text-ink shadow-xl shadow-calm/20">
                Start Ascend
                <ArrowRight size={20} />
              </Link>
              <div className="flex min-h-14 items-center justify-center rounded-lg border border-line bg-surface/85 px-5 text-center text-sm font-semibold text-zinc-200">
                Self-coached. AI-supported. Trainer-connected.
              </div>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-sm lg:max-w-md">
            <div className="absolute inset-8 rounded-full bg-calm/10 blur-3xl" />
            <div className="relative rounded-lg border border-line bg-surface/80 p-5 shadow-2xl shadow-black/30">
              <BrandMark size="lg" showWordmark />
              <div className="mt-5 rounded-lg border border-calm/30 bg-calm/10 p-4">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-calm">What Ascend makes visible</p>
                <p className="mt-2 text-2xl font-semibold leading-tight text-white">
                  The next action, the client at risk, and the signal that progress is happening.
                </p>
              </div>
              <div className="mt-3 space-y-2">
                {previewSignals.map((signal) => {
                  const Icon = signal.icon;
                  return (
                    <div key={signal.label} className="flex items-start gap-3 rounded-lg bg-ink p-3 text-sm font-medium text-zinc-200">
                      <Icon className={`mt-0.5 shrink-0 ${signal.color}`} size={17} />
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">{signal.label}</p>
                        <p className="mt-1 leading-5">{signal.value}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="mb-8 rounded-lg border border-line bg-surface/80 p-5 sm:p-6">
          <div className="grid gap-5 md:grid-cols-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-lime">For members</p>
              <p className="mt-2 text-xl font-semibold">Know what to do today.</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-calm">For trainers</p>
              <p className="mt-2 text-xl font-semibold">Know who needs attention.</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-400">For gyms</p>
              <p className="mt-2 text-xl font-semibold">Know if accountability is working.</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

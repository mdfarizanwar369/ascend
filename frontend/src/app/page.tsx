import { AlertTriangle, ArrowRight, CheckCircle2, Play, TrendingUp } from "lucide-react";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { WaitlistForm } from "@/components/waitlist/WaitlistForm";
import { PublicFooter } from "@/components/legal/PublicFooter";
import { ThemeToggle } from "@/components/ThemeToggle";

const appLoginUrl = "https://www.getascend.fit/login";

export default function HomePage() {
  const previewSignals = [
    { label: "Member", value: "Next: log lunch and drink 500ml water.", icon: CheckCircle2, color: "text-lime" },
    { label: "Trainer", value: "Sally needs attention: no food logs for 3 days.", icon: AlertTriangle, color: "text-amber" },
    { label: "Gym", value: "Engagement is up this week across active members.", icon: TrendingUp, color: "text-calm" }
  ];

  return (
    <main className="min-h-screen overflow-hidden bg-ink text-white">
      <div className="ascend-theme-glow pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_50%_-8%,rgba(53,242,208,0.16),transparent_34rem),radial-gradient(circle_at_10%_22%,rgba(139,92,246,0.14),transparent_28rem)]" />

      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-5 sm:px-8 lg:py-7">
        <header className="flex items-center justify-between">
          <Link href="https://www.getascend.fit" className="flex items-center gap-3" aria-label="Ascend homepage">
            <BrandMark size="sm" />
            <span className="text-xl font-semibold tracking-tight">Ascend</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link href={appLoginUrl} className="rounded-lg border border-line bg-surface/80 px-4 py-2 text-sm font-semibold text-zinc-100 shadow-lg shadow-black/20">
              Pilot login
            </Link>
          </div>
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
              <a href="#waitlist" className="flex h-14 items-center justify-center gap-2 rounded-lg bg-calm px-6 font-bold text-ink shadow-xl shadow-calm/20">
                Join the pilot waitlist
                <ArrowRight size={20} />
              </a>
              <Link href={appLoginUrl} className="flex min-h-14 items-center justify-center rounded-lg border border-line bg-surface/85 px-5 text-center text-sm font-semibold text-zinc-200">
                Pilot login
              </Link>
              <Link href="/demo" className="flex min-h-14 items-center justify-center gap-2 rounded-lg border border-calm/40 bg-calm/10 px-5 text-center text-sm font-semibold text-zinc-100">
                <Play size={17} /> Watch 30-sec demo
              </Link>
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

        <section id="waitlist" className="mb-8 grid gap-5 rounded-lg border border-line bg-ink/60 p-4 sm:p-5 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-lg border border-line bg-surface/70 p-5 sm:p-6">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-lime">Controlled pilot access</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-white">Ascend is opening gym by gym.</h2>
            <p className="mt-3 text-base leading-7 text-zinc-300">
              The waitlist helps us keep the pilot clean, protect AI usage, and onboard the right members, trainers, and gym owners first.
            </p>
            <div className="mt-5 space-y-3 text-sm text-zinc-300">
              <p className="rounded-lg bg-ink p-3">Members get early access when their gym or coaching mode opens.</p>
              <p className="rounded-lg bg-ink p-3">Trainers and owners can request pilot access for their clients or locations.</p>
            </div>
          </div>
          <WaitlistForm />
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
        <PublicFooter />
      </div>
    </main>
  );
}

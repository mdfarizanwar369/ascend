import { ArrowRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";

export default function HomePage() {
  const signals = [
    "Members know what to do today.",
    "Trainers see who needs attention.",
    "Gyms see who is staying engaged."
  ];

  return (
    <main className="min-h-screen overflow-hidden bg-ink text-white">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_50%_-8%,rgba(53,242,208,0.16),transparent_34rem),radial-gradient(circle_at_10%_22%,rgba(139,92,246,0.14),transparent_28rem)]" />

      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-5 sm:px-8 lg:py-7">
        <header className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3" aria-label="Ascend homepage">
            <BrandMark size="sm" />
            <span className="text-xl font-semibold tracking-tight">Ascend</span>
          </Link>
          <Link href="/login" className="rounded-lg border border-line bg-surface/80 px-4 py-2 text-sm font-semibold text-zinc-100 shadow-lg shadow-black/20">
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
              <Link href="/login" className="flex h-14 items-center justify-center gap-2 rounded-lg bg-calm px-6 font-bold text-ink shadow-xl shadow-calm/20">
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
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-calm">One promise</p>
                <p className="mt-2 text-2xl font-semibold leading-tight text-white">Keep the plan alive after the session ends.</p>
              </div>
              <div className="mt-3 space-y-2">
                {signals.map((signal) => (
                  <div key={signal} className="flex items-center gap-3 rounded-lg bg-ink p-3 text-sm font-medium text-zinc-200">
                    <CheckCircle2 className="shrink-0 text-lime" size={17} />
                    {signal}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mb-8 rounded-lg border border-line bg-surface/80 p-5 sm:p-6">
          <div className="grid gap-5 md:grid-cols-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-lime">For members</p>
              <p className="mt-2 text-xl font-semibold">Know the next best action.</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-calm">For trainers</p>
              <p className="mt-2 text-xl font-semibold">Know who needs attention today.</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-400">For gyms</p>
              <p className="mt-2 text-xl font-semibold">Know whether members are staying engaged.</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

import { ArrowRight, Dumbbell, QrCode, Sparkles } from "lucide-react";
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-ink text-white">
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-6">
        <header className="flex items-center justify-between">
          <div className="text-xl font-semibold">Ascend</div>
          <div className="rounded-lg border border-line px-3 py-2 text-xs text-zinc-300">Launch pilot</div>
        </header>

        <section className="flex flex-1 flex-col justify-center gap-7">
          <div className="grid h-20 w-20 place-items-center rounded-2xl bg-lime text-ink">
            <Dumbbell size={34} />
          </div>
          <div>
            <h1 className="text-5xl font-semibold leading-tight">Fitness accountability that follows the client.</h1>
            <p className="mt-4 text-base leading-7 text-zinc-300">
              Built for trainers, gym owners, and beginners at Anytime Fitness Austin Green and Kulai Indahpura.
            </p>
          </div>
          <div className="grid gap-3">
            <a href="/dashboard" className="flex h-14 items-center justify-between rounded-lg bg-lime px-4 py-4 font-semibold text-ink">
              Open client dashboard
              <ArrowRight size={20} />
            </a>
            <Link href="/onboarding" className="flex h-14 items-center justify-between rounded-lg border border-line bg-surface px-4 py-4 font-semibold text-white">
              Start onboarding
              <ArrowRight size={20} />
            </Link>
            <Link href="/login" className="flex h-14 items-center justify-between rounded-lg border border-line bg-surface px-4 py-4 font-semibold text-white">
              Sign up or log in
              <ArrowRight size={20} />
            </Link>
            <div className="grid grid-cols-2 gap-3">
              <Link href="/trainer" className="rounded-lg border border-line bg-surface p-4">
                <Sparkles className="text-calm" size={21} />
                <span className="mt-3 block text-sm font-medium">Trainer tools</span>
              </Link>
              <Link href="/admin" className="rounded-lg border border-line bg-surface p-4">
                <QrCode className="text-amber" size={21} />
                <span className="mt-3 block text-sm font-medium">Revenue view</span>
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

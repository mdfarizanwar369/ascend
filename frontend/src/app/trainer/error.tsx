"use client";

import Link from "next/link";

export default function TrainerError() {
  return (
    <main className="min-h-screen bg-ink px-4 py-8 text-white">
      <section className="mx-auto max-w-md rounded-lg border border-line bg-surface p-4">
        <h1 className="text-xl font-semibold">Trainer page could not load</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-400">Use a trainer, owner, or admin account to open this area.</p>
        <Link href="/dashboard" className="mt-4 flex h-12 items-center justify-center rounded-lg bg-lime font-semibold text-ink">
          Back to dashboard
        </Link>
      </section>
    </main>
  );
}

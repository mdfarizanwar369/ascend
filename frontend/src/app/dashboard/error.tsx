"use client";

import Link from "next/link";

export default function DashboardError() {
  return (
    <main className="min-h-screen bg-ink px-4 py-8 text-white">
      <section className="mx-auto max-w-md rounded-lg border border-line bg-surface p-4">
        <h1 className="text-xl font-semibold">Dashboard could not load</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-400">Refresh your session, then open the dashboard again.</p>
        <Link href="/reset" className="mt-4 flex h-12 items-center justify-center rounded-lg bg-lime font-semibold text-ink">
          Refresh app
        </Link>
      </section>
    </main>
  );
}

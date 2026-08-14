"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/clientObservability";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => reportClientError(error, { boundary: "app", digest: error.digest ?? null }), [error]);
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg items-center px-6">
      <section className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] p-6">
        <h1 className="text-2xl font-semibold">This screen could not load</h1>
        <p className="mt-3 text-[var(--muted)]">The rest of Ascend is still available. Please try this screen again.</p>
        <button className="mt-6 min-h-12 w-full rounded-md bg-teal-300 px-4 font-semibold text-slate-950" onClick={reset}>
          Try again
        </button>
      </section>
    </main>
  );
}

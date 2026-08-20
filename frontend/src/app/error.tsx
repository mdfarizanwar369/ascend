"use client";

import { useEffect } from "react";
import { captureClientError } from "@/lib/clientErrorReporter";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    void captureClientError(error, "next.route-boundary");
  }, [error]);

  return (
    <main className="ascend-page grid min-h-[70vh] place-items-center px-5 text-white">
      <section className="ascend-surface w-full max-w-md p-6 text-center">
        <h1 className="text-2xl font-semibold">This page needs another try</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">Your information is safe. Ascend recorded the issue so it can be investigated.</p>
        <button type="button" onClick={reset} className="ascend-pressable mt-5 h-12 w-full rounded-xl bg-lime font-semibold text-ink">Try again</button>
        <a href="/dashboard" className="ascend-pressable mt-3 flex h-12 items-center justify-center rounded-xl border border-line text-sm font-semibold">Return to Today</a>
      </section>
    </main>
  );
}

"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/clientObservability";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => reportClientError(error, { boundary: "global", digest: error.digest ?? null }), [error]);
  return (
    <html lang="en">
      <body>
        <main className="mx-auto flex min-h-screen max-w-lg items-center px-6">
          <section className="w-full rounded-lg border border-white/10 bg-slate-950 p-6 text-white">
            <h1 className="text-2xl font-semibold">Ascend needs a quick reset</h1>
            <p className="mt-3 text-slate-300">Your information is safe. Try loading this screen again.</p>
            <button className="mt-6 min-h-12 w-full rounded-md bg-teal-300 px-4 font-semibold text-slate-950" onClick={reset}>
              Try again
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}

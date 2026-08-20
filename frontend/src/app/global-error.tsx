"use client";

import { useEffect } from "react";
import { captureClientError } from "@/lib/clientErrorReporter";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    void captureClientError(error, "next.global-boundary");
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-[#0f1722] text-white">
        <main className="grid min-h-screen place-items-center px-5">
          <section className="w-full max-w-md rounded-xl border border-white/10 bg-[#182230] p-6 text-center">
            <h1 className="text-2xl font-semibold">Ascend needs a fresh start</h1>
            <p className="mt-3 text-sm leading-6 text-zinc-400">Your saved progress is safe. Please try opening the app again.</p>
            <button type="button" onClick={reset} className="mt-5 h-12 w-full rounded-xl bg-[#35f2d0] font-semibold text-[#071016]">Try again</button>
          </section>
        </main>
      </body>
    </html>
  );
}

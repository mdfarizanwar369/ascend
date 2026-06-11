"use client";

import { useEffect, useState } from "react";
import { BrandMark } from "@/components/BrandMark";

export function ResetClient() {
  const [message, setMessage] = useState("Clearing old app cache...");

  useEffect(() => {
    async function reset() {
      try {
        if ("serviceWorker" in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((registration) => registration.unregister()));
        }

        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((key) => caches.delete(key)));
        }

        localStorage.removeItem("ascend.demoFoodLogs");
        sessionStorage.clear();
        setMessage("Cache cleared. Opening Ascend...");

        window.setTimeout(() => {
          window.location.replace("/dashboard?fresh=reset");
        }, 800);
      } catch {
        setMessage("Cache cleared as much as the browser allowed. Open dashboard again.");
      }
    }

    reset();
  }, []);

  return (
    <main className="grid min-h-screen place-items-center bg-ink px-5 text-white">
      <section className="w-full max-w-sm rounded-lg border border-line bg-surface p-5 text-center">
        <div className="mx-auto w-fit">
          <BrandMark size="md" />
        </div>
        <h1 className="mt-4 text-2xl font-semibold">Resetting Ascend</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">{message}</p>
        <a href="/dashboard?fresh=manual" className="mt-5 flex h-11 items-center justify-center rounded-lg bg-lime font-semibold text-ink">
          Open dashboard
        </a>
      </section>
    </main>
  );
}

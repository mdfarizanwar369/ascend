"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { BrandMark } from "@/components/BrandMark";
import { getMe } from "@/lib/ascendApi";
import { getFirebaseClientAuth, waitForFirebasePersistence } from "@/lib/firebase";
import { markTodayEssentialsColdLaunch } from "@/lib/todayEssentialsLaunch";

function roleHome(roles: string[]) {
  if (roles.includes("owner") || roles.includes("admin")) return "/admin";
  if (roles.includes("trainer")) return "/trainer";
  return "/dashboard";
}

function withTimeout<T>(promise: Promise<T>, ms = 10_000) {
  let timeoutId = 0;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error("Launch timed out.")), ms);
  });

  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
}

export default function LaunchPage() {
  const [message, setMessage] = useState("Opening Ascend...");

  useEffect(() => {
    let isMounted = true;
    let unsubscribe = () => {};

    markTodayEssentialsColdLaunch();

    async function launch() {
      try {
        await withTimeout(waitForFirebasePersistence());
        const auth = getFirebaseClientAuth();

        const noUserTimeout = window.setTimeout(() => {
          if (!isMounted) return;
          setMessage("Login session could not be found. Please log in again.");
          window.location.replace("/login");
        }, 12_000);

        unsubscribe = onAuthStateChanged(auth, async (user) => {
          if (!isMounted) return;
          window.clearTimeout(noUserTimeout);

          if (!user) {
            window.location.replace("/login");
            return;
          }

          try {
            setMessage("Checking your account...");
            const profile = await withTimeout(getMe());
            window.location.replace(roleHome(Array.isArray(profile.roles) ? profile.roles : []));
          } catch {
            window.location.replace("/dashboard");
          }
        });
      } catch {
        window.location.replace("/login");
      }
    }

    launch();

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  return (
    <main className="grid min-h-screen place-items-center bg-ink px-4 text-white">
      <div className="text-center">
        <div className="mx-auto w-20">
          <BrandMark size="lg" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold">Ascend</h1>
        <p className="mt-2 text-sm text-zinc-400">{message}</p>
      </div>
    </main>
  );
}

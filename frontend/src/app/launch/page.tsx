"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { BrandMark } from "@/components/BrandMark";
import { getMe } from "@/lib/ascendApi";
import { getFirebaseClientAuth, waitForFirebasePersistence } from "@/lib/firebase";
import { markTodayEssentialsColdLaunch } from "@/lib/todayEssentialsLaunch";
import { useAscendCinematicLaunchV3 } from "@/components/dashboard/AscendCinematicLaunchV3";
import { useAscendLaunchMorphV2 } from "@/components/dashboard/AscendLaunchMorphV2";

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
  const router = useRouter();
  const {
    enabled: cinematicV3Enabled,
    registerLaunchAnchor: registerCinematicV3Anchor,
    dismiss: dismissCinematicV3
  } = useAscendCinematicLaunchV3();
  const {
    enabled: launchMorphV2Enabled,
    registerLaunchAnchor: registerLaunchMorphV2Anchor,
    dismiss: dismissLaunchMorphV2
  } = useAscendLaunchMorphV2();
  const [message, setMessage] = useState("Opening Ascend...");
  const registerLaunchAnchor = useCallback((element: HTMLSpanElement | null) => {
    if (cinematicV3Enabled) registerCinematicV3Anchor(element);
    else registerLaunchMorphV2Anchor(element);
  }, [cinematicV3Enabled, registerCinematicV3Anchor, registerLaunchMorphV2Anchor]);

  useEffect(() => {
    let isMounted = true;
    let unsubscribe = () => {};

    if (!cinematicV3Enabled && !launchMorphV2Enabled) markTodayEssentialsColdLaunch();

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
            const destination = roleHome(Array.isArray(profile.roles) ? profile.roles : []);
            if (destination !== "/dashboard") {
              dismissCinematicV3();
              dismissLaunchMorphV2();
            }
            if (cinematicV3Enabled || launchMorphV2Enabled) router.replace(destination);
            else window.location.replace(destination);
          } catch {
            if (cinematicV3Enabled || launchMorphV2Enabled) router.replace("/dashboard");
            else window.location.replace("/dashboard");
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
  }, [cinematicV3Enabled, dismissCinematicV3, dismissLaunchMorphV2, launchMorphV2Enabled, router]);

  return (
    <main className="grid min-h-screen place-items-center bg-ink px-4 text-white">
      <div className="text-center">
        {cinematicV3Enabled || launchMorphV2Enabled ? (
          <div className="mx-auto grid h-56 w-full max-w-72 place-items-center">
            <span ref={registerLaunchAnchor} className="block h-28 w-28" aria-hidden="true" />
          </div>
        ) : (
          <div className="mx-auto w-20">
            <BrandMark size="lg" />
          </div>
        )}
        <h1 className="mt-5 text-2xl font-semibold">Ascend</h1>
        <p className="mt-2 text-sm text-zinc-400">{message}</p>
      </div>
    </main>
  );
}

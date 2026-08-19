"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { BrandMark } from "@/components/BrandMark";
import { claimReturnMode, getMe } from "@/lib/ascendApi";
import { getFirebaseClientAuth, waitForFirebasePersistence } from "@/lib/firebase";
import { markTodayEssentialsColdLaunch } from "@/lib/todayEssentialsLaunch";
import { evaluateProfileForReturnMode, writeReturnModeHandoff } from "@/lib/returnMode";
import { useAscendLaunchMorphV2 } from "@/components/dashboard/AscendLaunchMorphV2";
import { useAscendLaunchMorphV22 } from "@/components/dashboard/AscendLaunchMorphV22";

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
    enabled: launchMorphV2Enabled,
    registerLaunchAnchor: registerLaunchMorphV2Anchor,
    dismiss: dismissLaunchMorphV2
  } = useAscendLaunchMorphV2();
  const {
    enabled: launchMorphV22Enabled,
    registerLaunchAnchor: registerLaunchMorphV22Anchor,
    dismiss: dismissLaunchMorphV22
  } = useAscendLaunchMorphV22();
  const launchMorphEnabled = launchMorphV22Enabled || launchMorphV2Enabled;
  const [message, setMessage] = useState("Opening Ascend...");
  const registerLaunchAnchor = useCallback((element: HTMLSpanElement | null) => {
    if (launchMorphV22Enabled) registerLaunchMorphV22Anchor(element);
    else registerLaunchMorphV2Anchor(element);
  }, [launchMorphV22Enabled, registerLaunchMorphV22Anchor, registerLaunchMorphV2Anchor]);

  useEffect(() => {
    let isMounted = true;
    let unsubscribe = () => {};

    if (!launchMorphEnabled) markTodayEssentialsColdLaunch();

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
            if (destination === "/dashboard" && evaluateProfileForReturnMode(profile).eligible) {
              const returnMode = await withTimeout(claimReturnMode()).catch(() => null);
              if (returnMode?.returnMode.claimed) {
                writeReturnModeHandoff(returnMode.returnMode.fullName ?? profile.user.full_name);
                dismissLaunchMorphV22();
                dismissLaunchMorphV2();
                if (launchMorphEnabled) router.replace("/return-mode");
                else window.location.replace("/return-mode");
                return;
              }
            }
            if (launchMorphEnabled) router.replace(destination);
            else window.location.replace(destination);
          } catch {
            if (launchMorphEnabled) router.replace("/dashboard");
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
  }, [dismissLaunchMorphV2, dismissLaunchMorphV22, launchMorphEnabled, router]);

  return (
    <main className="grid min-h-screen place-items-center bg-ink px-4 text-white">
      <div className="text-center">
        {launchMorphEnabled ? (
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

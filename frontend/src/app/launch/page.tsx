"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { BrandMark } from "@/components/BrandMark";
import { getMe } from "@/lib/ascendApi";
import { getFirebaseClientAuth, waitForFirebasePersistence } from "@/lib/firebase";

function roleHome(roles: string[]) {
  if (roles.includes("owner") || roles.includes("admin")) return "/admin";
  if (roles.includes("trainer")) return "/trainer";
  return "/dashboard";
}

export default function LaunchPage() {
  const [message, setMessage] = useState("Opening Ascend...");

  useEffect(() => {
    let isMounted = true;
    let unsubscribe = () => {};

    async function launch() {
      try {
        await waitForFirebasePersistence();
        const auth = getFirebaseClientAuth();

        unsubscribe = onAuthStateChanged(auth, async (user) => {
          if (!isMounted) return;

          if (!user) {
            window.location.replace("/login");
            return;
          }

          try {
            setMessage("Checking your account...");
            const profile = await getMe();
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

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getMe } from "@/lib/ascendApi";

export function RoleGate({
  allowedRoles,
  children,
  fallbackTitle,
  fallbackMessage
}: {
  allowedRoles: string[];
  children: React.ReactNode;
  fallbackTitle: string;
  fallbackMessage: string;
}) {
  const [state, setState] = useState<"loading" | "allowed" | "blocked">("loading");

  useEffect(() => {
    let isMounted = true;

    getMe()
      .then((response) => {
        if (!isMounted) return;
        const allowed = response.roles.some((role) => allowedRoles.includes(role));
        setState(allowed ? "allowed" : "blocked");
      })
      .catch(() => {
        if (isMounted) setState("blocked");
      });

    return () => {
      isMounted = false;
    };
  }, [allowedRoles]);

  if (state === "loading") {
    return <p className="mt-4 rounded-lg border border-line bg-surface p-4 text-sm text-zinc-300">Checking account access...</p>;
  }

  if (state === "blocked") {
    return (
      <section className="mt-4 rounded-lg border border-line bg-surface p-4">
        <h1 className="text-xl font-semibold">{fallbackTitle}</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-400">{fallbackMessage}</p>
        <Link href="/dashboard" className="mt-4 flex h-12 items-center justify-center rounded-lg bg-lime font-semibold text-ink">
          Back to client dashboard
        </Link>
      </section>
    );
  }

  return <>{children}</>;
}

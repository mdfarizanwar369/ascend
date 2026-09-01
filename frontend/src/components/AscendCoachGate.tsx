"use client";

import Link from "next/link";
import { RoleGate } from "@/components/RoleGate";
import { ascendCoachV1Enabled } from "@/lib/ascendCoachFlag";

export function AscendCoachGate({ children, hideWhenDenied = false }: { children: React.ReactNode; hideWhenDenied?: boolean }) {
  if (!ascendCoachV1Enabled()) {
    if (hideWhenDenied) return null;
    return (
      <section className="mt-4 rounded-lg border border-line bg-surface p-4">
        <h1 className="text-xl font-semibold">Ascend Coach unavailable</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-400">The Coach workspace is not enabled.</p>
        <Link href="/dashboard" className="mt-4 flex h-12 items-center justify-center rounded-lg bg-lime font-semibold text-ink">
          Back to dashboard
        </Link>
      </section>
    );
  }

  return (
    <RoleGate
      allowedRoles={["trainer"]}
      allowPlatformOwner
      hideWhenDenied={hideWhenDenied}
      fallbackTitle="Trainer or Platform Owner access only"
      fallbackMessage="This account cannot open Ascend Coach."
      requiredPlan="trainer_pro"
      planFeature="Ascend Coach"
    >
      {children}
    </RoleGate>
  );
}

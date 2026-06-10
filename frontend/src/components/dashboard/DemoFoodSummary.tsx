"use client";

import Link from "next/link";
import { useDemoFoodLogs } from "@/lib/demoFoodLogs";

export function DemoFoodSummary() {
  const logs = useDemoFoodLogs();

  if (!logs.length) {
    return (
      <Link href="/food-log" className="mt-4 block rounded-lg border border-line bg-surface p-4">
        <p className="text-sm font-semibold">Latest food log</p>
        <p className="mt-2 text-sm leading-6 text-zinc-400">No demo meals saved yet. Log a food photo to estimate calories and macros.</p>
      </Link>
    );
  }

  const latest = logs[0];

  return (
    <Link href="/food-log" className="mt-4 block rounded-lg border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Latest food log</p>
          <p className="mt-2 text-base font-medium">{latest.estimatedFoodName}</p>
          <p className="mt-1 text-xs text-zinc-400">
            P {latest.proteinG}g · C {latest.carbsG}g · F {latest.fatG}g
          </p>
        </div>
        <p className="text-xl font-semibold text-lime">{latest.calories}</p>
      </div>
    </Link>
  );
}

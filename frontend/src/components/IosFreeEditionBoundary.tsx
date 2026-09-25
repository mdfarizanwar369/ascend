"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useIosFreeEdition, useIosApp } from "@/lib/appEdition";

export function FreeAppFeatures() {
  return (
    <section className="mt-4 rounded-xl border border-line bg-surface p-5">
      <h2 className="text-lg font-semibold">Included with Ascend</h2>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-zinc-300">
        <li>Unlimited manual meal, water, weight and activity logs</li>
        <li>2 AI meal estimates per day</li>
        <li>10 Zoe chat replies per day</li>
        <li>1 generated workout per day — reopen it anytime that day</li>
        <li>3 detailed workout captures per rolling 7 days</li>
        <li>1 AI workout review per rolling 7 days</li>
      </ul>
      <p className="mt-4 text-sm leading-6 text-zinc-400">Daily allowances reset at midnight in your local time. Weekly allowances become available as earlier uses pass 7 days. Manual tracking stays available when an AI allowance is used up.</p>
    </section>
  );
}

export function FreeFeatureUnavailable() {
  return <main className="ascend-page min-h-screen px-4 py-8 text-white"><div className="mx-auto max-w-xl">
    <h1 className="text-2xl font-semibold">Your free Ascend app</h1>
    <p className="mt-3 text-zinc-300">That feature is not included in this version. Your free tracking tools are ready to use.</p>
    <FreeAppFeatures />
    <Link href="/dashboard" className="mt-5 flex min-h-12 items-center justify-center rounded-xl bg-lime font-semibold text-ink">Back to Home</Link>
  </div></main>;
}

export function IosFreeEditionBoundary({ children }: { children: React.ReactNode }) {
  const free = useIosFreeEdition();
  const native = useIosApp();
  const path = usePathname();
  if (!native) return <>{children}</>;
  if (path === "/" || path === "/demo") return <NativeStart />;
  if (["/privacy", "/terms", "/refund-policy"].includes(path)) return <NativeStart href={`${path}/ios`} />;
  if (/^\/profile\/health-sync(\/|$)/.test(path)) return <FreeFeatureUnavailable />;
  if (!free) return <>{children}</>;
  if (/^\/(subscription|trainer|admin|founder|athlete|messages|reports|progress-photos|coach-homework|bootstrap-owner)(\/|$)/.test(path)) {
    return <FreeFeatureUnavailable />;
  }
  return <>{children}</>;
}

function NativeStart({ href = "/launch" }: { href?: string }) {
  const router = useRouter();
  useEffect(() => { router.replace(href); }, [router, href]);
  return <p className="p-6 text-zinc-300">Opening Ascend…</p>;
}

"use client";

import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { DelightProgressBar } from "@/components/Delight";

const toneClasses = {
  teal: "border-calm/30 bg-[linear-gradient(145deg,rgba(61,230,209,0.10),rgba(18,23,33,0.98)_56%,rgba(139,92,246,0.07))]",
  lime: "border-lime/30 bg-[linear-gradient(145deg,rgba(163,255,70,0.09),rgba(18,23,33,0.98)_58%,rgba(61,230,209,0.06))]",
  purple: "border-purple-400/30 bg-[linear-gradient(145deg,rgba(139,92,246,0.12),rgba(18,23,33,0.98)_58%,rgba(61,230,209,0.05))]",
  amber: "border-amber/30 bg-[linear-gradient(145deg,rgba(248,184,78,0.10),rgba(18,23,33,0.98)_58%,rgba(139,92,246,0.05))]"
} as const;

const iconClasses = {
  teal: "bg-calm/12 text-calm",
  lime: "bg-lime text-ink",
  purple: "bg-purple-400/14 text-purple-200",
  amber: "bg-amber/14 text-amber"
} as const;

export function TrackingPageHeader({
  eyebrow,
  title,
  fallbackHref = "/dashboard",
  disabled = false
}: {
  eyebrow: string;
  title: string;
  fallbackHref?: string;
  disabled?: boolean;
}) {
  return (
    <header className="flex items-center gap-3 py-3">
      <BackButton fallbackHref={fallbackHref} disabled={disabled} />
      <div>
        <p className="text-sm text-zinc-400">{eyebrow}</p>
        <h1 className="text-2xl font-semibold leading-tight">{title}</h1>
      </div>
    </header>
  );
}

export function TrackingHero({
  icon: Icon,
  label,
  value,
  detail,
  tone = "teal",
  progress,
  children
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: keyof typeof toneClasses;
  progress?: number;
  children?: ReactNode;
}) {
  return (
    <section className={`ascend-tracking-hero ascend-soft-enter mt-4 rounded-2xl border p-5 shadow-soft ${toneClasses[tone]}`}>
      <div className="flex items-center gap-4">
        <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${iconClasses[tone]}`}>
          <Icon size={23} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-zinc-400">{label}</p>
          <div className="mt-1 text-3xl font-semibold leading-tight text-white">{value}</div>
          {detail ? <div className="mt-1.5 text-sm leading-5 text-zinc-400">{detail}</div> : null}
        </div>
        {typeof progress === "number" ? (
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-calm/30 bg-ink/70 text-sm font-semibold text-calm">
            {Math.max(0, Math.min(100, progress))}%
          </span>
        ) : null}
      </div>
      {typeof progress === "number" ? <div className="mt-5"><DelightProgressBar value={progress} /></div> : null}
      {children ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}

export function TrackingStatus({ message, success = false }: { message: string; success?: boolean }) {
  if (!message) return null;
  return (
    <p
      role="status"
      className={`mt-4 rounded-xl border px-4 py-3 text-sm leading-5 ${
        success ? "ascend-success-reveal border-lime/30 bg-lime/10 text-lime" : "border-line bg-surface text-zinc-300"
      }`}
    >
      {message}
    </p>
  );
}

 "use client";

import { ReactNode, useEffect, useState } from "react";
import { Activity, Dna, Sparkles } from "lucide-react";

type Tone = "momentum" | "dna" | "trainer" | "owner";

const toneClasses: Record<Tone, string> = {
  momentum: "from-calm/25 via-lime/10 to-purple-500/15 border-calm/30",
  dna: "from-purple-500/25 via-calm/10 to-lime/15 border-purple-300/30",
  trainer: "from-lime/20 via-calm/10 to-surface border-lime/30",
  owner: "from-calm/20 via-purple-500/10 to-surface border-calm/30"
};

export function AscendHeroPanel({
  eyebrow,
  title,
  body,
  tone,
  visual,
  children,
  className = ""
}: {
  eyebrow: string;
  title: string;
  body: string;
  tone: Tone;
  visual: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`ascend-identity-hero ascend-soft-enter relative mt-3 overflow-hidden rounded-3xl border bg-gradient-to-br p-5 shadow-soft ${toneClasses[tone]} ${className}`}>
      <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-calm/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 left-6 h-40 w-40 rounded-full bg-purple-500/10 blur-3xl" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-calm">{eyebrow}</p>
          <h1 className="mt-2 break-words text-3xl font-semibold leading-tight text-white">{title}</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-300">{body}</p>
        </div>
        <div className="self-start sm:self-auto">{visual}</div>
      </div>
      {children ? <div className="relative mt-4">{children}</div> : null}
    </section>
  );
}

export function MomentumHalo({ value, label = "Momentum" }: { value: number | string; label?: string }) {
  const numeric = typeof value === "number" ? Math.max(0, Math.min(100, value)) : null;
  const dash = numeric === null ? 72 : numeric;
  const [animatedDash, setAnimatedDash] = useState(0);

  useEffect(() => {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setAnimatedDash(dash);
      return;
    }
    setAnimatedDash(0);
    const frame = window.requestAnimationFrame(() => setAnimatedDash(dash));
    return () => window.cancelAnimationFrame(frame);
  }, [dash]);

  return (
    <div className="ascend-float relative grid h-28 w-28 shrink-0 place-items-center" aria-label={`${label} ${value}`}>
      <svg viewBox="0 0 120 120" className="absolute inset-0 h-full w-full -rotate-90">
        <defs>
          <linearGradient id="ascendMomentumGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3DE6D1" />
            <stop offset="52%" stopColor="#A3FF46" />
            <stop offset="100%" stopColor="#8B5CF6" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r="48" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
        <circle
          cx="60"
          cy="60"
          r="48"
          fill="none"
          stroke="url(#ascendMomentumGradient)"
          strokeWidth="8"
          strokeLinecap="round"
          pathLength="100"
          strokeDasharray={`${animatedDash} ${100 - animatedDash}`}
          className="transition-[stroke-dasharray] duration-1000 ease-out"
        />
      </svg>
      <div className="grid h-20 w-20 place-items-center rounded-3xl border border-calm/30 bg-ink/80 text-center shadow-[0_0_32px_rgba(61,230,209,0.12)]">
        <div>
          <p className="text-2xl font-semibold text-white">{value}</p>
          <p className="text-[10px] uppercase tracking-[0.12em] text-calm">{label}</p>
        </div>
      </div>
    </div>
  );
}

export function DnaSigil({ score }: { score?: number | string | null }) {
  return (
    <div className="ascend-float relative grid h-28 w-28 shrink-0 place-items-center" aria-label="Ascend DNA">
      <div className="absolute inset-0 rounded-full bg-purple-500/15 blur-2xl" />
      <div className="relative h-24 w-24 rounded-[2rem] border border-purple-300/35 bg-ink/80 p-4 shadow-lg shadow-purple-500/10">
        <Dna className="mx-auto text-purple-200" size={28} />
        <div className="mt-2 flex justify-center gap-1">
          {[0, 1, 2].map((item) => (
            <span key={item} className="h-7 w-2 rounded-full bg-gradient-to-b from-calm via-purple-300 to-lime" style={{ opacity: 0.55 + item * 0.15 }} />
          ))}
        </div>
        <p className="mt-1 text-center text-xs font-semibold text-white">{score ?? "DNA"}</p>
      </div>
    </div>
  );
}

export function PrioritySigil({ count }: { count: number }) {
  return (
    <div className="ascend-float grid h-24 w-24 shrink-0 place-items-center rounded-[2rem] border border-lime/35 bg-ink/80 shadow-lg shadow-lime/10">
      <Activity className="text-lime" size={24} />
      <p className="text-3xl font-semibold text-white">{count}</p>
      <p className="text-[10px] uppercase tracking-[0.12em] text-lime">Today</p>
    </div>
  );
}

export function BusinessSigil({ status }: { status: string }) {
  return (
    <div className="ascend-float grid h-24 w-24 shrink-0 place-items-center rounded-[2rem] border border-calm/35 bg-ink/80 text-center shadow-lg shadow-calm/10">
      <Sparkles className="text-calm" size={24} />
      <p className="text-sm font-semibold leading-tight text-white">{status}</p>
    </div>
  );
}

import Image from "next/image";
import { ReactNode } from "react";

export function ZoeAvatar({ size = "md", className = "" }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const dimensions = size === "sm" ? "h-8 w-8" : size === "lg" ? "h-14 w-14" : "h-10 w-10";
  return (
    <span className={`relative block shrink-0 overflow-hidden rounded-full border border-purple-300/35 bg-surface shadow-[0_0_22px_rgba(139,92,246,0.18)] ${dimensions} ${className}`} aria-hidden="true">
      <Image src="/brand/coach-zoe.jpg" alt="" fill sizes={size === "sm" ? "32px" : size === "lg" ? "56px" : "40px"} className="object-cover" />
    </span>
  );
}

export function MetricPulse({ pulseKey, children, className = "" }: { pulseKey: string | number; children: ReactNode; className?: string }) {
  return <span key={pulseKey} className={`ascend-metric-change inline-block ${className}`}>{children}</span>;
}

export function StaggerItem({ index, children, className = "" }: { index: number; children: ReactNode; className?: string }) {
  return (
    <div className={`ascend-stagger-enter ${className}`} style={{ animationDelay: `${Math.min(index, 8) * 55}ms` }}>
      {children}
    </div>
  );
}

export function ProgressAchievementVisual({
  eyebrow,
  title,
  detail,
  action
}: {
  eyebrow: string;
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <section className="ascend-success-reveal relative mt-4 overflow-hidden rounded-2xl border border-lime/35 bg-ink" aria-live="polite">
      <div className="relative aspect-[16/8] min-h-48">
        <Image src="/brand/progress-path.jpg" alt="A path rising toward morning light" fill sizes="(max-width: 480px) 100vw, 448px" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/65 to-black/10" />
        <div className="absolute inset-0 flex max-w-[78%] flex-col justify-end p-5">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-lime">{eyebrow}</p>
          <h2 className="mt-2 text-2xl font-semibold leading-tight text-white">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-200">{detail}</p>
        </div>
      </div>
      {action ? <div className="p-4 pt-3">{action}</div> : null}
    </section>
  );
}

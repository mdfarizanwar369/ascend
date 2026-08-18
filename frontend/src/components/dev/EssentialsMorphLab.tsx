"use client";

import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowRight, Beef, HeartPulse } from "lucide-react";
import { AscendEssentialsMorph } from "@/components/dashboard/AscendEssentialsMorph";
import { getAscendMorphV2Timing, useAscendLaunchMorphV2 } from "@/components/dashboard/AscendLaunchMorphV2";
import { SignalProgressRing } from "@/components/dashboard/ClientDashboard";

type SignalKey = "fuel" | "move" | "recover";

const baseSignals = {
  fuel: { key: "fuel" as const, label: "Fuel", icon: Beef, summary: "1 meal", detail: "95g protein left today", done: true, progress: 28 },
  move: { key: "move" as const, label: "Move", icon: Activity, summary: "No log yet", detail: "2 active days this week", done: false, progress: 0 },
  recover: { key: "recover" as const, label: "Recover", icon: HeartPulse, summary: "0.8L water", detail: "1.7L water left / okay sleep", done: false, progress: 38 }
};

export function EssentialsMorphLab() {
  const {
    enabled: morphV2Enabled,
    holdingLaunchGlyph,
    registerLaunchAnchor,
    startDashboardMorph
  } = useAscendLaunchMorphV2();
  const sectionRef = useRef<HTMLElement | null>(null);
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const morphStartFrameRef = useRef<number | null>(null);
  const [running, setRunning] = useState(false);
  const [settled, setSettled] = useState(false);
  const [variant, setVariant] = useState<"v1" | "v2">("v1");
  const [priority, setPriority] = useState<SignalKey>("move");
  const [auditFrame, setAuditFrame] = useState<number | null>(null);
  const [paramsReady, setParamsReady] = useState(false);
  const auditStartedRef = useRef(false);

  useEffect(() => {
    const params = new URL(window.location.href).searchParams;
    setVariant(params.get("variant") === "v2" ? "v2" : "v1");
    const requestedPriority = params.get("priority");
    if (requestedPriority === "fuel" || requestedPriority === "move" || requestedPriority === "recover") {
      setPriority(requestedPriority);
    }
    const frameParam = params.get("frame");
    const requestedFrame = frameParam === null ? null : Number(frameParam);
    if (requestedFrame !== null && Number.isFinite(requestedFrame) && requestedFrame >= 0) {
      setAuditFrame(Math.min(1150, requestedFrame));
    }
    setParamsReady(true);
  }, []);

  useEffect(() => {
    if (auditFrame === null) return;
    document.documentElement.dataset.ascendMorphAuditFrame = String(auditFrame);
    document.documentElement.style.setProperty("--ascend-morph-audit-frame", `${auditFrame}ms`);
    return () => {
      delete document.documentElement.dataset.ascendMorphAuditFrame;
      document.documentElement.style.removeProperty("--ascend-morph-audit-frame");
    };
  }, [auditFrame]);

  const signals = useMemo(() => {
    const remaining = (["fuel", "move", "recover"] as const).filter((key) => key !== priority);
    return [baseSignals[priority], ...remaining.map((key) => baseSignals[key])];
  }, [priority]);

  useEffect(() => {
    if (variant === "v2" && morphV2Enabled && anchorRef.current) registerLaunchAnchor(anchorRef.current);
  }, [morphV2Enabled, registerLaunchAnchor, variant]);

  const abortV1 = useCallback(() => {
    setRunning(false);
    setSettled(true);
  }, []);

  const start = useCallback(() => {
    setSettled(false);
    setRunning(true);
    document.documentElement.dataset.ascendMorphLabStarted = String(performance.now());
    if (variant !== "v2") return;
    const section = sectionRef.current;
    if (!section) return;
    morphStartFrameRef.current = window.requestAnimationFrame(() => {
      morphStartFrameRef.current = null;
      const started = startDashboardMorph({
        section,
        signals: signals.map(({ key, progress, done }) => ({ key, progress, done })),
        onComplete: () => {
          setRunning(false);
          setSettled(true);
        },
        onAbort: () => {
          setRunning(false);
          setSettled(true);
        }
      });
      if (started) return;
      setRunning(false);
      setSettled(true);
    });
  }, [signals, startDashboardMorph, variant]);

  useEffect(() => () => {
    if (morphStartFrameRef.current !== null) window.cancelAnimationFrame(morphStartFrameRef.current);
  }, []);

  useEffect(() => {
    if (!paramsReady || auditFrame === null || auditStartedRef.current) return;
    if (variant === "v2" && (!morphV2Enabled || !holdingLaunchGlyph)) return;
    auditStartedRef.current = true;
    let cancelled = false;
    const frame = window.requestAnimationFrame(() => {
      void document.fonts.ready.then(() => {
        if (!cancelled) start();
      });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [auditFrame, holdingLaunchGlyph, morphV2Enabled, paramsReady, start, variant]);

  useEffect(() => {
    if (!running || variant !== "v1") return;
    const timer = window.setTimeout(() => {
      setRunning(false);
      setSettled(true);
    }, 1120);
    return () => window.clearTimeout(timer);
  }, [running, variant]);

  const entrance = settled ? "settled" : running ? "running" : "waiting";
  const opening = variant === "v2" ? "morphV2" : "morph";

  return (
    <main className="ascend-today-canvas min-h-screen bg-ink pb-24 text-white">
      <span ref={anchorRef} className="pointer-events-none fixed left-1/2 top-[28%] h-28 w-28 -translate-x-1/2 -translate-y-1/2 opacity-0" />
      <div className="mx-auto min-h-screen w-full max-w-md px-4 pt-4">
        <header className="flex items-center justify-between py-3">
          <div>
            <p className="text-lg font-semibold">Ascend</p>
            <p className="text-xs text-zinc-400">Motion comparison lab</p>
          </div>
          <button data-testid="start-morph" type="button" onClick={start} disabled={running} className="h-10 rounded-lg border border-white/10 px-4 text-xs font-semibold text-white disabled:opacity-50">
            Replay {variant.toUpperCase()}
          </button>
        </header>

        <section className="mt-3 rounded-2xl border border-white/[0.08] bg-surface px-4 py-3">
          <p className="text-sm font-semibold">Fariz Anwar</p>
          <p className="mt-1 text-xs text-zinc-400">Premium / deterministic comparison state</p>
        </section>

        <section
          ref={sectionRef}
          data-entrance={entrance}
          data-opening={opening}
          className="ascend-today-essentials mt-3"
          aria-labelledby="morph-lab-title"
        >
          <AscendEssentialsMorph
            active={variant === "v1" && running}
            signals={signals.map(({ key, progress, done }) => ({ key, progress, done }))}
            onAbort={abortV1}
          />
          <div className="ascend-essentials-heading">
            <p className="ascend-eyebrow">Today&apos;s essentials</p>
            <h1 id="morph-lab-title" className="mt-1.5 text-[1.65rem] font-semibold leading-tight text-white">Your three. Build your momentum.</h1>
          </div>
          <div className="ascend-essentials-completion mt-3 flex items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full w-1/3 rounded-full bg-[linear-gradient(90deg,#a484ff,#35f2d0,#63a2ff)]" />
            </div>
            <p className="text-[11px] font-semibold text-zinc-400">1 of 3</p>
          </div>
          <nav className="mt-4 grid gap-3" aria-label="Today activity shortcuts">
            {signals.map((item, index) => {
              const Icon = item.icon;
              const isPriority = index === 0 && !item.done;
              const morphV2Timing = getAscendMorphV2Timing(index);
              const style = {
                "--ascend-essential-entry-delay": `${index * 80}ms`,
                "--ascend-v2-card-delay": `${morphV2Timing.cardDelayMs}ms`,
                "--ascend-v2-content-delay": `${morphV2Timing.contentDelayMs}ms`,
                "--ascend-v2-ring-delay": `${morphV2Timing.ringDelayMs}ms`
              } as CSSProperties;
              return (
                <div
                  key={item.key}
                  data-ascend-opening-target={item.key}
                  data-state={item.done ? "done" : isPriority ? "priority" : "open"}
                  data-active={settled && isPriority ? "true" : "false"}
                  data-tone={item.key}
                  style={style}
                  className="ascend-essential-card ascend-essential-enter"
                >
                  <SignalProgressRing progress={item.progress} done={item.done} priority={isPriority} tone={item.key}>
                    <Icon size={29} strokeWidth={2} />
                  </SignalProgressRing>
                  <span className="ascend-essential-copy min-w-0">
                    <span className="block text-xl font-semibold leading-6 text-white">{item.label}</span>
                    <span className={`ascend-essential-status mt-1 block text-[15px] font-semibold leading-5 ${item.done ? "is-done" : isPriority ? "is-priority" : ""}`}>{item.summary}</span>
                    <span className="mt-1.5 line-clamp-1 block text-xs leading-5 text-zinc-500">{item.detail}</span>
                  </span>
                  <span className="ascend-essential-chevron grid h-9 w-9 place-items-center rounded-full border border-white/[0.08] bg-white/[0.04] text-zinc-300"><ArrowRight size={17} /></span>
                  <span className="ascend-essential-action inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-semibold">Open <ArrowRight size={14} /></span>
                </div>
              );
            })}
          </nav>
        </section>

        <section className="ascend-momentum-result mt-3 flex items-center gap-3 rounded-2xl border border-white/[0.08] px-4 py-3">
          <div className="flex-1">
            <p className="ascend-eyebrow">Your momentum</p>
            <p className="mt-1.5 text-lg font-semibold">20/100</p>
            <p className="mt-1 text-xs text-zinc-400">Built from Fuel, Move and Recover.</p>
          </div>
          <div className="grid h-16 w-16 place-items-center rounded-full border border-purple-300/30 text-sm font-semibold text-purple-200">20</div>
        </section>

        <section className="ascend-today-focus mt-3 rounded-2xl border px-4 py-5 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-purple-200">Today&apos;s focus</p>
          <h2 className="mt-2 text-2xl font-semibold">Movement is today&apos;s best next step</h2>
        </section>
      </div>
    </main>
  );
}

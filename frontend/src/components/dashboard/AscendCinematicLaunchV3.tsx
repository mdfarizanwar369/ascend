"use client";

import {
  createContext,
  type CSSProperties,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { usePathname } from "next/navigation";
import { AscendLogoGlyph, type AscendLogoFragmentKey } from "@/components/brand/AscendLogoGlyph";
import { isTodayEssentialsCinematicV3Requested } from "@/lib/todayEssentialsCinematicV3";

type Point = { x: number; y: number };
type SourceGeometry = { left: number; top: number; size: number };
type TargetGeometry = Point & { size: number };

export type CinematicV3Signal = {
  key: AscendLogoFragmentKey;
  progress: number;
  done: boolean;
};

type CinematicRun = {
  source: SourceGeometry;
  targets: Record<AscendLogoFragmentKey, TargetGeometry>;
  order: AscendLogoFragmentKey[];
  viewport: { width: number; height: number };
};

type StartCinematicOptions = {
  section: HTMLElement;
  signals: CinematicV3Signal[];
  onComplete: () => void;
  onAbort: () => void;
};

type CinematicContextValue = {
  enabled: boolean;
  holdingLaunchGlyph: boolean;
  registerLaunchAnchor: (element: HTMLElement | null) => void;
  startDashboardCinematic: (options: StartCinematicOptions) => boolean;
  dismiss: () => void;
};

const CinematicContext = createContext<CinematicContextValue>({
  enabled: false,
  holdingLaunchGlyph: false,
  registerLaunchAnchor: () => {},
  startDashboardCinematic: () => false,
  dismiss: () => {}
});

const glyphAnchors: Record<AscendLogoFragmentKey, Point> = {
  fuel: { x: 63.5, y: 56 },
  move: { x: 76, y: 59.5 },
  recover: { x: 80, y: 48 }
};

const toneColors: Record<AscendLogoFragmentKey, string> = {
  fuel: "#a484ff",
  move: "#35f2d0",
  recover: "#63a2ff"
};

export function getAscendCinematicV3Timing(rank: number) {
  const normalizedRank = Math.min(2, Math.max(0, rank));
  const launchDelayMs = [160, 230, 290][normalizedRank];
  const flightDurationMs = [360, 380, 400][normalizedRank];
  const contactMs = launchDelayMs + flightDurationMs;

  return {
    launchDelayMs,
    flightDurationMs,
    contactMs,
    cardWakeMs: contactMs + 8,
    ringDrawMs: contactMs,
    contentWakeMs: contactMs + 52
  };
}

function measureTargets(section: HTMLElement) {
  const entries = (["fuel", "move", "recover"] as const).map((key) => {
    const ring = section.querySelector(`[data-ascend-opening-target="${key}"] .ascend-signal-ring`);
    if (!ring) return [key, null] as const;
    const rect = ring.getBoundingClientRect();
    return [key, {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height * (12 / 96),
      size: rect.width
    }] as const;
  });
  return Object.fromEntries(entries) as Record<AscendLogoFragmentKey, TargetGeometry | null>;
}

function fallbackSource(): SourceGeometry {
  const size = Math.min(116, Math.max(92, window.innerWidth * 0.27));
  return {
    left: window.innerWidth / 2 - size / 2,
    top: Math.max(96, window.innerHeight * 0.28 - size / 2),
    size
  };
}

function sourcePoint(source: SourceGeometry, key: AscendLogoFragmentKey) {
  const anchor = glyphAnchors[key];
  return {
    x: source.left + (anchor.x / 128) * source.size,
    y: source.top + (anchor.y / 128) * source.size
  };
}

function energyPath(source: Point, target: Point, rank: number) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const direction = rank === 0 ? 1 : rank === 1 ? -1 : 1;
  const bend = Math.min(104, Math.max(56, Math.abs(dx) * 0.32 + Math.abs(dy) * 0.08));
  const controlOne = {
    x: source.x + dx * 0.2 + bend * direction,
    y: source.y + dy * 0.16
  };
  const controlTwo = {
    x: source.x + dx * 0.76 - bend * direction * 0.52,
    y: source.y + dy * 0.72
  };
  return `M ${source.x} ${source.y} C ${controlOne.x} ${controlOne.y}, ${controlTwo.x} ${controlTwo.y}, ${target.x} ${target.y}`;
}

export function AscendCinematicLaunchV3Provider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [enabled, setEnabled] = useState(process.env.NEXT_PUBLIC_ASCEND_CINEMATIC_LAUNCH_V3 === "true");
  const [source, setSource] = useState<SourceGeometry | null>(null);
  const [run, setRun] = useState<CinematicRun | null>(null);
  const [phase, setPhase] = useState<"idle" | "holding" | "running">("idle");
  const completionTimerRef = useRef<number | null>(null);
  const abortTimerRef = useRef<number | null>(null);
  const refreshFrameRef = useRef<number | null>(null);
  const resizeAbortRef = useRef<(() => void) | null>(null);
  const completionRef = useRef<(() => void) | null>(null);
  const abortRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (isTodayEssentialsCinematicV3Requested()) setEnabled(true);
  }, []);

  const clearTimers = useCallback(() => {
    if (completionTimerRef.current !== null) window.clearTimeout(completionTimerRef.current);
    if (abortTimerRef.current !== null) window.clearTimeout(abortTimerRef.current);
    if (refreshFrameRef.current !== null) window.cancelAnimationFrame(refreshFrameRef.current);
    if (resizeAbortRef.current) window.removeEventListener("resize", resizeAbortRef.current);
    completionTimerRef.current = null;
    abortTimerRef.current = null;
    refreshFrameRef.current = null;
    resizeAbortRef.current = null;
  }, []);

  const dismiss = useCallback(() => {
    clearTimers();
    setRun(null);
    setPhase("idle");
    completionRef.current = null;
    abortRef.current = null;
  }, [clearTimers]);

  const registerLaunchAnchor = useCallback((element: HTMLElement | null) => {
    if (!enabled || !element) return;
    const rect = element.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height);
    setSource({
      left: rect.left + (rect.width - size) / 2,
      top: rect.top + (rect.height - size) / 2,
      size
    });
    setPhase("holding");
  }, [enabled]);

  const startDashboardCinematic = useCallback(({ section, signals, onComplete, onAbort }: StartCinematicOptions) => {
    if (!enabled || phase !== "holding") return false;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduceMotion) {
      dismiss();
      onComplete();
      return true;
    }

    const targets = measureTargets(section);
    if ((["fuel", "move", "recover"] as const).some((key) => !targets[key])) {
      dismiss();
      onAbort();
      return true;
    }

    const orderedKeys = signals.map((signal) => signal.key);
    const remainingKeys = (["fuel", "move", "recover"] as const).filter((key) => !orderedKeys.includes(key));
    completionRef.current = onComplete;
    abortRef.current = onAbort;
    setRun({
      source: source ?? fallbackSource(),
      targets: targets as Record<AscendLogoFragmentKey, TargetGeometry>,
      order: [...orderedKeys, ...remainingKeys],
      viewport: { width: window.innerWidth, height: window.innerHeight }
    });
    setPhase("running");

    refreshFrameRef.current = window.requestAnimationFrame(() => {
      refreshFrameRef.current = window.requestAnimationFrame(() => {
        refreshFrameRef.current = null;
        const refreshedTargets = measureTargets(section);
        if ((["fuel", "move", "recover"] as const).some((key) => !refreshedTargets[key])) return;
        setRun((current) => current ? {
          ...current,
          targets: refreshedTargets as Record<AscendLogoFragmentKey, TargetGeometry>,
          viewport: { width: window.innerWidth, height: window.innerHeight }
        } : current);
      });
    });

    const auditFrame = window.location.pathname.startsWith("/dev/essentials-morph")
      ? document.documentElement.dataset.ascendMorphAuditFrame
      : undefined;
    if (!auditFrame) {
      completionTimerRef.current = window.setTimeout(() => {
        completionTimerRef.current = null;
        setRun(null);
        setPhase("idle");
        completionRef.current?.();
        completionRef.current = null;
        abortRef.current = null;
      }, 1040);
    }

    const abortOnResize = () => {
      clearTimers();
      setRun(null);
      setPhase("idle");
      abortRef.current?.();
      completionRef.current = null;
      abortRef.current = null;
    };
    resizeAbortRef.current = abortOnResize;
    window.addEventListener("resize", abortOnResize, { once: true });
    abortTimerRef.current = window.setTimeout(() => {
      window.removeEventListener("resize", abortOnResize);
      if (resizeAbortRef.current === abortOnResize) resizeAbortRef.current = null;
      abortTimerRef.current = null;
    }, auditFrame ? 10_000 : 1050);
    return true;
  }, [clearTimers, dismiss, enabled, phase, source]);

  useEffect(() => {
    if (!enabled || phase !== "holding" || pathname === "/launch" || pathname === "/dashboard" || pathname.startsWith("/dev/essentials-morph")) return;
    const timer = window.setTimeout(dismiss, 120);
    return () => window.clearTimeout(timer);
  }, [dismiss, enabled, pathname, phase]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const value = useMemo<CinematicContextValue>(() => ({
    enabled,
    holdingLaunchGlyph: phase === "holding",
    registerLaunchAnchor,
    startDashboardCinematic,
    dismiss
  }), [dismiss, enabled, phase, registerLaunchAnchor, startDashboardCinematic]);

  return (
    <CinematicContext.Provider value={value}>
      {children}
      {enabled && phase !== "idle" ? (
        <div className="ascend-cinematic-v3-overlay" data-phase={phase} aria-hidden="true">
          {source ? (
            <>
              <AscendLogoGlyph
                className="ascend-cinematic-v3-glyph-base"
                style={{ left: source.left, top: source.top, width: source.size, height: source.size }}
              />
              {phase === "running" ? (
                <AscendLogoGlyph
                  className="ascend-cinematic-v3-glyph-charge"
                  style={{ left: source.left, top: source.top, width: source.size, height: source.size }}
                />
              ) : null}
            </>
          ) : null}
          {phase === "running" && run ? (
            <svg
              className="ascend-cinematic-v3-stage"
              viewBox={`0 0 ${run.viewport.width} ${run.viewport.height}`}
              preserveAspectRatio="none"
            >
              <defs>
                {(["fuel", "move", "recover"] as const).map((key) => {
                  const rank = Math.max(0, run.order.indexOf(key));
                  const start = sourcePoint(run.source, key);
                  const target = run.targets[key];
                  return (
                    <linearGradient key={key} id={`ascend-v3-energy-${key}`} gradientUnits="userSpaceOnUse" x1={start.x} y1={start.y} x2={target.x} y2={target.y}>
                      <stop offset="0" stopColor="#a484ff" />
                      <stop offset="0.5" stopColor={rank === 0 ? "#35f2d0" : toneColors[key]} />
                      <stop offset="1" stopColor={toneColors[key]} />
                    </linearGradient>
                  );
                })}
              </defs>
              {(["fuel", "move", "recover"] as const).map((key) => {
                const rank = Math.max(0, run.order.indexOf(key));
                const timing = getAscendCinematicV3Timing(rank);
                const start = sourcePoint(run.source, key);
                const target = run.targets[key];
                const path = energyPath(start, target, rank);
                const style = {
                  "--ascend-v3-launch-delay": `${timing.launchDelayMs}ms`,
                  "--ascend-v3-flight-duration": `${timing.flightDurationMs}ms`,
                  "--ascend-v3-contact-delay": `${timing.contactMs}ms`
                } as CSSProperties;
                return (
                  <g key={key} data-tone={key} data-rank={rank} style={style}>
                    <path className="ascend-cinematic-v3-trail-soft" d={path} pathLength="100" stroke={`url(#ascend-v3-energy-${key})`} />
                    <path className="ascend-cinematic-v3-trail-core" d={path} pathLength="100" stroke={`url(#ascend-v3-energy-${key})`} />
                    <circle className="ascend-cinematic-v3-impact" cx={target.x} cy={target.y} r={rank === 0 ? 8 : 6} fill="none" stroke={toneColors[key]} />
                  </g>
                );
              })}
            </svg>
          ) : null}
        </div>
      ) : null}
    </CinematicContext.Provider>
  );
}

export function useAscendCinematicLaunchV3() {
  return useContext(CinematicContext);
}

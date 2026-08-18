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
import { isTodayEssentialsMorphV22Requested } from "@/lib/todayEssentialsMorphV22";

type Point = { x: number; y: number };
type SourceGeometry = { left: number; top: number; size: number };
type TargetGeometry = Point & { size: number };

const GLYPH_SCALE = 1.2;
const COMPLETE_MS = 1000;

export function getAscendMorphV22Timing(rank: number) {
  const normalizedRank = Math.min(2, Math.max(0, rank));
  const flightDelayMs = [160, 250, 320][normalizedRank];
  const flightDurationMs = [340, 380, 400][normalizedRank];
  const contactMs = flightDelayMs + flightDurationMs;

  return {
    flightDelayMs,
    flightDurationMs,
    contactMs,
    cardDelayMs: contactMs,
    ringDelayMs: contactMs,
    contactPulseDelayMs: contactMs
  };
}

export type MorphV22Signal = {
  key: AscendLogoFragmentKey;
  progress: number;
  done: boolean;
};

type MorphRun = {
  source: SourceGeometry;
  targets: Record<AscendLogoFragmentKey, TargetGeometry>;
  order: AscendLogoFragmentKey[];
};

type StartMorphOptions = {
  section: HTMLElement;
  signals: MorphV22Signal[];
  onComplete: () => void;
  onAbort: () => void;
};

type MorphContextValue = {
  enabled: boolean;
  holdingLaunchGlyph: boolean;
  registerLaunchAnchor: (element: HTMLElement | null) => void;
  startDashboardMorph: (options: StartMorphOptions) => boolean;
  dismiss: () => void;
};

const MorphContext = createContext<MorphContextValue>({
  enabled: false,
  holdingLaunchGlyph: false,
  registerLaunchAnchor: () => {},
  startDashboardMorph: () => false,
  dismiss: () => {}
});

const fragmentAnchors: Record<AscendLogoFragmentKey, Point> = {
  fuel: { x: 63.5, y: 56 },
  move: { x: 76, y: 59.5 },
  recover: { x: 80, y: 48 }
};

const separation: Record<AscendLogoFragmentKey, Point> = {
  fuel: { x: -14, y: 5 },
  move: { x: 3, y: -13 },
  recover: { x: 15, y: 4 }
};

const travelLane: Record<AscendLogoFragmentKey, number> = {
  fuel: -6,
  move: 0,
  recover: 6
};

function targetGeometry(section: HTMLElement) {
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

function scaledSource(rect: DOMRect): SourceGeometry {
  const baseSize = Math.min(rect.width, rect.height);
  const size = baseSize * GLYPH_SCALE;
  return {
    left: rect.left + rect.width / 2 - size / 2,
    top: rect.top + rect.height / 2 - size / 2,
    size
  };
}

function fallbackSource(): SourceGeometry {
  const baseSize = Math.min(116, Math.max(92, window.innerWidth * 0.27));
  const size = baseSize * GLYPH_SCALE;
  return {
    left: window.innerWidth / 2 - size / 2,
    top: Math.max(84, window.innerHeight * 0.28 - size / 2),
    size
  };
}

export function AscendLaunchMorphV22Provider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [enabled, setEnabled] = useState(process.env.NEXT_PUBLIC_ASCEND_ESSENTIALS_MORPH_V22 === "true");
  const [source, setSource] = useState<SourceGeometry | null>(null);
  const [run, setRun] = useState<MorphRun | null>(null);
  const [phase, setPhase] = useState<"idle" | "holding" | "running">("idle");
  const completionTimerRef = useRef<number | null>(null);
  const abortTimerRef = useRef<number | null>(null);
  const refreshFrameRef = useRef<number | null>(null);
  const finalRefreshTimerRef = useRef<number | null>(null);
  const resizeAbortRef = useRef<(() => void) | null>(null);
  const completionRef = useRef<(() => void) | null>(null);
  const abortRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (isTodayEssentialsMorphV22Requested()) setEnabled(true);
  }, []);

  const clearTimers = useCallback(() => {
    if (completionTimerRef.current !== null) window.clearTimeout(completionTimerRef.current);
    if (abortTimerRef.current !== null) window.clearTimeout(abortTimerRef.current);
    if (finalRefreshTimerRef.current !== null) window.clearTimeout(finalRefreshTimerRef.current);
    if (refreshFrameRef.current !== null) window.cancelAnimationFrame(refreshFrameRef.current);
    completionTimerRef.current = null;
    abortTimerRef.current = null;
    finalRefreshTimerRef.current = null;
    refreshFrameRef.current = null;
    if (resizeAbortRef.current) window.removeEventListener("resize", resizeAbortRef.current);
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
    const nextSource = scaledSource(element.getBoundingClientRect());
    setSource((current) => (
      current
      && Math.abs(current.left - nextSource.left) < 0.5
      && Math.abs(current.top - nextSource.top) < 0.5
      && Math.abs(current.size - nextSource.size) < 0.5
        ? current
        : nextSource
    ));
    setPhase("holding");
  }, [enabled]);

  const startDashboardMorph = useCallback(({ section, signals, onComplete, onAbort }: StartMorphOptions) => {
    if (!enabled || phase !== "holding") return false;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduceMotion) {
      dismiss();
      onComplete();
      return true;
    }

    const measuredTargets = targetGeometry(section);
    if ((["fuel", "move", "recover"] as const).some((key) => !measuredTargets[key])) {
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
      targets: measuredTargets as Record<AscendLogoFragmentKey, TargetGeometry>,
      order: [...orderedKeys, ...remainingKeys]
    });
    setPhase("running");

    let framesRemaining = 8;
    const refreshTargets = () => {
      refreshFrameRef.current = window.requestAnimationFrame(() => {
        refreshFrameRef.current = null;
        framesRemaining -= 1;
        if (framesRemaining > 0) {
          refreshTargets();
          return;
        }
        const refreshedTargets = targetGeometry(section);
        if ((["fuel", "move", "recover"] as const).some((key) => !refreshedTargets[key])) return;
        setRun((current) => current ? {
          ...current,
          targets: refreshedTargets as Record<AscendLogoFragmentKey, TargetGeometry>
        } : current);
      });
    };
    refreshTargets();
    finalRefreshTimerRef.current = window.setTimeout(() => {
      finalRefreshTimerRef.current = null;
      const refreshedTargets = targetGeometry(section);
      if ((["fuel", "move", "recover"] as const).some((key) => !refreshedTargets[key])) return;
      setRun((current) => current ? {
        ...current,
        targets: refreshedTargets as Record<AscendLogoFragmentKey, TargetGeometry>
      } : current);
    }, 155);

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
      }, COMPLETE_MS);
    }

    const abortOnResize = () => {
      clearTimers();
      setRun(null);
      setPhase("idle");
      abortRef.current?.();
      completionRef.current = null;
      abortRef.current = null;
      resizeAbortRef.current = null;
    };
    resizeAbortRef.current = abortOnResize;
    window.addEventListener("resize", abortOnResize, { once: true });
    abortTimerRef.current = window.setTimeout(() => {
      window.removeEventListener("resize", abortOnResize);
      if (resizeAbortRef.current === abortOnResize) resizeAbortRef.current = null;
      abortTimerRef.current = null;
    }, auditFrame ? 10_000 : COMPLETE_MS + 20);
    return true;
  }, [clearTimers, dismiss, enabled, phase, source]);

  useEffect(() => {
    if (
      !enabled
      || phase !== "holding"
      || pathname === "/launch"
      || pathname === "/dashboard"
      || pathname.startsWith("/dev/essentials-morph")
    ) return;
    const timer = window.setTimeout(dismiss, 180);
    return () => window.clearTimeout(timer);
  }, [dismiss, enabled, pathname, phase]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const value = useMemo<MorphContextValue>(() => ({
    enabled,
    holdingLaunchGlyph: phase === "holding",
    registerLaunchAnchor,
    startDashboardMorph,
    dismiss
  }), [dismiss, enabled, phase, registerLaunchAnchor, startDashboardMorph]);

  return (
    <MorphContext.Provider value={value}>
      {children}
      {enabled && phase !== "idle" ? (
        <div className="ascend-morph-v22-overlay" data-phase={phase} aria-hidden="true">
          {source ? (
            <>
              <AscendLogoGlyph
                className="ascend-morph-v22-whole"
                style={{ left: source.left, top: source.top, width: source.size, height: source.size }}
              />
              {phase === "running" ? (
                <AscendLogoGlyph
                  className="ascend-morph-v22-charge"
                  style={{ left: source.left, top: source.top, width: source.size, height: source.size }}
                />
              ) : null}
            </>
          ) : null}
          {phase === "running" && run ? (
            <>
              {(["fuel", "move", "recover"] as const).map((key) => {
                const rank = Math.max(0, run.order.indexOf(key));
                const timing = getAscendMorphV22Timing(rank);
                const anchor = fragmentAnchors[key];
                const anchorX = run.source.left + (anchor.x / 128) * run.source.size;
                const anchorY = run.source.top + (anchor.y / 128) * run.source.size;
                const target = run.targets[key];
                const dx = target.x - anchorX;
                const dy = target.y - anchorY;
                const length = Math.max(1, Math.hypot(dx, dy));
                const wakeDistance = rank === 0 ? 6 : 4;
                const wakeDx = dx - (dx / length) * wakeDistance;
                const wakeDy = dy - (dy / length) * wakeDistance;
                const separateX = separation[key].x;
                const separateY = separation[key].y;
                const laneX = travelLane[key];
                const targetScale = Math.max(0.5, Math.min(0.66, target.size / run.source.size * 0.82));
                const style = {
                  left: `${run.source.left}px`,
                  top: `${run.source.top}px`,
                  width: `${run.source.size}px`,
                  height: `${run.source.size}px`,
                  transformOrigin: `${(anchor.x / 128) * 100}% ${(anchor.y / 128) * 100}%`,
                  "--ascend-v22-dx": `${dx}px`,
                  "--ascend-v22-dy": `${dy}px`,
                  "--ascend-v22-mid-x": `${dx * 0.88 + laneX}px`,
                  "--ascend-v22-mid-y": `${separateY + (dy - separateY) * 0.52}px`,
                  "--ascend-v22-near-x": `${dx * 0.98 + laneX * 0.2}px`,
                  "--ascend-v22-near-y": `${separateY + (dy - separateY) * 0.9}px`,
                  "--ascend-v22-wake-dx": `${wakeDx}px`,
                  "--ascend-v22-wake-dy": `${wakeDy}px`,
                  "--ascend-v22-separate-x": `${separateX}px`,
                  "--ascend-v22-separate-y": `${separateY}px`,
                  "--ascend-v22-target-scale": `${targetScale}`,
                  "--ascend-v22-flight-delay": `${timing.flightDelayMs}ms`,
                  "--ascend-v22-flight-duration": `${timing.flightDurationMs}ms`,
                  "--ascend-v22-wake-opacity": rank === 0 ? "0.10" : "0.07",
                  "--ascend-v22-wake-mid-opacity": rank === 0 ? "0.065" : "0.045",
                  "--ascend-v22-wake-tail-opacity": rank === 0 ? "0.018" : "0.012"
                } as CSSProperties;
                return (
                  <span key={key} className="contents">
                    <AscendLogoGlyph fragment={key} className="ascend-morph-v22-wake" style={style} />
                    <AscendLogoGlyph fragment={key} className="ascend-morph-v22-fragment" style={style} />
                  </span>
                );
              })}
            </>
          ) : null}
        </div>
      ) : null}
    </MorphContext.Provider>
  );
}

export function useAscendLaunchMorphV22() {
  return useContext(MorphContext);
}

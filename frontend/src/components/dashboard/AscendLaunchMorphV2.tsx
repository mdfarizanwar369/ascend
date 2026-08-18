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
import { isTodayEssentialsMorphV2Requested } from "@/lib/todayEssentialsMorphV2";

type Point = { x: number; y: number };
type SourceGeometry = { left: number; top: number; size: number };
type TargetGeometry = Point & { size: number };

export type MorphV2Signal = {
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
  signals: MorphV2Signal[];
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
  fuel: { x: -13, y: 4 },
  move: { x: 2, y: -12 },
  recover: { x: 14, y: 3 }
};

function targetGeometry(section: HTMLElement) {
  const entries = (["fuel", "move", "recover"] as const).map((key) => {
    const ring = section.querySelector(`[data-ascend-opening-target="${key}"] .ascend-signal-ring`);
    if (!ring) return [key, null] as const;
    const rect = ring.getBoundingClientRect();
    return [key, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, size: rect.width }] as const;
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

export function AscendLaunchMorphV2Provider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [enabled, setEnabled] = useState(process.env.NEXT_PUBLIC_ASCEND_ESSENTIALS_MORPH_V2 === "true");
  const [source, setSource] = useState<SourceGeometry | null>(null);
  const [run, setRun] = useState<MorphRun | null>(null);
  const [phase, setPhase] = useState<"idle" | "holding" | "running">("idle");
  const completionTimerRef = useRef<number | null>(null);
  const abortTimerRef = useRef<number | null>(null);
  const targetRefreshFrameOneRef = useRef<number | null>(null);
  const targetRefreshFrameTwoRef = useRef<number | null>(null);
  const resizeAbortRef = useRef<(() => void) | null>(null);
  const completionRef = useRef<(() => void) | null>(null);
  const abortRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (isTodayEssentialsMorphV2Requested()) setEnabled(true);
  }, []);

  const clearTimers = useCallback(() => {
    if (completionTimerRef.current !== null) window.clearTimeout(completionTimerRef.current);
    if (abortTimerRef.current !== null) window.clearTimeout(abortTimerRef.current);
    if (targetRefreshFrameOneRef.current !== null) window.cancelAnimationFrame(targetRefreshFrameOneRef.current);
    if (targetRefreshFrameTwoRef.current !== null) window.cancelAnimationFrame(targetRefreshFrameTwoRef.current);
    completionTimerRef.current = null;
    abortTimerRef.current = null;
    targetRefreshFrameOneRef.current = null;
    targetRefreshFrameTwoRef.current = null;
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
    const rect = element.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height);
    const nextSource = {
      left: rect.left + (rect.width - size) / 2,
      top: rect.top + (rect.height - size) / 2,
      size
    };
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

    const refreshTargetsAfterLayout = (framesRemaining: number) => {
      targetRefreshFrameTwoRef.current = window.requestAnimationFrame(() => {
        targetRefreshFrameTwoRef.current = null;
        if (framesRemaining > 1) {
          refreshTargetsAfterLayout(framesRemaining - 1);
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
    targetRefreshFrameOneRef.current = window.requestAnimationFrame(() => {
      targetRefreshFrameOneRef.current = null;
      refreshTargetsAfterLayout(8);
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
      }, 1150);
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
    }, auditFrame ? 10_000 : 1160);
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
        <div className="ascend-morph-v2-overlay" data-phase={phase} aria-hidden="true">
          {phase === "holding" && source ? (
            <AscendLogoGlyph
              className="ascend-morph-v2-whole"
              style={{ left: source.left, top: source.top, width: source.size, height: source.size }}
            />
          ) : null}
          {phase === "running" && run ? (
            <>
              {(["fuel", "move", "recover"] as const).map((key) => {
                const rank = Math.max(0, run.order.indexOf(key));
                const anchor = fragmentAnchors[key];
                const anchorX = run.source.left + (anchor.x / 128) * run.source.size;
                const anchorY = run.source.top + (anchor.y / 128) * run.source.size;
                const target = run.targets[key];
                const style = {
                  left: `${run.source.left}px`,
                  top: `${run.source.top}px`,
                  width: `${run.source.size}px`,
                  height: `${run.source.size}px`,
                  transformOrigin: `${(anchor.x / 128) * 100}% ${(anchor.y / 128) * 100}%`,
                  "--ascend-v2-dx": `${target.x - anchorX}px`,
                  "--ascend-v2-dy": `${target.y - anchorY}px`,
                  "--ascend-v2-separate-x": `${separation[key].x}px`,
                  "--ascend-v2-separate-y": `${separation[key].y}px`,
                  "--ascend-v2-target-scale": `${Math.max(0.42, Math.min(0.68, target.size / run.source.size * 0.78))}`,
                  "--ascend-v2-flight-delay": `${250 + rank * 65}ms`,
                  "--ascend-v2-flight-duration": `${510 - Math.min(rank, 2) * 20}ms`
                } as CSSProperties;
                return (
                  <AscendLogoGlyph
                    key={key}
                    fragment={key}
                    className="ascend-morph-v2-fragment"
                    style={style}
                  />
                );
              })}
              <AscendLogoGlyph
                fragment="move"
                className="ascend-morph-v2-activation"
                style={{
                  left: `${run.source.left}px`,
                  top: `${run.source.top}px`,
                  width: `${run.source.size}px`,
                  height: `${run.source.size}px`
                }}
              />
            </>
          ) : null}
        </div>
      ) : null}
    </MorphContext.Provider>
  );
}

export function useAscendLaunchMorphV2() {
  return useContext(MorphContext);
}

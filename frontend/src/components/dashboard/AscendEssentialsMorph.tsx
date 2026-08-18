"use client";

import { type CSSProperties, useLayoutEffect, useRef, useState } from "react";

type SignalKey = "fuel" | "move" | "recover";

export type AscendEssentialsMorphSignal = {
  key: SignalKey;
  progress: number;
  done: boolean;
};

type Point = { x: number; y: number };

type MorphGeometry = {
  width: number;
  height: number;
  origin: Point;
  targets: Record<SignalKey, Point>;
};

const signalOrder: SignalKey[] = ["fuel", "move", "recover"];

const separation: Record<SignalKey, Point> = {
  fuel: { x: -15, y: 4 },
  move: { x: 0, y: -13 },
  recover: { x: 15, y: 4 }
};

function centerWithin(element: Element, containerRect: DOMRect): Point {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left - containerRect.left + rect.width / 2,
    y: rect.top - containerRect.top + rect.height / 2
  };
}

function clampProgress(value: number) {
  return Math.min(100, Math.max(0, value));
}

export function AscendEssentialsMorph({
  active,
  signals,
  onAbort
}: {
  active: boolean;
  signals: AscendEssentialsMorphSignal[];
  onAbort: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState<MorphGeometry | null>(null);

  useLayoutEffect(() => {
    if (!active) {
      setGeometry(null);
      return;
    }

    const overlay = overlayRef.current;
    const section = overlay?.closest(".ascend-today-essentials");
    if (!overlay || !section) {
      onAbort();
      return;
    }

    const sectionRect = section.getBoundingClientRect();
    const targets = Object.fromEntries(signalOrder.map((key) => {
      const target = section.querySelector(`[data-ascend-opening-target="${key}"] .ascend-signal-ring`);
      return [key, target ? centerWithin(target, sectionRect) : null];
    })) as Record<SignalKey, Point | null>;

    if (signalOrder.some((key) => !targets[key])) {
      onAbort();
      return;
    }

    const firstTargetY = targets.fuel?.y ?? 190;
    setGeometry({
      width: sectionRect.width,
      height: sectionRect.height,
      origin: {
        x: sectionRect.width / 2,
        y: Math.max(74, Math.min(96, firstTargetY - 92))
      },
      targets: targets as Record<SignalKey, Point>
    });

    const abortOnResize = () => onAbort();
    window.addEventListener("resize", abortOnResize, { once: true });
    return () => window.removeEventListener("resize", abortOnResize);
  }, [active, onAbort]);

  const signalMap = new Map(signals.map((signal) => [signal.key, signal]));

  return (
    <div ref={overlayRef} className="ascend-essentials-morph" aria-hidden="true">
      {active && geometry ? (
        <svg
          className="ascend-essentials-morph-stage"
          viewBox={`0 0 ${geometry.width} ${geometry.height}`}
          preserveAspectRatio="none"
        >
          <circle
            className="ascend-essentials-morph-halo"
            cx={geometry.origin.x}
            cy={geometry.origin.y}
            r="54"
          />

          <g transform={`translate(${geometry.origin.x} ${geometry.origin.y})`}>
            {signalOrder.map((key) => {
              const target = geometry.targets[key];
              const signal = signalMap.get(key);
              const progress = signal?.done ? 100 : clampProgress(signal?.progress ?? 0);
              const style = {
                "--ascend-morph-dx": `${target.x - geometry.origin.x}px`,
                "--ascend-morph-dy": `${target.y - geometry.origin.y}px`,
                "--ascend-morph-separate-x": `${separation[key].x}px`,
                "--ascend-morph-separate-y": `${separation[key].y}px`
              } as CSSProperties;

              return (
                <g key={key} className="ascend-essentials-morph-fragment" data-tone={key} style={style}>
                  <circle
                    className="ascend-essentials-morph-ring"
                    cx="0"
                    cy="0"
                    r="36"
                    pathLength="100"
                    strokeDasharray={`${Math.max(progress, 3)} 100`}
                    transform="rotate(-90)"
                  />

                  {key === "fuel" ? (
                    <path
                      className="ascend-essentials-morph-mark"
                      d="M-40 34 L-13 -34 Q-7 -47 1 -31 L15 -5"
                    />
                  ) : null}

                  {key === "move" ? (
                    <path
                      className="ascend-essentials-morph-mark"
                      d="M-40 34 Q10 26 42 -19 M30 -19 L43 -20 L42 -7"
                    />
                  ) : null}

                  {key === "recover" ? (
                    <g className="ascend-essentials-morph-mark">
                      <path d="M0 -31 Q12 -9 27 -3 Q38 2 46 -10" />
                      <path d="M18 -2 L30 33" />
                      <circle cx="15" cy="-25" r="5" fill="currentColor" stroke="none" />
                    </g>
                  ) : null}
                </g>
              );
            })}
          </g>
        </svg>
      ) : null}
    </div>
  );
}

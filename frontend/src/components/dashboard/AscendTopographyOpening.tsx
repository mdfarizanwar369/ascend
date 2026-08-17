"use client";

import type { CSSProperties } from "react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

type SignalKey = "fuel" | "move" | "recover";

export type AscendTopographySignal = {
  key: SignalKey;
  label: string;
  value: string;
  progress: number;
};

type Point = { x: number; y: number };

type SceneGeometry = {
  origin: Point;
  stageWidth: number;
  stageHeight: number;
  markerOrigins: Record<SignalKey, Point>;
  markerTargets: Record<SignalKey, Point>;
};

const CONTOURS = [
  "M26 170 C45 76 123 30 211 46 C287 59 342 111 334 180 C326 244 254 279 172 270 C92 261 18 224 26 170 Z",
  "M52 170 C66 97 128 61 207 70 C273 78 315 119 308 179 C300 228 246 249 174 244 C105 238 43 218 52 170 Z",
  "M80 170 C90 120 137 91 204 96 C256 100 286 132 281 178 C275 215 232 226 176 219 C124 214 73 205 80 170 Z",
  "M108 170 C114 140 149 119 201 120 C238 120 259 145 254 177 C249 201 219 204 177 197 C140 191 103 190 108 170 Z"
];

const LAYER_MOTION = [
  { x: -18, y: 8, z: 46, rotate: -2.4 },
  { x: 14, y: -8, z: 32, rotate: 1.7 },
  { x: -9, y: -5, z: 21, rotate: -1.2 },
  { x: 7, y: 5, z: 12, rotate: 0.8 }
];

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function centerOf(element: Element) {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function markerStyle(origin: Point, target: Point, index: number) {
  return {
    left: `${origin.x}px`,
    top: `${origin.y}px`,
    "--topography-target-x": `${target.x - origin.x}px`,
    "--topography-target-y": `${target.y - origin.y}px`,
    "--topography-marker-delay": `${index * 45}ms`
  } as CSSProperties;
}

export function AscendTopographyOpening({
  active,
  score,
  isStarting,
  signals,
  onFinish
}: {
  active: boolean;
  score: number;
  isStarting: boolean;
  signals: AscendTopographySignal[];
  onFinish: () => void;
}) {
  const [scene, setScene] = useState<SceneGeometry | null>(null);
  const finishRef = useRef(onFinish);
  const gradientId = useId().replace(/:/g, "");

  useEffect(() => {
    finishRef.current = onFinish;
  }, [onFinish]);

  useLayoutEffect(() => {
    if (!active) {
      setScene(null);
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finishRef.current();
      return;
    }

    let finished = false;
    let finishTimer = 0;
    let secondFrame = 0;

    const finish = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(finishTimer);
      setScene(null);
      finishRef.current();
    };

    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        const momentum = document.querySelector('[data-ascend-opening-target="momentum"]');
        const fuel = document.querySelector('[data-ascend-opening-target="fuel"]');
        const move = document.querySelector('[data-ascend-opening-target="move"]');
        const recover = document.querySelector('[data-ascend-opening-target="recover"]');

        if (!momentum || !fuel || !move || !recover) {
          finish();
          return;
        }

        const origin = centerOf(momentum);
        const stageWidth = Math.min(400, window.innerWidth * 0.96);
        const stageHeight = Math.min(320, window.innerHeight * 0.42);
        const horizontalSpread = Math.min(118, stageWidth * 0.29);

        setScene({
          origin,
          stageWidth,
          stageHeight,
          markerOrigins: {
            fuel: { x: origin.x - horizontalSpread, y: origin.y + 20 },
            move: { x: origin.x, y: origin.y + 72 },
            recover: { x: origin.x + horizontalSpread, y: origin.y + 20 }
          },
          markerTargets: {
            fuel: centerOf(fuel),
            move: centerOf(move),
            recover: centerOf(recover)
          }
        });

        finishTimer = window.setTimeout(finish, 1780);
      });
    });

    window.addEventListener("scroll", finish, { passive: true, once: true });

    return () => {
      finished = true;
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      window.clearTimeout(finishTimer);
      window.removeEventListener("scroll", finish);
    };
  }, [active]);

  if (!active || !scene) return null;

  const progress = isStarting ? 0 : clamp(score);
  const radius = 76;
  const ringOffset = 100 - progress;
  const endAngle = ((progress / 100) * 360 - 90) * (Math.PI / 180);
  const arrowX = 180 + radius * Math.cos(endAngle);
  const arrowY = 150 + radius * Math.sin(endAngle);

  return (
    <div className="ascend-topography-overlay" aria-hidden="true" data-testid="ascend-topography-opening">
      <div
        className="ascend-topography-stage"
        style={{
          left: `${scene.origin.x}px`,
          top: `${scene.origin.y}px`,
          width: `${scene.stageWidth}px`,
          height: `${scene.stageHeight}px`
        }}
      >
        <div className="ascend-topography-depth-stack">
          {CONTOURS.map((path, index) => {
            const motion = LAYER_MOTION[index];
            return (
              <svg
                key={path}
                className="ascend-topography-depth-layer"
                viewBox="0 0 360 300"
                style={{
                  "--topography-layer": index,
                  "--topography-layer-delay": `${index * 45}ms`,
                  "--topography-release-x": `${motion.x}px`,
                  "--topography-release-y": `${motion.y}px`,
                  "--topography-release-z": `${motion.z}px`,
                  "--topography-release-rotate": `${motion.rotate}deg`,
                  "--topography-return-x": `${motion.x * -0.55}px`,
                  "--topography-return-y": `${motion.y * -0.55}px`,
                  "--topography-return-rotate": `${motion.rotate * -0.45}deg`
                } as CSSProperties}
              >
                <path className="ascend-topography-contour" d={path} pathLength="1" />
              </svg>
            );
          })}
        </div>

        <svg className="ascend-topography-identity" viewBox="0 0 360 300">
          <defs>
            <linearGradient id={`${gradientId}-rise`} x1="96" y1="220" x2="238" y2="67" gradientUnits="userSpaceOnUse">
              <stop stopColor="#a484ff" />
              <stop offset="0.56" stopColor="#35f2d0" />
              <stop offset="1" stopColor="#a3ff46" />
            </linearGradient>
          </defs>

          <g className="ascend-topography-mountain" fill="none" stroke={`url(#${gradientId}-rise)`} strokeLinecap="round" strokeLinejoin="round">
            <path d="M100 211 L147 111 C155 94 178 94 186 111 L222 203" pathLength="1" strokeWidth="7" />
            <path className="ascend-topography-ascent" d="M111 214 C145 193 178 151 229 78" pathLength="1" strokeWidth="7" />
          </g>

          <g className="ascend-topography-climber" fill="none" stroke="#a3ff46" strokeLinecap="round" strokeLinejoin="round">
            <path d="M-5 -5 L5 0 L-5 5" strokeWidth="4" />
          </g>

          <g className="ascend-topography-summit" fill="none" stroke="#a3ff46" strokeLinecap="round" strokeLinejoin="round">
            <path d="M211 79 H231 V99" strokeWidth="7" />
            <path className="ascend-topography-summit-cut ascend-topography-summit-cut-one" d="M229 78 C252 76 272 64 287 45" pathLength="1" />
            <path className="ascend-topography-summit-cut ascend-topography-summit-cut-two" d="M229 78 C258 90 284 91 311 81" pathLength="1" />
            <path className="ascend-topography-summit-cut ascend-topography-summit-cut-three" d="M229 78 C239 105 254 124 280 141" pathLength="1" />
          </g>

          <circle className="ascend-topography-ring-track" cx="180" cy="150" r={radius} pathLength="100" />
          <circle
            className="ascend-topography-ring-progress"
            cx="180"
            cy="150"
            r={radius}
            pathLength="100"
            stroke={`url(#${gradientId}-rise)`}
            strokeDasharray="100"
            style={{ "--topography-ring-offset": ringOffset } as CSSProperties}
            transform="rotate(-90 180 150)"
          />
          {isStarting ? (
            <circle className="ascend-topography-ring-arrow" cx="180" cy="74" r="4" fill="#35f2d0" />
          ) : progress > 0 ? (
            <g
              className="ascend-topography-ring-arrow"
              style={{
                "--topography-arrow-x": `${arrowX}px`,
                "--topography-arrow-y": `${arrowY}px`,
                "--topography-arrow-rotate": `${progress * 3.6}deg`
              } as CSSProperties}
            >
              <path d="M-4 -4 L5 0 L-4 4" fill="none" stroke="#a3ff46" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" />
            </g>
          ) : null}
        </svg>

        <div className="ascend-topography-momentum-value">
          <strong>{isStarting ? "--" : score}</strong>
          <span>Momentum</span>
        </div>
      </div>

      {signals.map((signal, index) => (
        <div
          key={signal.key}
          className="ascend-topography-data-marker"
          data-signal={signal.key}
          style={markerStyle(scene.markerOrigins[signal.key], scene.markerTargets[signal.key], index)}
        >
          <span>{signal.label}</span>
          <strong>{signal.value}</strong>
          <i aria-hidden="true"><b style={{ width: `${clamp(signal.progress)}%` }} /></i>
        </div>
      ))}
    </div>
  );
}

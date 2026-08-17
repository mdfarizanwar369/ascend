"use client";

import type { CSSProperties } from "react";

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

export function AscendRiseMomentum({
  score,
  label,
  isStarting = false,
  animate = false
}: {
  score: number;
  label: string;
  isStarting?: boolean;
  animate?: boolean;
}) {
  const radius = 76;
  const progress = isStarting ? 0 : clamp(score);
  const endAngle = ((progress / 100) * 360 - 90) * (Math.PI / 180);
  const endX = 100 + radius * Math.cos(endAngle);
  const endY = 100 + radius * Math.sin(endAngle);
  const endRotation = progress * 3.6;
  const ringStyle = {
    strokeDashoffset: 100 - progress,
    "--ascend-ring-offset": 100 - progress
  } as CSSProperties;

  return (
    <div
      className="ascend-rise-momentum relative mx-auto h-[9.5rem] w-[9.5rem] sm:h-[10.75rem] sm:w-[10.75rem]"
      data-animate={animate ? "true" : "false"}
      data-starting={isStarting ? "true" : "false"}
      role="img"
      aria-label={isStarting ? "Momentum starts building after your first check-in." : `Momentum ${score} out of 100, based on your last seven days.`}
    >
      <svg className="h-full w-full" viewBox="0 0 200 200" role="img" aria-hidden="true">
        <defs>
          <linearGradient id="ascend-rise-gradient" x1="34" y1="30" x2="170" y2="170" gradientUnits="userSpaceOnUse">
            <stop stopColor="#a484ff" />
            <stop offset="0.52" stopColor="#35f2d0" />
            <stop offset="1" stopColor="#a3ff46" />
          </linearGradient>
        </defs>

        <circle className="ascend-rise-track" cx="100" cy="100" r={radius} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="9" />
        <circle
          className="ascend-rise-progress"
          cx="100"
          cy="100"
          r={radius}
          pathLength="100"
          fill="none"
          stroke="url(#ascend-rise-gradient)"
          strokeLinecap="round"
          strokeWidth="9"
          strokeDasharray="100"
          style={ringStyle}
          transform="rotate(-90 100 100)"
        />

        <g className="ascend-rise-mark" fill="none" stroke="url(#ascend-rise-gradient)" strokeLinecap="round" strokeLinejoin="round">
          <path d="M63 132 L85 77 C90 65 107 65 112 77 L133 125" strokeWidth="10" />
          <path d="M75 132 C95 119 120 102 138 69" strokeWidth="9" />
          <path d="M127 70 H139 V82" stroke="#35f2d0" strokeWidth="8" />
          <circle cx="113" cy="84" r="6.5" fill="#35f2d0" stroke="none" />
        </g>

        {isStarting ? (
          <circle className="ascend-rise-seed" cx="100" cy="24" r="4.5" fill="#35f2d0" />
        ) : progress > 0 ? (
          <g className="ascend-rise-endpoint" transform={`translate(${endX} ${endY}) rotate(${endRotation})`}>
            <path d="M-4 -4 L5 0 L-4 4" fill="none" stroke="#a3ff46" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" />
          </g>
        ) : null}
      </svg>

      <div className="absolute inset-0 grid place-items-center text-center">
        <div className="ascend-rise-score">
          <p className="text-4xl font-semibold leading-none text-white sm:text-5xl">{isStarting ? "--" : score}</p>
          <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.2em] text-purple-200">Momentum</p>
          <p className="mt-1 text-xs font-medium text-calm">{label}</p>
        </div>
      </div>
    </div>
  );
}

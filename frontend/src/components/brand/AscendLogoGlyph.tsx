"use client";

import { type CSSProperties, useId } from "react";

export type AscendLogoFragmentKey = "fuel" | "move" | "recover";

type GlyphProps = {
  className?: string;
  fragment?: AscendLogoFragmentKey;
  destinationTone?: AscendLogoFragmentKey;
  geometry?: "rounded" | "production";
  style?: CSSProperties;
};

/** Rounded app-icon geometry plus the sharper production brand-mark geometry. */
export function AscendLogoGlyph({ className, fragment, destinationTone, geometry = "rounded", style }: GlyphProps) {
  const gradientId = `ascend-glyph-${useId().replace(/:/g, "")}`;
  const showFuel = !fragment || fragment === "fuel";
  const showMove = !fragment || fragment === "move";
  const showRecover = !fragment || fragment === "recover";
  const destinationColor = destinationTone === "fuel"
    ? "#A484FF"
    : destinationTone === "move"
      ? "#35F2D0"
      : destinationTone === "recover"
        ? "#63A2FF"
        : null;

  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 128 128"
      fill="none"
      aria-hidden="true"
      data-ascend-morph-v2-fragment={fragment}
    >
      {geometry === "production" ? (
        <>
          {showFuel ? (
            <>
              <path
                d="M17 108L49 28C53 18 59 14 66 16C71 17 74 21 77 28L88 52C93 62 100 67 108 65C114 64 119 60 124 55C116 70 105 77 93 75C81 73 74 65 69 54L59 38L35 94L17 108Z"
                fill={`url(#${gradientId})`}
              />
              <path
                d="M80 68L100 107C103 113 110 115 117 110L98 60L80 68Z"
                fill={`url(#${gradientId})`}
              />
            </>
          ) : null}
          {showMove ? (
            <path
              d="M17 108C46 100 71 88 92 72C107 60 115 46 119 30L108 35L121 18L124 41L117 35C113 53 103 69 88 82C68 98 44 107 17 108Z"
              fill={`url(#${gradientId})`}
            />
          ) : null}
          {showRecover ? <circle cx="92" cy="44" r="8" fill="#35F2D0" /> : null}
        </>
      ) : (
        <>
          {showFuel ? (
            <path
              d="M26 88L52 34C57 23 73 23 78 34L101 82"
              stroke={destinationColor ?? `url(#${gradientId})`}
              strokeWidth="13"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
          {showMove ? (
            <>
              <path
                d="M40 88C62 75 87 61 106 31"
                stroke={destinationColor ?? `url(#${gradientId})`}
                strokeWidth="12"
                strokeLinecap="round"
              />
              <path
                d="M92 33H106V47"
                stroke={destinationColor ?? "#35F2D0"}
                strokeWidth="12"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          ) : null}
          {showRecover ? <circle cx="80" cy="48" r="9" fill={destinationColor ?? "#35F2D0"} /> : null}
        </>
      )}
      <defs>
        <linearGradient id={gradientId} x1="17" y1="18" x2="124" y2="108" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A855F7" />
          <stop offset="0.52" stopColor="#3B82F6" />
          <stop offset="1" stopColor="#35F2D0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

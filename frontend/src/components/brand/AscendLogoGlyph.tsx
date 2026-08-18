"use client";

import { type CSSProperties, useId } from "react";

export type AscendLogoFragmentKey = "fuel" | "move" | "recover";

type GlyphProps = {
  className?: string;
  fragment?: AscendLogoFragmentKey;
  destinationTone?: AscendLogoFragmentKey;
  style?: CSSProperties;
};

/** Canonical geometry from public/icon.svg. Keep both assets in sync. */
export function AscendLogoGlyph({ className, fragment, destinationTone, style }: GlyphProps) {
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
      <defs>
        <linearGradient id={gradientId} x1="26" y1="28" x2="110" y2="88" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A855F7" />
          <stop offset="0.52" stopColor="#3B82F6" />
          <stop offset="1" stopColor="#35F2D0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

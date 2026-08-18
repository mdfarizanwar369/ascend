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

/** Rounded app-icon geometry plus the exact production brand-mark asset. */
export function AscendLogoGlyph({ className, fragment, destinationTone, geometry = "rounded", style }: GlyphProps) {
  const gradientId = `ascend-glyph-${useId().replace(/:/g, "")}`;
  const productionAsset = fragment
    ? `/brand/ascend-mark-${fragment}-exact.png`
    : "/brand/ascend-mark-exact.png";
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
        <image
          href={productionAsset}
          x="4"
          y="15.75"
          width="120"
          height="96.47"
          preserveAspectRatio="xMidYMid meet"
        />
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

"use client";

import Image from "next/image";

export function BrandMark({ size = "md", showWordmark = false }: { size?: "sm" | "md" | "lg"; showWordmark?: boolean }) {
  const sizeClass =
    size === "lg" ? "mx-auto h-56 w-full max-w-72 self-center" : size === "sm" ? "h-9 w-9 rounded-lg" : "h-10 w-10 rounded-lg";
  const displayClass = size === "lg" ? "grid" : "inline-grid";
  const imageSizes = size === "lg" ? "(max-width: 768px) 288px, 320px" : "40px";

  return (
    <span className={`relative ${displayClass} shrink-0 place-items-center bg-transparent ${sizeClass}`}>
      <Image
        src="/brand/ascend-logo.png"
        alt={showWordmark ? "Ascend" : ""}
        fill
        sizes={imageSizes}
        className="object-contain"
        priority={size === "lg"}
      />
    </span>
  );
}

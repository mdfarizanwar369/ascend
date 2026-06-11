"use client";

import Image from "next/image";

export function BrandMark({ size = "md", showWordmark = false }: { size?: "sm" | "md" | "lg"; showWordmark?: boolean }) {
  const sizeClass = size === "lg" ? "h-20 w-20 rounded-2xl" : size === "sm" ? "h-9 w-9 rounded-lg" : "h-10 w-10 rounded-lg";

  return (
    <span className={`relative inline-grid shrink-0 place-items-center overflow-hidden bg-ink shadow-lg shadow-teal/20 ${sizeClass}`}>
      <Image
        src="/brand/ascend-logo.png"
        alt={showWordmark ? "Ascend" : ""}
        fill
        sizes="80px"
        className="scale-[1.7] object-cover"
        style={{ objectPosition: "50% 38%" }}
        priority={size === "lg"}
      />
    </span>
  );
}

"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export function BackButton({ fallbackHref = "/dashboard", disabled = false }: { fallbackHref?: string; disabled?: boolean }) {
  const router = useRouter();

  function goBack() {
    if (disabled) return;
    router.push(fallbackHref);
  }

  return (
    <button
      type="button"
      onClick={goBack}
      disabled={disabled}
      className="ascend-pressable grid h-12 w-12 shrink-0 touch-manipulation place-items-center rounded-lg border border-line bg-surface text-zinc-100 shadow-sm hover:border-calm/50 hover:bg-surface/90 disabled:cursor-wait disabled:opacity-40"
      aria-label={disabled ? "Saving in progress" : "Go back"}
    >
      <ArrowLeft size={21} />
    </button>
  );
}

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
      className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-line bg-surface disabled:cursor-wait disabled:opacity-40"
      aria-label={disabled ? "Saving in progress" : "Go back"}
    >
      <ArrowLeft size={19} />
    </button>
  );
}

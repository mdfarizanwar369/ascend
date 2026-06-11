"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export function BackButton({ fallbackHref = "/dashboard" }: { fallbackHref?: string }) {
  const router = useRouter();

  function goBack() {
    router.push(fallbackHref);
  }

  return (
    <button
      type="button"
      onClick={goBack}
      className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-line bg-surface"
      aria-label="Go back"
    >
      <ArrowLeft size={19} />
    </button>
  );
}

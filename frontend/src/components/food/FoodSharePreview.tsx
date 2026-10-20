"use client";

import { useEffect, useRef, useState } from "react";
import { Share2, X } from "lucide-react";
import { shareAscendImage } from "@/lib/ascendStoryShare";

export function FoodSharePreview({ blob, previewUrl, foodName, onClose }: {
  blob: Blob;
  previewUrl: string;
  foodName: string;
  onClose: () => void;
}) {
  const [isSharing, setIsSharing] = useState(false);
  const [status, setStatus] = useState("");
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSharing) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isSharing, onClose]);

  async function handleShare() {
    if (isSharing) return;
    setIsSharing(true);
    setStatus("");
    try {
      const result = await shareAscendImage(blob, {
        title: "Share my meal",
        text: "My meal on Ascend.",
        filePrefix: "ascend-food-snap"
      });
      setStatus(result === "download" ? "Your image was downloaded. You can post it from your photos or files." : "Share sheet opened. You choose where to post it.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not share this image. Please try again.";
      setStatus(/abort|cancel/i.test(message) ? "Sharing cancelled." : message);
    } finally {
      setIsSharing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#070c16]/95 px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] text-white backdrop-blur-lg" role="dialog" aria-modal="true" aria-label="Meal share preview">
      <div className="mx-auto max-w-md">
        <header className="mb-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-lime">Food snap</p>
            <h2 className="mt-1 text-xl font-semibold">Ready to share</h2>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} disabled={isSharing} aria-label="Close share preview" className="ascend-pressable grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-white/5 disabled:opacity-60"><X size={20} /></button>
        </header>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={previewUrl} alt={`Share card preview for ${foodName}`} className="mx-auto aspect-[4/5] w-full max-w-[350px] rounded-2xl border border-white/15 object-contain shadow-[0_24px_80px_rgba(0,0,0,0.6)]" />
        <p className="mt-4 text-center text-sm text-zinc-300">Your meal photo and reviewed estimate, ready to post.</p>
        <button type="button" onClick={handleShare} disabled={isSharing} className="ascend-pressable mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-lime text-base font-semibold text-ink disabled:opacity-60">
          <Share2 size={19} />{isSharing ? "Opening share options..." : "Share image"}
        </button>
        {status ? <p className="mt-3 text-center text-sm text-zinc-300" role="status">{status}</p> : null}
      </div>
    </div>
  );
}

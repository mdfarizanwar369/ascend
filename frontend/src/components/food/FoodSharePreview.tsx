"use client";

import { useEffect, useRef, useState } from "react";
import { Share2, X } from "lucide-react";
import { shareAscendImage } from "@/lib/ascendStoryShare";
import type { FoodShareFormat } from "@/lib/foodShareCard";

export function FoodSharePreview({ blob, previewUrl, foodName, format, hasPhoto, isPreparing, renderError, onFormatChange, onClose }: {
  blob: Blob;
  previewUrl: string;
  foodName: string;
  format: FoodShareFormat;
  hasPhoto: boolean;
  isPreparing: boolean;
  renderError: string;
  onFormatChange: (format: FoodShareFormat) => void;
  onClose: () => void;
}) {
  const [isSharing, setIsSharing] = useState(false);
  const [status, setStatus] = useState("");
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSharing && !isPreparing) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isPreparing, isSharing, onClose]);

  async function handleShare() {
    if (isSharing || isPreparing) return;
    setIsSharing(true);
    setStatus("");
    try {
      const result = await shareAscendImage(blob, {
        title: "Share my meal",
        text: "My meal on Ascend.",
        filePrefix: format === "story" ? "ascend-food-story" : "ascend-food-snap"
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
          <button ref={closeRef} type="button" onClick={onClose} disabled={isSharing || isPreparing} aria-label="Close share preview" className="ascend-pressable grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-white/5 disabled:opacity-60"><X size={20} /></button>
        </header>
        {hasPhoto ? (
          <div className="mb-4 grid grid-cols-2 rounded-xl border border-white/15 bg-white/5 p-1" aria-label="Share format">
            {(["story", "post"] as const).map((option) => (
              <button key={option} type="button" onClick={() => onFormatChange(option)} disabled={isSharing || isPreparing} aria-pressed={format === option} className={`ascend-pressable min-h-11 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60 ${format === option ? "bg-lime text-ink" : "text-zinc-300"}`}>
                {option === "story" ? "Story · full screen" : "Post · feed"}
              </button>
            ))}
          </div>
        ) : null}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={previewUrl} alt={`${format === "story" ? "Story" : "Post"} share preview for ${foodName}`} className={`mx-auto w-auto max-w-full rounded-2xl border border-white/15 object-contain shadow-[0_24px_80px_rgba(0,0,0,0.6)] ${format === "story" ? "max-h-[min(54dvh,540px)] aspect-[9/16]" : "max-h-[min(54dvh,540px)] aspect-[4/5]"}`} />
        <p className="mt-3 text-center text-sm text-zinc-300">{format === "story" ? "Full-screen Story using your original meal photo." : "Your reviewed meal estimate, ready to post."}</p>
        {renderError ? <p className="mt-2 text-center text-sm text-amber" role="alert">{renderError}</p> : null}
        <button type="button" onClick={handleShare} disabled={isSharing || isPreparing} className="ascend-pressable mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-lime text-base font-semibold text-ink disabled:opacity-60">
          <Share2 size={19} />{isSharing ? "Opening share options..." : "Share image"}
        </button>
        {status ? <p className="mt-3 text-center text-sm text-zinc-300" role="status">{status}</p> : null}
      </div>
    </div>
  );
}

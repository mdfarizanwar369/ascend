"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Share2, Sparkles } from "lucide-react";
import { getProgressPhotos } from "@/lib/ascendApi";

type ProgressPhoto = Awaited<ReturnType<typeof getProgressPhotos>>["progressPhotos"][number];

const LazyAscendStoriesComposer = dynamic(
  () => import("@/components/progress/AscendStoriesComposer").then((module) => module.AscendStoriesComposer),
  {
    ssr: false,
    loading: () => <div className="fixed inset-0 z-[100] grid place-items-center bg-ink p-5 text-sm text-zinc-300">Preparing your story...</div>
  }
);

export function AscendStoriesLauncher({ photos }: { photos: ProgressPhoto[] }) {
  const [open, setOpen] = useState(false);
  const hasPhoto = photos.some((photo) => Boolean(photo.image_url));

  return (
    <>
      <section className="ascend-surface mt-4 overflow-hidden border-purple-400/35 p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-purple-400/30 bg-purple-500/10 text-purple-200"><Sparkles size={21} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-purple-300">Ascend Stories</p>
            <h2 className="mt-1 text-lg font-semibold">Turn progress into something worth sharing.</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">Your photos stay private until you choose to export.</p>
          </div>
        </div>
        <button type="button" disabled={!hasPhoto} onClick={() => setOpen(true)} className="ascend-pressable mt-4 flex h-12 w-full items-center justify-center rounded-xl bg-lime font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-45"><Share2 className="mr-2" size={18} />Share Your Ascent</button>
        {!hasPhoto ? <p className="mt-2 text-center text-xs text-zinc-500">Add your first progress photo to begin.</p> : null}
      </section>
      {open ? <LazyAscendStoriesComposer photos={photos} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

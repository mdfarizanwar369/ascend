"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import type { ExerciseVisual } from "@ascend/shared";
import { recordWorkoutVisualEvent } from "@/lib/ascendApi";

type Props = { exercise: ExerciseVisual };

export function ExerciseVisualCard({ exercise }: Props) {
  const [failed, setFailed] = useState(false);
  const [reported, setReported] = useState(false);
  const [loadedImages, setLoadedImages] = useState<string[]>([]);
  const failureReported = useRef(false);
  if (failed) return null;

  function handleError() {
    setFailed(true);
    if (!failureReported.current) {
      failureReported.current = true;
      void recordWorkoutVisualEvent("image_load_failure", exercise.id).catch(() => undefined);
    }
  }

  const images = exercise.images.kind === "pair"
    ? [{ src: exercise.images.start, label: "Start" }, { src: exercise.images.peak, label: "Peak" }]
    : [{ src: exercise.images.main, label: "Position" }];

  return (
    <div className="mt-3 rounded-xl border border-line bg-surface/80 p-2.5 text-zinc-200">
      <div className={`grid gap-2 ${images.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
        {images.map(({ src, label }) => (
          <figure key={src} className="min-w-0 overflow-hidden rounded-lg bg-surface">
            <div className="relative aspect-square">
            <Image src={src} alt={`${exercise.canonicalName}${label === "Position" ? " position" : `: ${label.toLowerCase()} position`}`} width={512} height={512}
              sizes={images.length === 2 ? "(max-width: 480px) 38vw, 180px" : "(max-width: 480px) 76vw, 360px"}
              className={`mx-auto aspect-square max-h-64 w-full object-contain ${loadedImages.includes(src) ? "opacity-100" : "opacity-0"}`}
              loading="lazy" unoptimized onLoad={() => setLoadedImages(previous => previous.includes(src) ? previous : [...previous, src])} onError={handleError} />
            {!loadedImages.includes(src) ? <span aria-hidden="true" className="absolute inset-0 grid place-items-center bg-ink/70 text-[11px] text-zinc-400">Loading visual…</span> : null}
            </div>
            <figcaption className="bg-surface px-2 py-1 text-center text-[10px] font-bold uppercase tracking-widest text-zinc-400">{label}</figcaption>
          </figure>
        ))}
      </div>
      <div className="mt-2 text-xs leading-5 text-zinc-300">
        <p><span className="font-semibold text-zinc-100">Equipment:</span> {exercise.equipment} · <span className="font-semibold text-zinc-100">Targets:</span> {exercise.targetMuscles}</p>
        <p className="mt-1">{exercise.instructions}</p>
        <p className="mt-1 text-zinc-400"><span className="font-semibold text-zinc-100">Form cue:</span> {exercise.cue}</p>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-[11px]">
        <span className="text-zinc-400">Original Ascend exercise visual</span>
        <button type="button" disabled={reported} className="text-zinc-400 underline underline-offset-2 disabled:no-underline" onClick={() => {
          void recordWorkoutVisualEvent("incorrect_mapping_report", exercise.id).then(() => setReported(true)).catch(() => undefined);
        }}>{reported ? "Report sent" : "Report incorrect visual"}</button>
      </div>
    </div>
  );
}

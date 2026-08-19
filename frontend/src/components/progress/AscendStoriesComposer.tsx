"use client";

import { CSSProperties, useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock3, Copy, Download, ImageIcon, Share2, SlidersHorizontal, Sparkles, X } from "lucide-react";
import {
  getAscendMemory,
  getBurnLogs,
  getFoodLogs,
  getGoalStatus,
  getMyProgressComparison,
  getMyStreak,
  getProgressPhotos
} from "@/lib/ascendApi";
import {
  AscendStoryContext,
  AscendStoryCrop,
  AscendStoryDraft,
  AscendStoryFormat,
  AscendStoryPhoto,
  AscendStoryStyle,
  availableStoryFormats,
  buildVerifiedStoryMetrics,
  createStoryDraft,
  defaultStoryCaption,
  formatStoryDate,
  isThenNowDateReversed,
  isThenNowSelectionValid,
  listVerifiedMilestones,
  storyElapsedLabel
} from "@/lib/ascendStories";
import { recordAscendStoryEvent } from "@/lib/ascendStoryAnalytics";
import { renderAscendStory } from "@/lib/ascendStoryRenderer";
import { saveAscendStory, shareAscendStory } from "@/lib/ascendStoryShare";

type ProgressPhoto = Awaited<ReturnType<typeof getProgressPhotos>>["progressPhotos"][number];

function storyPhoto(photo: ProgressPhoto): AscendStoryPhoto | null {
  if (!photo.image_url) return null;
  return {
    id: photo.id,
    url: photo.image_url,
    loggedAt: photo.logged_at,
    photoType: photo.photo_type
  };
}

function photoTransform(crop: AscendStoryCrop): CSSProperties {
  return {
    transform: `translate(${crop.x * 0.42}%, ${crop.y * 0.42}%) scale(${crop.zoom})`,
    transformOrigin: "center"
  };
}

function readableErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return "Could not prepare your story. Please try again.";
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

async function loadStoryContext(photos: ProgressPhoto[]): Promise<AscendStoryContext> {
  const available = photos.map(storyPhoto).filter((photo): photo is AscendStoryPhoto => Boolean(photo));
  if (!available.length) throw new Error("Add a progress photo before creating a story.");
  const sorted = [...available].sort((left, right) => new Date(left.loggedAt).getTime() - new Date(right.loggedAt).getTime());
  const latestPhoto = sorted[sorted.length - 1];
  const matchingAngle = sorted.filter((photo) => photo.photoType === latestPhoto.photoType);

  const [memoryResult, streakResult, progressResult, burnResult, foodResult, goalResult] = await Promise.allSettled([
    getAscendMemory(),
    getMyStreak(),
    getMyProgressComparison(),
    getBurnLogs(),
    getFoodLogs({ range: "all", order: "newest", limit: 100 }),
    getGoalStatus()
  ]);

  const memory = memoryResult.status === "fulfilled" ? memoryResult.value.timeline : [];
  const streak = streakResult.status === "fulfilled" ? streakResult.value.streak : { current: 0, best: 0 };
  const progress = progressResult.status === "fulfilled" ? progressResult.value.comparison : null;
  const burnLogs = burnResult.status === "fulfilled" ? burnResult.value.burnLogs : [];
  const workoutsAreMinimum = burnLogs.length >= 100;
  const foodLogs = foodResult.status === "fulfilled" ? foodResult.value.foodLogs : [];
  const mealsAreMinimum = foodResult.status === "fulfilled" && foodResult.value.nextOffset !== null && foodResult.value.nextOffset !== undefined;
  const goal = goalResult.status === "fulfilled" ? goalResult.value.goalStatus : null;
  const currentWeight = progress?.current.weightKg ?? null;
  const baselineWeight = progress?.baseline.weightKg ?? null;
  const milestones = listVerifiedMilestones({
    memories: memory,
    currentStreak: streak.current,
    bestStreak: streak.best,
    goalAchievedAt: goal?.achieved_at ?? null,
    workouts: burnLogs.length,
    workoutsAreMinimum,
    meals: foodLogs.length,
    mealsAreMinimum
  });

  return {
    firstPhoto: matchingAngle[0] ?? latestPhoto,
    latestPhoto,
    currentStreak: streak.current,
    milestone: milestones[0] ?? null,
    milestones,
    metrics: buildVerifiedStoryMetrics({
      currentStreak: streak.current,
      momentum: progress?.current.momentum ?? null,
      currentWeight,
      baselineWeight,
      workouts: burnLogs.length,
      workoutsAreMinimum,
      meals: foodLogs.length,
      mealsAreMinimum
    })
  };
}

const formatLabels: Record<AscendStoryFormat, string> = {
  today: "Today",
  "then-now": "Then → Now",
  earned: "Earned"
};

const styleLabels: Record<AscendStoryStyle, string> = {
  loud: "Loud",
  cinematic: "Cinematic",
  quiet: "Quiet"
};

function CropControls({ label, crop, onChange }: { label: string; crop: AscendStoryCrop; onChange: (crop: AscendStoryCrop) => void }) {
  return (
    <div className="rounded-xl border border-line bg-ink/70 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">{label}</p>
      <label className="mt-3 block text-xs text-zinc-300">
        Zoom
        <input className="mt-1 h-9 w-full accent-lime" type="range" min="1" max="2.5" step="0.05" value={crop.zoom} onChange={(event) => onChange({ ...crop, zoom: Number(event.target.value) })} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs text-zinc-300">
          Left / right
          <input className="mt-1 h-9 w-full accent-lime" type="range" min="-50" max="50" step="1" value={crop.x} onChange={(event) => onChange({ ...crop, x: Number(event.target.value) })} />
        </label>
        <label className="block text-xs text-zinc-300">
          Up / down
          <input className="mt-1 h-9 w-full accent-lime" type="range" min="-50" max="50" step="1" value={crop.y} onChange={(event) => onChange({ ...crop, y: Number(event.target.value) })} />
        </label>
      </div>
    </div>
  );
}

export function StoryPreview({ context, draft }: { context: AscendStoryContext; draft: AscendStoryDraft }) {
  const loud = draft.style === "loud";
  const quiet = draft.style === "quiet";
  const overlay = loud
    ? "from-[#210d3d]/95 via-transparent to-black/55"
    : quiet
      ? "from-[#09111c]/88 via-transparent to-[#09111c]/35"
      : "from-[#08101d]/95 via-transparent to-black/50";

  return (
    <div className="relative aspect-[9/16] w-full overflow-hidden rounded-2xl border border-white/15 bg-ink shadow-[0_20px_70px_rgba(0,0,0,0.42)]" aria-label="Story preview">
      {draft.format === "then-now" ? (
        <div className="absolute inset-0 grid grid-cols-2">
          <div className="relative overflow-hidden border-r border-white/75">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={context.firstPhoto.url} alt="Earlier progress" className="h-full w-full object-cover" style={photoTransform(draft.firstCrop)} />
          </div>
          <div className="relative overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={context.latestPhoto.url} alt="Latest progress" className="h-full w-full object-cover" style={photoTransform(draft.latestCrop)} />
          </div>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={context.latestPhoto.url} alt="Latest progress" className="absolute inset-0 h-full w-full object-cover" style={photoTransform(draft.latestCrop)} />
      )}
      <div className={`absolute inset-0 bg-gradient-to-t ${overlay}`} />
      {draft.format === "then-now" ? <div className="pointer-events-none absolute inset-x-4 top-1/2 border-t border-dashed border-white/35" aria-hidden="true" /> : null}
      {draft.showAttribution ? <div className="absolute left-5 top-[8%] flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/ascend-mark-exact.png" alt="" className="h-8 w-8 object-contain" />
        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-white">ASCEND</p>
          <p className="text-[8px] font-semibold tracking-[0.2em] text-white/65">MADE WITH ASCEND</p>
        </div>
      </div> : null}
      {draft.format === "then-now" ? (
        <div className="absolute inset-x-5 bottom-[30%] flex justify-between text-[10px] font-bold tracking-[0.22em]">
          <span className="text-white/75">THEN</span>
          <span className="text-lime">NOW</span>
        </div>
      ) : null}
      <div className="absolute inset-x-5 bottom-[13%]">
        {draft.format === "earned" && context.milestone ? <p className="mb-2 text-[10px] font-bold tracking-[0.24em] text-lime">EARNED</p> : null}
        {draft.caption.trim() ? <p className={`${loud ? "text-3xl" : quiet ? "text-xl" : "text-2xl"} font-semibold leading-tight text-white`}>{draft.caption}</p> : null}
        {draft.showDate ? <p className="mt-2 text-[11px] text-white/65">{formatStoryDate(context.latestPhoto.loggedAt)}</p> : null}
        {draft.showElapsed && draft.format === "then-now" ? <p className="mt-1 text-[10px] text-white/55">{storyElapsedLabel(context.firstPhoto.loggedAt, context.latestPhoto.loggedAt)}</p> : null}
        {draft.metricKeys.length && context.metrics.length ? (
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {context.metrics.filter((metric) => draft.metricKeys.includes(metric.key)).map((metric) => (
              <div key={metric.key} className="rounded-lg border border-white/15 bg-black/50 p-2 backdrop-blur-sm">
                <p className="truncate text-[8px] uppercase tracking-[0.08em] text-white/55">{metric.label}</p>
                <p className="mt-1 text-[11px] font-semibold text-white">{metric.value}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MilestoneReveal({ milestone, reducedMotion, onClose }: { milestone: NonNullable<AscendStoryContext["milestone"]>; reducedMotion: boolean; onClose: () => void }) {
  useEffect(() => {
    if (reducedMotion) return;
    const timeout = window.setTimeout(onClose, 2_200);
    return () => window.clearTimeout(timeout);
  }, [onClose, reducedMotion]);

  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-ink/95 p-6 text-center" role="status">
      <div className={reducedMotion ? "" : "animate-[fade-in_260ms_ease-out]"}>
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-lime/40 bg-lime/10 text-lime"><Sparkles size={28} /></span>
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-purple-300">A moment you earned</p>
        <p className="mx-auto mt-3 max-w-xs text-2xl font-semibold leading-tight text-white">{milestone.title}</p>
        <button type="button" onClick={onClose} className="ascend-pressable mt-6 h-11 rounded-full border border-line px-6 text-sm font-semibold text-zinc-200">Continue</button>
      </div>
    </div>
  );
}

export function AscendStoriesComposer({ photos, onClose }: { photos: ProgressPhoto[]; onClose: () => void }) {
  const [context, setContext] = useState<AscendStoryContext | null>(null);
  const [draft, setDraft] = useState<AscendStoryDraft | null>(null);
  const [status, setStatus] = useState("Preparing your story...");
  const [isWorking, setIsWorking] = useState(false);
  const [showCrop, setShowCrop] = useState(false);
  const [showReveal, setShowReveal] = useState(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    let mounted = true;
    loadStoryContext(photos)
      .then((next) => {
        if (!mounted) return;
        setContext(next);
        setDraft(createStoryDraft("today", next));
        setStatus("Your photos stay on this device while the story is created.");
        recordAscendStoryEvent("ascend_story_opened");
      })
      .catch((error) => mounted && setStatus(error instanceof Error ? error.message : "Could not prepare your story."));
    return () => { mounted = false; };
  }, [photos]);

  const formats = useMemo(() => context ? availableStoryFormats(context) : [], [context]);
  const selectablePhotos = useMemo(() => {
    const source = photos.map(storyPhoto).filter((photo): photo is AscendStoryPhoto => Boolean(photo));
    return Array.from(new Map(source.map((photo) => [photo.id, photo])).values())
      .sort((left, right) => new Date(right.loggedAt).getTime() - new Date(left.loggedAt).getTime());
  }, [photos]);

  const reversedDates = Boolean(context && draft?.format === "then-now" && isThenNowDateReversed(context.firstPhoto, context.latestPhoto));

  function selectPhoto(role: "first" | "latest", photoId: string) {
    if (!context) return;
    const selected = selectablePhotos.find((photo) => photo.id === photoId);
    if (!selected) return;
    const next = role === "first" ? { ...context, firstPhoto: selected } : { ...context, latestPhoto: selected };
    if (draft?.format === "then-now" && !isThenNowSelectionValid(next.firstPhoto, next.latestPhoto)) {
      setStatus("Choose two different photos for Then → Now.");
      return;
    }
    setContext(next);
    setStatus("Photo selection updated.");
  }

  function selectFormat(format: AscendStoryFormat) {
    if (!context || !draft) return;
    setDraft({ ...draft, format, showElapsed: format === "then-now", caption: defaultStoryCaption(format, context) });
    if (format === "earned" && context.milestone && !reducedMotion) setShowReveal(true);
    recordAscendStoryEvent("ascend_story_format_selected", { format, style: draft.style });
  }

  function selectMilestone(milestoneKey: string) {
    if (!context || !draft) return;
    const milestone = context.milestones.find((item) => item.key === milestoneKey);
    if (!milestone) return;
    setContext({ ...context, milestone });
    setDraft({ ...draft, caption: milestone.title });
  }

  function selectStyle(style: AscendStoryStyle) {
    if (!draft) return;
    setDraft({ ...draft, style });
    recordAscendStoryEvent("ascend_story_style_selected", { format: draft.format, style });
  }

  async function exportStory(action: "share" | "save") {
    if (!context || !draft || isWorking) return;
    setIsWorking(true);
    setStatus(action === "share" ? "Preparing your share sheet..." : "Preparing your image...");
    let imageGenerated = false;
    try {
      const blob = await renderAscendStory(context, draft);
      imageGenerated = true;
      recordAscendStoryEvent("ascend_story_preview_generated", { format: draft.format, style: draft.style });
      if (action === "share") {
        const result = await shareAscendStory(blob, draft.caption);
        recordAscendStoryEvent(result === "download" ? "ascend_story_image_saved" : "ascend_story_share_sheet_opened", { format: draft.format, style: draft.style, platform: result === "native" ? "native" : "web" });
        setStatus(result === "download" ? "Sharing is unavailable here, so your PNG was downloaded." : "Share sheet opened. Your story remains yours.");
      } else {
        const result = await saveAscendStory(blob);
        recordAscendStoryEvent("ascend_story_image_saved", { format: draft.format, style: draft.style, platform: result.platform });
        setStatus(result.platform === "native" ? `Saved to ${result.location}.` : "Your story PNG was downloaded.");
      }
    } catch (error) {
      const message = readableErrorMessage(error);
      if (!imageGenerated) recordAscendStoryEvent("ascend_story_generation_failed", { format: draft.format, style: draft.style });
      if (action === "share" && !/abort|cancel/i.test(message)) recordAscendStoryEvent("ascend_story_share_failed", { format: draft.format, style: draft.style });
      setStatus(/abort|cancel/i.test(message) ? "Sharing cancelled." : message);
    } finally {
      setIsWorking(false);
    }
  }

  async function copyCaption() {
    if (!draft?.caption.trim()) return;
    try {
      await navigator.clipboard.writeText(draft.caption.trim());
      setStatus("Caption copied.");
    } catch {
      setStatus("Select the caption text to copy it on this device.");
    }
  }

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-ink text-white" role="dialog" aria-modal="true" aria-label="Share Your Ascent story editor">
      <div className="mx-auto min-h-full max-w-xl px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="sticky top-0 z-10 -mx-4 flex items-center justify-between border-b border-line bg-ink/95 px-4 py-3 backdrop-blur">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-purple-300">Progress photos</p>
            <h2 className="mt-1 text-xl font-semibold">Share Your Ascent</h2>
          </div>
          <button type="button" onClick={onClose} disabled={isWorking} className="ascend-pressable grid h-11 w-11 place-items-center rounded-full border border-line bg-surface" aria-label="Close story editor"><X size={21} /></button>
        </header>

        {!context || !draft ? (
          <section className="ascend-surface mt-5 p-5 text-sm text-zinc-300">{status}</section>
        ) : (
          <>
            <div className="relative mx-auto mt-5 w-full max-w-[330px]">
              <StoryPreview context={context} draft={draft} />
              {showReveal && context.milestone ? <MilestoneReveal milestone={context.milestone} reducedMotion={reducedMotion} onClose={() => setShowReveal(false)} /> : null}
            </div>

            <section className="ascend-surface mt-5 p-4">
              <p className="text-sm font-semibold">Choose photo{draft.format === "then-now" ? "s" : ""}</p>
              {draft.format === "then-now" ? (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <label className="text-xs text-zinc-400">Then
                    <select value={context.firstPhoto.id} onChange={(event) => selectPhoto("first", event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-line bg-ink px-3 text-sm text-white">
                      {selectablePhotos.map((photo) => <option key={`then-${photo.id}`} value={photo.id}>{formatStoryDate(photo.loggedAt)} · {photo.photoType}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-zinc-400">Now
                    <select value={context.latestPhoto.id} onChange={(event) => selectPhoto("latest", event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-line bg-ink px-3 text-sm text-white">
                      {selectablePhotos.map((photo) => <option key={`now-${photo.id}`} value={photo.id}>{formatStoryDate(photo.loggedAt)} · {photo.photoType}</option>)}
                    </select>
                  </label>
                </div>
              ) : (
                <select value={context.latestPhoto.id} onChange={(event) => selectPhoto("latest", event.target.value)} className="mt-3 h-11 w-full rounded-xl border border-line bg-ink px-3 text-sm text-white" aria-label="Story photo">
                  {selectablePhotos.map((photo) => <option key={photo.id} value={photo.id}>{formatStoryDate(photo.loggedAt)} · {photo.photoType}</option>)}
                </select>
              )}
              {reversedDates ? <p className="mt-2 rounded-lg border border-amber-400/35 bg-amber-400/10 p-2 text-xs leading-5 text-amber-200">The Now photo is dated before the Then photo. Swap them for a trustworthy timeline.</p> : null}

              <p className="mt-5 text-sm font-semibold">Story format</p>
              <div className={`mt-3 grid gap-2 ${formats.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                {formats.map((format) => (
                  <button key={format} type="button" onClick={() => selectFormat(format)} className={`ascend-pressable min-h-11 rounded-xl border px-2 text-sm font-semibold ${draft.format === format ? "border-lime bg-lime text-ink" : "border-line bg-ink text-zinc-300"}`}>{formatLabels[format]}</button>
                ))}
              </div>
              {!context.milestone ? <p className="mt-3 text-xs leading-5 text-zinc-500">Earned stories appear only when Ascend can verify a meaningful milestone.</p> : null}
              {draft.format === "earned" && context.milestone && context.milestones.length > 1 ? (
                <label className="mt-4 block text-xs text-zinc-400">Achievement
                  <select value={context.milestone.key} onChange={(event) => selectMilestone(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-line bg-ink px-3 text-sm text-white">
                    {context.milestones.map((milestone) => <option key={milestone.key} value={milestone.key}>{milestone.title}</option>)}
                  </select>
                </label>
              ) : null}

              <p className="mt-5 text-sm font-semibold">Visual style</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {(Object.keys(styleLabels) as AscendStoryStyle[]).map((style) => (
                  <button key={style} type="button" onClick={() => selectStyle(style)} className={`ascend-pressable min-h-11 rounded-xl border px-2 text-sm font-semibold ${draft.style === style ? "border-purple-400 bg-purple-500/15 text-purple-100" : "border-line bg-ink text-zinc-300"}`}>{styleLabels[style]}</button>
                ))}
              </div>
            </section>

            <section className="ascend-surface mt-4 p-4">
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-semibold" htmlFor="ascend-story-caption">Your words</label>
                <button type="button" onClick={copyCaption} disabled={!draft.caption.trim()} className="ascend-pressable flex h-10 items-center rounded-full border border-line bg-ink px-3 text-xs font-semibold text-zinc-300 disabled:opacity-40"><Copy className="mr-1.5" size={15} />Copy caption</button>
              </div>
              <textarea id="ascend-story-caption" value={draft.caption} maxLength={140} onChange={(event) => setDraft({ ...draft, caption: event.target.value })} className="mt-3 min-h-24 w-full resize-none rounded-xl border border-line bg-ink p-3 text-sm leading-6 text-white outline-none focus:border-lime" placeholder="Add a short caption, or leave this empty." />
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => setShowCrop((current) => !current)} className="ascend-pressable flex h-11 items-center rounded-full border border-line bg-ink px-4 text-sm font-semibold text-zinc-200"><SlidersHorizontal className="mr-2" size={17} />Adjust photo</button>
                <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-line bg-ink px-4 text-sm text-zinc-200">
                  <input type="checkbox" checked={draft.showDate} onChange={(event) => setDraft({ ...draft, showDate: event.target.checked })} className="h-4 w-4 accent-lime" />
                  <CalendarDays size={16} /> Date
                </label>
                {draft.format === "then-now" ? (
                  <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-line bg-ink px-4 text-sm text-zinc-200">
                    <input type="checkbox" checked={draft.showElapsed} onChange={(event) => setDraft({ ...draft, showElapsed: event.target.checked })} className="h-4 w-4 accent-lime" />
                    <Clock3 size={16} /> Elapsed time
                  </label>
                ) : null}
                <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-line bg-ink px-4 text-sm text-zinc-200">
                  <input type="checkbox" checked={draft.showAttribution} onChange={(event) => setDraft({ ...draft, showAttribution: event.target.checked })} className="h-4 w-4 accent-lime" />
                  Made with Ascend
                </label>
              </div>
              {context.metrics.length ? (
                <div className="mt-4">
                  <p className="flex items-center text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400"><ImageIcon className="mr-2" size={15} />Optional verified stats</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {context.metrics.map((metric) => {
                      const checked = draft.metricKeys.includes(metric.key);
                      return (
                        <label key={metric.key} className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl border border-line bg-ink px-3 text-sm text-zinc-200">
                          <span><span className="block font-medium">{metric.label}</span><span className="text-xs text-zinc-500">{metric.value}{metric.sensitive ? " · sensitive" : ""}</span></span>
                          <input type="checkbox" checked={checked} onChange={(event) => setDraft({ ...draft, metricKeys: event.target.checked ? [...draft.metricKeys, metric.key] : draft.metricKeys.filter((key) => key !== metric.key) })} className="h-5 w-5 shrink-0 accent-lime" />
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              {context.metrics.some((metric) => metric.sensitive) ? <p className="mt-3 text-xs leading-5 text-zinc-500">Sensitive numbers, including weight change, stay hidden unless you select them individually.</p> : <p className="mt-3 text-xs leading-5 text-zinc-500">All statistics are optional and hidden by default.</p>}
            </section>

            {showCrop ? (
              <section className="ascend-surface mt-4 space-y-3 p-4">
                <CropControls label={draft.format === "then-now" ? "Earlier photo" : "Photo position"} crop={draft.format === "then-now" ? draft.firstCrop : draft.latestCrop} onChange={(crop) => setDraft(draft.format === "then-now" ? { ...draft, firstCrop: crop } : { ...draft, latestCrop: crop })} />
                {draft.format === "then-now" ? <CropControls label="Latest photo" crop={draft.latestCrop} onChange={(crop) => setDraft({ ...draft, latestCrop: crop })} /> : null}
              </section>
            ) : null}

            <section className="mt-4 grid grid-cols-2 gap-3">
              <button type="button" disabled={isWorking} onClick={() => exportStory("save")} className="ascend-pressable flex h-12 items-center justify-center rounded-xl border border-line bg-surface font-semibold text-zinc-100 disabled:opacity-55"><Download className="mr-2" size={18} />Save image</button>
              <button type="button" disabled={isWorking} onClick={() => exportStory("share")} className="ascend-pressable flex h-12 items-center justify-center rounded-xl bg-lime font-semibold text-ink disabled:opacity-55"><Share2 className="mr-2" size={18} />{isWorking ? "Preparing..." : "Share"}</button>
            </section>
            <p className="mt-3 text-center text-xs leading-5 text-zinc-400" aria-live="polite">{status}</p>
          </>
        )}
      </div>
    </div>
  );
}

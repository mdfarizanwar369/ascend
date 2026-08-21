"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  ArrowRight,
  Brain,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  ImagePlus,
  LockKeyhole,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import {
  askBodyScanPreviewQuestion,
  BodyCompositionScan,
  BodyScanCoaching,
  BodyScanIntroductoryBaseline,
  extractBodyScanPreview,
  getBodyScanPreviewBaseline,
  getBodyScanPreviewExplanation,
  saveBodyScanPreview
} from "@/lib/ascendApi";
import { clearBodyScanImageCache, optimizeBodyScanImage, OptimizedBodyScanImage } from "@/lib/bodyScanImageProcessor";

type EditableMetricKey =
  | "weightKg"
  | "bodyFatPercent"
  | "skeletalMuscleMassKg"
  | "bmi"
  | "visceralFat"
  | "bodyWaterPercent"
  | "bmrKcal";

const primaryMetrics: Array<{ key: EditableMetricKey; label: string; unit: string; step: string }> = [
  { key: "weightKg", label: "Weight", unit: "kg", step: "0.1" },
  { key: "bodyFatPercent", label: "Body fat", unit: "%", step: "0.1" },
  { key: "skeletalMuscleMassKg", label: "Skeletal muscle", unit: "kg", step: "0.1" }
];

const advancedMetrics: Array<{ key: EditableMetricKey; label: string; unit: string; step: string }> = [
  { key: "bmi", label: "BMI", unit: "", step: "0.1" },
  { key: "visceralFat", label: "Visceral fat reading", unit: "", step: "0.1" },
  { key: "bodyWaterPercent", label: "Body water", unit: "%", step: "0.1" },
  { key: "bmrKcal", label: "BMR", unit: "kcal", step: "1" }
];

function emptyDraft(): BodyCompositionScan {
  return {
    scanDate: new Date().toISOString().slice(0, 10),
    importSource: "manual_entry",
    sourceImages: [],
    userConfirmed: true
  };
}

function numberValue(value: number | null | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

function displayValue(value: number | null | undefined, unit: string) {
  if (value === null || value === undefined) return "Not captured";
  return `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 })}${unit ? ` ${unit}` : ""}`;
}

function ScanMetric({ label, value, unit }: { label: string; value: number | null | undefined; unit: string }) {
  return (
    <div className="rounded-lg border border-line bg-ink p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{displayValue(value, unit)}</p>
    </div>
  );
}

export function BodyScanPreviewClient() {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [baseline, setBaseline] = useState<BodyScanIntroductoryBaseline | null>(null);
  const [coaching, setCoaching] = useState<BodyScanCoaching | null>(null);
  const [draft, setDraft] = useState<BodyCompositionScan | null>(null);
  const [images, setImages] = useState<OptimizedBodyScanImage[]>([]);
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState("Loading Body Scan...");
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [showCapture, setShowCapture] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const loadExplanation = useCallback(async (scanId: string) => {
    setStatus("Coach Zoe is preparing your assessment...");
    const response = await getBodyScanPreviewExplanation(scanId);
    setCoaching(response.coaching);
    setStatus("");
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await getBodyScanPreviewBaseline();
      setAvailable(response.access.enabled);
      setBaseline(response.scan);
      setShowCapture(!response.scan);
      if (response.scan?.id) await loadExplanation(response.scan.id);
      else setStatus("");
    } catch (error) {
      setAvailable(false);
      setStatus(error instanceof Error ? error.message : "Body Scan preview could not be loaded.");
    }
  }, [loadExplanation]);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  async function prepareImages(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).slice(0, 6);
    event.target.value = "";
    if (!files.length) return;
    abortRef.current?.abort();
    clearBodyScanImageCache();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setDraft(null);
    setStatus("Preparing your scan photo...");
    try {
      const optimized: OptimizedBodyScanImage[] = [];
      for (const file of files) {
        const image = await optimizeBodyScanImage(file, {
          existingHashes: optimized.map((item) => item.hash),
          signal: controller.signal,
          onStage: setStatus
        });
        if (!image.duplicate) optimized.push(image);
      }
      setImages(optimized);
      const warnings = optimized.flatMap((image) => image.warnings).filter((warning) => warning.severity !== "info").length;
      setStatus(warnings
        ? `${optimized.length} photo${optimized.length === 1 ? "" : "s"} ready. Review the extracted values carefully because ${warnings} image-quality warning${warnings === 1 ? " was" : "s were"} found.`
        : `${optimized.length} photo${optimized.length === 1 ? "" : "s"} ready to read.`);
    } catch (error) {
      setImages([]);
      setStatus(error instanceof Error ? error.message : "This scan photo could not be prepared.");
    } finally {
      setBusy(false);
    }
  }

  async function analyse() {
    if (!images.length || busy) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setStatus("Reading the visible numbers on your scan...");
    try {
      const response = await extractBodyScanPreview(images.map((image) => image.dataUrl), controller.signal);
      setDraft({
        ...response.draft,
        scanDate: response.draft.scanDate || new Date().toISOString().slice(0, 10),
        importSource: "ai_import",
        userConfirmed: true
      });
      setStatus("Review these values against the original report before saving.");
    } catch (error) {
      setDraft(emptyDraft());
      setStatus(error instanceof Error ? `${error.message} You can still enter the numbers manually.` : "The report could not be read. Enter the numbers manually.");
    } finally {
      setBusy(false);
    }
  }

  function updateMetric(key: EditableMetricKey, rawValue: string) {
    if (!draft) return;
    const value = rawValue === "" ? null : Number(rawValue);
    setDraft({ ...draft, [key]: Number.isFinite(value) ? value : null });
  }

  async function confirmScan(event: FormEvent) {
    event.preventDefault();
    if (!draft || busy) return;
    setBusy(true);
    setStatus("Saving your confirmed baseline...");
    try {
      const response = await saveBodyScanPreview({ ...draft, userConfirmed: true });
      setBaseline(response.scan);
      setDraft(null);
      setImages([]);
      setShowCapture(false);
      clearBodyScanImageCache();
      await loadExplanation(response.scan.id);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "This scan could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function askQuestion(event: FormEvent) {
    event.preventDefault();
    const cleanQuestion = question.trim();
    if (!baseline?.id || !cleanQuestion || !coaching || busy || coaching.followUpsRemaining <= 0) return;
    setBusy(true);
    setStatus("Coach Zoe is reviewing your confirmed scan...");
    try {
      const response = await askBodyScanPreviewQuestion(baseline.id, cleanQuestion);
      setCoaching({
        ...coaching,
        followUps: [...coaching.followUps, response.followUp],
        followUpsRemaining: response.followUpsRemaining
      });
      setQuestion("");
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Coach Zoe could not answer that question.");
    } finally {
      setBusy(false);
    }
  }

  if (available === null) {
    return <div className="mx-auto mt-6 max-w-md rounded-xl border border-line bg-surface p-5 text-sm text-zinc-300">Loading Body Scan...</div>;
  }

  if (!available) {
    return (
      <section className="mx-auto mt-6 max-w-md rounded-xl border border-line bg-surface p-5">
        <LockKeyhole className="text-zinc-400" size={24} />
        <h1 className="mt-4 text-xl font-semibold">Body Scan preview is unavailable</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-400">This owner-only preview is disabled. The rest of Ascend is unaffected.</p>
        {status ? <p className="mt-4 text-xs text-zinc-500">{status}</p> : null}
      </section>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl pb-10 pt-4">
      <header className="px-1">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">Owner preview</p>
        <div className="mt-2 flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-lime text-ink"><ScanLine size={22} /></span>
          <div>
            <h1 className="text-2xl font-semibold">Understand your Body Scan</h1>
            <p className="mt-1 text-sm leading-6 text-zinc-400">Confirm the report, then Coach Zoe will explain what the numbers mean in plain language.</p>
          </div>
        </div>
      </header>

      {baseline ? (
        <section className="mt-5 rounded-xl border border-lime/35 bg-surface p-4 shadow-raised sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-lime">Body Scan Complete</p>
              <h2 className="mt-1 text-xl font-semibold">Your starting point</h2>
              <p className="mt-1 text-sm text-zinc-400">Confirmed {baseline.scanDate}</p>
            </div>
            <span className="grid h-10 w-10 place-items-center rounded-full border border-lime/40 bg-lime/10 text-lime"><Check size={21} /></span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <ScanMetric label="Weight" value={baseline.weightKg} unit="kg" />
            <ScanMetric label="Body fat" value={baseline.bodyFatPercent} unit="%" />
            <ScanMetric label="Skeletal muscle" value={baseline.skeletalMuscleMassKg} unit="kg" />
          </div>
        </section>
      ) : null}

      {coaching ? (
        <section className="mt-4 rounded-xl border border-violet-500/35 bg-[linear-gradient(145deg,rgba(139,92,246,0.13),rgba(53,242,208,0.05))] p-4 sm:p-5">
          <div className="flex items-center gap-2 text-violet-300"><Brain size={19} /><p className="text-xs font-semibold uppercase tracking-[0.16em]">Coach Zoe explains</p></div>
          <h2 className="mt-3 text-xl font-semibold leading-8">{coaching.explanation.headline}</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-300">{coaching.explanation.summary}</p>

          <div className="mt-5 space-y-2">
            {coaching.explanation.importantNumbers.map((item) => (
              <div key={`${item.label}-${item.value}`} className="rounded-lg border border-line bg-ink/80 p-3">
                <div className="flex items-baseline justify-between gap-3"><p className="text-sm font-semibold">{item.label}</p><p className="text-base font-semibold text-lime">{item.value}</p></div>
                <p className="mt-1 text-xs leading-5 text-zinc-400">{item.meaning}</p>
              </div>
            ))}
          </div>

          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">Your priorities</p>
            <div className="mt-2 space-y-3">
              {coaching.explanation.priorities.map((priority, index) => (
                <div key={priority.title} className="flex gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-lime text-xs font-bold text-ink">{index + 1}</span>
                  <div><p className="text-sm font-semibold">{priority.title}</p><p className="mt-1 text-sm leading-5 text-zinc-400">{priority.action}</p></div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 rounded-lg border border-line bg-ink/70 p-3 text-xs leading-5 text-zinc-400">
            <p>{coaching.explanation.measurementNote}</p>
            <p className="mt-2 text-zinc-300">{coaching.explanation.nextScanGuidance}</p>
          </div>
          <p className="mt-3 flex gap-2 text-xs leading-5 text-zinc-500"><ShieldCheck className="mt-0.5 shrink-0" size={15} />{coaching.explanation.safetyNote}</p>
        </section>
      ) : baseline && status ? (
        <section className="mt-4 rounded-xl border border-line bg-surface p-5">
          <Sparkles className="animate-pulse text-violet-400" size={22} />
          <p className="mt-3 text-sm text-zinc-300">{status}</p>
        </section>
      ) : null}

      {coaching && baseline ? (
        <section className="mt-4 rounded-xl border border-line bg-surface p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-sm font-semibold">Ask about this scan</p><p className="mt-1 text-xs leading-5 text-zinc-400">Two introductory questions are included. Zoe uses only your confirmed report.</p></div>
            <span className="rounded-full border border-line bg-ink px-2.5 py-1 text-xs text-zinc-300">{coaching.followUpsRemaining} left</span>
          </div>
          {coaching.followUps.length ? (
            <div className="mt-4 space-y-3">
              {coaching.followUps.map((item) => (
                <div key={item.id} className="rounded-lg border border-line bg-ink p-3">
                  <p className="text-sm font-semibold">{item.question}</p>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">{item.answer}</p>
                </div>
              ))}
            </div>
          ) : null}
          {coaching.followUpsRemaining > 0 ? (
            <form onSubmit={askQuestion} className="mt-4">
              <label className="text-xs font-semibold text-zinc-400" htmlFor="body-scan-question">What would you like explained?</label>
              <textarea id="body-scan-question" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={500} rows={3} className="mt-2 w-full rounded-lg border border-line bg-ink p-3 text-sm text-white outline-none focus:border-lime" placeholder="For example: What should I focus on first?" />
              <button type="submit" disabled={busy || question.trim().length < 2} className="ascend-pressable mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-lime font-semibold text-ink disabled:opacity-50">Ask Coach Zoe <ArrowRight size={17} /></button>
            </form>
          ) : null}
        </section>
      ) : null}

      {baseline ? (
        <section className="mt-4 rounded-xl border border-line bg-surface p-4">
          <div className="flex gap-3"><LockKeyhole className="mt-0.5 shrink-0 text-violet-400" size={19} /><div><p className="text-sm font-semibold">See how your body changes over time</p><p className="mt-1 text-xs leading-5 text-zinc-400">Comparison confidence, longer-term patterns, and scan-informed adjustments are reserved for the future Premium and Athlete experiences.</p></div></div>
        </section>
      ) : null}

      {showCapture ? (
        <section className="mt-5 rounded-xl border border-line bg-surface p-4 sm:p-5">
          <h2 className="text-lg font-semibold">Add your scan report</h2>
          <p className="mt-1 text-sm leading-6 text-zinc-400">Use a clear, straight-on photo. Ascend reads the visible values; you confirm them before anything is saved.</p>
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={prepareImages} />
          <input ref={galleryInputRef} type="file" accept="image/*" multiple className="hidden" onChange={prepareImages} />
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" disabled={busy} onClick={() => cameraInputRef.current?.click()} className="ascend-pressable flex h-12 items-center justify-center gap-2 rounded-lg bg-lime font-semibold text-ink disabled:opacity-50"><Camera size={18} /> Take photo</button>
            <button type="button" disabled={busy} onClick={() => galleryInputRef.current?.click()} className="ascend-pressable flex h-12 items-center justify-center gap-2 rounded-lg border border-line bg-ink font-semibold text-zinc-200 disabled:opacity-50"><ImagePlus size={18} /> Gallery</button>
          </div>
          {images.length ? (
            <div className="mt-4">
              <div className="flex gap-2 overflow-x-auto pb-2">{images.map((image) => <Image key={image.id} src={image.dataUrl} alt="Prepared Body Scan report" width={80} height={96} unoptimized className="h-24 w-20 rounded-lg border border-line object-cover" />)}</div>
              <button type="button" onClick={analyse} disabled={busy} className="ascend-pressable mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-violet-500 font-semibold text-white disabled:opacity-50"><ScanLine size={18} /> Read scan values</button>
            </div>
          ) : null}

          {draft ? (
            <form onSubmit={confirmScan} className="mt-5 border-t border-line pt-5">
              <div className="flex items-center gap-2"><CircleHelp size={18} className="text-amber" /><p className="text-sm font-semibold">Confirm against your original report</p></div>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {primaryMetrics.map((metric) => (
                  <label key={metric.key} className="text-xs font-semibold text-zinc-400">{metric.label}
                    <span className="mt-1 flex items-center rounded-lg border border-line bg-ink pr-3 focus-within:border-lime">
                      <input type="number" step={metric.step} value={numberValue(draft[metric.key] as number | null | undefined)} onChange={(event) => updateMetric(metric.key, event.target.value)} className="min-w-0 flex-1 bg-transparent p-3 text-base text-white outline-none" />
                      <span className="text-xs text-zinc-500">{metric.unit}</span>
                    </span>
                  </label>
                ))}
              </div>
              <button type="button" onClick={() => setShowAdvanced((value) => !value)} className="mt-4 flex w-full items-center justify-between rounded-lg border border-line bg-ink px-3 py-3 text-sm font-semibold text-zinc-300">More scan values {showAdvanced ? <ChevronUp size={17} /> : <ChevronDown size={17} />}</button>
              {showAdvanced ? (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {advancedMetrics.map((metric) => (
                    <label key={metric.key} className="text-xs font-semibold text-zinc-400">{metric.label}
                      <span className="mt-1 flex items-center rounded-lg border border-line bg-ink pr-3 focus-within:border-lime">
                        <input type="number" step={metric.step} value={numberValue(draft[metric.key] as number | null | undefined)} onChange={(event) => updateMetric(metric.key, event.target.value)} className="min-w-0 flex-1 bg-transparent p-3 text-base text-white outline-none" />
                        <span className="text-xs text-zinc-500">{metric.unit}</span>
                      </span>
                    </label>
                  ))}
                </div>
              ) : null}
              <label className="mt-4 block text-xs font-semibold text-zinc-400">Scan date
                <input type="date" value={draft.scanDate} onChange={(event) => setDraft({ ...draft, scanDate: event.target.value })} required className="mt-1 h-11 w-full rounded-lg border border-line bg-ink px-3 text-sm text-white outline-none focus:border-lime" />
              </label>
              <button type="submit" disabled={busy} className="ascend-pressable mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-lime font-semibold text-ink disabled:opacity-50"><Check size={18} /> Confirm and explain</button>
            </form>
          ) : null}
        </section>
      ) : baseline ? (
        <button type="button" onClick={() => { setShowCapture(true); setDraft(null); setImages([]); setStatus(""); }} className="ascend-pressable mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-line bg-surface text-sm font-semibold text-zinc-300"><RefreshCw size={16} /> Test another owner scan</button>
      ) : null}

      {status && !(baseline && !coaching) ? <p role="status" className="mt-4 rounded-lg border border-line bg-surface p-3 text-sm leading-6 text-zinc-300">{status}</p> : null}
    </div>
  );
}

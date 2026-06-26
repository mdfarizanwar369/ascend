"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Brain, Camera, CheckCircle2, LineChart, ShieldCheck, Sparkles, Upload } from "lucide-react";
import {
  BodyCompositionScan,
  BodyCompositionSummary,
  extractBodyComposition,
  getBodyCompositionScans,
  getBodyCompositionSummary,
  getTrainerBodyComposition,
  saveBodyCompositionScan,
  saveTrainerBodyCompositionScan
} from "@/lib/ascendApi";
import { BackButton } from "@/components/BackButton";

const metricFields: Array<[keyof BodyCompositionScan, string, string]> = [
  ["weightKg", "Weight", "kg"],
  ["bodyFatPercent", "Body fat", "%"],
  ["fatMassKg", "Fat mass", "kg"],
  ["leanBodyMassKg", "Lean body mass", "kg"],
  ["skeletalMuscleMassKg", "Skeletal muscle", "kg"],
  ["muscleMassKg", "Muscle mass", "kg"],
  ["visceralFat", "Visceral fat", ""],
  ["bodyWaterPercent", "Body water", "%"],
  ["bmrKcal", "BMR", "kcal"],
  ["metabolicAge", "Metabolic age", "years"]
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function emptyDraft(): BodyCompositionScan {
  return {
    scanDate: today(),
    importSource: "manual_entry",
    userConfirmed: true,
    missingFields: [],
    sourceImages: []
  };
}

function valueText(value: number | null | undefined, unit = "") {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  return `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 })}${unit ? ` ${unit}` : ""}`;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read image."));
    reader.readAsDataURL(file);
  });
}

function TrendSparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <div className="h-10 rounded-lg bg-ink" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((value, index) => {
    const x = (index / Math.max(1, values.length - 1)) * 100;
    const y = 36 - ((value - min) / range) * 32;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg viewBox="0 0 100 40" className="h-10 w-full overflow-visible">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-teal-300" />
    </svg>
  );
}

function DnaScoreCard({ summary }: { summary: BodyCompositionSummary | null }) {
  const score = summary?.dnaScore.current;
  const change = summary?.dnaScore.change;
  return (
    <section className="rounded-lg border border-teal-400/40 bg-teal-400/10 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-teal-300">Ascend DNA</p>
          <h2 className="mt-1 text-xl font-semibold">Body Composition Score</h2>
          <p className="mt-1 text-xs text-zinc-400">Experimental coaching signal. Not medical advice.</p>
        </div>
        <div className="grid h-20 w-20 place-items-center rounded-full border-4 border-teal-300 bg-ink text-center">
          <span className="text-2xl font-semibold">{score ?? "--"}</span>
        </div>
      </div>
      {change !== null && change !== undefined ? <p className="mt-3 text-sm text-teal-200">{change >= 0 ? "+" : ""}{change} vs previous scan</p> : null}
    </section>
  );
}

export function BodyCompositionClient({ clientId, coachView = false }: { clientId?: string; coachView?: boolean }) {
  const [summary, setSummary] = useState<BodyCompositionSummary | null>(null);
  const [scans, setScans] = useState<BodyCompositionScan[]>([]);
  const [draft, setDraft] = useState<BodyCompositionScan>(emptyDraft());
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [status, setStatus] = useState("Loading body composition...");
  const [busy, setBusy] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);

  const load = useCallback(async () => {
    try {
      if (coachView && clientId) {
        const response = await getTrainerBodyComposition(clientId);
        setSummary(response.summary);
        setScans(response.scans);
      } else {
        const [summaryResponse, scanResponse] = await Promise.all([getBodyCompositionSummary(), getBodyCompositionScans()]);
        setSummary(summaryResponse.summary);
        setScans(scanResponse.scans);
      }
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Body Composition Engine could not load.");
    }
  }, [clientId, coachView]);

  useEffect(() => { load(); }, [load]);

  const trendValues = useMemo(() => [...scans].reverse().map((scan) => Number(scan.bodyFatPercent ?? scan.weightKg ?? 0)).filter(Boolean), [scans]);

  async function onFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).slice(0, 6);
    if (!files.length) return;
    setStatus("Preparing scan images...");
    try {
      const dataUrls = await Promise.all(files.map(readFileAsDataUrl));
      setSelectedImages(dataUrls);
      setStatus(`${dataUrls.length} image${dataUrls.length === 1 ? "" : "s"} ready. Review manually or run AI extraction.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not prepare images.");
    }
  }

  async function runExtraction() {
    if (!selectedImages.length) {
      setStatus("Choose 1 to 6 scan images first.");
      return;
    }
    setBusy(true);
    setStatus("Ascend DNA is reading the scan. It will only extract visible values.");
    try {
      const response = await extractBodyComposition(selectedImages);
      setDraft({ ...emptyDraft(), ...response.draft, userConfirmed: true });
      setShowManualEntry(true);
      setStatus("AI draft ready. Review every value before saving.");
    } catch (error) {
      setDraft({ ...emptyDraft(), sourceImages: [] });
      setShowManualEntry(true);
      setStatus(error instanceof Error ? `${error.message} You can still enter the scan manually.` : "AI extraction failed. Enter the scan manually.");
    } finally {
      setBusy(false);
    }
  }

  async function saveScan(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const payload = { ...draft, userConfirmed: true };
      const response = coachView && clientId
        ? await saveTrainerBodyCompositionScan(clientId, { ...payload, importSource: "manual_entry" })
        : await saveBodyCompositionScan(payload);
      setSummary(response.summary);
      await load();
      setDraft(emptyDraft());
      setSelectedImages([]);
      setShowManualEntry(false);
      setStatus("Body composition scan saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save scan.");
    } finally {
      setBusy(false);
    }
  }

  function setDraftValue(key: keyof BodyCompositionScan, value: string) {
    setDraft((current) => ({
      ...current,
      [key]: value === "" ? null : key === "scanDate" || key === "machine" || key === "notes" ? value : Number(value)
    }));
  }

  return (
    <>
      <section className="mt-4 flex items-start gap-3">
        <BackButton fallbackHref={coachView ? (clientId ? `/trainer/clients/${clientId}` : "/trainer") : "/athlete"} />
        <div>
          <p className="text-sm text-teal-300">Ascend DNA</p>
          <h1 className="mt-1 text-3xl font-semibold">Body Composition Engine</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">Upload scans, confirm values, then track body composition trends over time.</p>
        </div>
      </section>

      {status ? <p className="mt-4 rounded-lg border border-line bg-surface p-3 text-sm text-zinc-300">{status}</p> : null}

      <div className="mt-4 space-y-4">
        <DnaScoreCard summary={summary} />

        <section className="rounded-lg border border-line bg-surface p-4">
          <div className="flex items-center gap-3">
            <LineChart className="text-teal-300" size={20} />
            <div>
              <h2 className="font-semibold">Trend snapshot</h2>
              <p className="text-xs text-zinc-400">{summary?.nutritionDataSource ?? "Profile Only"}</p>
            </div>
          </div>
          <div className="mt-3 rounded-lg bg-ink p-3">
            <TrendSparkline values={trendValues} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-ink p-3"><p className="text-xs text-zinc-500">Latest weight</p><p className="mt-1 text-xl font-semibold">{valueText(summary?.latestScan?.weightKg, "kg")}</p></div>
            <div className="rounded-lg bg-ink p-3"><p className="text-xs text-zinc-500">Body fat</p><p className="mt-1 text-xl font-semibold">{valueText(summary?.latestScan?.bodyFatPercent, "%")}</p></div>
            <div className="rounded-lg bg-ink p-3"><p className="text-xs text-zinc-500">Lean mass</p><p className="mt-1 text-xl font-semibold">{valueText(summary?.derived.fatFreeMassKg, "kg")}</p></div>
            <div className="rounded-lg bg-ink p-3"><p className="text-xs text-zinc-500">FFMI</p><p className="mt-1 text-xl font-semibold">{valueText(summary?.derived.ffmi)}</p></div>
          </div>
        </section>

        {summary?.insights.length || summary?.coachAlerts.length ? (
          <section className="rounded-lg border border-purple-400/40 bg-purple-400/10 p-4">
            <div className="flex items-center gap-2"><Brain className="text-purple-300" size={19} /><h2 className="font-semibold">Coaching insights</h2></div>
            <div className="mt-3 space-y-2 text-sm leading-6 text-zinc-200">
              {summary.insights.map((insight) => <p key={insight}>{insight}</p>)}
              {summary.coachAlerts.map((alert) => <p key={alert.type} className={alert.severity === "positive" ? "text-teal-200" : alert.severity === "high" ? "text-red-300" : "text-amber"}>{alert.message}</p>)}
            </div>
          </section>
        ) : null}

        {!coachView ? (
          <section className="rounded-lg border border-line bg-surface p-4">
            <div className="flex items-center gap-2"><Upload className="text-teal-300" size={19} /><h2 className="font-semibold">Import scan</h2></div>
            <p className="mt-2 text-sm leading-6 text-zinc-400">Use printed reports, machine screens, screenshots, or manual entry. Ascend never saves without your confirmation.</p>
            <label className="mt-3 grid min-h-28 place-items-center rounded-lg border border-dashed border-teal-400/50 bg-teal-400/5 p-4 text-center">
              <Camera className="text-teal-300" size={24} />
              <span className="mt-2 text-sm font-semibold">Choose 1 to 6 images</span>
              <span className="mt-1 text-xs text-zinc-500">Printed report, phone photo, or screenshots</span>
              <input type="file" accept="image/*" multiple onChange={onFiles} className="sr-only" />
            </label>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" disabled={busy || !selectedImages.length} onClick={runExtraction} className="h-11 rounded-lg bg-teal-300 font-semibold text-ink disabled:opacity-50"><Sparkles className="mr-1 inline" size={17} /> Read with AI</button>
              <button type="button" onClick={() => { setDraft(emptyDraft()); setShowManualEntry(true); }} className="h-11 rounded-lg border border-line bg-ink font-semibold text-zinc-200">Manual entry</button>
            </div>
          </section>
        ) : (
          <button type="button" onClick={() => { setDraft(emptyDraft()); setShowManualEntry(true); }} className="h-11 rounded-lg border border-teal-400/50 bg-teal-400/10 font-semibold text-teal-200">Add manual coach entry</button>
        )}

        {showManualEntry ? (
          <form onSubmit={saveScan} className="rounded-lg border border-line bg-surface p-4">
            <div className="flex items-center gap-2"><ShieldCheck className="text-teal-300" size={19} /><h2 className="font-semibold">Review before saving</h2></div>
            <p className="mt-2 text-sm text-zinc-400">Confirm every field. Leave unknown values blank.</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="text-xs text-zinc-400">Scan date<input type="date" value={draft.scanDate} onChange={(event) => setDraftValue("scanDate", event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line bg-ink px-3 text-white" /></label>
              <label className="text-xs text-zinc-400">Machine<input value={draft.machine ?? ""} onChange={(event) => setDraftValue("machine", event.target.value)} placeholder="InBody, Tanita, Evolt..." className="mt-1 h-11 w-full rounded-lg border border-line bg-ink px-3 text-white" /></label>
              {metricFields.map(([key, label, unit]) => (
                <label key={key} className="text-xs text-zinc-400">{label}{unit ? ` (${unit})` : ""}<input type="number" step="0.1" value={draft[key] === null || draft[key] === undefined ? "" : String(draft[key])} onChange={(event) => setDraftValue(key, event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line bg-ink px-3 text-white" /></label>
              ))}
            </div>
            <label className="mt-3 block text-xs text-zinc-400">Notes<textarea value={draft.notes ?? ""} onChange={(event) => setDraftValue("notes", event.target.value)} rows={3} className="mt-1 w-full resize-none rounded-lg border border-line bg-ink p-3 text-sm text-white" /></label>
            <button disabled={busy} className="mt-3 h-11 w-full rounded-lg bg-teal-300 font-semibold text-ink disabled:opacity-50"><CheckCircle2 className="mr-1 inline" size={17} /> Confirm and save scan</button>
          </form>
        ) : null}

        <section className="rounded-lg border border-line bg-surface p-4">
          <div className="flex items-center gap-2"><Activity className="text-teal-300" size={19} /><h2 className="font-semibold">Scan history</h2></div>
          <div className="mt-3 space-y-3">
            {scans.map((scan) => (
              <article key={scan.id ?? `${scan.scanDate}-${scan.createdAt}`} className="rounded-lg bg-ink p-3">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="font-semibold">{scan.scanDate}</p><p className="text-xs text-zinc-500">{scan.machine || "Unknown machine"} / {scan.importSource === "ai_import" ? "AI Import" : "Manual Entry"}</p></div>
                  <span className="rounded-md bg-surface px-2 py-1 text-xs text-teal-200">{scan.confidenceScore !== null && scan.confidenceScore !== undefined ? `${Math.round(scan.confidenceScore * 100)}%` : "reviewed"}</span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <p><span className="block text-xs text-zinc-500">Weight</span>{valueText(scan.weightKg, "kg")}</p>
                  <p><span className="block text-xs text-zinc-500">Fat</span>{valueText(scan.bodyFatPercent, "%")}</p>
                  <p><span className="block text-xs text-zinc-500">Muscle</span>{valueText(scan.skeletalMuscleMassKg ?? scan.muscleMassKg, "kg")}</p>
                </div>
                {scan.sourceImages?.[0]?.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={scan.sourceImages[0].url} alt="Body composition scan" className="mt-3 max-h-48 w-full rounded-lg object-contain" />
                ) : null}
              </article>
            ))}
            {!scans.length ? <p className="rounded-lg bg-ink p-3 text-sm text-zinc-400">No scans saved yet.</p> : null}
          </div>
        </section>
      </div>
    </>
  );
}

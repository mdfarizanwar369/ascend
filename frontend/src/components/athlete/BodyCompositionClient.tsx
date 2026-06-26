"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BODY_SCAN_IMPORT_STAGES, BodyScanImportStageId, hasBlockingBodyScanWarnings } from "@ascend/shared";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Brain,
  Camera,
  CheckCircle2,
  Clock,
  FileText,
  LineChart,
  LockKeyhole,
  Pencil,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Upload,
  XCircle
} from "lucide-react";
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
import { OptimizedBodyScanImage, clearBodyScanImageCache, optimizeBodyScanImage } from "@/lib/bodyScanImageProcessor";

type MetricKey = keyof BodyCompositionScan;

const metricFields: Array<{ key: MetricKey; label: string; unit: string; section: "body" | "composition" | "health" | "hydration" }> = [
  { key: "weightKg", label: "Weight", unit: "kg", section: "body" },
  { key: "bmi", label: "BMI", unit: "", section: "body" },
  { key: "bodyFatPercent", label: "Body fat", unit: "%", section: "composition" },
  { key: "fatMassKg", label: "Fat mass", unit: "kg", section: "composition" },
  { key: "leanBodyMassKg", label: "Lean body mass", unit: "kg", section: "composition" },
  { key: "skeletalMuscleMassKg", label: "Skeletal muscle", unit: "kg", section: "composition" },
  { key: "muscleMassKg", label: "Muscle mass", unit: "kg", section: "composition" },
  { key: "bodyWaterPercent", label: "Body water", unit: "%", section: "hydration" },
  { key: "proteinPercent", label: "Protein", unit: "%", section: "hydration" },
  { key: "mineralPercent", label: "Minerals", unit: "%", section: "hydration" },
  { key: "boneMassKg", label: "Bone mass", unit: "kg", section: "health" },
  { key: "visceralFat", label: "Visceral fat", unit: "", section: "health" },
  { key: "bmrKcal", label: "Resting burn", unit: "kcal", section: "health" },
  { key: "metabolicAge", label: "Metabolic age", unit: "years", section: "health" }
];

const sectionCopy = {
  body: { title: "Body size", description: "Core measurements from the scan." },
  composition: { title: "Muscle and fat", description: "The numbers coaches use to understand recomposition." },
  hydration: { title: "Hydration and tissue", description: "Useful when the report includes water, protein, or minerals." },
  health: { title: "Metabolic signals", description: "Coaching signals only. Not medical advice." }
} as const;

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

function numericValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function friendlyFieldName(field: string) {
  const match = metricFields.find((item) => item.key === field);
  return match?.label ?? field.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

function confidenceInfo(score: number | null | undefined) {
  if (score === null || score === undefined || Number.isNaN(Number(score))) {
    return { label: "Needs review", tone: "border-amber/40 bg-amber/10 text-amber", percent: null };
  }
  const percent = Math.round(Math.max(0, Math.min(1, Number(score))) * 100);
  if (percent >= 85) return { label: "High confidence", tone: "border-teal-400/40 bg-teal-400/10 text-teal-200", percent };
  if (percent >= 65) return { label: "Medium confidence", tone: "border-amber/40 bg-amber/10 text-amber", percent };
  return { label: "Low confidence", tone: "border-red-400/40 bg-red-400/10 text-red-300", percent };
}

function detectedMetricCount(scan: BodyCompositionScan | null) {
  if (!scan) return 0;
  return metricFields.filter((field) => numericValue(scan[field.key]) !== null).length;
}

function missingMetricNames(scan: BodyCompositionScan | null) {
  const missing = new Set(scan?.missingFields?.filter(Boolean) ?? []);
  metricFields.forEach((field) => {
    if (scan && numericValue(scan[field.key]) === null) missing.add(String(field.key));
  });
  return Array.from(missing).map(friendlyFieldName);
}

function reviewTimeText(scan: BodyCompositionScan | null) {
  const missing = missingMetricNames(scan).length;
  const detected = detectedMetricCount(scan);
  const minutes = Math.max(1, Math.ceil((missing + detected) / 8));
  return `${minutes} min review`;
}

function nutritionGuide(summary: BodyCompositionSummary | null) {
  const calories = summary?.derived.estimatedDailyEnergyNeedsKcal ?? null;
  const leanMass = summary?.derived.fatFreeMassKg ?? summary?.latestScan?.leanBodyMassKg ?? summary?.latestScan?.estimatedLeanBodyMassKg ?? null;
  const protein = leanMass ? Math.round(leanMass * 2.1) : null;
  const fat = calories ? Math.round((calories * 0.25) / 9) : null;
  const carbs = calories && protein && fat ? Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4)) : null;
  return { calories, protein, carbs, fat };
}

function trendFor(summary: BodyCompositionSummary | null, metric: string) {
  return summary?.trends.find((item) => item.metric === metric) ?? null;
}

function changeText(change: number | null | undefined, unit = "") {
  if (change === null || change === undefined || Number.isNaN(Number(change))) return "No previous scan";
  const sign = change > 0 ? "+" : "";
  return `${sign}${Number(change).toLocaleString(undefined, { maximumFractionDigits: 1 })}${unit}`;
}

function improvementTone(metric: string, change: number | null | undefined) {
  if (change === null || change === undefined || Number.isNaN(Number(change)) || Math.abs(Number(change)) < 0.05) {
    return { className: "text-zinc-300", icon: TrendingUp };
  }
  const lowerIsBetter = ["Weight", "Body Fat", "Fat Mass", "Visceral Fat", "Metabolic Age"].includes(metric);
  const improved = lowerIsBetter ? Number(change) < 0 : Number(change) > 0;
  return improved ? { className: "text-teal-200", icon: Number(change) < 0 ? ArrowDownRight : ArrowUpRight } : { className: "text-amber", icon: Number(change) < 0 ? ArrowDownRight : ArrowUpRight };
}

function quickSummary(summary: BodyCompositionSummary | null, scan: BodyCompositionScan | null) {
  if (!scan) return "No confirmed body composition data yet.";
  const bodyFatChange = trendFor(summary, "Body Fat")?.change ?? null;
  const muscleChange = (trendFor(summary, "Skeletal Muscle") ?? trendFor(summary, "Muscle"))?.change ?? null;
  if (bodyFatChange !== null && bodyFatChange < -0.4 && (muscleChange ?? 0) >= 0) {
    return "Fat is trending down while muscle is being maintained. Strong recomposition signal.";
  }
  if (muscleChange !== null && muscleChange < -0.4) {
    return "Muscle is trending down. Review protein, recovery, and training load.";
  }
  if (bodyFatChange !== null && bodyFatChange > 0.5) {
    return "Body fat is moving up. Review nutrition consistency before the next scan.";
  }
  if ((summary?.scanCount ?? 0) <= 1) return "First scan saved. Add another scan later to unlock true trend coaching.";
  return "Scan saved. Keep the next check-in consistent so the trend becomes clearer.";
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
    <section className="rounded-lg border border-teal-400/40 bg-gradient-to-br from-teal-400/15 to-purple-400/10 p-4 shadow-lg shadow-teal-400/5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-teal-300">Ascend DNA</p>
          <h2 className="mt-1 text-xl font-semibold">Body Composition Score</h2>
          <p className="mt-1 text-xs leading-5 text-zinc-400">Experimental coaching signal. Not medical advice.</p>
        </div>
        <div className="grid h-20 w-20 shrink-0 place-items-center rounded-full border-4 border-teal-300 bg-ink text-center">
          <span className="text-2xl font-semibold">{score ?? "--"}</span>
        </div>
      </div>
      {change !== null && change !== undefined ? (
        <p className="mt-3 text-sm text-teal-200">{change >= 0 ? "+" : ""}{change} vs previous scan</p>
      ) : (
        <p className="mt-3 text-sm text-zinc-400">Add another scan to see score movement.</p>
      )}
    </section>
  );
}

function EmptyState() {
  return (
    <section className="rounded-lg border border-teal-400/30 bg-teal-400/10 p-4">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-teal-300 text-[#071018]">
          <Sparkles size={20} />
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-teal-300">Welcome to Ascend DNA</p>
          <h2 className="mt-1 text-lg font-semibold">Upload your first body composition scan</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-300">
            Unlock personalized nutrition, AI coaching, DNA Score, trend tracking, and coach insights after you confirm your first scan.
          </p>
        </div>
      </div>
    </section>
  );
}

function StageProgress({ activeStage, busy }: { activeStage: BodyScanImportStageId | null; busy: boolean }) {
  if (!activeStage && !busy) return null;
  const activeIndex = BODY_SCAN_IMPORT_STAGES.findIndex((stage) => stage.id === activeStage);
  return (
    <section className="mt-4 rounded-lg border border-line bg-surface p-3">
      <div className="space-y-2">
        {BODY_SCAN_IMPORT_STAGES.slice(1).map((stage) => {
          const stageIndex = BODY_SCAN_IMPORT_STAGES.findIndex((item) => item.id === stage.id);
          const active = activeStage === stage.id;
          const complete = activeStage === "complete" || (activeIndex >= 0 && activeIndex > stageIndex);
          return (
            <div key={stage.id} className={`flex items-center gap-3 rounded-lg p-3 text-sm transition ${active ? "bg-teal-300 text-[#071018]" : complete ? "bg-teal-400/10 text-teal-200" : "bg-ink text-zinc-500"}`}>
              <div className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${active ? "bg-[#071018]/10" : complete ? "bg-teal-400/20" : "bg-surface"}`}>
                {complete ? <CheckCircle2 size={15} /> : active ? <Sparkles size={15} className="animate-pulse" /> : <Clock size={14} />}
              </div>
              <div>
                <p className="font-semibold">{stage.label}</p>
                {active ? <p className="text-xs opacity-80">{stage.message}</p> : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ResultsCard({ summary, scan, onDismiss }: { summary: BodyCompositionSummary | null; scan: BodyCompositionScan | null; onDismiss: () => void }) {
  if (!scan) return null;
  const guide = nutritionGuide(summary);
  const confidence = confidenceInfo(scan.confidenceScore);
  const dnaChange = summary?.dnaScore.change ?? null;
  const comparisonRows = [
    { metric: "Weight", current: scan.weightKg, previous: summary?.previousScan?.weightKg, unit: "kg", change: trendFor(summary, "Weight")?.change ?? null },
    { metric: "Body Fat", current: scan.bodyFatPercent, previous: summary?.previousScan?.bodyFatPercent, unit: "%", change: trendFor(summary, "Body Fat")?.change ?? null },
    { metric: "Muscle", current: scan.skeletalMuscleMassKg ?? scan.muscleMassKg, previous: summary?.previousScan?.skeletalMuscleMassKg ?? summary?.previousScan?.muscleMassKg, unit: "kg", change: (trendFor(summary, "Skeletal Muscle") ?? trendFor(summary, "Muscle"))?.change ?? null },
    { metric: "Lean Mass", current: scan.leanBodyMassKg ?? scan.estimatedLeanBodyMassKg, previous: summary?.previousScan?.leanBodyMassKg ?? summary?.previousScan?.estimatedLeanBodyMassKg, unit: "kg", change: trendFor(summary, "Lean Mass")?.change ?? null },
    { metric: "Visceral Fat", current: scan.visceralFat, previous: summary?.previousScan?.visceralFat, unit: "", change: trendFor(summary, "Visceral Fat")?.change ?? null },
    { metric: "Resting Burn", current: scan.bmrKcal, previous: summary?.previousScan?.bmrKcal, unit: "kcal", change: trendFor(summary, "BMR")?.change ?? null }
  ];
  return (
    <section className="rounded-lg border border-teal-400/40 bg-gradient-to-br from-teal-400/15 via-surface to-purple-400/10 p-4 shadow-xl shadow-teal-400/10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-teal-300">Saved</p>
          <h2 className="mt-1 text-2xl font-semibold">Ascend DNA updated</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-300">
            Your confirmed scan is now powering body trends, coaching insights, and scan-informed nutrition guidance.
          </p>
        </div>
        <button type="button" onClick={onDismiss} className="rounded-lg border border-line bg-ink px-3 py-2 text-xs font-semibold text-zinc-200">Close</button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-ink p-3"><p className="text-xs text-zinc-500">DNA Score</p><p className="mt-1 text-2xl font-semibold text-teal-200">{summary?.dnaScore.current ?? "--"}</p><p className="text-xs text-zinc-500">{dnaChange !== null ? `${dnaChange >= 0 ? "+" : ""}${dnaChange} change` : "first score"}</p></div>
        <div className={`rounded-lg border p-3 ${confidence.tone}`}><p className="text-xs opacity-80">AI Confidence</p><p className="mt-1 text-lg font-semibold">{confidence.percent ? `${confidence.percent}%` : confidence.label}</p></div>
        <div className="rounded-lg bg-ink p-3"><p className="text-xs text-zinc-500">Body fat</p><p className="mt-1 text-xl font-semibold">{valueText(scan.bodyFatPercent, "%")}</p></div>
        <div className="rounded-lg bg-ink p-3"><p className="text-xs text-zinc-500">Muscle</p><p className="mt-1 text-xl font-semibold">{valueText(scan.skeletalMuscleMassKg ?? scan.muscleMassKg, "kg")}</p></div>
      </div>
      <div className="mt-3 rounded-lg border border-line bg-ink p-3">
        <p className="text-sm font-semibold">AI coach summary</p>
        <p className="mt-2 text-sm leading-6 text-zinc-300">{quickSummary(summary, scan)}</p>
      </div>
      <div className="mt-3 rounded-lg border border-line bg-ink p-3">
        <p className="text-sm font-semibold">Previous vs current</p>
        <div className="mt-3 space-y-2">
          {comparisonRows.map((row) => {
            const tone = improvementTone(row.metric, row.change);
            const Icon = tone.icon;
            return (
              <div key={row.metric} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-lg bg-surface p-2 text-xs">
                <span className="font-semibold text-zinc-200">{row.metric}</span>
                <span className="text-zinc-400">{valueText(row.previous, row.unit)} to {valueText(row.current, row.unit)}</span>
                <span className={`inline-flex items-center gap-1 font-semibold ${tone.className}`}><Icon size={14} />{changeText(row.change, row.unit)}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-3 rounded-lg border border-line bg-ink p-3">
        <p className="text-sm font-semibold">Nutrition guide updated</p>
        <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
          <p><span className="block text-lg font-semibold text-white">{guide.calories ?? "--"}</span>kcal</p>
          <p><span className="block text-lg font-semibold text-white">{guide.protein ?? "--"}g</span>protein</p>
          <p><span className="block text-lg font-semibold text-white">{guide.carbs ?? "--"}g</span>carbs</p>
          <p><span className="block text-lg font-semibold text-white">{guide.fat ?? "--"}g</span>fat</p>
        </div>
      </div>
    </section>
  );
}

function AiDraftSummary({ draft }: { draft: BodyCompositionScan }) {
  const missing = missingMetricNames(draft);
  const confidence = confidenceInfo(draft.confidenceScore);
  const detected = detectedMetricCount(draft);
  return (
    <section className="rounded-lg border border-purple-400/40 bg-purple-400/10 p-4">
      <div className="flex items-start gap-3">
        <Brain className="mt-1 text-purple-300" size={20} />
        <div>
          <h2 className="font-semibold">AI Analysis Complete</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-300">
            Ascend detected {detected} metric{detected === 1 ? "" : "s"}. {missing.length ? `${missing.length} need confirmation.` : "All detected values are ready for your review."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${confidence.tone}`}>{confidence.percent ? `${confidence.label} / ${confidence.percent}%` : confidence.label}</span>
            <span className="rounded-full border border-line bg-ink px-3 py-1 text-xs text-zinc-300">{reviewTimeText(draft)}</span>
          </div>
          {missing.length ? (
            <p className="mt-3 text-xs leading-5 text-amber">Please confirm: {missing.slice(0, 6).join(", ")}{missing.length > 6 ? "..." : ""}</p>
          ) : null}
          {confidence.percent !== null && confidence.percent < 65 ? (
            <p className="mt-2 text-xs leading-5 text-red-300">Low confidence. Retake the photo if the numbers look unclear.</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function CoachSnapshot({ summary }: { summary: BodyCompositionSummary | null }) {
  if (!summary?.latestScan) return null;
  const bodyFat = trendFor(summary, "Body Fat");
  const muscle = trendFor(summary, "Skeletal Muscle") ?? trendFor(summary, "Muscle");
  const visceral = trendFor(summary, "Visceral Fat");
  return (
    <section className="rounded-lg border border-purple-400/40 bg-purple-400/10 p-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="text-purple-300" size={19} />
        <h2 className="font-semibold">Coach view</h2>
      </div>
      <p className="mt-2 text-sm leading-6 text-zinc-300">Use this scan to guide the next check-in without turning the client review into a data dump.</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-ink p-3"><p className="text-xs text-zinc-500">Body fat movement</p><p className="mt-1 font-semibold">{changeText(bodyFat?.change, "%")}</p></div>
        <div className="rounded-lg bg-ink p-3"><p className="text-xs text-zinc-500">Muscle movement</p><p className="mt-1 font-semibold">{changeText(muscle?.change, "kg")}</p></div>
        <div className="rounded-lg bg-ink p-3"><p className="text-xs text-zinc-500">Visceral fat</p><p className="mt-1 font-semibold">{valueText(summary.latestScan.visceralFat)}</p></div>
        <div className="rounded-lg bg-ink p-3"><p className="text-xs text-zinc-500">Compliance</p><p className="mt-1 font-semibold">{summary.scanCount > 1 ? "Trending" : "Baseline"}</p></div>
      </div>
      <div className="mt-3 rounded-lg bg-ink p-3">
        <p className="text-xs text-zinc-500">Recommended discussion</p>
        <p className="mt-1 text-sm leading-6 text-zinc-200">{quickSummary(summary, summary.latestScan)}</p>
      </div>
      {summary.coachAlerts.length ? (
        <div className="mt-3 space-y-2">
          {summary.coachAlerts.map((alert) => (
            <p key={alert.type} className={`rounded-lg bg-ink p-3 text-sm ${alert.severity === "positive" ? "text-teal-200" : alert.severity === "high" ? "text-red-300" : "text-amber"}`}>{alert.message}</p>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function BodyCompositionClient({ clientId, coachView = false }: { clientId?: string; coachView?: boolean }) {
  const [summary, setSummary] = useState<BodyCompositionSummary | null>(null);
  const [scans, setScans] = useState<BodyCompositionScan[]>([]);
  const [draft, setDraft] = useState<BodyCompositionScan>(emptyDraft());
  const [selectedImages, setSelectedImages] = useState<OptimizedBodyScanImage[]>([]);
  const [status, setStatus] = useState("Loading body composition...");
  const [busy, setBusy] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [activeStage, setActiveStage] = useState<BodyScanImportStageId | null>(null);
  const [allowLowQuality, setAllowLowQuality] = useState(false);
  const [editAnyway, setEditAnyway] = useState(false);
  const [lastSavedScan, setLastSavedScan] = useState<BodyCompositionScan | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

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
  const guide = nutritionGuide(summary);
  const latest = summary?.latestScan ?? null;
  const fitnessAge = latest?.metabolicAge ?? null;
  const nextScanDate = latest?.scanDate ? new Date(new Date(latest.scanDate).getTime() + 30 * 86_400_000) : null;
  const greatestImprovement = useMemo(() => {
    const ranked = (summary?.trends ?? [])
      .filter((trend) => trend.change !== null && trend.change !== undefined)
      .map((trend) => {
        const lowerIsBetter = ["Weight", "Body Fat", "Fat Mass", "Visceral Fat", "Metabolic Age"].includes(trend.metric);
        const score = lowerIsBetter ? -Number(trend.change) : Number(trend.change);
        return { ...trend, score };
      })
      .sort((a, b) => b.score - a.score);
    return ranked[0] ?? null;
  }, [summary?.trends]);
  const biggestChallenge = useMemo(() => {
    const ranked = (summary?.trends ?? [])
      .filter((trend) => trend.change !== null && trend.change !== undefined)
      .map((trend) => {
        const lowerIsBetter = ["Weight", "Body Fat", "Fat Mass", "Visceral Fat", "Metabolic Age"].includes(trend.metric);
        const score = lowerIsBetter ? -Number(trend.change) : Number(trend.change);
        return { ...trend, score };
      })
      .sort((a, b) => a.score - b.score);
    return ranked[0]?.score < 0 ? ranked[0] : null;
  }, [summary?.trends]);

  async function onFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).slice(0, 6);
    if (!files.length) return;
    abortControllerRef.current?.abort();
    clearBodyScanImageCache();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setBusy(true);
    setAllowLowQuality(false);
    setEditAnyway(false);
    setLastSavedScan(null);
    setActiveStage("optimize");
    setStatus("Optimizing scan images...");
    try {
      const optimized: OptimizedBodyScanImage[] = [];
      for (const file of files) {
        const image = await optimizeBodyScanImage(file, {
          existingHashes: optimized.map((item) => item.hash),
          signal: controller.signal,
          onStage: (message) => setStatus(message)
        });
        if (!image.duplicate) optimized.push(image);
      }
      setSelectedImages(optimized);
      setActiveStage("quality_check");
      const warningCount = optimized.reduce((total, image) => total + image.warnings.filter((warning) => warning.severity !== "info").length, 0);
      const duplicateCount = files.length - optimized.length;
      setStatus(`${optimized.length} image${optimized.length === 1 ? "" : "s"} ready. ${duplicateCount ? `${duplicateCount} duplicate skipped. ` : ""}${warningCount ? `${warningCount} quality warning${warningCount === 1 ? "" : "s"} found.` : "Quality looks usable."}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not prepare images.");
    } finally {
      setBusy(false);
    }
  }

  async function runExtraction() {
    if (!selectedImages.length) {
      setStatus("Choose 1 to 6 scan images first.");
      return;
    }
    const allWarnings = selectedImages.flatMap((image) => image.warnings);
    if (hasBlockingBodyScanWarnings(allWarnings) && !allowLowQuality) {
      setAllowLowQuality(true);
      setActiveStage("quality_check");
      setStatus("The image may be hard to read. Retake for best accuracy, or press Read with AI again to continue.");
      return;
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setBusy(true);
    setActiveStage("upload");
    setStatus("Uploading optimized scan images...");
    try {
      const dataUrls = selectedImages.map((image) => image.dataUrl);
      setActiveStage("read");
      setStatus("Reading visible body composition values...");
      const response = await extractBodyComposition(dataUrls, controller.signal);
      setActiveStage("complete");
      setDraft({ ...emptyDraft(), ...response.draft, userConfirmed: true });
      setShowManualEntry(true);
      setEditAnyway(false);
      const missing = missingMetricNames(response.draft);
      const detected = detectedMetricCount(response.draft);
      const confidence = confidenceInfo(response.draft.confidenceScore);
      setStatus(`${confidence.label}. Detected ${detected} metric${detected === 1 ? "" : "s"}. ${missing.length ? `${missing.length} value${missing.length === 1 ? "" : "s"} need confirmation.` : "Review and save when ready."}`);
    } catch (error) {
      setDraft({ ...emptyDraft(), sourceImages: [] });
      setShowManualEntry(true);
      setEditAnyway(true);
      const message = error instanceof Error && error.name === "AbortError"
        ? "Body scan import cancelled."
        : error instanceof Error
          ? `${error.message} You can still enter the scan manually.`
          : "AI extraction failed. Enter the scan manually.";
      setStatus(message);
    } finally {
      setBusy(false);
    }
  }

  function cancelImport() {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setBusy(false);
    setActiveStage(null);
    setStatus("Body scan import cancelled.");
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
      setLastSavedScan(response.scan);
      await load();
      setDraft(emptyDraft());
      setSelectedImages([]);
      clearBodyScanImageCache();
      setShowManualEntry(false);
      setEditAnyway(false);
      setStatus("Scan saved. Your Ascend DNA is updated.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save scan.");
    } finally {
      setBusy(false);
    }
  }

  function setDraftValue(key: MetricKey, value: string) {
    setDraft((current) => ({
      ...current,
      [key]: value === "" ? null : key === "scanDate" || key === "machine" || key === "notes" ? value : Number(value)
    }));
  }

  const hasSelectedImages = selectedImages.length > 0;
  const canReadWithAi = !busy && hasSelectedImages;
  const canSaveScan = !busy;
  const confidence = confidenceInfo(draft.confidenceScore);
  const lockVerifiedValues = confidence.percent !== null && confidence.percent >= 85 && !editAnyway;
  const primaryButtonClass = "font-semibold shadow-lg shadow-teal-300/15 transition disabled:cursor-not-allowed disabled:opacity-70";
  const activePrimaryButtonClass = "bg-teal-300 !text-[#071018] hover:bg-teal-200";
  const inactivePrimaryButtonClass = "border border-line bg-ink !text-zinc-100 shadow-none";

  return (
    <>
      <section className="mt-4 flex items-start gap-3">
        <BackButton fallbackHref={coachView ? (clientId ? `/trainer/clients/${clientId}` : "/trainer") : "/athlete"} />
        <div>
          <p className="text-sm text-teal-300">Ascend DNA</p>
          <h1 className="mt-1 text-3xl font-semibold">Body Composition Engine</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">Upload a scan, confirm the values, then turn body composition into clearer coaching decisions.</p>
        </div>
      </section>

      {status ? <p className="mt-4 rounded-lg border border-line bg-surface p-3 text-sm leading-6 text-zinc-300">{status}</p> : null}
      <StageProgress activeStage={activeStage} busy={busy} />

      <div className="mt-4 space-y-4">
        {lastSavedScan ? <ResultsCard summary={summary} scan={lastSavedScan} onDismiss={() => setLastSavedScan(null)} /> : null}
        {!scans.length && !showManualEntry && !lastSavedScan ? <EmptyState /> : null}
        <DnaScoreCard summary={summary} />
        {coachView ? <CoachSnapshot summary={summary} /> : null}

        <section className="rounded-lg border border-line bg-surface p-4">
          <div className="flex items-center gap-3">
            <LineChart className="text-teal-300" size={20} />
            <div>
              <h2 className="font-semibold">Progress intelligence</h2>
              <p className="text-xs text-zinc-400">{summary?.nutritionDataSource ?? "Profile Only"}</p>
            </div>
          </div>
          <div className="mt-3 rounded-lg bg-ink p-3">
            <TrendSparkline values={trendValues} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-ink p-3"><p className="text-xs text-zinc-500">Latest weight</p><p className="mt-1 text-xl font-semibold">{valueText(latest?.weightKg, "kg")}</p></div>
            <div className="rounded-lg bg-ink p-3"><p className="text-xs text-zinc-500">Body fat</p><p className="mt-1 text-xl font-semibold">{valueText(latest?.bodyFatPercent, "%")}</p></div>
            <div className="rounded-lg bg-ink p-3"><p className="text-xs text-zinc-500">Lean mass</p><p className="mt-1 text-xl font-semibold">{valueText(summary?.derived.fatFreeMassKg, "kg")}</p></div>
            <div className="rounded-lg bg-ink p-3"><p className="text-xs text-zinc-500">FFMI</p><p className="mt-1 text-xl font-semibold">{valueText(summary?.derived.ffmi)}</p></div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-purple-400/30 bg-purple-400/10 p-3">
              <p className="text-xs text-purple-200">Fitness age</p>
              <p className="mt-1 text-xl font-semibold">{fitnessAge ? `${Math.round(fitnessAge)} years` : "--"}</p>
              <p className="mt-1 text-[11px] leading-4 text-zinc-500">Experimental. Uses scan data when available.</p>
            </div>
            <div className="rounded-lg border border-teal-400/30 bg-teal-400/10 p-3">
              <p className="text-xs text-teal-200">Goal ETA</p>
              <p className="mt-1 text-xl font-semibold">{summary?.derived.goalEtaWeeks ? `${Math.round(summary.derived.goalEtaWeeks)} weeks` : "--"}</p>
              <p className="mt-1 text-[11px] leading-4 text-zinc-500">Based on current trend, not a guarantee.</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-ink p-3">
              <p className="text-xs text-zinc-500">Greatest improvement</p>
              <p className="mt-1 text-sm font-semibold">{greatestImprovement ? greatestImprovement.metric : "--"}</p>
              <p className="mt-1 text-xs text-teal-200">{greatestImprovement ? changeText(greatestImprovement.change) : "Add another scan"}</p>
            </div>
            <div className="rounded-lg bg-ink p-3">
              <p className="text-xs text-zinc-500">Biggest challenge</p>
              <p className="mt-1 text-sm font-semibold">{biggestChallenge ? biggestChallenge.metric : "--"}</p>
              <p className="mt-1 text-xs text-amber">{biggestChallenge ? changeText(biggestChallenge.change) : "No concern detected"}</p>
            </div>
            <div className="rounded-lg bg-ink p-3">
              <p className="text-xs text-zinc-500">Weekly trend</p>
              <p className="mt-1 text-sm font-semibold">{summary?.derived.weeklyProgressPercent !== null && summary?.derived.weeklyProgressPercent !== undefined ? `${summary.derived.weeklyProgressPercent}%` : "--"}</p>
              <p className="mt-1 text-xs text-zinc-500">Body composition movement</p>
            </div>
            <div className="rounded-lg bg-ink p-3">
              <p className="text-xs text-zinc-500">Monthly trend</p>
              <p className="mt-1 text-sm font-semibold">{summary?.derived.monthlyProgressPercent !== null && summary?.derived.monthlyProgressPercent !== undefined ? `${summary.derived.monthlyProgressPercent}%` : "--"}</p>
              <p className="mt-1 text-xs text-zinc-500">Needs 28+ days of scans</p>
            </div>
            <div className="rounded-lg bg-ink p-3">
              <p className="text-xs text-zinc-500">Current streak</p>
              <p className="mt-1 text-sm font-semibold">{summary?.scanCount ? `${summary.scanCount} confirmed` : "--"}</p>
              <p className="mt-1 text-xs text-zinc-500">Scan history depth</p>
            </div>
            <div className="rounded-lg bg-ink p-3">
              <p className="text-xs text-zinc-500">Last scan</p>
              <p className="mt-1 text-sm font-semibold">{latest?.scanDate ? new Date(latest.scanDate).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "--"}</p>
              <p className="mt-1 text-xs text-zinc-500">{nextScanDate ? `Next around ${nextScanDate.toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : "No scan yet"}</p>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-line bg-surface p-4">
          <div className="flex items-center gap-2">
            <Target className="text-teal-300" size={19} />
            <h2 className="font-semibold">Scan-informed nutrition</h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-zinc-400">Ascend can use confirmed body composition to make targets more personal than profile-only estimates.</p>
          <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
            <div className="rounded-lg bg-ink p-2"><span className="block text-lg font-semibold text-white">{guide.calories ?? "--"}</span>kcal</div>
            <div className="rounded-lg bg-ink p-2"><span className="block text-lg font-semibold text-white">{guide.protein ?? "--"}g</span>protein</div>
            <div className="rounded-lg bg-ink p-2"><span className="block text-lg font-semibold text-white">{guide.carbs ?? "--"}g</span>carbs</div>
            <div className="rounded-lg bg-ink p-2"><span className="block text-lg font-semibold text-white">{guide.fat ?? "--"}g</span>fat</div>
          </div>
        </section>

        {summary?.insights.length || summary?.coachAlerts.length ? (
          <section className="rounded-lg border border-purple-400/40 bg-purple-400/10 p-4">
            <div className="flex items-center gap-2"><Brain className="text-purple-300" size={19} /><h2 className="font-semibold">Coach summary</h2></div>
            <div className="mt-3 space-y-2 text-sm leading-6 text-zinc-200">
              {summary.insights.map((insight) => <p key={insight}>{insight}</p>)}
              {summary.coachAlerts.map((alert) => <p key={alert.type} className={alert.severity === "positive" ? "text-teal-200" : alert.severity === "high" ? "text-red-300" : "text-amber"}>{alert.message}</p>)}
            </div>
          </section>
        ) : (
          <section className="rounded-lg border border-line bg-surface p-4">
            <div className="flex items-center gap-2"><Brain className="text-purple-300" size={19} /><h2 className="font-semibold">Coach summary</h2></div>
            <p className="mt-2 text-sm leading-6 text-zinc-400">Add a scan to unlock clear, coach-friendly body composition insights.</p>
          </section>
        )}

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
              <button type="button" disabled={!canReadWithAi} onClick={runExtraction} className={`h-11 rounded-lg ${primaryButtonClass} ${canReadWithAi ? activePrimaryButtonClass : inactivePrimaryButtonClass}`}>
                <Sparkles className="mr-1 inline" size={17} /> {busy ? "Reading..." : allowLowQuality ? "Read anyway" : "Read with AI"}
              </button>
              <button type="button" onClick={() => { setDraft(emptyDraft()); setShowManualEntry(true); setEditAnyway(true); setLastSavedScan(null); }} className="h-11 rounded-lg border border-line bg-ink font-semibold text-zinc-100 transition hover:border-teal-400/50">
                Manual entry
              </button>
            </div>
            {selectedImages.length ? (
              <div className="mt-3 space-y-2">
                {selectedImages.map((image, index) => (
                  <article key={image.id} className="rounded-lg bg-ink p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">Image {index + 1}</p>
                        <p className="text-xs text-zinc-500">{Math.round(image.originalBytes / 1024)} KB to {Math.round(image.optimizedBytes / 1024)} KB / {image.width}x{image.height}</p>
                      </div>
                      {image.warnings.some((warning) => warning.severity !== "info") ? <AlertTriangle className="text-amber" size={18} /> : <CheckCircle2 className="text-teal-300" size={18} />}
                    </div>
                    {image.warnings.filter((warning) => warning.severity !== "info").map((warning) => (
                      <p key={`${image.id}-${warning.code}`} className={`mt-2 text-xs leading-5 ${warning.severity === "blocking" ? "text-red-300" : "text-amber"}`}>{warning.message}</p>
                    ))}
                  </article>
                ))}
              </div>
            ) : null}
          </section>
        ) : (
          <button type="button" onClick={() => { setDraft(emptyDraft()); setShowManualEntry(true); setEditAnyway(true); }} className="h-11 rounded-lg border border-teal-400/50 bg-teal-400/10 font-semibold text-teal-200">Add manual coach entry</button>
        )}

        {showManualEntry ? (
          <form onSubmit={saveScan} className="rounded-lg border border-line bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="text-teal-300" size={19} />
                <div>
                  <h2 className="font-semibold">Review and confirm</h2>
                  <p className="mt-1 text-sm text-zinc-400">Only confirmed scans are saved to history.</p>
                </div>
              </div>
              {lockVerifiedValues ? (
                <button type="button" onClick={() => setEditAnyway(true)} className="rounded-lg border border-line bg-ink px-3 py-2 text-xs font-semibold text-zinc-100">
                  <Pencil className="mr-1 inline" size={14} /> Edit anyway
                </button>
              ) : null}
            </div>
            <div className="mt-4">
              <AiDraftSummary draft={draft} />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="text-xs text-zinc-400">Scan date<input type="date" value={draft.scanDate} onChange={(event) => setDraftValue("scanDate", event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line bg-ink px-3 text-white" /></label>
              <label className="text-xs text-zinc-400">Machine<input value={draft.machine ?? ""} onChange={(event) => setDraftValue("machine", event.target.value)} placeholder="InBody, Tanita, Evolt..." className="mt-1 h-11 w-full rounded-lg border border-line bg-ink px-3 text-white" /></label>
            </div>

            {(["body", "composition", "hydration", "health"] as const).map((section) => (
              <section key={section} className="mt-4 rounded-lg border border-line bg-ink p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{sectionCopy[section].title}</h3>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">{sectionCopy[section].description}</p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {metricFields.filter((field) => field.section === section).map((field) => {
                    const missing = missingMetricNames(draft).includes(field.label);
                    const hasValue = numericValue(draft[field.key]) !== null;
                    const locked = lockVerifiedValues && hasValue && !missing;
                    return (
                      <label key={String(field.key)} className="text-xs text-zinc-400">
                        <span className="flex items-center justify-between gap-2">
                          <span>{field.label}{field.unit ? ` (${field.unit})` : ""}</span>
                          {locked ? <span className="inline-flex items-center gap-1 text-[10px] text-teal-200"><LockKeyhole size={11} /> verified</span> : missing ? <span className="text-[10px] text-amber">confirm</span> : null}
                        </span>
                        <input
                          type="number"
                          step="0.1"
                          disabled={locked}
                          value={draft[field.key] === null || draft[field.key] === undefined ? "" : String(draft[field.key])}
                          onChange={(event) => setDraftValue(field.key, event.target.value)}
                          className={`mt-1 h-11 w-full rounded-lg border px-3 text-white disabled:cursor-not-allowed disabled:text-zinc-400 ${missing ? "border-amber/60 bg-amber/10" : "border-line bg-surface"}`}
                        />
                      </label>
                    );
                  })}
                </div>
              </section>
            ))}

            <label className="mt-3 block text-xs text-zinc-400">Notes<textarea value={draft.notes ?? ""} onChange={(event) => setDraftValue("notes", event.target.value)} rows={3} className="mt-1 w-full resize-none rounded-lg border border-line bg-ink p-3 text-sm text-white" /></label>
            <button type="submit" disabled={!canSaveScan} className={`mt-3 h-12 w-full rounded-lg ${primaryButtonClass} ${canSaveScan ? activePrimaryButtonClass : inactivePrimaryButtonClass}`}>
              <CheckCircle2 className="mr-1 inline" size={17} /> {busy ? "Saving..." : "Confirm and save scan"}
            </button>
          </form>
        ) : null}

        <section className="rounded-lg border border-line bg-surface p-4">
          <div className="flex items-center gap-2"><Activity className="text-teal-300" size={19} /><h2 className="font-semibold">Scan history</h2></div>
          <div className="mt-3 space-y-3">
            {scans.map((scan) => {
              const scanConfidence = confidenceInfo(scan.confidenceScore);
              const bodyFatChange = scan.id === latest?.id ? trendFor(summary, "Body Fat")?.change : null;
              const muscleChange = scan.id === latest?.id ? (trendFor(summary, "Skeletal Muscle") ?? trendFor(summary, "Muscle"))?.change : null;
              return (
                <article key={scan.id ?? `${scan.scanDate}-${scan.createdAt}`} className="rounded-lg border border-line bg-ink p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{new Date(scan.scanDate).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</p>
                      <p className="text-xs text-zinc-500">{scan.machine || "Unknown machine"} / {scan.importSource === "ai_import" ? "AI Import" : "Manual Entry"}</p>
                    </div>
                    <span className={`rounded-md border px-2 py-1 text-xs ${scanConfidence.tone}`}>{scanConfidence.percent ? `${scanConfidence.percent}%` : "reviewed"}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <p><span className="block text-xs text-zinc-500">Weight</span>{valueText(scan.weightKg, "kg")}</p>
                    <p><span className="block text-xs text-zinc-500">Fat</span>{valueText(scan.bodyFatPercent, "%")}</p>
                    <p><span className="block text-xs text-zinc-500">Muscle</span>{valueText(scan.skeletalMuscleMassKg ?? scan.muscleMassKg, "kg")}</p>
                  </div>
                  {scan.id === latest?.id ? (
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <p className="rounded-lg bg-surface p-2">{bodyFatChange !== null && bodyFatChange !== undefined && bodyFatChange < 0 ? <ArrowDownRight className="mr-1 inline text-teal-300" size={14} /> : <TrendingUp className="mr-1 inline text-zinc-400" size={14} />}Body fat {changeText(bodyFatChange, "%")}</p>
                      <p className="rounded-lg bg-surface p-2">{muscleChange !== null && muscleChange !== undefined && muscleChange > 0 ? <ArrowUpRight className="mr-1 inline text-teal-300" size={14} /> : <TrendingUp className="mr-1 inline text-zinc-400" size={14} />}Muscle {changeText(muscleChange, "kg")}</p>
                    </div>
                  ) : null}
                  {scan.sourceImages?.[0]?.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={scan.sourceImages[0].url} alt="Body composition scan" className="mt-3 max-h-48 w-full rounded-lg object-contain" />
                  ) : null}
                </article>
              );
            })}
            {!scans.length ? (
              <div className="rounded-lg bg-ink p-4 text-sm text-zinc-400">
                <FileText className="mb-2 text-teal-300" size={20} />
                No scans saved yet. Your first confirmed scan will appear here.
              </div>
            ) : null}
          </div>
        </section>

        {nextScanDate ? (
          <p className="pb-4 text-center text-xs text-zinc-500">Suggested next scan: {nextScanDate.toLocaleDateString(undefined, { day: "numeric", month: "short" })}</p>
        ) : null}
      </div>
    </>
  );
}

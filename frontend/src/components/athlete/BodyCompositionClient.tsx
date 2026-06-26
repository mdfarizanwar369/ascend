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
  Pencil,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Upload
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

const coreMetrics: Array<{ key: MetricKey; label: string; unit: string }> = [
  { key: "weightKg", label: "Weight", unit: "kg" },
  { key: "bodyFatPercent", label: "Body fat", unit: "%" },
  { key: "skeletalMuscleMassKg", label: "Skeletal muscle", unit: "kg" }
];

const advancedMetricKeys = new Set<MetricKey>(metricFields.map((field) => field.key).filter((key) => !coreMetrics.some((core) => core.key === key)));

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
  if (value === null || value === undefined || value === "") return null;
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
  coreMetrics.forEach((field) => {
    if (scan && numericValue(scan[field.key]) === null) missing.add(String(field.key));
  });
  return Array.from(missing).map(friendlyFieldName);
}

function missingCoreFields(scan: BodyCompositionScan) {
  return coreMetrics.filter((field) => numericValue(scan[field.key]) === null).map((field) => field.label);
}

function reviewTimeText(scan: BodyCompositionScan | null) {
  const missing = missingMetricNames(scan).length;
  const minutes = missing ? 2 : 1;
  return `${minutes} min review`;
}

function friendlyBodyScanError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/date/i.test(message)) return "Please choose a valid scan date.";
  if (/weight|fat mass|lean body/i.test(message)) return "One of the scan numbers looks unusual. Check the main values and try saving again.";
  if (/machine|notes/i.test(message)) return "One optional note is too long. Shorten it and try again.";
  if (/image|payload|too large|at most 6/i.test(message)) return "That upload is too large. Try fewer images or retake a clearer photo.";
  if (/auth|token|login|permission/i.test(message)) return "Your session needs a quick refresh. Please log in again and retry.";
  if (/network|fetch|timeout/i.test(message)) return "Connection was interrupted. Please try again in a moment.";
  return "Ascend could not save this scan yet. Check the highlighted values and try again.";
}

function prepareDraftForReview(draft: BodyCompositionScan): BodyCompositionScan {
  return {
    ...emptyDraft(),
    ...draft,
    scanDate: draft.scanDate?.slice(0, 10) || today(),
    weightKg: numericValue(draft.weightKg),
    bodyFatPercent: numericValue(draft.bodyFatPercent),
    skeletalMuscleMassKg: numericValue(draft.skeletalMuscleMassKg) ?? numericValue(draft.muscleMassKg),
    muscleMassKg: numericValue(draft.muscleMassKg),
    missingFields: (draft.missingFields ?? []).filter((field) => {
      if (field === "skeletalMuscleMassKg" && (numericValue(draft.skeletalMuscleMassKg) !== null || numericValue(draft.muscleMassKg) !== null)) return false;
      return true;
    }),
    userConfirmed: true
  };
}

function nutritionGuide(summary: BodyCompositionSummary | null, scanOverride?: BodyCompositionScan | null) {
  const calories = summary?.derived.estimatedDailyEnergyNeedsKcal ?? null;
  const scan = scanOverride ?? summary?.latestScan ?? null;
  const leanMass = scanOverride
    ? numericValue(scan?.leanBodyMassKg) ?? numericValue(scan?.estimatedLeanBodyMassKg) ?? numericValue(scan?.skeletalMuscleMassKg) ?? numericValue(scan?.muscleMassKg)
    : summary?.derived.fatFreeMassKg ?? summary?.latestScan?.leanBodyMassKg ?? summary?.latestScan?.estimatedLeanBodyMassKg ?? null;
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

function quickSummary(summary: BodyCompositionSummary | null, scan: BodyCompositionScan | null) {
  if (!scan) return "No confirmed scan yet.";
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

function DnaScoreCard({ summary, draftScan }: { summary: BodyCompositionSummary | null; draftScan?: BodyCompositionScan | null }) {
  const score = summary?.dnaScore.current;
  const change = summary?.dnaScore.change;
  return (
    <section className="rounded-lg border border-teal-400/40 bg-gradient-to-br from-teal-400/15 to-purple-400/10 p-4 shadow-lg shadow-teal-400/5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-teal-300">Ascend DNA</p>
          <h2 className="mt-1 text-xl font-semibold">Ascend DNA Score</h2>
          <p className="mt-1 text-xs leading-5 text-zinc-400">Experimental coaching signal. Not medical advice.</p>
          {draftScan ? <p className="mt-2 inline-flex rounded-full border border-amber/40 bg-amber/10 px-3 py-1 text-xs font-semibold text-amber">Draft (Not yet saved)</p> : null}
        </div>
        <div className="grid h-20 w-20 shrink-0 place-items-center rounded-full border-4 border-teal-300 bg-ink text-center">
          <span className="text-2xl font-semibold">{score ?? "--"}</span>
        </div>
      </div>
      {draftScan ? (
        <p className="mt-3 text-sm text-zinc-300">Save the scan to calculate confirmed score movement.</p>
      ) : change !== null && change !== undefined ? (
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
          <p className="text-xs uppercase tracking-[0.25em] text-teal-300">Body Scan</p>
          <h2 className="mt-1 text-lg font-semibold">Upload your first body scan</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-300">
            Unlock personalized nutrition, progress trends, and coach-friendly insights after you confirm your first scan.
          </p>
        </div>
      </div>
    </section>
  );
}

function StageProgress({ activeStage, busy }: { activeStage: BodyScanImportStageId | null; busy: boolean }) {
  if (!busy || !activeStage) return null;
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

function coachInsight(summary: BodyCompositionSummary | null, scan: BodyCompositionScan) {
  const alert = summary?.coachAlerts.find((item) => item.severity !== "positive") ?? summary?.coachAlerts[0];
  if (alert?.message) return alert.message;
  const protein = nutritionGuide(summary, scan).protein;
  if (protein) return `Use this scan to keep protein near ${protein}g daily and review your next scan in about four weeks.`;
  return "Keep training consistent, log your meals honestly, and compare again in about four weeks.";
}

function ResultsCard({ summary, scan }: { summary: BodyCompositionSummary | null; scan: BodyCompositionScan | null }) {
  if (!scan) return null;
  const guide = nutritionGuide(summary, scan);
  const summaryText = quickSummary(summary, scan);
  const dashboardHref = "/dashboard";
  return (
    <section className="rounded-lg border border-teal-400/50 bg-gradient-to-br from-teal-400/20 via-surface to-purple-400/15 p-4 shadow-xl shadow-teal-400/10">
      <div className="rounded-lg bg-ink/80 p-4">
        <p className="text-xs uppercase tracking-[0.25em] text-teal-300">Body Scan Complete</p>
        <h2 className="mt-2 text-2xl font-semibold">Your Body Scan Has Been Saved</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-300">Your Ascend DNA has been updated successfully.</p>
      </div>

      <div className="mt-3 rounded-lg border border-line bg-ink p-3">
        <p className="text-sm font-semibold">Latest Scan</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-surface p-3"><p className="text-xs text-zinc-500">Weight</p><p className="mt-1 text-xl font-semibold">{valueText(scan.weightKg, "kg")}</p></div>
          <div className="rounded-lg bg-surface p-3"><p className="text-xs text-zinc-500">Body Fat</p><p className="mt-1 text-xl font-semibold">{valueText(scan.bodyFatPercent, "%")}</p></div>
          <div className="rounded-lg bg-surface p-3"><p className="text-xs text-zinc-500">Skeletal Muscle</p><p className="mt-1 text-xl font-semibold">{valueText(scan.skeletalMuscleMassKg ?? scan.muscleMassKg, "kg")}</p></div>
          <div className="rounded-lg bg-surface p-3"><p className="text-xs text-zinc-500">Scan Date</p><p className="mt-1 text-base font-semibold">{new Date(scan.scanDate).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</p></div>
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-purple-400/30 bg-purple-400/10 p-3">
        <p className="text-sm font-semibold">AI Summary</p>
        <p className="mt-2 text-sm leading-6 text-zinc-200">{summaryText}</p>
      </div>

      <div className="mt-3 rounded-lg border border-line bg-ink p-3">
        <p className="text-sm font-semibold">Nutrition Updated</p>
        <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
          <p className="rounded-lg bg-surface p-2"><span className="block text-lg font-semibold text-white">{guide.calories ?? "--"}</span>kcal</p>
          <p className="rounded-lg bg-surface p-2"><span className="block text-lg font-semibold text-white">{guide.protein ?? "--"}g</span>protein</p>
          <p className="rounded-lg bg-surface p-2"><span className="block text-lg font-semibold text-white">{guide.carbs ?? "--"}g</span>carbs</p>
          <p className="rounded-lg bg-surface p-2"><span className="block text-lg font-semibold text-white">{guide.fat ?? "--"}g</span>fat</p>
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-teal-400/30 bg-teal-400/10 p-3">
        <p className="text-sm font-semibold">Coach Insight</p>
        <p className="mt-2 text-sm leading-6 text-zinc-200">{coachInsight(summary, scan)}</p>
        <p className="mt-3 text-xs font-semibold text-teal-200">Next Recommended Scan</p>
        <p className="mt-1 text-sm text-zinc-300">Recommended in approximately 4 weeks.</p>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <a href="#scan-history" className="flex h-12 items-center justify-center rounded-lg bg-teal-300 font-semibold !text-[#071018] shadow-lg shadow-teal-300/15">View Progress</a>
        <a href={dashboardHref} className="flex h-12 items-center justify-center rounded-lg border border-zinc-500 bg-ink font-semibold !text-white">Return to Dashboard</a>
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
            Ascend found {detected} useful number{detected === 1 ? "" : "s"}. {missing.length ? `${missing.length} main value${missing.length === 1 ? "" : "s"} need your help.` : "The main values are ready to save."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${confidence.tone}`}>{confidence.percent ? `${confidence.label} / ${confidence.percent}%` : confidence.label}</span>
            <span className="rounded-full border border-line bg-ink px-3 py-1 text-xs text-zinc-300">{reviewTimeText(draft)}</span>
          </div>
          {missing.length ? (
            <p className="mt-3 text-xs leading-5 text-amber">Please add: {missing.slice(0, 4).join(", ")}{missing.length > 4 ? "..." : ""}</p>
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
  const [status, setStatus] = useState("Loading Ascend DNA...");
  const [busy, setBusy] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [activeStage, setActiveStage] = useState<BodyScanImportStageId | null>(null);
  const [allowLowQuality, setAllowLowQuality] = useState(false);
  const [editAnyway, setEditAnyway] = useState(false);
  const [showAdvancedMetrics, setShowAdvancedMetrics] = useState(false);
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
      setStatus(error instanceof Error ? friendlyBodyScanError(error) : "Ascend DNA could not load yet.");
    }
  }, [clientId, coachView]);

  useEffect(() => { load(); }, [load]);

  const trendValues = useMemo(() => [...scans].reverse().map((scan) => Number(scan.bodyFatPercent ?? scan.weightKg ?? 0)).filter(Boolean), [scans]);
  const draftHasValues = showManualEntry && detectedMetricCount(draft) > 0;
  const displayScan = draftHasValues ? draft : summary?.latestScan ?? null;
  const guide = nutritionGuide(summary, draftHasValues ? draft : null);
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
    setShowAdvancedMetrics(false);
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
      setStatus("Reading visible scan values...");
      const response = await extractBodyComposition(dataUrls, controller.signal);
      setActiveStage("complete");
      const nextDraft = prepareDraftForReview(response.draft);
      if (!nextDraft.scanDate) {
        nextDraft.scanDate = new Date().toISOString().slice(0, 10);
      }
      setDraft(nextDraft);
      setShowManualEntry(true);
      setEditAnyway(false);
      setShowAdvancedMetrics(false);
      const missing = missingMetricNames(nextDraft);
      const detected = detectedMetricCount(nextDraft);
      const confidence = confidenceInfo(nextDraft.confidenceScore);
      setStatus(`${confidence.label}. Detected ${detected} metric${detected === 1 ? "" : "s"}. ${missing.length ? `${missing.length} core value${missing.length === 1 ? "" : "s"} need confirmation.` : "Review the main values, then save."}`);
    } catch (error) {
      setDraft({ ...emptyDraft(), sourceImages: [] });
      setShowManualEntry(true);
      setEditAnyway(true);
      setShowAdvancedMetrics(false);
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
    console.info("[body-composition-save] Save button clicked", { coachView, clientId });
    event.preventDefault();
    try {
      const missingCore = missingCoreFields(draft);
      console.info("[body-composition-save] Validation complete", {
        missingCore,
        hasWeight: numericValue(draft.weightKg) !== null,
        hasBodyFat: numericValue(draft.bodyFatPercent) !== null,
        hasSkeletalMuscle: numericValue(draft.skeletalMuscleMassKg) !== null,
        scanDate: draft.scanDate
      });
      if (missingCore.length) {
        setStatus(`Almost there. Add ${missingCore.join(", ")} before saving your Ascend DNA results.`);
        return;
      }
      setBusy(true);
      const payload = { ...draft, userConfirmed: true };
      const serializedPayload = JSON.stringify(payload);
      console.info("[body-composition-save] Calling saveBodyCompositionScan()", {
        endpoint: coachView && clientId ? "trainer" : "athlete",
        payload,
        payloadBytes: new Blob([serializedPayload]).size
      });
      const response = coachView && clientId
        ? await saveTrainerBodyCompositionScan(clientId, { ...payload, importSource: "manual_entry" })
        : await saveBodyCompositionScan(payload);
      console.info("[body-composition-save] Save completed", {
        scanId: response.scan.id,
        summaryLatestScanId: response.summary.latestScan?.id ?? null
      });
      setSummary(response.summary);
      setLastSavedScan(response.scan);
      await load();
      setDraft(emptyDraft());
      setSelectedImages([]);
      clearBodyScanImageCache();
      setShowManualEntry(false);
      setEditAnyway(false);
      setShowAdvancedMetrics(false);
      setActiveStage(null);
      setStatus("");
    } catch (error) {
      console.error("[body-composition-save] Save pipeline failed", {
        error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : null
      });
      setStatus(friendlyBodyScanError(error));
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
  const missingCore = missingCoreFields(draft);
  const canSaveScan = !busy && missingCore.length === 0;
  const confidence = confidenceInfo(draft.confidenceScore);
  const lockVerifiedValues = confidence.percent !== null && confidence.percent >= 85 && !editAnyway;
  const primaryButtonClass = "font-semibold shadow-lg shadow-teal-300/15 transition disabled:cursor-not-allowed";
  const activePrimaryButtonClass = "bg-teal-300 !text-[#071018] hover:bg-teal-200";
  const inactivePrimaryButtonClass = "border border-zinc-600 bg-zinc-800 !text-zinc-200 shadow-none";

  return (
    <>
      <section className="mt-4 flex items-start gap-3">
        <BackButton fallbackHref={coachView ? (clientId ? `/trainer/clients/${clientId}` : "/trainer") : "/athlete"} />
        <div>
          <p className="text-sm text-teal-300">Body Scan</p>
          <h1 className="mt-1 text-3xl font-semibold">Body Scan</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">Upload your scan, confirm the main numbers, and Ascend turns them into clear progress insights.</p>
        </div>
      </section>

      {status ? <p className="mt-4 rounded-lg border border-line bg-surface p-3 text-sm leading-6 text-zinc-300">{status}</p> : null}
      <StageProgress activeStage={activeStage} busy={busy} />

      <div className="mt-4 space-y-4">
        {lastSavedScan ? <ResultsCard summary={summary} scan={lastSavedScan} /> : null}
        {!scans.length && !showManualEntry && !lastSavedScan ? <EmptyState /> : null}
        <DnaScoreCard summary={summary} draftScan={draftHasValues ? draft : null} />
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
            <div className="rounded-lg bg-ink p-3"><p className="text-xs text-zinc-500">{draftHasValues ? "Draft weight" : "Latest weight"}</p><p className="mt-1 text-xl font-semibold">{valueText(displayScan?.weightKg, "kg")}</p>{draftHasValues ? <p className="mt-1 text-[11px] text-amber">Draft (Not yet saved)</p> : null}</div>
            <div className="rounded-lg bg-ink p-3"><p className="text-xs text-zinc-500">Body fat</p><p className="mt-1 text-xl font-semibold">{valueText(displayScan?.bodyFatPercent, "%")}</p>{draftHasValues ? <p className="mt-1 text-[11px] text-amber">Draft</p> : null}</div>
            <div className="rounded-lg bg-ink p-3"><p className="text-xs text-zinc-500">Lean mass</p><p className="mt-1 text-xl font-semibold">{valueText(draftHasValues ? (displayScan?.leanBodyMassKg ?? displayScan?.estimatedLeanBodyMassKg) : summary?.derived.fatFreeMassKg, "kg")}</p></div>
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
          <p className="mt-2 text-sm leading-6 text-zinc-400">Ascend can use confirmed scan data to make targets more personal than profile-only estimates.</p>
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
            <p className="mt-2 text-sm leading-6 text-zinc-400">Add a scan to unlock clear, coach-friendly progress insights.</p>
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
              <button type="button" onClick={() => { setDraft(emptyDraft()); setShowManualEntry(true); setEditAnyway(true); setShowAdvancedMetrics(false); setLastSavedScan(null); }} className="h-11 rounded-lg border border-zinc-500 bg-surface font-semibold !text-white transition hover:border-teal-400/50">
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
          <button type="button" onClick={() => { setDraft(emptyDraft()); setShowManualEntry(true); setEditAnyway(true); setShowAdvancedMetrics(false); }} className="h-11 rounded-lg border border-teal-400/60 bg-teal-400/10 font-semibold !text-teal-100">Add scan manually</button>
        )}

        {showManualEntry ? (
          <form onSubmit={saveScan} className="rounded-lg border border-line bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="text-teal-300" size={19} />
                <div>
                  <h2 className="font-semibold">Review the main numbers</h2>
                  <p className="mt-1 text-sm text-zinc-400">Confirm only what matters first. Extra report details are optional.</p>
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

            <section className="mt-4 rounded-lg border border-line bg-ink p-3">
              <h3 className="font-semibold">Main scan values</h3>
              <p className="mt-1 text-xs leading-5 text-zinc-500">These four values are enough to save your body scan.</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="text-xs text-zinc-400">Scan date<input type="date" value={draft.scanDate} onChange={(event) => setDraftValue("scanDate", event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line bg-surface px-3 text-white" /></label>
                {coreMetrics.map((field) => {
                  const missing = numericValue(draft[field.key]) === null;
                  const locked = lockVerifiedValues && !missing;
                  return (
                    <label key={String(field.key)} className="text-xs text-zinc-400">
                      <span className="flex items-center justify-between gap-2">
                        <span>{field.label}{field.unit ? ` (${field.unit})` : ""}</span>
                        {missing ? <span className="text-[10px] text-amber">needed</span> : locked ? <span className="text-[10px] text-teal-200">ready</span> : null}
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
              {missingCore.length ? <p className="mt-3 text-xs leading-5 text-amber">Add {missingCore.join(", ")} to save your body scan.</p> : <p className="mt-3 text-xs leading-5 text-teal-200">Ready to save. Advanced details are optional.</p>}
            </section>

            <section className="mt-4 rounded-lg border border-line bg-ink p-3">
              <button type="button" onClick={() => setShowAdvancedMetrics((value) => !value)} className="flex min-h-11 w-full items-center justify-between rounded-lg border border-zinc-600 bg-surface px-3 text-left text-sm font-semibold !text-white">
                <span>Advanced Metrics</span>
                <span className="text-xs text-zinc-400">{showAdvancedMetrics ? "Hide" : "Optional"}</span>
              </button>
              {showAdvancedMetrics ? (
                <div className="mt-3 space-y-4">
                  <label className="block text-xs text-zinc-400">Scanner or device (optional)<input value={draft.machine ?? ""} onChange={(event) => setDraftValue("machine", event.target.value)} placeholder="InBody, Tanita, Evolt..." className="mt-1 h-11 w-full rounded-lg border border-line bg-surface px-3 text-white" /></label>
                  {(["body", "composition", "hydration", "health"] as const).map((section) => {
                    const fields = metricFields.filter((field) => field.section === section && advancedMetricKeys.has(field.key));
                    if (!fields.length) return null;
                    return (
                      <div key={section}>
                        <h3 className="text-sm font-semibold">{sectionCopy[section].title}</h3>
                        <p className="mt-1 text-xs leading-5 text-zinc-500">{sectionCopy[section].description}</p>
                        <div className="mt-3 grid grid-cols-2 gap-3">
                          {fields.map((field) => (
                            <label key={String(field.key)} className="text-xs text-zinc-400">
                              {field.label}{field.unit ? ` (${field.unit})` : ""}
                              <input
                                type="number"
                                step="0.1"
                                value={draft[field.key] === null || draft[field.key] === undefined ? "" : String(draft[field.key])}
                                onChange={(event) => setDraftValue(field.key, event.target.value)}
                                className="mt-1 h-11 w-full rounded-lg border border-line bg-surface px-3 text-white"
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  <label className="block text-xs text-zinc-400">Coach notes (optional)<textarea value={draft.notes ?? ""} onChange={(event) => setDraftValue("notes", event.target.value)} rows={3} className="mt-1 w-full resize-none rounded-lg border border-line bg-surface p-3 text-sm text-white" /></label>
                </div>
              ) : null}
            </section>

            <button type="submit" disabled={!canSaveScan} className={`mt-3 h-12 w-full rounded-lg ${primaryButtonClass} ${canSaveScan ? activePrimaryButtonClass : inactivePrimaryButtonClass}`}>
              <CheckCircle2 className="mr-1 inline" size={17} /> {busy ? "Saving..." : "Save Body Scan"}
            </button>
          </form>
        ) : null}

        <section id="scan-history" className="rounded-lg border border-line bg-surface p-4 scroll-mt-4">
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
                      <p className="text-xs text-zinc-500">{scan.machine || "Device not entered"} / {scan.importSource === "ai_import" ? "Read by AI" : "Entered manually"}</p>
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

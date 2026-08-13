"use client";

import { useEffect, useState } from "react";
import { FileText, Sparkles } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { generateWeeklyReport, getCurrentWeeklyReport } from "@/lib/ascendApi";
import { WeeklyReportSummary } from "@/components/reports/WeeklyReportSummary";
import { SectionShell, SkeletonBlock, SkeletonText } from "@/components/PerceivedLoading";

type WeeklyReport = NonNullable<Awaited<ReturnType<typeof getCurrentWeeklyReport>>["report"]>;

function formatDate(value?: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-MY", { day: "numeric", month: "short" });
}

export function WeeklyReportClient() {
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [status, setStatus] = useState("Loading this week's report...");
  const [isGenerating, setIsGenerating] = useState(false);
  const isInitialLoading = !report && status.startsWith("Loading");

  useEffect(() => {
    getCurrentWeeklyReport()
      .then((response) => {
        setReport(response.report);
        setStatus(response.report ? "" : "Your weekly reflection will appear here once there is enough activity to review.");
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "Could not load weekly reflection."));
  }, []);

  async function handleGenerate() {
    setIsGenerating(true);
    setStatus("Building your weekly reflection...");

    try {
      const response = await generateWeeklyReport();
      setReport(response.report);
      setStatus("Weekly reflection ready.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not generate weekly reflection.");
    } finally {
      setIsGenerating(false);
    }
  }

  if (isInitialLoading) {
    return (
      <main className="min-h-screen bg-ink px-4 py-5 text-white">
        <div className="mx-auto max-w-md">
          <header className="flex items-center gap-3 py-3">
            <BackButton fallbackHref="/dashboard" />
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-calm text-ink">
              <FileText size={20} />
            </span>
            <div>
              <p className="text-sm text-zinc-400">Premium</p>
              <h1 className="text-2xl font-semibold">Weekly reflection</h1>
            </div>
          </header>
          <SectionShell title="Weekly Reflection">
            <SkeletonText lines={4} />
            <SkeletonBlock className="mt-4 h-12 w-full rounded-lg" />
          </SectionShell>
          <p className="mt-4 rounded-lg border border-line bg-surface p-3 text-sm text-zinc-300">{status}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ink px-4 py-5 text-white">
      <div className="mx-auto max-w-md">
        <header className="flex items-center gap-3 py-3">
          <BackButton fallbackHref="/dashboard" />
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-calm text-ink">
            <FileText size={20} />
          </span>
          <div>
            <p className="text-sm text-zinc-400">Premium</p>
            <h1 className="text-2xl font-semibold">Weekly reflection</h1>
          </div>
        </header>

        {!report ? <section className="ascend-surface mt-4 p-5">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 text-calm" size={20} />
            <div>
              <p className="font-semibold text-calm">See what your week is telling you.</p>
              <p className="mt-2 text-sm leading-6 text-zinc-300">
                Ascend brings together your food, water, weight, workouts, and momentum so you can see what improved and choose one simple focus.
              </p>
            </div>
          </div>
        </section> : null}

        <button
          type="button"
          disabled={isGenerating}
          onClick={handleGenerate}
          className="ascend-pressable mt-4 flex h-12 w-full items-center justify-center rounded-xl bg-lime font-semibold text-ink disabled:opacity-60"
        >
          {isGenerating ? "Building..." : report ? "Refresh reflection" : "Build weekly reflection"}
        </button>

        {status ? <p className="ascend-surface-subtle mt-4 p-3 text-sm text-zinc-300">{status}</p> : null}

        {report ? (
          <section className="ascend-surface mt-4 overflow-hidden">
            <div className="ascend-branded-surface bg-[linear-gradient(145deg,rgba(139,92,246,0.18),rgba(18,23,33,0.96)_55%,rgba(61,230,209,0.10))] p-5">
              <p className="text-sm text-zinc-400">{formatDate(report.week_start)} - {formatDate(report.week_end)}</p>
              <h2 className="mt-2 max-w-sm text-3xl font-semibold leading-tight">This week, made visible.</h2>
              <div className="mt-6 flex items-end justify-between gap-4">
                <div>
                  <p className="text-5xl font-semibold text-white">{report.compliance_score ?? "--"}</p>
                  <p className="mt-1 text-sm text-zinc-400">Weekly momentum</p>
                </div>
                <div className="grid flex-1 grid-cols-10 gap-1.5" role="img" aria-label={`Weekly momentum score ${report.compliance_score ?? "not available"} out of 100 for ${formatDate(report.week_start)} through ${formatDate(report.week_end)}.`}>
                  {Array.from({ length: 10 }, (_, index) => (
                    <span key={index} className={`h-12 rounded-full ${report.compliance_score !== null && report.compliance_score !== undefined && report.compliance_score >= (index + 1) * 10 ? "bg-lime" : "bg-white/10"}`} aria-hidden="true" />
                  ))}
                </div>
              </div>
            </div>
            <div className="p-5">
              <WeeklyReportSummary summary={report.summary} audience="client" />
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

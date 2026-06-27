"use client";

import { useEffect, useState } from "react";
import { FileText, Sparkles } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { generateWeeklyReport, getCurrentWeeklyReport } from "@/lib/ascendApi";
import { WeeklyReportSummary } from "@/components/reports/WeeklyReportSummary";

type WeeklyReport = NonNullable<Awaited<ReturnType<typeof getCurrentWeeklyReport>>["report"]>;

function formatDate(value?: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-MY", { day: "numeric", month: "short" });
}

export function WeeklyReportClient() {
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [status, setStatus] = useState("Loading this week's report...");
  const [isGenerating, setIsGenerating] = useState(false);

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

        <section className="mt-4 rounded-lg border border-calm/40 bg-calm/10 p-4">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 text-calm" size={20} />
            <div>
              <p className="font-semibold text-calm">See what your week is telling you.</p>
              <p className="mt-2 text-sm leading-6 text-zinc-300">
                Ascend brings together your food, water, weight, workouts, and momentum so you can see what improved and choose one simple focus.
              </p>
            </div>
          </div>
        </section>

        <button
          type="button"
          disabled={isGenerating}
          onClick={handleGenerate}
          className="ascend-pressable mt-4 flex h-12 w-full items-center justify-center rounded-lg bg-lime font-semibold text-ink disabled:opacity-60"
        >
          {isGenerating ? "Building..." : report ? "Refresh reflection" : "Build weekly reflection"}
        </button>

        {status ? <p className="mt-4 rounded-lg border border-line bg-surface p-3 text-sm text-zinc-300">{status}</p> : null}

        {report ? (
          <section className="mt-4 rounded-lg border border-line bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-zinc-400">
                  {formatDate(report.week_start)} - {formatDate(report.week_end)}
                </p>
                <h2 className="mt-1 text-xl font-semibold">Your week in review</h2>
              </div>
              <span className="rounded-lg bg-ink px-3 py-2 text-right text-sm font-semibold text-lime">
                <span className="block">{report.compliance_score ?? "--"}/100</span>
                <span className="block text-[11px] font-normal text-zinc-400">Momentum</span>
              </span>
            </div>
            <div className="mt-4">
              <WeeklyReportSummary summary={report.summary} audience="client" />
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

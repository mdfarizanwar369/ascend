"use client";

import { useEffect, useState } from "react";
import { FileText, Sparkles } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { generateWeeklyReport, getCurrentWeeklyReport } from "@/lib/ascendApi";

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
        setStatus(response.report ? "" : "No report generated for this week yet.");
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "Could not load weekly report."));
  }, []);

  async function handleGenerate() {
    setIsGenerating(true);
    setStatus("Generating your weekly report...");

    try {
      const response = await generateWeeklyReport();
      setReport(response.report);
      setStatus("Weekly report ready.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not generate weekly report.");
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
            <h1 className="text-2xl font-semibold">Weekly report</h1>
          </div>
        </header>

        <section className="mt-4 rounded-lg border border-calm/40 bg-calm/10 p-4">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 text-calm" size={20} />
            <div>
              <p className="font-semibold text-calm">Turn your logs into next actions.</p>
              <p className="mt-2 text-sm leading-6 text-zinc-300">
                Ascend summarizes your week from food, water, weight, habits, burn, and compliance.
              </p>
            </div>
          </div>
        </section>

        <button
          type="button"
          disabled={isGenerating}
          onClick={handleGenerate}
          className="mt-4 flex h-12 w-full items-center justify-center rounded-lg bg-lime font-semibold text-ink disabled:opacity-60"
        >
          {isGenerating ? "Generating..." : report ? "Refresh this week" : "Generate report"}
        </button>

        {status ? <p className="mt-4 rounded-lg border border-line bg-surface p-3 text-sm text-zinc-300">{status}</p> : null}

        {report ? (
          <section className="mt-4 rounded-lg border border-line bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-zinc-400">
                  {formatDate(report.week_start)} - {formatDate(report.week_end)}
                </p>
                <h2 className="mt-1 text-xl font-semibold">Your accountability summary</h2>
              </div>
              <span className="rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-lime">
                {report.compliance_score ?? "--"}/100
              </span>
            </div>
            <p className="mt-4 whitespace-pre-line text-sm leading-7 text-zinc-200">{report.summary}</p>
          </section>
        ) : null}
      </div>
    </main>
  );
}

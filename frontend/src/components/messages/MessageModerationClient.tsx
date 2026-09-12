"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getMessageReports, MessageReport, resolveMessageReport } from "@/lib/ascendApi";

export function MessageModerationClient() {
  const [reports, setReports] = useState<MessageReport[]>([]);
  const [status, setStatus] = useState("Loading reports...");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { setReports((await getMessageReports()).reports); setStatus(""); }
    catch { setStatus("Could not load reports. Founder access is required."); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function resolve(id: string, action: "remove" | "restrict" | "dismiss") {
    if (busy) return;
    setBusy(true);
    try { await resolveMessageReport(id, action); await load(); }
    catch { setStatus("Could not resolve the report. Refresh and try again."); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-3xl space-y-4 p-4 text-white">
    <Link href="/founder" className="text-calm underline">Back to founder workspace</Link>
    <h1 className="text-2xl font-semibold">Message reports</h1>
    <p className="text-sm text-zinc-400">Review reports promptly. Removing content hides it in the conversation. Restricting also stops the sender from using messaging. Account suspension is available in Users and assignments.</p>
    <button onClick={load} disabled={busy} className="min-h-11 rounded-lg border border-line px-4">Refresh reports</button>
    {status ? <p role="status">{status}</p> : null}
    {!status && !reports.length ? <p>No message reports.</p> : null}
    {reports.map(report => <article key={report.id} className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <p className="font-semibold">{report.reason} · {report.status}</p>
      <p className="text-sm text-zinc-400">From {report.reporter_name} about {report.sender_name} · {new Date(report.created_at).toLocaleString()}</p>
      <blockquote className="whitespace-pre-wrap rounded-lg bg-ink p-3">{report.message_body}</blockquote>
      {report.details ? <p className="whitespace-pre-wrap text-sm">{report.details}</p> : null}
      {report.status === "open" ? <div className="flex flex-wrap gap-2">
        <button disabled={busy} onClick={() => resolve(report.id, "remove")} className="min-h-11 rounded-lg border border-line px-3">Remove message</button>
        <button disabled={busy} onClick={() => resolve(report.id, "restrict")} className="min-h-11 rounded-lg border border-amber px-3 text-amber">Remove and restrict sender</button>
        <button disabled={busy} onClick={() => resolve(report.id, "dismiss")} className="min-h-11 rounded-lg border border-line px-3">Dismiss report</button>
      </div> : null}
    </article>)}
  </main>;
}

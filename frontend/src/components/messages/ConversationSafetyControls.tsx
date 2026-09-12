"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ConversationSafety, getConversationSafety, reportMessage, setConversationBlocked } from "@/lib/ascendApi";

export function ConversationSafetyControls({ userId, onAvailabilityChange }: {
  userId: string; onAvailabilityChange: (canSend: boolean) => void;
}) {
  const [safety, setSafety] = useState<ConversationSafety | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const revision = useRef(0);

  useEffect(() => {
    let active = true;
    onAvailabilityChange(false);
    async function refresh() {
      const current = ++revision.current;
      try {
        const result = await getConversationSafety(userId);
        if (!active || current !== revision.current) return;
        setSafety(result);
        onAvailabilityChange(result.canSend);
        setError("");
      } catch {
        if (active && current === revision.current) setError("Could not check conversation settings. Reopen this conversation to retry.");
      }
    }
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 20_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [userId, onAvailabilityChange]);

  async function toggleBlock() {
    if (!safety || busy) return;
    ++revision.current;
    setBusy(true);
    try {
      const result = await setConversationBlocked(userId, !safety.blockedByMe);
      ++revision.current;
      setSafety(result);
      onAvailabilityChange(result.canSend);
      setError("");
    } catch {
      setError("Could not change the block setting. Please try again.");
    } finally { setBusy(false); }
  }

  return <section aria-label="Conversation safety" className="mt-3 rounded-xl border border-line bg-surface p-3 text-sm">
    <button type="button" disabled={!safety || busy} onClick={toggleBlock} className="min-h-11 rounded-lg border border-line px-3 font-semibold disabled:opacity-50">
      {busy ? "Saving..." : safety?.blockedByMe ? "Unblock user" : "Block user"}
    </button>
    <p className="mt-2 text-zinc-400">{safety?.blockedByMe ? "You blocked this user. Messages are stopped in both directions. You can still report past messages." : safety && !safety.canSend ? "Messaging is unavailable for this conversation." : "Blocking stops messages in both directions. Use Report message below any received message to contact Ascend moderation."}</p>
    {error ? <p role="alert" className="mt-2 text-amber">{error}</p> : null}
  </section>;
}

export function ReportMessageButton({ messageId }: { messageId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("harassment");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await reportMessage(messageId, reason, details);
      setSent(true);
      setOpen(false);
    } catch { setError("Report was not sent. Please try again."); }
    finally { setBusy(false); }
  }
  if (sent) return <p role="status" className="mt-2 text-xs text-calm">Report sent to Ascend moderation.</p>;
  return <div className="mt-2">
    <button type="button" onClick={() => setOpen(!open)} className="min-h-11 text-xs underline">{open ? "Cancel report" : "Report message"}</button>
    {open ? <form onSubmit={submit} className="space-y-2 text-sm">
      <p className="text-xs text-zinc-400">The message and your report will be shared privately with Ascend moderation.</p>
      <label className="block">Reason<select value={reason} onChange={event => setReason(event.target.value)} className="mt-1 block w-full rounded-lg border border-line bg-ink p-2">
        <option value="harassment">Harassment or bullying</option><option value="inappropriate">Inappropriate content</option><option value="spam">Spam or scam</option><option value="other">Other</option>
      </select></label>
      <label className="block">Additional details (optional)<textarea value={details} maxLength={2000} onChange={event => setDetails(event.target.value)} className="mt-1 block w-full rounded-lg border border-line bg-ink p-2" /></label>
      <button type="submit" disabled={busy} className="min-h-11 rounded-lg bg-calm px-3 font-semibold text-ink disabled:opacity-50">{busy ? "Sending..." : "Submit report"}</button>
      {error ? <p role="alert" className="text-amber">{error}</p> : null}
    </form> : null}
  </div>;
}

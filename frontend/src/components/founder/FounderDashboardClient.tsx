"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Bot,
  Building2,
  CheckCircle2,
  Clipboard,
  DollarSign,
  ExternalLink,
  Mail,
  NotebookPen,
  RefreshCcw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  Users
} from "lucide-react";
import {
  createFounderConversation,
  createFounderLead,
  createFounderNote,
  disconnectFounderGmail,
  FounderLead,
  FounderLeadStatus,
  generateFounderEmailDrafts,
  getFounderDashboard,
  getFounderGmailAuthUrl,
  getFounderGmailStatus,
  getFounderLeads,
  getFounderNotes,
  researchFounderLead,
  researchFounderWebsite,
  sendFounderGmail,
  syncFounderGmailReplies,
  updateFounderLead
} from "@/lib/ascendApi";

const statuses: FounderLeadStatus[] = [
  "Not Contacted",
  "Email Sent",
  "Replied",
  "Meeting Booked",
  "Demo Completed",
  "Pilot",
  "Customer",
  "Lost"
];

const emptyLead = {
  gymName: "",
  website: "",
  country: "",
  city: "",
  publicEmail: "",
  contactPerson: "",
  ownerManagerName: "",
  linkedinUrl: "",
  instagramUrl: "",
  gymSize: "",
  ptFocus: "",
  existingApp: "",
  aiFitScore: 7,
  status: "Not Contacted" as FounderLeadStatus,
  expectedMrrCents: 0,
  currentMrrCents: 0,
  sourceUrls: [] as string[]
};

const outreachDraftOptions = [
  { key: "coldEmail", label: "Cold email" },
  { key: "followUp1", label: "Follow-up 1" },
  { key: "followUp2", label: "Follow-up 2" },
  { key: "linkedinMessage", label: "LinkedIn" },
  { key: "instagramDm", label: "Instagram DM" }
] as const;

type Summary = Awaited<ReturnType<typeof getFounderDashboard>>["summary"];
type Note = Awaited<ReturnType<typeof getFounderNotes>>["notes"][number];

function money(cents: number | string | null | undefined) {
  return `RM ${(Number(cents ?? 0) / 100).toLocaleString("en-MY", { maximumFractionDigits: 0 })}`;
}

function fieldValue(value: unknown) {
  if (Array.isArray(value)) return value.join("\n");
  if (value === null || value === undefined || value === "") return "Unknown";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function metricTone(value: number) {
  if (value >= 8) return "text-lime";
  if (value >= 6) return "text-amber";
  return "text-red-300";
}

function draftText(lead: FounderLead | null, key: string) {
  const value = lead?.emailDrafts?.[key];
  return typeof value === "string" ? value : "";
}

function draftSubject(lead: FounderLead | null, key: string) {
  const subject = draftText(lead, "subject");
  if (subject) return subject;
  return key === "coldEmail" ? "Exploring Ascend for your coaching team" : "Following up about Ascend";
}

function StatCard({ title, value, detail, icon: Icon }: { title: string; value: string; detail: string; icon: typeof Target }) {
  return (
    <article className="ascend-workspace-stat p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-400">{title}</p>
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-lime/10 text-lime">
          <Icon size={18} />
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-sm text-zinc-400">{detail}</p>
    </article>
  );
}

function DraftBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="rounded-2xl border border-line bg-ink p-4">
      <p className="text-xs uppercase tracking-[0.22em] text-purple-300">{title}</p>
      <p className="mt-3 whitespace-pre-line text-sm leading-6 text-zinc-300">{fieldValue(value)}</p>
    </div>
  );
}

export function FounderDashboardClient() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [leads, setLeads] = useState<FounderLead[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [leadForm, setLeadForm] = useState(emptyLead);
  const [status, setStatus] = useState("Loading Founder Dashboard...");
  const [saving, setSaving] = useState(false);
  const [researchUrl, setResearchUrl] = useState("");
  const [researchResult, setResearchResult] = useState<Record<string, unknown> | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteBody, setNoteBody] = useState("");
  const [gmailStatus, setGmailStatus] = useState<string>("Checking Gmail integration...");
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailConfigured, setGmailConfigured] = useState(false);
  const [gmailEmail, setGmailEmail] = useState<string | null>(null);
  const [gmailAutoSynced, setGmailAutoSynced] = useState(false);
  const [selectedDraftKey, setSelectedDraftKey] = useState<(typeof outreachDraftOptions)[number]["key"]>("coldEmail");
  const [approvedSubject, setApprovedSubject] = useState("");
  const [approvedBody, setApprovedBody] = useState("");

  const selectedLead = useMemo(() => leads.find((lead) => lead.id === selectedId) ?? null, [leads, selectedId]);

  async function load() {
    setStatus("Loading Founder Dashboard...");
    try {
      const [dashboardResponse, leadResponse, gmailResponse] = await Promise.all([
        getFounderDashboard(),
        getFounderLeads(),
        getFounderGmailStatus().catch((error) => ({
          configured: false,
          connected: false,
          available: false,
          gmailEmail: null,
          lastSyncedAt: null,
          connectedAt: null,
          manualApprovalRequired: true,
          message: error instanceof Error ? error.message : "Gmail status unavailable."
        }))
      ]);
      setSummary(dashboardResponse.summary);
      setLeads(leadResponse.leads);
      setSelectedId((current) => current ?? leadResponse.leads[0]?.id ?? null);
      setGmailStatus(gmailResponse.message);
      setGmailConnected(gmailResponse.connected);
      setGmailConfigured(gmailResponse.configured);
      setGmailEmail(gmailResponse.gmailEmail);
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Founder Dashboard could not load. Use the platform founder account.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!gmailConnected || gmailAutoSynced) return;
    setGmailAutoSynced(true);
    syncFounderGmailReplies()
      .then(async (response) => {
        if (response.importedReplies > 0) {
          setStatus(`Gmail synced. ${response.importedReplies} reply${response.importedReplies === 1 ? "" : "ies"} imported.`);
          await load();
        }
      })
      .catch(() => undefined);
  }, [gmailConnected, gmailAutoSynced]);

  useEffect(() => {
    if (!selectedLead) {
      setNotes([]);
      return;
    }
    getFounderNotes(selectedLead.id)
      .then((response) => setNotes(response.notes))
      .catch(() => setNotes([]));
  }, [selectedLead]);

  useEffect(() => {
    if (!selectedLead) return;
    const firstAvailable = outreachDraftOptions.find((option) => draftText(selectedLead, option.key))?.key ?? "coldEmail";
    setSelectedDraftKey(firstAvailable);
    setApprovedSubject(draftSubject(selectedLead, firstAvailable));
    setApprovedBody(draftText(selectedLead, firstAvailable));
  }, [selectedLead]);

  const filteredLeads = useMemo(() => {
    return [...leads].sort((a, b) => b.aiFitScore - a.aiFitScore || statuses.indexOf(a.status) - statuses.indexOf(b.status));
  }, [leads]);

  async function saveLead() {
    if (!leadForm.gymName.trim()) {
      setStatus("Add a gym name first.");
      return;
    }
    setSaving(true);
    try {
      const response = await createFounderLead({
        ...leadForm,
        sourceUrls: leadForm.website ? [leadForm.website] : []
      });
      setLeads((current) => [response.lead, ...current]);
      setSelectedId(response.lead.id);
      setLeadForm(emptyLead);
      setStatus("Lead added.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Lead could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function changeLeadStatus(lead: FounderLead, nextStatus: FounderLeadStatus) {
    const response = await updateFounderLead(lead.id, { status: nextStatus });
    setLeads((current) => current.map((item) => (item.id === lead.id ? response.lead : item)));
  }

  async function runResearchForUrl() {
    if (!researchUrl.trim()) return;
    setSaving(true);
    setStatus("Researching public website...");
    try {
      const response = await researchFounderWebsite({ website: researchUrl });
      setResearchResult(response.research);
      setStatus(`Research complete from ${response.sourceChars.toLocaleString()} characters of public website text.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Research failed.");
    } finally {
      setSaving(false);
    }
  }

  async function runResearchForLead(lead: FounderLead) {
    setSaving(true);
    setStatus(`Researching ${lead.gymName}...`);
    try {
      const response = await researchFounderLead(lead.id);
      setLeads((current) => current.map((item) => (item.id === lead.id ? response.lead : item)));
      setResearchResult(response.research);
      setStatus("Lead research saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Lead research failed.");
    } finally {
      setSaving(false);
    }
  }

  async function generateEmails(lead: FounderLead) {
    setSaving(true);
    setStatus(`Writing outreach drafts for ${lead.gymName}...`);
    try {
      const response = await generateFounderEmailDrafts({ leadId: lead.id });
      setLeads((current) => current.map((item) => (item.id === lead.id ? { ...item, emailDrafts: response.drafts } : item)));
      setSelectedDraftKey("coldEmail");
      setApprovedSubject(String(response.drafts.subject ?? ""));
      setApprovedBody(String(response.drafts.coldEmail ?? ""));
      setStatus("Email drafts ready. Review before sending.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Email drafts failed.");
    } finally {
      setSaving(false);
    }
  }

  async function saveOutboundDraft(lead: FounderLead) {
    const subject = String(lead.emailDrafts?.subject ?? "");
    const body = String(lead.emailDrafts?.coldEmail ?? "");
    if (!body) {
      setStatus("Generate an email draft first.");
      return;
    }
    await createFounderConversation({
      leadId: lead.id,
      channel: "gmail",
      direction: "outbound",
      subject,
      body,
      sentAt: new Date().toISOString()
    });
    await changeLeadStatus(lead, "Email Sent");
    setStatus("Email marked as sent. No email was sent automatically.");
  }

  async function connectGmail() {
    setSaving(true);
    try {
      const response = await getFounderGmailAuthUrl();
      window.location.href = response.authUrl;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not start Gmail connection.");
      setSaving(false);
    }
  }

  async function sendApprovedEmail(lead: FounderLead) {
    const subject = approvedSubject.trim();
    const body = approvedBody.trim();
    if (!subject || !body) {
      setStatus("Choose a draft and review the subject/body before sending.");
      return;
    }
    if (!lead.publicEmail) {
      setStatus("This lead has no public email saved.");
      return;
    }
    setSaving(true);
    try {
      await sendFounderGmail({ leadId: lead.id, subject, body, approved: true });
      setStatus(`Email sent to ${lead.publicEmail} and saved to the CRM.`);
      await load();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Gmail send failed.");
    } finally {
      setSaving(false);
    }
  }

  async function syncReplies() {
    setSaving(true);
    try {
      const response = await syncFounderGmailReplies();
      setStatus(`Gmail sync complete. Imported ${response.importedReplies} replies.`);
      await load();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Gmail reply sync failed.");
    } finally {
      setSaving(false);
    }
  }

  async function disconnectGmail() {
    setSaving(true);
    try {
      await disconnectFounderGmail();
      setGmailAutoSynced(false);
      setStatus("Gmail disconnected.");
      await load();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not disconnect Gmail.");
    } finally {
      setSaving(false);
    }
  }

  async function addNote() {
    if (!selectedLead || !noteBody.trim()) return;
    const response = await createFounderNote(selectedLead.id, { noteType: "general", body: noteBody });
    setNotes((current) => [response.note as Note, ...current]);
    setNoteBody("");
  }

  return (
    <main className="space-y-5 pb-24">
      <section className="ascend-identity-hero rounded-[2rem] border border-purple-400/25 bg-[radial-gradient(circle_at_top_right,rgba(53,242,208,0.18),transparent_18rem),linear-gradient(135deg,rgba(139,92,246,0.22),rgba(18,23,33,0.96))] p-6 shadow-soft">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.34em] text-purple-200">Internal Only</p>
            <h1 className="mt-3 text-3xl font-semibold md:text-5xl">Founder Dashboard</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300">
              Acquire gyms, manage outreach, research leads, create approved email drafts, and track Ascend's growth pipeline.
            </p>
          </div>
          <button
            onClick={load}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-ink px-4 text-sm font-semibold text-zinc-100"
          >
            <RefreshCcw size={16} />
            Refresh
          </button>
        </div>
      </section>

      {status ? <p className="ascend-workspace-inset p-4 text-sm text-zinc-300">{status}</p> : null}

      <section className="grid gap-3 md:grid-cols-4">
        <StatCard title="Leads" value={String(summary?.leads ?? 0)} detail="Total gyms tracked" icon={Building2} />
        <StatCard title="Reply rate" value={`${summary?.replyRate ?? 0}%`} detail="Based on pipeline status" icon={Mail} />
        <StatCard title="Meetings" value={String(summary?.meetingsBooked ?? 0)} detail="Booked or later stage" icon={Users} />
        <StatCard title="Expected MRR" value={money(summary?.expectedMrrCents ?? 0)} detail="Weighted manually by you" icon={DollarSign} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="ascend-workspace-section p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-purple-300">Lead Database</p>
              <h2 className="mt-1 text-2xl font-semibold">Gym acquisition pipeline</h2>
            </div>
            <ShieldCheck className="text-lime" />
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <input className="rounded-2xl border border-line bg-ink px-4 py-3 text-sm" placeholder="Gym name" value={leadForm.gymName} onChange={(event) => setLeadForm({ ...leadForm, gymName: event.target.value })} />
            <input className="rounded-2xl border border-line bg-ink px-4 py-3 text-sm" placeholder="Website" value={leadForm.website} onChange={(event) => setLeadForm({ ...leadForm, website: event.target.value })} />
            <input className="rounded-2xl border border-line bg-ink px-4 py-3 text-sm" placeholder="Public email" value={leadForm.publicEmail} onChange={(event) => setLeadForm({ ...leadForm, publicEmail: event.target.value })} />
            <input className="rounded-2xl border border-line bg-ink px-4 py-3 text-sm" placeholder="Country" value={leadForm.country} onChange={(event) => setLeadForm({ ...leadForm, country: event.target.value })} />
            <input className="rounded-2xl border border-line bg-ink px-4 py-3 text-sm" placeholder="City" value={leadForm.city} onChange={(event) => setLeadForm({ ...leadForm, city: event.target.value })} />
            <input className="rounded-2xl border border-line bg-ink px-4 py-3 text-sm" placeholder="PT focus" value={leadForm.ptFocus} onChange={(event) => setLeadForm({ ...leadForm, ptFocus: event.target.value })} />
            <input className="rounded-2xl border border-line bg-ink px-4 py-3 text-sm" placeholder="LinkedIn" value={leadForm.linkedinUrl} onChange={(event) => setLeadForm({ ...leadForm, linkedinUrl: event.target.value })} />
            <input className="rounded-2xl border border-line bg-ink px-4 py-3 text-sm" placeholder="Instagram" value={leadForm.instagramUrl} onChange={(event) => setLeadForm({ ...leadForm, instagramUrl: event.target.value })} />
            <button disabled={saving} onClick={saveLead} className="h-12 rounded-2xl bg-lime px-4 text-sm font-semibold text-ink disabled:opacity-60">
              Add lead
            </button>
          </div>

          <div className="mt-5 max-h-[34rem] space-y-3 overflow-auto pr-1">
            {filteredLeads.length ? filteredLeads.map((lead) => (
              <button
                key={lead.id}
                onClick={() => setSelectedId(lead.id)}
                className={`w-full rounded-2xl border p-4 text-left transition ${selectedId === lead.id ? "border-lime bg-lime/10" : "border-line bg-ink"}`}
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{lead.gymName}</h3>
                      <span className="rounded-full border border-line px-2 py-1 text-xs text-zinc-400">{lead.status}</span>
                      <span className={`text-sm font-semibold ${metricTone(lead.aiFitScore)}`}>Fit {lead.aiFitScore}/10</span>
                    </div>
                    <p className="mt-2 text-sm text-zinc-400">{[lead.city, lead.country].filter(Boolean).join(", ") || "Location unknown"} • {lead.ptFocus || "PT focus unknown"}</p>
                    <p className="mt-2 text-sm text-zinc-300">{lead.publicEmail || "No public email saved"}</p>
                  </div>
                  <select
                    value={lead.status}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => changeLeadStatus(lead, event.target.value as FounderLeadStatus)}
                    className="ascend-field ascend-select rounded-xl border px-3 py-2 pr-10 text-sm"
                  >
                    {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </div>
              </button>
            )) : (
              <div className="rounded-2xl border border-line bg-ink p-6 text-sm text-zinc-400">No leads yet. Add the first gym above.</div>
            )}
          </div>
        </div>

        <aside className="space-y-4">
          <section className="ascend-workspace-section p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <Search className="text-lime" />
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-purple-300">AI Research</p>
                <h2 className="text-xl font-semibold">Research a website</h2>
              </div>
            </div>
            <input className="mt-4 w-full rounded-2xl border border-line bg-ink px-4 py-3 text-sm" placeholder="https://gymwebsite.com" value={researchUrl} onChange={(event) => setResearchUrl(event.target.value)} />
            <button disabled={saving || !researchUrl} onClick={runResearchForUrl} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-lime font-semibold text-ink disabled:opacity-60">
              <Bot size={18} />
              Research website
            </button>
          </section>

          <section className="ascend-workspace-section p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <Mail className="text-lime" />
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-purple-300">Gmail Integration</p>
                <h2 className="text-xl font-semibold">{gmailConnected ? "Connected" : "Manual approval only"}</h2>
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 text-zinc-400">{gmailStatus}</p>
            {gmailEmail ? <p className="mt-2 rounded-2xl border border-line bg-ink px-3 py-2 text-sm text-zinc-300">{gmailEmail}</p> : null}
            <div className="mt-4 grid gap-2">
              {!gmailConnected ? (
                <button
                  disabled={saving || !gmailConfigured}
                  onClick={connectGmail}
                  className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-lime font-semibold text-ink disabled:opacity-60"
                >
                  <Mail size={17} />
                  Connect Gmail
                </button>
              ) : (
                <>
                  <button
                    disabled={saving}
                    onClick={syncReplies}
                    className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-lime font-semibold text-ink disabled:opacity-60"
                  >
                    <RefreshCcw size={17} />
                    Sync replies
                  </button>
                  <button
                    disabled={saving}
                    onClick={disconnectGmail}
                    className="flex h-11 items-center justify-center rounded-2xl border border-line bg-ink text-sm font-semibold text-zinc-100 disabled:opacity-60"
                  >
                    Disconnect Gmail
                  </button>
                </>
              )}
            </div>
          </section>
        </aside>
      </section>

      {selectedLead ? (
        <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="ascend-workspace-section p-4 sm:p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-purple-300">Selected Lead</p>
                <h2 className="mt-1 text-2xl font-semibold">{selectedLead.gymName}</h2>
                <p className="mt-2 text-sm text-zinc-400">{selectedLead.website || "No website saved"}</p>
              </div>
              <div className="flex gap-2">
                {selectedLead.website ? (
                  <a href={selectedLead.website} target="_blank" rel="noreferrer" className="grid h-11 w-11 place-items-center rounded-2xl border border-line bg-ink text-zinc-200">
                    <ExternalLink size={18} />
                  </a>
                ) : null}
                <button disabled={saving || !selectedLead.website} onClick={() => runResearchForLead(selectedLead)} className="grid h-11 w-11 place-items-center rounded-2xl border border-line bg-ink text-lime disabled:opacity-50">
                  <Sparkles size={18} />
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-line bg-ink p-4">
                <p className="text-xs text-zinc-500">Owner / Manager</p>
                <p className="mt-1 font-semibold">{selectedLead.ownerManagerName || "Unknown"}</p>
              </div>
              <div className="rounded-2xl border border-line bg-ink p-4">
                <p className="text-xs text-zinc-500">Existing App</p>
                <p className="mt-1 font-semibold">{selectedLead.existingApp || "Unknown"}</p>
              </div>
              <div className="rounded-2xl border border-line bg-ink p-4">
                <p className="text-xs text-zinc-500">Gym Size</p>
                <p className="mt-1 font-semibold">{selectedLead.gymSize || "Unknown"}</p>
              </div>
              <div className="rounded-2xl border border-line bg-ink p-4">
                <p className="text-xs text-zinc-500">AI Fit Score</p>
                <p className={`mt-1 text-2xl font-semibold ${metricTone(selectedLead.aiFitScore)}`}>{selectedLead.aiFitScore}/10</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <button disabled={saving} onClick={() => generateEmails(selectedLead)} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-lime font-semibold text-ink disabled:opacity-60">
                <Send size={17} />
                Generate outreach
              </button>
              <button
                disabled={saving || !gmailConnected || !selectedLead.publicEmail || !approvedSubject.trim() || !approvedBody.trim()}
                onClick={() => sendApprovedEmail(selectedLead)}
                className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-lime/40 bg-lime/10 font-semibold text-lime disabled:opacity-60"
              >
                <Mail size={17} />
                Send approved email
              </button>
              <button disabled={saving} onClick={() => saveOutboundDraft(selectedLead)} className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-ink font-semibold text-zinc-100 disabled:opacity-60">
                <CheckCircle2 size={17} />
                Mark sent manually
              </button>
            </div>

            <div className="mt-5">
              <p className="text-sm font-semibold">Notes</p>
              <textarea className="mt-2 min-h-28 w-full rounded-2xl border border-line bg-ink p-3 text-sm" placeholder="Meeting notes, objections, feature requests, next actions..." value={noteBody} onChange={(event) => setNoteBody(event.target.value)} />
              <button onClick={addNote} className="mt-2 flex h-11 items-center justify-center gap-2 rounded-2xl border border-line bg-ink px-4 text-sm font-semibold">
                <NotebookPen size={16} />
                Save note
              </button>
              <div className="mt-3 space-y-2">
                {notes.slice(0, 5).map((note) => (
                  <div key={note.id} className="rounded-2xl border border-line bg-ink p-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">{note.note_type}</p>
                    <p className="mt-2 text-sm leading-6 text-zinc-300">{note.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <section className="ascend-workspace-section p-4 sm:p-5">
              <p className="text-sm uppercase tracking-[0.24em] text-purple-300">AI Research</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {Object.entries((Object.keys(selectedLead.research ?? {}).length ? selectedLead.research : researchResult) ?? {}).map(([key, value]) => (
                  <DraftBlock key={key} title={key.replace(/([A-Z])/g, " $1")} value={value} />
                ))}
                {!Object.keys((Object.keys(selectedLead.research ?? {}).length ? selectedLead.research : researchResult) ?? {}).length ? (
                  <div className="rounded-2xl border border-line bg-ink p-5 text-sm text-zinc-400">Run AI Research to generate gym summary, services, PT emphasis, objections and talking points.</div>
                ) : null}
              </div>
            </section>

            <section className="ascend-workspace-section p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm uppercase tracking-[0.24em] text-purple-300">AI Email Writer</p>
                  <h2 className="text-xl font-semibold">Approval drafts</h2>
                </div>
                <Clipboard className="text-lime" />
              </div>
              <p className="mt-2 text-sm text-zinc-400">Ascend never sends automatically. Review the draft, then either send the approved email through Gmail or mark manual outreach as sent.</p>

              {Object.keys(selectedLead.emailDrafts ?? {}).length ? (
                <div className="mt-4 rounded-2xl border border-lime/30 bg-lime/10 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-lime">Manual approval composer</p>
                      <p className="mt-1 text-xs leading-5 text-zinc-400">
                        To: {selectedLead.publicEmail || "No public email saved yet"}
                      </p>
                    </div>
                    <span className="rounded-full bg-ink px-3 py-1 text-xs font-semibold text-zinc-300">
                      {gmailConnected ? "Gmail connected" : "Connect Gmail first"}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    {outreachDraftOptions.map((option) => {
                      const hasDraft = Boolean(draftText(selectedLead, option.key));
                      return (
                        <button
                          key={option.key}
                          type="button"
                          disabled={!hasDraft}
                          onClick={() => {
                            setSelectedDraftKey(option.key);
                            setApprovedSubject(draftSubject(selectedLead, option.key));
                            setApprovedBody(draftText(selectedLead, option.key));
                          }}
                          className={`h-11 rounded-2xl border px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                            selectedDraftKey === option.key
                              ? "border-lime bg-lime text-ink"
                              : "border-line bg-ink text-zinc-200"
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>

                  <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500" htmlFor="approved-email-subject">
                    Subject
                  </label>
                  <input
                    id="approved-email-subject"
                    value={approvedSubject}
                    onChange={(event) => setApprovedSubject(event.target.value)}
                    className="mt-2 h-12 w-full rounded-2xl border border-line bg-ink px-4 text-sm text-white outline-none transition focus:border-lime"
                  />

                  <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500" htmlFor="approved-email-body">
                    Approved message
                  </label>
                  <textarea
                    id="approved-email-body"
                    value={approvedBody}
                    onChange={(event) => setApprovedBody(event.target.value)}
                    className="mt-2 min-h-56 w-full rounded-2xl border border-line bg-ink p-4 text-sm leading-6 text-white outline-none transition focus:border-lime"
                  />

                  <button
                    type="button"
                    disabled={saving || !gmailConnected || !selectedLead.publicEmail || !approvedSubject.trim() || !approvedBody.trim()}
                    onClick={() => sendApprovedEmail(selectedLead)}
                    className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-lime font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Mail size={17} />
                    {saving ? "Sending..." : "Send approved email"}
                  </button>
                </div>
              ) : null}

              <div className="mt-4 grid gap-3">
                {Object.entries(selectedLead.emailDrafts ?? {}).map(([key, value]) => (
                  <DraftBlock key={key} title={key.replace(/([A-Z])/g, " $1")} value={value} />
                ))}
                {!Object.keys(selectedLead.emailDrafts ?? {}).length ? (
                  <div className="rounded-2xl border border-line bg-ink p-5 text-sm text-zinc-400">Generate outreach to create subject, cold email, two follow-ups, LinkedIn message and Instagram DM.</div>
                ) : null}
              </div>
            </section>
          </div>
        </section>
      ) : null}

      <section className="ascend-workspace-section p-4 sm:p-5">
        <p className="text-sm uppercase tracking-[0.24em] text-purple-300">Pipeline</p>
        <div className="mt-4 grid gap-2 md:grid-cols-8">
          {statuses.map((pipelineStatus) => (
            <div key={pipelineStatus} className="rounded-2xl border border-line bg-ink p-3">
              <p className="text-xs text-zinc-500">{pipelineStatus}</p>
              <div className="mt-3 flex items-center justify-between">
                <p className="text-2xl font-semibold">{leads.filter((lead) => lead.status === pipelineStatus).length}</p>
                <ArrowRight size={15} className="text-zinc-600" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

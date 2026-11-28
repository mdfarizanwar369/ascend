"use client";

import { useState } from "react";
import { getNativeCapacitorPlatform } from "@/lib/nativePlatform";
import { createCycleBackup, cycleBackupMaxBytes, cycleBackupName, openCycleBackup } from "@/lib/cycleBackup";
import { mergeCycleEntries, readCycleEntries, type CycleEntries } from "@/lib/cycleLog";

const button = "min-h-11 rounded-xl border border-line bg-ink px-3 text-sm font-semibold disabled:opacity-45";

async function saveBackupFile(contents: string) {
  if (getNativeCapacitorPlatform() === "ios") {
    const { Directory, Encoding, Filesystem } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const path = `cycle-${crypto.randomUUID()}/${cycleBackupName}`;
    try {
      const { uri } = await Filesystem.writeFile({ path, data: contents, directory: Directory.Cache, encoding: Encoding.UTF8, recursive: true });
      await Share.share({ title: "Save your private backup", files: [uri] });
    } finally {
      await Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => undefined);
    }
    return;
  }
  const file = new File([contents], cycleBackupName, { type: "application/json" });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; }
    catch (error) { if (error instanceof DOMException && error.name === "AbortError") return; }
  }
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = cycleBackupName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 20_000);
}

export function CycleBackup({ accountId, today, hasEntries, onImport }: {
  accountId: string; today: string; hasEntries: boolean; onImport: (entries: CycleEntries) => void;
}) {
  const [mode, setMode] = useState<"export" | "import" | null>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [file, setFile] = useState<File>();
  const [prepared, setPrepared] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function selectMode(next: typeof mode) {
    setMode(next); setPassword(""); setConfirmation(""); setFile(undefined);
    setPrepared(""); setMessage(""); setError("");
  }

  async function work() {
    setBusy(true);
    setError("");
    try {
      if (mode === "export") {
        const entries = readCycleEntries(localStorage, accountId);
        if (!Object.keys(entries).length) throw new Error("Missing entries.");
        setPrepared(await createCycleBackup(entries, password));
      } else if (file) {
        if (file.size > cycleBackupMaxBytes) throw new Error("File is too large.");
        const incoming = await openCycleBackup(await file.text(), password, today);
        const { entries, added, skipped } = mergeCycleEntries(localStorage, accountId, incoming);
        onImport(entries);
        setMessage(`Imported ${added} ${added === 1 ? "day" : "days"}. Kept ${skipped} existing ${skipped === 1 ? "day" : "days"}.`);
        setFile(undefined);
        setMode(null);
      }
      setPassword("");
      setConfirmation("");
    } catch {
      setError(mode === "export" ? "Ascend couldn’t prepare the backup." : "Couldn’t open this file. Check the backup and password.");
    } finally { setBusy(false); }
  }

  return <section className="rounded-[1.4rem] border border-line bg-surface p-4" aria-labelledby="cycle-backup-title">
    <h2 id="cycle-backup-title" className="font-semibold">Move or back up your log</h2>
    <p className="mt-1 text-sm text-zinc-300">Save a password-protected file to Files, then import it on the other device or in the iPhone app.</p>
    <div className="mt-3 flex flex-wrap gap-2">
      <button className={button} type="button" disabled={busy || !hasEntries} onClick={() => selectMode("export")}>Export backup</button>
      <button className={button} type="button" disabled={busy} onClick={() => selectMode("import")}>Import backup</button>
    </div>
    {mode && !prepared && <form className="mt-4 grid gap-3" onSubmit={(event) => { event.preventDefault(); void work(); }}>
      {mode === "import" && <label className="grid gap-1 text-sm">Choose backup file
        <input required type="file" accept=".json,application/json" className="max-w-full text-sm"
          onChange={(event) => setFile(event.target.files?.[0])} />
      </label>}
      <label className="grid gap-1 text-sm">{mode === "export" ? "Create a backup password" : "Backup password"}
        <input required className="min-h-11 rounded-lg border border-line bg-ink px-3" type="password"
          autoComplete={mode === "export" ? "new-password" : "off"} minLength={mode === "export" ? 12 : undefined} maxLength={256}
          value={password} onChange={(event) => setPassword(event.target.value)} />
      </label>
      {mode === "export" && <label className="grid gap-1 text-sm">Confirm password
        <input required className="min-h-11 rounded-lg border border-line bg-ink px-3" type="password" autoComplete="new-password" maxLength={256}
          value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
        <span className="text-xs text-zinc-400">Use at least 12 characters. Keep this password to open the file later.</span>
      </label>}
      <button className={`${button} justify-self-start`} type="submit"
        disabled={busy || (mode === "export" ? password.length < 12 || password !== confirmation : !file || !password)}>
        {mode === "export" ? "Prepare backup" : "Import and keep existing days"}
      </button>
    </form>}
    {prepared && hasEntries && <button type="button" className={`${button} mt-3`} onClick={() => {
      setError("");
      void saveBackupFile(prepared).catch(() => setError("Couldn’t save the backup file. Try again."));
    }}>Save backup file</button>}
    {message && <p className="mt-2 text-sm text-calm" role="status">{message}</p>}
    {error && <p className="mt-2 text-sm text-amber" role="alert">{error}</p>}
  </section>;
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Trash2 } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { requestAccountDeletion } from "@/lib/ascendApi";
import { clearLocalAscendSession } from "@/lib/authSession";

const retainItems = [
  "Payment processor records, invoices, and tax/accounting records that we are required to keep.",
  "Security, fraud-prevention, and abuse-prevention logs where legally justified.",
  "Limited operational backups until they expire from normal retention cycles."
];

export function AccountClient() {
  const router = useRouter();
  const [confirmationText, setConfirmationText] = useState("");
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = useMemo(() => confirmationText.trim().toUpperCase() === "DELETE" && !isSubmitting, [confirmationText, isSubmitting]);

  async function submit() {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setStatus("Submitting your account deletion request...");

    try {
      const response = await requestAccountDeletion(confirmationText.trim());
      await clearLocalAscendSession();
      const destination = response.outcome === "deleted" ? "/delete-account?status=deleted" : "/delete-account?status=requested";
      router.replace(destination);
      window.setTimeout(() => {
        window.location.replace(destination);
      }, 150);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "We could not start account deletion right now.");
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-ink px-4 py-5 text-white">
      <div className="mx-auto w-full max-w-md">
        <header className="flex items-center gap-3 py-3">
          <BackButton fallbackHref="/profile" disabled={isSubmitting} />
          <div>
            <p className="text-sm text-zinc-400">Profile</p>
            <h1 className="text-2xl font-semibold">Account</h1>
          </div>
        </header>

        <section className="mt-4 rounded-lg border border-amber/30 bg-amber/10 p-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-amber text-ink">
              <AlertTriangle size={20} />
            </span>
            <div>
              <p className="text-base font-semibold text-white">Delete your Ascend account</p>
              <p className="mt-2 text-sm leading-6 text-zinc-200">
                This permanently removes your Ascend account or starts a managed deletion review if billing or business-role safeguards apply.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-4 rounded-lg border border-line bg-surface p-4">
          <p className="text-sm font-semibold">What is deleted</p>
          <ul className="mt-3 space-y-3 text-sm leading-6 text-zinc-300">
            <li>Your Ascend profile and login access.</li>
            <li>Your logged meals, water, weight, workouts, habits, progress photos, Coach Zoe history, and Health Sync records stored by Ascend.</li>
            <li>Uploaded food, profile, progress, and body scan images stored by Ascend where available.</li>
          </ul>
        </section>

        <section className="mt-4 rounded-lg border border-line bg-surface p-4">
          <p className="text-sm font-semibold">What may be retained</p>
          <ul className="mt-3 space-y-3 text-sm leading-6 text-zinc-300">
            {retainItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-5 text-zinc-500">
            Most standard member deletions complete immediately. If your account has active billing or business-role dependencies, Ascend disables access and completes review within a typical 30-day window.
          </p>
        </section>

        <section className="mt-4 rounded-lg border border-line bg-surface p-4">
          <label className="block text-sm font-semibold" htmlFor="delete-confirmation">
            Type DELETE to confirm
          </label>
          <input
            id="delete-confirmation"
            value={confirmationText}
            onChange={(event) => setConfirmationText(event.target.value)}
            disabled={isSubmitting}
            className="mt-3 h-12 w-full rounded-lg border border-line bg-ink px-4 text-white outline-none focus:border-calm disabled:opacity-60"
            placeholder="DELETE"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-rose-500 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 size={18} />
            {isSubmitting ? "Processing..." : "Delete Account"}
          </button>
          <p className="mt-3 text-xs leading-5 text-zinc-500">
            Need help first? Email <a className="text-calm hover:underline" href="mailto:support@getascend.fit?subject=Ascend%20Account%20Deletion%20Help">support@getascend.fit</a> or review the public deletion instructions below.
          </p>
          <Link href="/delete-account" className="mt-3 block text-sm font-medium text-calm hover:underline">
            View public account deletion instructions
          </Link>
        </section>

        {status ? <p className="mt-4 rounded-lg border border-line bg-surface p-3 text-sm text-zinc-300">{status}</p> : null}
      </div>
    </main>
  );
}

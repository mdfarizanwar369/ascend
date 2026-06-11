"use client";

import { useState } from "react";
import Link from "next/link";
import { bootstrapOwner } from "@/lib/ascendApi";
import { getFirebaseClientAuth } from "@/lib/firebase";
import { BackButton } from "@/components/BackButton";
import { BrandMark } from "@/components/BrandMark";

export function BootstrapOwnerClient() {
  const [status, setStatus] = useState("Log in first, then press the button to unlock owner/admin access for your email.");
  const [isSaving, setIsSaving] = useState(false);

  async function onBootstrap() {
    setIsSaving(true);
    setStatus("Checking your email and updating your role...");

    try {
      const response = await bootstrapOwner();
      await getFirebaseClientAuth().currentUser?.getIdToken(true);
      setStatus(`Owner access enabled for ${response.user.email}. Opening Admin...`);
      window.setTimeout(() => {
        window.location.href = "/admin";
      }, 800);
    } catch (error) {
      setStatus(
        error instanceof Error
          ? `${error.message}. Check BOOTSTRAP_OWNER_EMAIL on the backend Railway service.`
          : "Could not enable owner access."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-ink px-4 py-5 text-white">
      <div className="mx-auto max-w-md">
        <header className="flex items-start gap-3 py-3">
          <BackButton fallbackHref="/dashboard" />
          <BrandMark size="md" />
          <div>
            <h1 className="text-2xl font-semibold">Owner access setup</h1>
            <p className="mt-2 text-sm leading-6 text-zinc-400">Use this once for your own test account.</p>
          </div>
        </header>

        <section className="mt-4 rounded-lg border border-line bg-surface p-4">
          <p className="text-sm leading-6 text-zinc-300">{status}</p>
          <button
            type="button"
            disabled={isSaving}
            onClick={onBootstrap}
            className="mt-4 h-12 w-full rounded-lg bg-lime font-semibold text-ink disabled:opacity-60"
          >
            {isSaving ? "Enabling..." : "Enable owner access"}
          </button>
        </section>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Link href="/trainer" className="flex h-12 items-center justify-center rounded-lg border border-line bg-surface font-semibold">
            Trainer
          </Link>
          <Link href="/admin" className="flex h-12 items-center justify-center rounded-lg border border-line bg-surface font-semibold">
            Admin
          </Link>
        </div>
      </div>
    </main>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Trash2 } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { LanguageSelector } from "@/components/LanguageSelector";
import { requestAccountDeletion } from "@/lib/ascendApi";
import { clearLocalAscendSession } from "@/lib/authSession";
import { useI18n } from "@/lib/i18n/I18nProvider";

export function AccountClient() {
  const router = useRouter();
  const { t } = useI18n();
  const [confirmationText, setConfirmationText] = useState("");
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = useMemo(() => confirmationText.trim().toUpperCase() === "DELETE" && !isSubmitting, [confirmationText, isSubmitting]);

  async function submit() {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setStatus(t("account.deleting"));

    try {
      const response = await requestAccountDeletion(confirmationText.trim());
      await clearLocalAscendSession();
      const destination = response.outcome === "deleted" ? "/delete-account?status=deleted" : "/delete-account?status=requested";
      router.replace(destination);
      window.setTimeout(() => {
        window.location.replace(destination);
      }, 150);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("account.deleteError"));
      setIsSubmitting(false);
    }
  }

  const retainItems = [t("account.retainedPayments"), t("account.retainedSecurity"), t("account.retainedBackups")];

  return (
    <main className="min-h-screen bg-ink px-4 py-5 text-white">
      <div className="mx-auto w-full max-w-md">
        <header className="flex items-center gap-3 py-3">
          <BackButton fallbackHref="/profile" disabled={isSubmitting} />
          <div>
            <p className="text-sm text-zinc-400">{t("common.profile")}</p>
            <h1 className="text-2xl font-semibold">{t("common.account")}</h1>
          </div>
        </header>

        <LanguageSelector />

        <section className="mt-4 rounded-lg border border-amber/30 bg-amber/10 p-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-amber text-ink">
              <AlertTriangle size={20} />
            </span>
            <div>
              <p className="text-base font-semibold text-white">{t("account.deleteTitle")}</p>
              <p className="mt-2 text-sm leading-6 text-zinc-200">
                {t("account.deleteDescription")}
              </p>
            </div>
          </div>
        </section>

        <section className="mt-4 rounded-lg border border-line bg-surface p-4">
          <p className="text-sm font-semibold">{t("account.whatDeleted")}</p>
          <ul className="mt-3 space-y-3 text-sm leading-6 text-zinc-300">
            <li>{t("account.deletedProfile")}</li>
            <li>{t("account.deletedLogs")}</li>
            <li>{t("account.deletedImages")}</li>
          </ul>
        </section>

        <section className="mt-4 rounded-lg border border-line bg-surface p-4">
          <p className="text-sm font-semibold">{t("account.whatRetained")}</p>
          <ul className="mt-3 space-y-3 text-sm leading-6 text-zinc-300">
            {retainItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-5 text-zinc-500">
            {t("account.retentionNote")}
          </p>
        </section>

        <section className="mt-4 rounded-lg border border-line bg-surface p-4">
          <label className="block text-sm font-semibold" htmlFor="delete-confirmation">
            {t("account.typeDelete")}
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
            {isSubmitting ? t("common.processing") : t("account.deleteButton")}
          </button>
          <p className="mt-3 text-xs leading-5 text-zinc-500">
            {t("account.needHelp")} {t("account.email")} <a className="text-calm hover:underline" href="mailto:support@getascend.fit?subject=Ascend%20Account%20Deletion%20Help">support@getascend.fit</a>.
          </p>
          <Link href="/delete-account" className="mt-3 block text-sm font-medium text-calm hover:underline">
            {t("account.publicDeletion")}
          </Link>
        </section>

        {status ? <p className="mt-4 rounded-lg border border-line bg-surface p-3 text-sm text-zinc-300">{status}</p> : null}
      </div>
    </main>
  );
}

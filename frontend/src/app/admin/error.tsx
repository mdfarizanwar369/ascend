"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n/I18nProvider";

export default function AdminError() {
  const { t } = useI18n();
  return (
    <main className="min-h-screen bg-ink px-4 py-8 text-white">
      <section className="mx-auto max-w-md rounded-lg border border-line bg-surface p-4">
        <h1 className="text-xl font-semibold">{t("admin.errorTitle")}</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-400">{t("admin.errorMessage")}</p>
        <Link href="/dashboard" className="mt-4 flex h-12 items-center justify-center rounded-lg bg-lime font-semibold text-ink">
          {t("access.backToDashboard")}
        </Link>
      </section>
    </main>
  );
}

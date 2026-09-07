"use client";

import { Globe2 } from "lucide-react";
import { ASCEND_LOCALES, type AscendLocale } from "@ascend/shared";
import { useI18n } from "@/lib/i18n/I18nProvider";

export function LanguageSelector({ compact = false }: { compact?: boolean }) {
  const { locale, labels, setLocale, t } = useI18n();

  async function choose(nextLocale: AscendLocale) {
    await setLocale(nextLocale).catch(() => undefined);
  }

  if (compact) {
    return (
      <label className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-surface text-zinc-100" aria-label={t("common.language")}>
        <Globe2 size={18} />
        <select
          value={locale}
          onChange={(event) => choose(event.target.value as AscendLocale)}
          className="absolute h-11 w-11 cursor-pointer opacity-0"
          aria-label={t("common.language")}
        >
          {ASCEND_LOCALES.map((item) => (
            <option key={item} value={item}>{labels[item]}</option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <fieldset className="rounded-lg border border-line bg-surface p-4">
      <legend className="px-1 text-sm font-semibold text-white">{t("account.languageTitle")}</legend>
      <p className="mt-1 text-sm leading-6 text-zinc-400">{t("account.languageDescription")}</p>
      <div className="mt-3 grid gap-2">
        {ASCEND_LOCALES.map((item) => {
          const selected = item === locale;
          return (
            <button
              key={item}
              type="button"
              onClick={() => choose(item)}
              className={`flex min-h-12 items-center justify-between rounded-lg border px-3 text-left text-sm font-semibold transition ${
                selected ? "border-lime bg-lime text-ink" : "border-line bg-ink text-zinc-100 hover:border-calm/60"
              }`}
              aria-pressed={selected}
            >
              <span>{labels[item]}</span>
              {selected ? <span className="text-xs">{t("common.saved")}</span> : null}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ASCEND_LOCALE_LABELS, DEFAULT_ASCEND_LOCALE, normalizeAscendLocale, type AscendLocale } from "@ascend/shared";
import { getMe, updateLanguagePreference } from "@/lib/ascendApi";
import { clearCachedAccountProfile } from "@/lib/accountSession";
import { messages } from "./messages";
import { renderedMessages } from "./renderedMessages";

const STORAGE_KEY = "ascend:locale";

export type Translate = (key: string, values?: Record<string, string | number>) => string;

type I18nContextValue = {
  locale: AscendLocale;
  labels: typeof ASCEND_LOCALE_LABELS;
  t: Translate;
  setLocale: (locale: AscendLocale, options?: { persist?: boolean }) => Promise<void>;
  formatDate: (value: string | Date, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

const fallbackI18nContext = {
  locale: DEFAULT_ASCEND_LOCALE,
  labels: ASCEND_LOCALE_LABELS,
  t: (key: string, values?: Record<string, string | number>) => interpolate(renderedMessages.en[key] ?? messages.en[key] ?? key, values),
  setLocale: async () => undefined,
  formatDate: (value: string | Date, options?: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(DEFAULT_ASCEND_LOCALE, options).format(typeof value === "string" ? new Date(value) : value),
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => new Intl.NumberFormat(DEFAULT_ASCEND_LOCALE, options).format(value)
} satisfies I18nContextValue;

function readStoredLocale() {
  if (typeof window === "undefined") return DEFAULT_ASCEND_LOCALE;
  try {
    return normalizeAscendLocale(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_ASCEND_LOCALE;
  }
}

function writeStoredLocale(locale: AscendLocale) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Local preference is a convenience; account persistence remains the source of truth after sign-in.
  }
}

function interpolate(template: string, values?: Record<string, string | number>) {
  if (!values) return template;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => String(values[key] ?? match));
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<AscendLocale>(DEFAULT_ASCEND_LOCALE);

  useEffect(() => {
    const stored = readStoredLocale();
    setLocaleState(stored);
    document.documentElement.lang = stored;
  }, []);

  useEffect(() => {
    let active = true;
    getMe()
      .then((response) => {
        if (!active) return;
        const accountLocale = normalizeAscendLocale(response.user.preferred_locale);
        setLocaleState(accountLocale);
        writeStoredLocale(accountLocale);
        document.documentElement.lang = accountLocale;
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const setLocale = useCallback(async (nextLocale: AscendLocale, options: { persist?: boolean } = {}) => {
    setLocaleState(nextLocale);
    writeStoredLocale(nextLocale);
    document.documentElement.lang = nextLocale;

    if (options.persist !== false) {
      await updateLanguagePreference(nextLocale);
      clearCachedAccountProfile();
    }
  }, []);

  const value = useMemo<I18nContextValue>(() => {
    const t = (key: string, values?: Record<string, string | number>) => {
      const template = renderedMessages[locale][key] ?? messages[locale][key] ?? renderedMessages.en[key] ?? messages.en[key] ?? key;
      return interpolate(template, values);
    };

    return {
      locale,
      labels: ASCEND_LOCALE_LABELS,
      t,
      setLocale,
      formatDate: (value, options) => new Intl.DateTimeFormat(locale, options).format(typeof value === "string" ? new Date(value) : value),
      formatNumber: (value, options) => new Intl.NumberFormat(locale, options).format(value)
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  return context ?? fallbackI18nContext;
}

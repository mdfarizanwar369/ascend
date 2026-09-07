export const ASCEND_LOCALES = ["en", "ms-MY", "zh-Hans"] as const;

export type AscendLocale = (typeof ASCEND_LOCALES)[number];

export const DEFAULT_ASCEND_LOCALE: AscendLocale = "en";

export const ASCEND_LOCALE_LABELS: Record<AscendLocale, string> = {
  en: "English",
  "ms-MY": "Bahasa Melayu",
  "zh-Hans": "中文"
};

export function isAscendLocale(value: unknown): value is AscendLocale {
  return typeof value === "string" && (ASCEND_LOCALES as readonly string[]).includes(value);
}

export function normalizeAscendLocale(value: unknown): AscendLocale {
  return isAscendLocale(value) ? value : DEFAULT_ASCEND_LOCALE;
}

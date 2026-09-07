import { describe, expect, it } from "vitest";
import { DEFAULT_ASCEND_LOCALE, normalizeAscendLocale } from "@ascend/shared";

describe("locale preference contract", () => {
  it("accepts Ascend supported locales and falls back to English", () => {
    expect(normalizeAscendLocale("en")).toBe("en");
    expect(normalizeAscendLocale("ms-MY")).toBe("ms-MY");
    expect(normalizeAscendLocale("zh-Hans")).toBe("zh-Hans");
    expect(normalizeAscendLocale("ms")).toBe(DEFAULT_ASCEND_LOCALE);
    expect(normalizeAscendLocale(null)).toBe(DEFAULT_ASCEND_LOCALE);
  });
});

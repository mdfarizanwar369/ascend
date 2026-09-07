import { describe, expect, it } from "vitest";
import { ASCEND_LOCALES } from "@ascend/shared";
import { messages } from "./messages";

describe("i18n messages", () => {
  it("keeps all supported locales aligned to the English key set", () => {
    const englishKeys = Object.keys(messages.en).sort();
    for (const locale of ASCEND_LOCALES) {
      expect(Object.keys(messages[locale]).sort()).toEqual(englishKeys);
    }
  });

  it("provides meaningful labels for the required locales", () => {
    expect(messages.en["common.language"]).toBe("Language");
    expect(messages["ms-MY"]["common.language"]).toBe("Bahasa");
    expect(messages["zh-Hans"]["common.language"]).toBe("语言");
  });

  it.each(["ms-MY", "zh-Hans"] as const)("does not leak the English Platform Owner role into %s coaching access copy", (locale) => {
    const keys = [
      "access.trainerOrOwnerOnly",
      "access.founderDenied",
      "trainer.platformOwnerClientList",
      "trainer.platformOwnerAccess",
      "client360.platformOwnerRead",
      "client360.platformOwnerActive"
    ] as const;

    for (const key of keys) expect(messages[locale][key]).not.toMatch(/Platform Owner/i);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { ASCEND_APPEARANCE_BOOT_SCRIPT, appearanceColorMode } from "./ascendAppearance";

function boot(storage: Pick<Storage, "getItem"> = localStorage) {
  new Function("document", "localStorage", "navigator", ASCEND_APPEARANCE_BOOT_SCRIPT)(document, storage, navigator);
}

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.appearance;
  delete document.documentElement.dataset.theme;
});

describe("appearance before page hydration", () => {
  it.each(["classic", "light", "gym-girl", "cute-lift", "iron", "summit", "ascend-club"] as const)(
    "restores %s on a fresh document without mounting the theme picker",
    appearance => {
      localStorage.setItem("ascend-appearance", appearance);
      boot();
      expect(document.documentElement.dataset.appearance).toBe(appearance);
      expect(document.documentElement.dataset.theme).toBe(appearanceColorMode(appearance));
    }
  );

  it("preserves the older light-mode preference", () => {
    localStorage.setItem("ascend-theme", "light");
    boot();
    expect(document.documentElement.dataset.appearance).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("handles missing, unsupported and inaccessible cache safely", () => {
    boot();
    expect(document.documentElement.dataset.appearance).toBe("classic");
    localStorage.setItem("ascend-appearance", "unknown-theme");
    boot();
    expect(document.documentElement.dataset.appearance).toBe("classic");
    expect(() => boot({ getItem: () => { throw new Error("Storage unavailable"); } })).not.toThrow();
    expect(document.documentElement.dataset.appearance).toBe("classic");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});

export const ASCEND_APPEARANCES = [
  { id: "classic", name: "Ascend Classic", description: "The original dark look", preview: null },
  { id: "light", name: "Ascend Light", description: "A clean daytime look", preview: null },
  { id: "gym-girl", name: "Gym Girl Club", description: "Rose and strength", preview: "/themes/gym-girl-banner.webp" },
  { id: "cute-lift", name: "Cute Lift Club", description: "Pastel energy", preview: "/themes/cute-lift-banner.webp" },
  { id: "iron", name: "Iron Club", description: "Iron and copper", preview: "/themes/iron-banner.webp" },
  { id: "summit", name: "Summit Club", description: "Alpine and evergreen", preview: "/themes/summit-banner.webp" },
  { id: "ascend-club", name: "Ascend Club", description: "Move together, your way", preview: "/themes/ascend-club-banner.webp" },
] as const;

export type AscendAppearance = (typeof ASCEND_APPEARANCES)[number]["id"];

// Share the supported list with the pre-hydration script, including new skins.
export const ASCEND_APPEARANCE_BOOT_SCRIPT = `
  (function () {
    if (navigator.userAgent.indexOf("AscendAndroid/1") !== -1) {
      document.documentElement.dataset.nativePlatform = "android";
    }
    try {
      var saved = localStorage.getItem("ascend-appearance");
      var supported = ${JSON.stringify(ASCEND_APPEARANCES.map(option => option.id))};
      var appearance = supported.indexOf(saved) >= 0 ? saved : (localStorage.getItem("ascend-theme") === "light" ? "light" : "classic");
      document.documentElement.dataset.appearance = appearance;
      document.documentElement.dataset.theme = appearance === "light" || appearance === "cute-lift" ? "light" : "dark";
    } catch (_) {
      document.documentElement.dataset.appearance = "classic";
      document.documentElement.dataset.theme = "dark";
    }
  })();
`;

let appearanceRevision = 0;

export function getAscendAppearanceRevision() {
  return appearanceRevision;
}

export function parseAscendAppearance(value: unknown): AscendAppearance | null {
  return typeof value === "string" && ASCEND_APPEARANCES.some(option => option.id === value)
    ? value as AscendAppearance
    : null;
}

export function appearanceColorMode(appearance: AscendAppearance): "dark" | "light" {
  return appearance === "light" || appearance === "cute-lift" ? "light" : "dark";
}

export function applyAscendAppearance(appearance: AscendAppearance) {
  appearanceRevision++;
  document.documentElement.dataset.appearance = appearance;
  document.documentElement.dataset.theme = appearanceColorMode(appearance);
  try {
    localStorage.setItem("ascend-appearance", appearance);
    localStorage.setItem("ascend-theme", appearanceColorMode(appearance));
  } catch {
    // The native preference and current page still work without browser storage.
  }
}

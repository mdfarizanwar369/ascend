import { defaultNudgePreferences, nudgeCategories, NudgeCategory, NudgePreferences } from "@ascend/shared";

export type NudgePreset = "daily" | "essentials";
export const presetCategories: Record<NudgePreset, readonly NudgeCategory[]> = {
  daily: ["breakfast", "lunch", "dinner", "hydration", "workout"],
  essentials: ["workout", "weekly"]
};
export function presetAvailable(preset: NudgePreset, available: readonly NudgeCategory[]) {
  return presetCategories[preset].every(category => available.includes(category));
}
/** Selecting a preset changes reminder types, never consent or personal times. */
export function applyNudgePreset(preferences: NudgePreferences, preset: NudgePreset): NudgePreferences {
  return {
    ...preferences,
    // Weekly reviews are routine nudges, so Minimal would silently suppress them.
    intensity: "balanced",
    categories: Object.fromEntries(nudgeCategories.map(category => [category, {
      ...preferences.categories[category], enabled: presetCategories[preset].includes(category)
    }])) as NudgePreferences["categories"]
  };
}
export function selectedNudgePreset(preferences: NudgePreferences): NudgePreset | null {
  if (preferences.intensity !== "balanced") return null;
  return (["daily", "essentials"] as const).find(preset => nudgeCategories.every(category =>
    preferences.categories[category].enabled === presetCategories[preset].includes(category)
  )) ?? null;
}
/** A new-account suggestion only. Nothing is enabled or persisted on page load. */
export function suggestedNudgePreferences(timezone: string, available: readonly NudgeCategory[]) {
  const preferences = defaultNudgePreferences(timezone);
  // Two hours before the evening check-in, beyond the existing 90-minute cooldown.
  preferences.categories.weekly.time = "18:30";
  const preset = (["daily", "essentials"] as const).find(value => presetAvailable(value, available));
  return preset ? applyNudgePreset(preferences, preset) : preferences;
}

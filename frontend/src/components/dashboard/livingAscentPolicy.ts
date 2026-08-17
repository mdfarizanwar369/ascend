export type LivingAscentMode = "first" | "daily";

export const LIVING_ASCENT_FIRST_SEEN_KEY = "ascend:living-ascent:v1:first-seen";
export const LIVING_ASCENT_LAST_OPEN_KEY = "ascend:living-ascent:v1:last-open";

type OpeningStorage = Pick<Storage, "getItem" | "setItem">;

export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function selectLivingAscentMode(storage: OpeningStorage, dateKey: string): LivingAscentMode | null {
  const hasSeenFirstExperience = storage.getItem(LIVING_ASCENT_FIRST_SEEN_KEY) === "true";
  const lastOpen = storage.getItem(LIVING_ASCENT_LAST_OPEN_KEY);

  if (!hasSeenFirstExperience) {
    storage.setItem(LIVING_ASCENT_FIRST_SEEN_KEY, "true");
    storage.setItem(LIVING_ASCENT_LAST_OPEN_KEY, dateKey);
    return "first";
  }

  if (lastOpen !== dateKey) {
    storage.setItem(LIVING_ASCENT_LAST_OPEN_KEY, dateKey);
    return "daily";
  }

  return null;
}

export const cycleFlows = ["spotting", "light", "medium", "heavy"] as const;
export const cycleSymptoms = ["cramps", "headache", "bloating", "fatigue", "backache"] as const;
export const cycleEnergy = ["low", "usual", "high"] as const;

export interface CycleEntry {
  period: boolean;
  flow: typeof cycleFlows[number] | null;
  symptoms: (typeof cycleSymptoms[number])[];
  energy: typeof cycleEnergy[number] | null;
}

type CycleEntries = Record<string, CycleEntry>;
type CycleStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const cycleStorageKey = (accountId: string) => `ascend.private-cycle.v1.${accountId}`;
export const emptyCycleEntry: CycleEntry = { period: false, flow: null, symptoms: [], energy: null };

export function hasCycleEntry(entry: CycleEntry) {
  return entry.period || Boolean(entry.flow || entry.energy || entry.symptoms.length);
}

export function readCycleEntries(storage: CycleStorage, accountId: string): CycleEntries {
  const raw = storage.getItem(cycleStorageKey(accountId));
  if (!raw) return {};
  const entries = JSON.parse(raw) as CycleEntries | null;
  if (!entries || typeof entries !== "object" || Array.isArray(entries) ||
    Object.entries(entries).some(([date, entry]) => !/^\d{4}-\d{2}-\d{2}$/.test(date)
      || !entry || typeof entry.period !== "boolean" || !Array.isArray(entry.symptoms)
      || entry.symptoms.some((symptom) => !cycleSymptoms.includes(symptom))
      || (entry.flow !== null && !cycleFlows.includes(entry.flow))
      || (entry.energy !== null && !cycleEnergy.includes(entry.energy)))) {
    throw new Error("Cycle log could not be read.");
  }
  return entries;
}

export function writeCycleEntry(storage: CycleStorage, accountId: string, date: string, entry: CycleEntry): CycleEntries {
  const entries = readCycleEntries(storage, accountId);
  if (hasCycleEntry(entry)) entries[date] = entry;
  else delete entries[date];
  const key = cycleStorageKey(accountId);
  if (Object.keys(entries).length) storage.setItem(key, JSON.stringify(entries));
  else storage.removeItem(key);
  return entries;
}

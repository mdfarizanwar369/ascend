import { getFirebaseClientAuth } from "@/lib/firebase";

export type DashboardRecordType = "food" | "water" | "weight" | "burn" | "habit";
const MAX_PENDING_AGE_MS = 2 * 60_000;

interface StoredDashboardRecord<T> {
  record: T;
  savedAt: number;
  ownerUid: string | null;
}

function recordKey(type: DashboardRecordType) {
  return `ascend:pending-${type}-log`;
}

export interface PendingFoodLog {
  id: string;
  image_url?: string | null;
  image_s3_key?: string | null;
  meal_type?: string;
  estimated_food_name: string;
  calories: number;
  protein_g: string | number;
  carbs_g: string | number;
  fat_g: string | number;
  logged_at: string;
}

export function rememberSavedFoodLog(foodLog: PendingFoodLog) {
  rememberDashboardRecord("food", foodLog);
}

export function rememberDashboardRecord<T>(type: DashboardRecordType, record: T) {
  try {
    const stored: StoredDashboardRecord<T> = {
      record,
      savedAt: Date.now(),
      ownerUid: getFirebaseClientAuth().currentUser?.uid ?? null
    };
    window.sessionStorage.setItem(recordKey(type), JSON.stringify(stored));
  } catch {
    // Storage can be unavailable in restrictive browser modes; the API refresh remains the fallback.
  }
}

export function readPendingFoodLog(): PendingFoodLog | null {
  return readDashboardRecord<PendingFoodLog>("food");
}

export function readDashboardRecord<T>(type: DashboardRecordType): T | null {
  try {
    const value = window.sessionStorage.getItem(recordKey(type));
    if (!value) return null;
    const stored = JSON.parse(value) as StoredDashboardRecord<T> | T;
    if (!("record" in (stored as object)) || !("savedAt" in (stored as object))) return stored as T;

    const envelope = stored as StoredDashboardRecord<T>;
    const currentUid = getFirebaseClientAuth().currentUser?.uid ?? null;
    if (Date.now() - envelope.savedAt > MAX_PENDING_AGE_MS || (envelope.ownerUid && envelope.ownerUid !== currentUid)) {
      window.sessionStorage.removeItem(recordKey(type));
      return null;
    }
    return envelope.record;
  } catch {
    return null;
  }
}

export function clearPendingFoodLog(id: string) {
  clearDashboardRecord("food", id);
}

export function clearDashboardRecord<T extends { id: string }>(type: DashboardRecordType, id: string) {
  try {
    const pending = readDashboardRecord<T>(type);
    if (pending?.id === id) window.sessionStorage.removeItem(recordKey(type));
  } catch {
    // A failed cleanup is harmless and will be retried on the next dashboard refresh.
  }
}

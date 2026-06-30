import { getFirebaseClientAuth } from "@/lib/firebase";

export type DashboardRecordType = "food" | "water" | "weight" | "burn" | "habit";
export type DashboardActionType = DashboardRecordType | "progress_photo";
const MAX_PENDING_AGE_MS = 2 * 60_000;
const MAX_RECENT_ACTION_AGE_MS = 25 * 60_000;
export const DASHBOARD_RECORD_EVENT = "ascend:dashboard-record-updated";

interface StoredDashboardRecord<T> {
  record: T;
  savedAt: number;
  ownerUid: string | null;
}

function recordKey(type: DashboardRecordType) {
  return `ascend:pending-${type}-log`;
}

function actionKey() {
  return "ascend:recent-dashboard-action";
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
  try {
    window.dispatchEvent(new CustomEvent(DASHBOARD_RECORD_EVENT, { detail: { type } }));
  } catch {
    // Cross-component refresh is a nice enhancement, not a requirement for saving.
  }
  rememberDashboardAction(type);
}

export function rememberDashboardAction(type: DashboardActionType) {
  try {
    const stored = {
      type,
      savedAt: Date.now(),
      ownerUid: getFirebaseClientAuth().currentUser?.uid ?? null
    };
    window.localStorage.setItem(actionKey(), JSON.stringify(stored));
  } catch {
    // Celebration state is optional; saving the actual record remains the important path.
  }
}

export function readRecentDashboardAction(): { type: DashboardActionType; savedAt: number } | null {
  try {
    const value = window.localStorage.getItem(actionKey());
    if (!value) return null;
    const stored = JSON.parse(value) as { type?: DashboardActionType; savedAt?: number; ownerUid?: string | null };
    if (!stored.type || !stored.savedAt) return null;
    const currentUid = getFirebaseClientAuth().currentUser?.uid ?? null;
    if (Date.now() - stored.savedAt > MAX_RECENT_ACTION_AGE_MS || (stored.ownerUid && stored.ownerUid !== currentUid)) {
      window.localStorage.removeItem(actionKey());
      return null;
    }
    return { type: stored.type, savedAt: stored.savedAt };
  } catch {
    return null;
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

const PENDING_FOOD_LOG_KEY = "ascend:pending-food-log";

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
  try {
    window.sessionStorage.setItem(PENDING_FOOD_LOG_KEY, JSON.stringify(foodLog));
  } catch {
    // Storage can be unavailable in restrictive browser modes; the API refresh remains the fallback.
  }
}

export function readPendingFoodLog(): PendingFoodLog | null {
  try {
    const value = window.sessionStorage.getItem(PENDING_FOOD_LOG_KEY);
    return value ? JSON.parse(value) as PendingFoodLog : null;
  } catch {
    return null;
  }
}

export function clearPendingFoodLog(id: string) {
  try {
    const pending = readPendingFoodLog();
    if (pending?.id === id) window.sessionStorage.removeItem(PENDING_FOOD_LOG_KEY);
  } catch {
    // A failed cleanup is harmless and will be retried on the next dashboard refresh.
  }
}


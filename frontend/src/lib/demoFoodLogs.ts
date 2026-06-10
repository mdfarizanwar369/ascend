"use client";

import { useSyncExternalStore } from "react";

export interface DemoFoodLog {
  id: string;
  imagePreviewUrl: string | null;
  mealType: string;
  estimatedFoodName: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  aiEstimateRaw: unknown;
  wasEditedByUser: boolean;
  loggedAt: string;
}

const key = "ascend.demoFoodLogs";
const eventName = "ascend.demoFoodLogs.changed";

function readLogs() {
  if (typeof window === "undefined") return [];

  try {
    return JSON.parse(window.localStorage.getItem(key) ?? "[]") as DemoFoodLog[];
  } catch {
    return [];
  }
}

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => undefined;

  window.addEventListener(eventName, callback);
  window.addEventListener("storage", callback);

  return () => {
    window.removeEventListener(eventName, callback);
    window.removeEventListener("storage", callback);
  };
}

export function saveDemoFoodLog(log: DemoFoodLog) {
  const existing = readLogs();
  window.localStorage.setItem(key, JSON.stringify([log, ...existing].slice(0, 20)));
  window.dispatchEvent(new Event(eventName));
}

export function useDemoFoodLogs() {
  return useSyncExternalStore(subscribe, readLogs, () => []);
}


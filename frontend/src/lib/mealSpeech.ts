"use client";

import { registerPlugin } from "@capacitor/core";
import { isNativeAndroidCapacitor } from "./nativePlatform";

export type MealSpeechResult = {
  transcript: string;
  confidence: number | null;
  alternatives: string[];
  source: "android" | "browser";
};

export type MealSpeechAvailability = {
  available: boolean;
  source: "android" | "browser" | "none";
};

type NativeMealSpeechPlugin = {
  isAvailable(): Promise<{ available: boolean; permissionGranted: boolean }>;
  startListening(options?: { locale?: string; prompt?: string }): Promise<{
    transcript: string;
    confidence?: number | null;
    alternatives?: string[];
  }>;
  stopListening(): Promise<{ stopped: boolean }>;
  cancelListening(): Promise<{ cancelled: boolean }>;
};

type BrowserSpeechRecognitionAlternative = {
  transcript: string;
  confidence: number;
};

type BrowserSpeechRecognitionResult = {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: BrowserSpeechRecognitionAlternative;
};

type BrowserSpeechRecognitionEvent = Event & {
  readonly resultIndex: number;
  readonly results: {
    readonly length: number;
    [index: number]: BrowserSpeechRecognitionResult;
  };
};

type BrowserSpeechRecognitionErrorEvent = Event & {
  readonly error: string;
  readonly message?: string;
};

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type SpeechWindow = Window & {
  SpeechRecognition?: BrowserSpeechRecognitionConstructor;
  webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
};

const NativeMealSpeech = registerPlugin<NativeMealSpeechPlugin>("MealSpeech");

let activeBrowserRecognition: BrowserSpeechRecognition | null = null;
let activeSource: "android" | "browser" | null = null;

function browserSpeechConstructor() {
  if (typeof window === "undefined") return null;
  const speechWindow = window as SpeechWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function localePreference(locale?: string) {
  if (locale?.trim()) return locale.trim();
  if (typeof navigator !== "undefined" && navigator.language) return navigator.language;
  return "en-MY";
}

function speechError(code: string, fallback: string) {
  const error = new Error(fallback) as Error & { code?: string };
  error.code = code;
  return error;
}

function browserErrorMessage(code: string) {
  if (code === "not-allowed" || code === "service-not-allowed") {
    return speechError("permission_denied", "Microphone access is off. Allow it in your device settings, then try again.");
  }
  if (code === "no-speech" || code === "aborted") {
    return speechError(code === "aborted" ? "cancelled" : "no_speech", code === "aborted" ? "Listening was cancelled." : "I did not hear a meal. Try again and speak close to your phone.");
  }
  if (code === "audio-capture") {
    return speechError("audio_error", "Your microphone is unavailable right now. Check whether another app is using it.");
  }
  if (code === "network") {
    return speechError("network", "Speech recognition needs a connection right now. Check your internet and try again.");
  }
  return speechError("recognition_failed", "I could not understand that meal. Try again or type it instead.");
}

export function mealSpeechErrorMessage(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  if (code === "permission_denied") return "Microphone access is off. Allow it in your device settings, then try again.";
  if (code === "no_speech" || code === "no_match") return "I did not catch that meal. Try again and speak naturally.";
  if (code === "audio_error") return "Your microphone is unavailable right now. Type the meal or try again.";
  if (code === "network" || code === "network_timeout") return "Speech recognition needs a connection right now. Type the meal or try again.";
  if (code === "busy") return "The microphone is already listening. Wait a moment and try again.";
  if (error instanceof Error && error.message) return error.message;
  return "I could not understand that meal. Try again or type it instead.";
}

export function isMealSpeechCancellation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && String((error as { code?: unknown }).code) === "cancelled";
}

export function isMealSpeechPotentiallyAvailable() {
  return isNativeAndroidCapacitor() || Boolean(browserSpeechConstructor());
}

export async function getMealSpeechAvailability(): Promise<MealSpeechAvailability> {
  if (isNativeAndroidCapacitor()) {
    try {
      const status = await NativeMealSpeech.isAvailable();
      return { available: status.available, source: status.available ? "android" : "none" };
    } catch {
      return { available: false, source: "none" };
    }
  }

  const available = Boolean(browserSpeechConstructor());
  return { available, source: available ? "browser" : "none" };
}

function startBrowserRecognition(locale?: string): Promise<MealSpeechResult> {
  const SpeechRecognition = browserSpeechConstructor();
  if (!SpeechRecognition) throw speechError("unavailable", "Voice entry is not available in this browser.");
  if (activeBrowserRecognition || activeSource) throw speechError("busy", "The microphone is already listening.");

  const recognition = new SpeechRecognition();
  recognition.lang = localePreference(locale);
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 3;
  activeBrowserRecognition = recognition;
  activeSource = "browser";

  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      if (activeBrowserRecognition === recognition) activeBrowserRecognition = null;
      if (activeSource === "browser") activeSource = null;
    };

    recognition.onresult = (event) => {
      const result = event.results[event.resultIndex] ?? event.results[0];
      const alternatives = result
        ? Array.from({ length: result.length }, (_, index) => result[index]?.transcript?.trim()).filter((value): value is string => Boolean(value))
        : [];
      const transcript = alternatives[0] ?? "";
      if (!transcript) return;
      settled = true;
      const confidence = result?.[0]?.confidence;
      cleanup();
      resolve({
        transcript,
        confidence: Number.isFinite(confidence) && confidence >= 0 ? confidence : null,
        alternatives,
        source: "browser"
      });
    };

    recognition.onerror = (event) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(browserErrorMessage(event.error));
    };

    recognition.onend = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(speechError("no_speech", "I did not hear a meal. Try again and speak close to your phone."));
    };

    try {
      recognition.start();
    } catch (error) {
      settled = true;
      cleanup();
      reject(error instanceof Error ? error : speechError("recognition_failed", "Voice entry could not start."));
    }
  });
}

export async function startMealSpeechRecognition(options?: { locale?: string }): Promise<MealSpeechResult> {
  if (isNativeAndroidCapacitor()) {
    if (activeSource) throw speechError("busy", "The microphone is already listening.");
    activeSource = "android";
    try {
      const result = await NativeMealSpeech.startListening({
        locale: localePreference(options?.locale),
        prompt: "Describe what you ate"
      });
      const transcript = result.transcript?.trim();
      if (!transcript) throw speechError("no_speech", "I did not hear a meal. Try again and speak close to your phone.");
      return {
        transcript,
        confidence: typeof result.confidence === "number" && result.confidence >= 0 ? result.confidence : null,
        alternatives: result.alternatives?.filter(Boolean) ?? [transcript],
        source: "android"
      };
    } finally {
      if (activeSource === "android") activeSource = null;
    }
  }

  return startBrowserRecognition(options?.locale);
}

export async function stopMealSpeechRecognition() {
  if (activeSource === "android") {
    await NativeMealSpeech.stopListening();
    return;
  }
  activeBrowserRecognition?.stop();
}

export async function cancelMealSpeechRecognition() {
  if (activeSource === "android") {
    await NativeMealSpeech.cancelListening().catch(() => undefined);
    activeSource = null;
    return;
  }
  const recognition = activeBrowserRecognition;
  activeBrowserRecognition = null;
  activeSource = null;
  recognition?.abort();
}

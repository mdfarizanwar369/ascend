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
  onstart: (() => void) | null;
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
const SPEECH_PERMISSION_TIMEOUT_MS = 20_000;
const SPEECH_LISTENING_TIMEOUT_MS = 15_000;
const SPEECH_STOP_TIMEOUT_MS = 2_500;
const SPEECH_RESULT_RELEASE_TIMEOUT_MS = 750;
const SPEECH_ABORT_RELEASE_GRACE_MS = 50;
const NATIVE_SPEECH_SAFETY_TIMEOUT_MS = 20_000;

let activeBrowserRecognition: BrowserSpeechRecognition | null = null;
let finishActiveBrowserRecognition: (() => void) | null = null;
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
  if (code === "speech_timeout") return "Listening took too long. Nothing was saved, so you can try again or type the meal.";
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
    let permissionTimer: ReturnType<typeof setTimeout> | null = null;
    let listeningTimer: ReturnType<typeof setTimeout> | null = null;
    let stopTimer: ReturnType<typeof setTimeout> | null = null;
    let resultReleaseTimer: ReturnType<typeof setTimeout> | null = null;
    let capturedResult: MealSpeechResult | null = null;

    const clearTimers = () => {
      if (permissionTimer) clearTimeout(permissionTimer);
      if (listeningTimer) clearTimeout(listeningTimer);
      if (stopTimer) clearTimeout(stopTimer);
      if (resultReleaseTimer) clearTimeout(resultReleaseTimer);
      permissionTimer = null;
      listeningTimer = null;
      stopTimer = null;
      resultReleaseTimer = null;
    };

    const cleanup = () => {
      clearTimers();
      recognition.onstart = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      if (activeBrowserRecognition === recognition) activeBrowserRecognition = null;
      if (finishActiveBrowserRecognition === finishRecognition) finishActiveBrowserRecognition = null;
      if (activeSource === "browser") activeSource = null;
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        recognition.abort();
      } catch {
        // The recognition service may already have stopped itself.
      }
      reject(error);
    };

    const resolveCapturedResult = () => {
      if (settled || !capturedResult) return;
      const result = capturedResult;
      settled = true;
      cleanup();
      resolve(result);
    };

    const forceReleaseCapturedResult = () => {
      if (settled || !capturedResult) return;
      const result = capturedResult;
      settled = true;
      cleanup();
      try {
        recognition.abort();
      } catch {
        // A completed recognition service may already be closed.
      }
      setTimeout(() => resolve(result), SPEECH_ABORT_RELEASE_GRACE_MS);
    };

    const finishRecognition = () => {
      if (settled) return;
      try {
        recognition.stop();
      } catch {
        fail(speechError("recognition_failed", "Voice entry could not finish listening."));
        return;
      }
      if (stopTimer) clearTimeout(stopTimer);
      stopTimer = setTimeout(() => {
        fail(speechError("speech_timeout", "Speech recognition did not return a result after listening stopped."));
      }, SPEECH_STOP_TIMEOUT_MS);
    };

    finishActiveBrowserRecognition = finishRecognition;
    permissionTimer = setTimeout(() => {
      fail(speechError("speech_timeout", "Speech recognition did not start after microphone permission."));
    }, SPEECH_PERMISSION_TIMEOUT_MS);

    recognition.onstart = () => {
      if (permissionTimer) clearTimeout(permissionTimer);
      permissionTimer = null;
      listeningTimer = setTimeout(() => {
        fail(speechError("speech_timeout", "Speech recognition remained open without returning a meal."));
      }, SPEECH_LISTENING_TIMEOUT_MS);
    };

    recognition.onresult = (event) => {
      const result = event.results[event.resultIndex] ?? event.results[0];
      const alternatives = result
        ? Array.from({ length: result.length }, (_, index) => result[index]?.transcript?.trim()).filter((value): value is string => Boolean(value))
        : [];
      const transcript = alternatives[0] ?? "";
      if (!transcript) return;
      const confidence = result?.[0]?.confidence;
      capturedResult = {
        transcript,
        confidence: Number.isFinite(confidence) && confidence >= 0 ? confidence : null,
        alternatives,
        source: "browser"
      };
      if (listeningTimer) clearTimeout(listeningTimer);
      listeningTimer = null;
      try {
        recognition.stop();
      } catch {
        forceReleaseCapturedResult();
        return;
      }
      resultReleaseTimer = setTimeout(forceReleaseCapturedResult, SPEECH_RESULT_RELEASE_TIMEOUT_MS);
    };

    recognition.onerror = (event) => {
      if (capturedResult) {
        resolveCapturedResult();
        return;
      }
      fail(browserErrorMessage(event.error));
    };

    recognition.onend = () => {
      if (settled) return;
      if (capturedResult) {
        resolveCapturedResult();
        return;
      }
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
      const nativeRequest = NativeMealSpeech.startListening({
        locale: localePreference(options?.locale),
        prompt: "Describe what you ate"
      });
      const result = await new Promise<Awaited<typeof nativeRequest>>((resolve, reject) => {
        let finished = false;
        const timer = setTimeout(() => {
          if (finished) return;
          finished = true;
          NativeMealSpeech.cancelListening().catch(() => undefined);
          reject(speechError("speech_timeout", "Speech recognition did not return a meal."));
        }, NATIVE_SPEECH_SAFETY_TIMEOUT_MS);
        nativeRequest.then(
          (value) => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            resolve(value);
          },
          (error) => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            reject(error);
          }
        );
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
  finishActiveBrowserRecognition?.();
}

export async function cancelMealSpeechRecognition() {
  if (activeSource === "android") {
    await NativeMealSpeech.cancelListening().catch(() => undefined);
    activeSource = null;
    return;
  }
  const recognition = activeBrowserRecognition;
  activeBrowserRecognition = null;
  finishActiveBrowserRecognition = null;
  activeSource = null;
  recognition?.abort();
}

"use client";

import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import type { VoiceTodayIntent } from "./ascendApi";

const plugin = registerPlugin<{
  isAvailable(): Promise<{ available: boolean; naturalAudioAvailable?: boolean }>;
  listen(options: { locale: string }): Promise<{ transcript: string }>;
  stopListening(): Promise<void>;
  addListener(event: "partialTranscript", callback: (event: { transcript: string }) => void): Promise<PluginListenerHandle>;
  cancel(): Promise<void>;
  speak(options: { text: string }): Promise<void>;
  playAudio(options: { audioBase64: string }): Promise<void>;
  stopSpeaking(): Promise<void>;
}>("AscendVoice");

export const ascendVoice = plugin;

export function parseVoiceTodayIntent(transcript: string): VoiceTodayIntent | null {
  const text = transcript.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (/\b(water|hydration|drink|drank)\b/.test(text)) return "water_logged";
  if (/\bprotein\b/.test(text)) return "protein_remaining";
  if (/\b(calor(?:ie|ies)|kcal)\b/.test(text)) {
    return /\b(left|remaining|remain|more|can i|allowance)\b/.test(text) ? "calories_remaining" : "calories_consumed";
  }
  if (/\b(today|summary|progress|doing)\b/.test(text)) return "today_summary";
  return null;
}

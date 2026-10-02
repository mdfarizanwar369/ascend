"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Mic, Volume2 } from "lucide-react";
import { getVoiceToday, getVoiceTodayAudio, type VoiceTodayIntent } from "@/lib/ascendApi";
import { ascendVoice, parseVoiceTodayIntent } from "@/lib/ascendVoice";
import { getNativeCapacitorPlatform } from "@/lib/nativePlatform";

const prompts: Array<{ label: string; intent: VoiceTodayIntent }> = [
  { label: "Calories eaten", intent: "calories_consumed" },
  { label: "Calories left", intent: "calories_remaining" },
  { label: "Protein left", intent: "protein_remaining" },
  { label: "Water logged", intent: "water_logged" }
];

export function AscendVoiceBeta() {
  const [onIos, setOnIos] = useState(false);
  const [available, setAvailable] = useState(false);
  const [naturalAudioAvailable, setNaturalAudioAvailable] = useState(false);
  const [listening, setListening] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [working, setWorking] = useState(false);
  const [heard, setHeard] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [replySeconds, setReplySeconds] = useState<number | null>(null);
  const stopStartedAt = useRef<number | null>(null);

  useEffect(() => {
    if (getNativeCapacitorPlatform() !== "ios") return;
    let active = true;
    setOnIos(true);
    void ascendVoice.isAvailable().then((result) => {
      if (!active) return;
      setAvailable(result.available);
      setNaturalAudioAvailable(result.naturalAudioAvailable === true);
    }).catch(() => { if (active) { setAvailable(false); setNaturalAudioAvailable(false); } });
    const transcriptListener = ascendVoice.addListener("partialTranscript", ({ transcript }) => {
      if (active) setHeard(transcript);
    });
    void transcriptListener.catch(() => undefined);
    return () => {
      active = false;
      void transcriptListener.then((handle) => handle.remove()).catch(() => undefined);
      void ascendVoice.cancel().catch(() => undefined);
      void ascendVoice.stopSpeaking().catch(() => undefined);
    };
  }, []);

  async function ask(intent: VoiceTodayIntent, startedAt = performance.now()) {
    setError("");
    setWorking(true);
    setReplySeconds(null);
    try {
      await ascendVoice.stopSpeaking();
      // Show the text when ready, but never hold back speech while this separate request finishes.
      let audioReady = false;
      void getVoiceToday(intent).then((result) => {
        if (!audioReady) setAnswer(result.spokenText);
      }).catch(() => undefined);
      const audio = await getVoiceTodayAudio(intent);
      audioReady = true;
      setAnswer(audio.spokenText);
      await ascendVoice.playAudio({ audioBase64: audio.audioBase64 });
      setReplySeconds(Math.round((performance.now() - startedAt) / 100) / 10);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Natural voice is unavailable. Your answer is shown above.");
    } finally { setWorking(false); }
  }

  async function listen() {
    if (listening) {
      if (stopping) return;
      setStopping(true);
      stopStartedAt.current = performance.now();
      try { await ascendVoice.stopListening(); }
      catch (cause) {
        setStopping(false);
        const message = cause instanceof Error ? cause.message : "Could not finish listening. Please try again.";
        setError(/not implemented/i.test(message) ? "Update Ascend to the latest TestFlight build to finish voice questions." : message);
      }
      return;
    }
    if (!naturalAudioAvailable) {
      setError("Update Ascend to the latest TestFlight build to use natural voice.");
      return;
    }
    setError(""); setAnswer(""); setHeard(""); setReplySeconds(null); setListening(true); setStopping(false);
    stopStartedAt.current = null;
    try {
      await ascendVoice.stopSpeaking();
      const { transcript } = await ascendVoice.listen({ locale: "en-US" });
      setHeard(transcript);
      setListening(false);
      setStopping(false);
      const intent = parseVoiceTodayIntent(transcript);
      if (!intent) {
        setError("Try asking about calories eaten, calories left, protein left, or water logged today.");
        return;
      }
      await ask(intent, stopStartedAt.current ?? performance.now());
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      if (message !== "Listening cancelled") setError(message);
    } finally { setListening(false); setStopping(false); }
  }

  if (!onIos) return null;
  return <div className="ascend-inset my-3 p-4" aria-label="Ascend Voice beta">
    <div className="flex items-center gap-2 text-sm font-semibold text-white"><Volume2 size={17} /> Ascend Voice <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-zinc-300">Private beta</span></div>
    <p className="mt-1 text-xs text-zinc-400">An add-on to Today&apos;s Numbers. Tap to ask about today&apos;s calories, protein, or water.</p>
    <p className="mt-1 text-[11px] text-zinc-500">iPhone Speech Recognition turns your question into text, using on-device recognition when available. Otherwise Apple may process the audio. Your answer is sent to Google Gemini for natural speech only when AI sharing is enabled. <Link href="/ai-privacy" className="text-calm underline">AI privacy</Link></p>
    <button type="button" onClick={() => void listen()} disabled={working || stopping} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-calm px-5 text-sm font-semibold text-black disabled:opacity-50">
      <Mic size={17} /> {stopping ? "Finishing question…" : listening ? "Stop listening" : working ? "Checking today…" : "Ask Ascend"}
    </button>
    {listening && <p className="mt-2 text-xs text-calm" role="status">{stopping ? "Turning your words into an answer…" : "Listening… ask your question now, then tap Stop listening."}</p>}
    {!naturalAudioAvailable && <p className="mt-2 text-xs text-amber-300">Natural voice needs the latest Ascend TestFlight build.</p>}
    {!available && naturalAudioAvailable && <p className="mt-2 text-xs text-amber-300">Tap Ask Ascend to check iPhone speech access.</p>}
    <div className="mt-3 flex flex-wrap gap-2">{prompts.map((prompt) => <button key={prompt.intent} type="button" disabled={!naturalAudioAvailable || working} onClick={() => void ask(prompt.intent)} className="min-h-10 rounded-full border border-white/15 px-3 text-xs text-zinc-200 disabled:opacity-50">{prompt.label}</button>)}</div>
    {heard && <p className="mt-3 text-xs text-zinc-400">Heard: {heard}</p>}
    {answer && <p className="mt-2 text-sm text-white" role="status">{answer}</p>}
    {replySeconds !== null && <p className="mt-1 text-[11px] text-zinc-500">Voice started in {replySeconds.toFixed(1)}s</p>}
    {error && <p className="mt-2 text-xs text-amber-300" role="alert">{error}</p>}
  </div>;
}

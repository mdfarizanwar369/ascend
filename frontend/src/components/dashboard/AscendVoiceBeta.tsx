"use client";

import { useEffect, useState } from "react";
import { Mic, Volume2 } from "lucide-react";
import { getVoiceToday, type VoiceTodayIntent } from "@/lib/ascendApi";
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
  const [listening, setListening] = useState(false);
  const [working, setWorking] = useState(false);
  const [heard, setHeard] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (getNativeCapacitorPlatform() !== "ios") return;
    setOnIos(true);
    void ascendVoice.isAvailable().then((result) => setAvailable(result.available)).catch(() => setAvailable(false));
    return () => { void ascendVoice.cancel().catch(() => undefined); void ascendVoice.stopSpeaking().catch(() => undefined); };
  }, []);

  async function ask(intent: VoiceTodayIntent) {
    setError("");
    setWorking(true);
    try {
      const result = await getVoiceToday(intent);
      setAnswer(result.spokenText);
      await ascendVoice.speak({ text: result.spokenText });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load today's numbers. Try again.");
    } finally { setWorking(false); }
  }

  async function listen() {
    if (listening) { await ascendVoice.cancel().catch(() => undefined); setListening(false); return; }
    setError(""); setAnswer(""); setHeard(""); setListening(true);
    try {
      await ascendVoice.stopSpeaking();
      const { transcript } = await ascendVoice.listen({ locale: "en-US" });
      setHeard(transcript);
      const intent = parseVoiceTodayIntent(transcript);
      if (!intent) {
        setError("Try asking about calories eaten, calories left, protein left, or water logged today.");
        return;
      }
      await ask(intent);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      if (!/cancel/i.test(message)) setError(message);
    } finally { setListening(false); }
  }

  if (!onIos) return null;
  return <div className="ascend-inset mb-3 p-4" aria-label="Ascend Voice beta">
    <div className="flex items-center gap-2 text-sm font-semibold text-white"><Volume2 size={17} /> Ascend Voice <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-zinc-300">Private beta</span></div>
    <p className="mt-1 text-xs text-zinc-400">Tap to ask about today&apos;s calories, protein, or water. Ascend listens only while you tap the mic.</p>
    <button type="button" onClick={() => void listen()} disabled={!available || working} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-calm px-5 text-sm font-semibold text-black disabled:opacity-50">
      <Mic size={17} /> {listening ? "Stop listening" : working ? "Checking today…" : "Ask Ascend"}
    </button>
    {!available && <p className="mt-2 text-xs text-amber-300">Voice needs the latest Ascend TestFlight build and on-device English speech support.</p>}
    <div className="mt-3 flex flex-wrap gap-2">{prompts.map((prompt) => <button key={prompt.intent} type="button" disabled={working} onClick={() => void ask(prompt.intent)} className="min-h-10 rounded-full border border-white/15 px-3 text-xs text-zinc-200 disabled:opacity-50">{prompt.label}</button>)}</div>
    {heard && <p className="mt-3 text-xs text-zinc-400">Heard: {heard}</p>}
    {answer && <p className="mt-2 text-sm text-white" role="status">{answer}</p>}
    {error && <p className="mt-2 text-xs text-amber-300" role="alert">{error}</p>}
  </div>;
}

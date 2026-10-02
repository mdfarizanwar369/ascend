import { env } from "../config/env";
import { assertAiProviderConsent, withAiDataSubject } from "./aiConsentService";
import { withAiWorkLease } from "./aiWorkLeaseService";
import { readResponseBufferLimited } from "../utils/outboundUrl";

const VOICE_MODEL = "gemini-3.8-flash-lite-tts";
const GEMINI_TTS_URL = `https://generativelanguage.googleapis.com/v1beta/models/${VOICE_MODEL}:streamGenerateContent?alt=sse`;
const MAX_RESPONSE_BYTES = 3_000_000;
const MAX_AUDIO_BYTES = 2_000_000;
const AUDIO_CACHE_MS = 60_000;
const MAX_CACHED_REPLIES = 32;
const MAX_CACHED_AUDIO_CHARS = 350_000;
const audioCache = new Map<string, { audio: string; expiresAt: number }>();

type GeminiSpeechStreamEvent = {
  candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> } }>;
  error?: { message?: string };
};

export function readGeminiSpeechStream(raw: Buffer): string {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for (const eventBlock of raw.toString("utf8").split(/\r?\n\r?\n/)) {
    const data = eventBlock.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
    if (!data || data === "[DONE]") continue;
    let event: GeminiSpeechStreamEvent;
    try { event = JSON.parse(data) as GeminiSpeechStreamEvent; }
    catch { throw new Error("Natural voice returned an invalid audio stream."); }
    if (event.error) throw new Error("Natural voice is unavailable right now. The answer is shown on screen.");
    for (const part of event.candidates?.[0]?.content?.parts ?? []) {
      const inline = part.inlineData;
      if (!inline?.data) continue;
      const [format, ...parameters] = (inline.mimeType ?? "").toLowerCase().replace(/\s+/g, "").split(";");
      if (format !== "audio/l16" || !parameters.includes("rate=24000")
        || (parameters.some((parameter) => parameter.startsWith("channels=")) && !parameters.includes("channels=1"))) {
        throw new Error("Natural voice returned an unsupported audio format.");
      }
      const chunk = Buffer.from(inline.data, "base64");
      totalBytes += chunk.length;
      if (!chunk.length || chunk.length % 2 !== 0 || totalBytes + 44 > MAX_AUDIO_BYTES) {
        throw new Error("Natural voice returned an unsupported audio format.");
      }
      chunks.push(chunk);
    }
  }
  if (!totalBytes) throw new Error("Natural voice is unavailable right now.");
  const wav = Buffer.allocUnsafe(44 + totalBytes);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(36 + totalBytes, 4);
  wav.write("WAVEfmt ", 8, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(24_000, 24);
  wav.writeUInt32LE(48_000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(totalBytes, 40);
  let position = 44;
  for (const chunk of chunks) { chunk.copy(wav, position); position += chunk.length; }
  return wav.toString("base64");
}

export async function synthesizeVoiceReply(userId: string, spokenText: string): Promise<string> {
  if (!spokenText || spokenText.length > 500) throw new Error("Natural voice cannot read this answer.");
  if (env.AI_PROVIDER !== "gemini" || !env.GEMINI_API_KEY) {
    throw new Error("Natural voice is not configured right now.");
  }
  return withAiDataSubject(userId, async () => {
    await assertAiProviderConsent("gemini");
    const cacheKey = `${userId}\u0000${spokenText}`;
    const cached = audioCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.audio;
    if (cached) audioCache.delete(cacheKey);
    return withAiWorkLease(`voice-tts:${userId}`, async () => {
      const response = await fetch(GEMINI_TTS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY! },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{
            text: spokenText,
            speech_metadata: { style: "Warm, smooth, natural and conversational. Speak clearly at a relaxed pace, like a helpful personal coach." }
          }] }],
          generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { voice: "Algieba" } } }
        }),
        signal: AbortSignal.timeout(15_000)
      });
      if (!response.ok) {
        console.warn("[voice-tts] Gemini speech request failed", { status: response.status });
        await response.body?.cancel();
        throw new Error("Natural voice is unavailable right now. The answer is shown on screen.");
      }
      const raw = await readResponseBufferLimited(response, MAX_RESPONSE_BYTES);
      const audio = readGeminiSpeechStream(raw);
      if (audio.length <= MAX_CACHED_AUDIO_CHARS) {
        if (audioCache.size >= MAX_CACHED_REPLIES) audioCache.delete(audioCache.keys().next().value!);
        audioCache.set(cacheKey, { audio, expiresAt: Date.now() + AUDIO_CACHE_MS });
      }
      return audio;
    });
  });
}

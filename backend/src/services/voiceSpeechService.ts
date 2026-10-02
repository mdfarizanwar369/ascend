import { env } from "../config/env";
import { assertAiProviderConsent, withAiDataSubject } from "./aiConsentService";
import { withAiWorkLease } from "./aiWorkLeaseService";
import { readResponseBufferLimited } from "../utils/outboundUrl";

const GEMINI_TTS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const MAX_RESPONSE_BYTES = 3_000_000;
const MAX_AUDIO_BYTES = 2_000_000;

type AudioPart = { type?: string; data?: string };
type GeminiSpeechResponse = {
  steps?: Array<{ type?: string; content?: AudioPart[] }>;
  output_audio?: { data?: string };
};

export function readGeminiSpeechAudio(payload: GeminiSpeechResponse): string {
  const parts = payload.steps?.flatMap((step) => step.type === "model_output" ? step.content ?? [] : []) ?? [];
  const encoded = parts.filter((part) => part.type === "audio" && typeof part.data === "string").at(-1)?.data
    ?? payload.output_audio?.data;
  if (!encoded || encoded.length > Math.ceil(MAX_AUDIO_BYTES * 4 / 3) + 8) {
    throw new Error("Natural voice is unavailable right now.");
  }
  const audio = Buffer.from(encoded, "base64");
  if (audio.length < 44 || audio.length > MAX_AUDIO_BYTES || audio.toString("ascii", 0, 4) !== "RIFF"
    || audio.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Natural voice returned an unsupported audio format.");
  }
  return encoded;
}

export async function synthesizeVoiceReply(userId: string, spokenText: string): Promise<string> {
  if (!spokenText || spokenText.length > 500) throw new Error("Natural voice cannot read this answer.");
  if (env.AI_PROVIDER !== "gemini" || !env.GEMINI_API_KEY) {
    throw new Error("Natural voice is not configured right now.");
  }
  return withAiWorkLease(`voice-tts:${userId}`, () => withAiDataSubject(userId, async () => {
    await assertAiProviderConsent("gemini");
    const response = await fetch(GEMINI_TTS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY! },
      body: JSON.stringify({
        model: "gemini-3.8-flash-tts",
        input: [{ type: "user_input", content: [{
          type: "text",
          text: spokenText,
          annotations: [{ type: "speech_metadata", style: "Warm, smooth, natural and conversational. Speak clearly at a relaxed pace, like a helpful personal coach." }]
        }] }],
        response_format: { type: "audio" },
        generation_config: { speech_config: [{ voice: "Algieba" }] }
      }),
      signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) {
      console.warn("[voice-tts] Gemini speech request failed", { status: response.status });
      await response.body?.cancel();
      throw new Error("Natural voice is unavailable right now. The answer is shown on screen.");
    }
    const raw = await readResponseBufferLimited(response, MAX_RESPONSE_BYTES);
    const payload = JSON.parse(raw.toString("utf8")) as GeminiSpeechResponse;
    return readGeminiSpeechAudio(payload);
  }));
}

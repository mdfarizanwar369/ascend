import { beforeEach, describe, expect, it, vi } from "vitest";

const consent = vi.hoisted(() => vi.fn());
vi.mock("../config/env", () => ({ env: { AI_PROVIDER: "gemini", GEMINI_API_KEY: "test-key" } }));
vi.mock("../services/aiConsentService", () => ({
  assertAiProviderConsent: consent,
  withAiDataSubject: (_userId: string, work: () => Promise<unknown>) => work()
}));
vi.mock("../services/aiWorkLeaseService", () => ({
  withAiWorkLease: (_resource: string, work: () => Promise<unknown>) => work()
}));

import { readGeminiSpeechStream, synthesizeVoiceReply } from "../services/voiceSpeechService";

const pcm = Buffer.from([0, 0, 1, 0, 2, 0, 3, 0]);
function speechEvent(chunk: Buffer, mimeType = "audio/l16; rate=24000; channels=1") {
  return `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType, data: chunk.toString("base64") } }] } }] })}\n\n`;
}
const stream = `${speechEvent(pcm.subarray(0, 4))}${speechEvent(pcm.subarray(4))}data: ${JSON.stringify({ usageMetadata: { totalTokenCount: 10 } })}\n\n`;
const expectedAudio = readGeminiSpeechStream(Buffer.from(stream));

beforeEach(() => { consent.mockReset(); consent.mockResolvedValue(undefined); });

describe("private natural voice", () => {
  it("joins streamed PCM into a playable WAV and rejects malformed audio", () => {
    const wav = Buffer.from(expectedAudio, "base64");
    expect(wav.toString("ascii", 0, 12)).toBe("RIFF,\u0000\u0000\u0000WAVE");
    expect(wav.readUInt32LE(24)).toBe(24_000);
    expect(wav.readUInt32LE(40)).toBe(pcm.length);
    expect(wav.subarray(44)).toEqual(pcm);
    expect(() => readGeminiSpeechStream(Buffer.from("data: {bad json}\n\n"))).toThrow(/invalid audio stream/);
    expect(() => readGeminiSpeechStream(Buffer.from("data: {}\n\n"))).toThrow(/unavailable/);
    expect(() => readGeminiSpeechStream(Buffer.from(speechEvent(Buffer.from([1]))))).toThrow(/unsupported audio format/);
    expect(readGeminiSpeechStream(Buffer.from(speechEvent(pcm, "audio/L16;codec=pcm;rate=24000")))).toBe(expectedAudio);
    expect(() => readGeminiSpeechStream(Buffer.from(speechEvent(pcm, "audio/l16;rate=24000;channels=2")))).toThrow(/unsupported audio format/);
  });

  it("does not contact Gemini when AI sharing is off", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    consent.mockRejectedValueOnce(new Error("AI sharing is off"));
    try {
      await expect(synthesizeVoiceReply("owner-id", "You have 800 calories left.")).rejects.toThrow("AI sharing is off");
      expect(fetchMock).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });

  it("sends only the computed answer to Gemini and returns playable audio", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(stream, { headers: { "Content-Type": "text/event-stream" } }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      expect(await synthesizeVoiceReply("owner-id", "You have 800 calories left.")).toBe(expectedAudio);
      expect(consent).toHaveBeenCalledWith("gemini");
      const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-lite-tts:streamGenerateContent?alt=sse");
      const body = JSON.parse(String(options.body));
      expect(body.contents[0].parts[0].text).toBe("You have 800 calories left.");
      expect(body.generationConfig.speechConfig.voiceConfig.voice).toBe("Algieba");
    } finally { vi.unstubAllGlobals(); }
  });

  it("reuses a recent answer while checking AI consent on every request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(stream, { headers: { "Content-Type": "text/event-stream" } }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const text = "You have 123 calories left today.";
      expect(await synthesizeVoiceReply("cache-test-owner", text)).toBe(expectedAudio);
      expect(await synthesizeVoiceReply("cache-test-owner", text)).toBe(expectedAudio);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(consent).toHaveBeenCalledTimes(2);
      consent.mockRejectedValueOnce(new Error("AI sharing is off"));
      await expect(synthesizeVoiceReply("cache-test-owner", text)).rejects.toThrow("AI sharing is off");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally { vi.unstubAllGlobals(); }
  });
});

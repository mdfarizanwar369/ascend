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

import { readGeminiSpeechAudio, synthesizeVoiceReply } from "../services/voiceSpeechService";

const audio = Buffer.alloc(44);
audio.write("RIFF", 0);
audio.write("WAVE", 8);
const encoded = audio.toString("base64");

beforeEach(() => { consent.mockReset(); consent.mockResolvedValue(undefined); });

describe("private natural voice", () => {
  it("reads Gemini's model-output WAV and rejects malformed audio", () => {
    expect(readGeminiSpeechAudio({ steps: [{ type: "model_output", content: [{ type: "audio", data: encoded }] }] })).toBe(encoded);
    expect(() => readGeminiSpeechAudio({ steps: [{ type: "model_output", content: [{ type: "audio", data: Buffer.from("not wave").toString("base64") }] }] })).toThrow(/unsupported audio format/);
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
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ steps: [{ type: "model_output", content: [{ type: "audio", data: encoded }] }] }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      expect(await synthesizeVoiceReply("owner-id", "You have 800 calories left.")).toBe(encoded);
      expect(consent).toHaveBeenCalledWith("gemini");
      const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/interactions");
      const body = JSON.parse(String(options.body));
      expect(body.model).toBe("gemini-3.8-flash-tts");
      expect(body.input[0].content[0].text).toBe("You have 800 calories left.");
      expect(body.generation_config.speech_config[0].voice).toBe("Algieba");
    } finally { vi.unstubAllGlobals(); }
  });
});

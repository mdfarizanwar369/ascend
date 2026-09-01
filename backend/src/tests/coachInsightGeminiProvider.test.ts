import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/env", () => ({
  env: {
    AI_PROVIDER: "gemini",
    GEMINI_API_KEY: "synthetic-test-key",
    GEMINI_MODEL: "gemini-3.6-flash",
    OPENAI_API_KEY: undefined,
    OPENAI_MODEL: "unused-openai-model",
    NODE_ENV: "test",
    FOOD_AI_PERFORMANCE_LOGS: false
  }
}));

import { createCoachInsightProviderReply, getAiProviderIdentity } from "../integrations/openai";

const providerInsight = JSON.stringify({
  summary: "Training has been recorded consistently over the recent period, while protein target frequency is the clearest evidence-based coaching opportunity. The available data supports reviewing practical protein consistency before changing the broader approach. Weight evidence is stable, but the trainer should keep interpreting that result alongside the stated goal and the freshness and sufficiency limits in the authorized snapshot.",
  priorities: [{
    title: "Review protein consistency",
    reason: "The authorized signal shows that the protein target was missed on most logged days.",
    signalCodes: ["PROTEIN_TARGET_FREQUENTLY_MISSED"]
  }],
  dataCaveats: []
});

function geminiResponse(text = providerInsight) {
  return new Response(JSON.stringify({
    candidates: [{ finishReason: "STOP", content: { parts: [{ text }] } }]
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("Gemini Coach Insight provider contract", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse()));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses the configured Gemini model once with JSON schema output", async () => {
    expect(getAiProviderIdentity()).toEqual({ provider: "gemini", model: "gemini-3.6-flash", configured: true });

    const reply = await createCoachInsightProviderReply("system", "synthetic authorized context");

    expect(reply).toEqual({ text: providerInsight, provider: "gemini", model: "gemini-3.6-flash" });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, request] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain("/models/gemini-3.6-flash:generateContent");
    const body = JSON.parse(String(request?.body));
    expect(body.generationConfig).toMatchObject({
      maxOutputTokens: 700,
      responseMimeType: "application/json",
      thinkingConfig: { thinkingLevel: "minimal" }
    });
    expect(body.generationConfig.responseSchema.required).toEqual(["summary", "priorities", "dataCaveats"]);
  });

  it("does not retry or fall back when Gemini fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })));

    await expect(createCoachInsightProviderReply("system", "synthetic authorized context")).rejects.toThrow(/503/);

    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

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

import { createCoachZoeReply } from "../integrations/openai";

function geminiResponse(text = "A compact provider reply grounded in the supplied synthetic context.") {
  return new Response(JSON.stringify({
    candidates: [{ finishReason: "STOP", content: { parts: [{ text }] } }]
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("Coach Zoe multilingual provider contract", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse()));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    ["en", "Language: Answer in English."],
    ["ms-MY", "Language: Answer in natural Malaysian Bahasa Melayu."],
    ["zh-Hans", "Language: Answer in natural Simplified Chinese"]
  ])("binds the final provider prompt to %s", async (locale, expectedInstruction) => {
    await createCoachZoeReply(
      "How should I adjust today's workout if I feel tired?",
      JSON.stringify({ dataConfidence: { state: "TREND_READY" }, recentWorkout: "Lower Strength" }),
      "workout",
      locale
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    const [, request] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(String(request?.body));
    const providerText = body.contents[0].parts[0].text as string;

    expect(providerText).toContain(expectedInstruction);
    expect(providerText).toContain("You are Coach Zoe inside Ascend.");
    expect(providerText).toContain("Never invent data.");
    expect(providerText).toContain("Do not redesign or replace the existing Workout Builder.");
    expect(providerText).toContain("Client context:");
    expect(providerText).toContain("Question: How should I adjust today's workout if I feel tired?");
  });
});

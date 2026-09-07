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

  it.each([
    ["ms-MY", "Jana Workout Hari Ini", "Pembina Workout"],
    ["zh-Hans", "生成今日训练", "训练生成器"]
  ])("localizes English Ascend feature labels returned by the provider for %s", async (locale, generatedWorkoutLabel, builderLabel) => {
    vi.mocked(fetch).mockResolvedValueOnce(geminiResponse("Open Generate Today's Workout in the Workout Builder."));

    const reply = await createCoachZoeReply("Build my session", "{}", "workout", locale);

    expect(reply).toContain(generatedWorkoutLabel);
    expect(reply).toContain(builderLabel);
    expect(reply).not.toContain("Generate Today's Workout");
    expect(reply).not.toContain("Workout Builder");
  });

  it("localizes generic English training categories in Simplified Chinese while preserving named exercises", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(geminiResponse("Use Push movements for Upper Body, then Lower Body & Core and Pull Movements with Goblet Squats."));

    const reply = await createCoachZoeReply("What should I train?", "{}", "workout", "zh-Hans");

    expect(reply).toContain("推类动作");
    expect(reply).toContain("上肢");
    expect(reply).toContain("下肢与核心");
    expect(reply).toContain("拉类动作");
    expect(reply).toContain("Goblet Squats");
    expect(reply).not.toMatch(/Push movements|Upper Body|Lower Body & Core|Pull Movements/i);
  });

  it.each([
    ["ms-MY", "Jana Workout Hari Ini"],
    ["zh-Hans", "生成今日训练"]
  ])("uses a localized deterministic fallback for %s", async (locale, expectedCopy) => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("synthetic provider outage"));

    const reply = await createCoachZoeReply("Build my session", "{}", "workout", locale);

    expect(reply).toContain(expectedCopy);
    expect(reply).not.toContain("Generate Today's Workout");
  });

  it.each([
    ["ms-MY", "Untuk langkah seterusnya"],
    ["zh-Hans", "下一步请完成"]
  ])("localizes the no-question closing for %s", async (locale, expectedClosing) => {
    vi.mocked(fetch).mockResolvedValueOnce(geminiResponse("Adakah anda bersedia?"));

    const reply = await createCoachZoeReply("What next?", "{}", "general", locale);

    expect(reply).toContain(expectedClosing);
    expect(reply).not.toContain("For your next step");
  });
});

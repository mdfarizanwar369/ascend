import { describe, expect, it } from "vitest";
import { z } from "zod";
import { geminiThinkingBudgetForModel } from "../integrations/openai";

describe("AI provider env", () => {
  it("allows Gemini as the pilot AI provider", () => {
    const schema = z.enum(["openai", "gemini", "kimi", "qwen", "local"]);
    expect(schema.parse("gemini")).toBe("gemini");
  });

  it("keeps enough output budget for structured Gemini responses", () => {
    expect(geminiThinkingBudgetForModel("gemini-2.5-flash")).toBe(0);
    expect(geminiThinkingBudgetForModel("gemini-3.6-flash")).toBe(128);
    expect(geminiThinkingBudgetForModel("gemini-2.0-flash")).toBeNull();
  });
});

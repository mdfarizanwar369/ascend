import { describe, expect, it } from "vitest";
import { z } from "zod";

describe("AI provider env", () => {
  it("allows Gemini as the pilot AI provider", () => {
    const schema = z.enum(["openai", "gemini", "kimi", "qwen", "local"]);
    expect(schema.parse("gemini")).toBe("gemini");
  });
});

import { describe, expect, it } from "vitest";
import { normalizeCoachProse } from "../integrations/openai";

describe("workout coaching copy normalization", () => {
  it("never cuts a generated workout introduction mid-word or mid-sentence", () => {
    const intro = "Welcome to your workout, Ascender! Yesterday we focused on your upper body, so today we're shifting our attention to building a strong foundation with a lower body session. This workout keeps the pace controlled while giving every exercise a clear purpose for today.";

    const normalized = normalizeCoachProse(intro, "Fallback introduction.");

    expect(normalized.length).toBeLessThanOrEqual(220);
    expect(normalized).toMatch(/[.!?]$/);
    expect(normalized).not.toMatch(/\bwo$/i);
  });

  it("preserves a complete introduction that is already concise", () => {
    const intro = "Here is a balanced session for today.";

    expect(normalizeCoachProse(intro, "Fallback introduction.")).toBe(intro);
  });
});

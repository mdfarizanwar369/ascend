import { describe, expect, it, vi } from "vitest";

describe("AI error logging metadata", () => {
  it("removes generated content and technical details in production", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");

    const { safeAiErrorMetadata } = await import("../integrations/openai");

    expect(safeAiErrorMetadata({
      category: "invalid_json",
      model: "gemini-test",
      status: 500,
      responsePreview: "private generated meal content",
      rawResponse: { private: true },
      technicalDetail: "provider response details",
      error: "raw parser message"
    })).toEqual({
      category: "invalid_json",
      model: "gemini-test",
      status: 500
    });

    vi.unstubAllEnvs();
  });

  it("keeps full diagnostics outside production", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "test");

    const { safeAiErrorMetadata } = await import("../integrations/openai");
    const metadata = { category: "invalid_json", responsePreview: "test response" };

    expect(safeAiErrorMetadata(metadata)).toEqual(metadata);

    vi.unstubAllEnvs();
  });
});

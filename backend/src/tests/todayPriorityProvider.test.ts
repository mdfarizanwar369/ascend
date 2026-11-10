import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/aiWorkLeaseService", async importOriginal => ({
  ...await importOriginal<typeof import("../services/aiWorkLeaseService")>(),
  createAiProviderGate: () => (_key: string, work: () => Promise<unknown>) => work()
}));

const candidates = [
  { key: "Water", title: "Have a glass of water", reason: "Keep hydration steady.", href: "/water", cta: "Log water", rank: 1 },
  { key: "Movement", title: "Take a gentle walk", reason: "An easy movement break.", href: "/workout", cta: "Move", rank: 2 }
] as const;
const input = { candidates: [...candidates], facts: { context: "Fictional test context" } };

function response(text: string, finishReason = "STOP") {
  return new Response(JSON.stringify({ candidates: [{ finishReason, content: { parts: [{ text }] } }] }), { status: 200 });
}

async function loadProvider(model = "gemini-3.6-flash") {
  vi.resetModules();
  vi.stubEnv("AI_PROVIDER", "gemini");
  vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
  vi.stubEnv("GEMINI_MODEL", model);
  vi.doMock("../services/aiConsentService", () => ({ assertAiProviderConsent: vi.fn(async () => undefined) }));
  return import("../integrations/openai");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Today priority provider reliability", () => {
  it("constrains Gemini to eligible candidates and preserves the live candidate wording", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => response(JSON.stringify({
      selectedKey: "Water", title: "Ignore live wording", reason: "Ignore current facts"
    })));
    vi.stubGlobal("fetch", fetchMock);
    const { refineTodayPriority } = await loadProvider();

    await expect(refineTodayPriority(input)).resolves.toEqual(candidates[0]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const config = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).generationConfig;
    expect(config).toMatchObject({
      thinkingConfig: { thinkingLevel: "low" }, responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT", required: ["selectedKey"],
        properties: { selectedKey: { type: "STRING", enum: ["Water", "Movement"] } }
      }
    });
    expect(config.maxOutputTokens).toBeGreaterThanOrEqual(1024);
  });

  it.each(["MAX_TOKENS", "SAFETY", "RECITATION"])("falls back when Gemini stops with %s even if the partial text parses", async finishReason => {
    const fetchMock = vi.fn(async () => response('{"selectedKey":"Water"}', finishReason));
    vi.stubGlobal("fetch", fetchMock);
    const { refineTodayPriority } = await loadProvider();

    await expect(refineTodayPriority(input)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(['{"selectedKey":', '{"selectedKey":"Meal"}', 'null', '[]'])("retains the rules fallback for invalid output %s", async text => {
    const fetchMock = vi.fn(async () => response(text));
    vi.stubGlobal("fetch", fetchMock);
    const { refineTodayPriority } = await loadProvider();

    await expect(refineTodayPriority(input)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("preserves the legacy title and reason contract", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => response(JSON.stringify({
      selectedKey: "Movement", title: "A gentle walk", reason: "Keep movement comfortable today."
    })));
    vi.stubGlobal("fetch", fetchMock);
    const { refineLegacyTodayPriority } = await loadProvider();

    await expect(refineLegacyTodayPriority(input)).resolves.toEqual({
      ...candidates[1], title: "A gentle walk", reason: "Keep movement comfortable today."
    });
    const schema = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).generationConfig.responseSchema;
    expect(schema).toMatchObject({
      required: ["selectedKey", "title", "reason"],
      properties: { selectedKey: { enum: ["Water", "Movement"] }, title: { type: "STRING" }, reason: { type: "STRING" } }
    });
  });

  it("uses compatible thinking settings for Gemini 2.5", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => response('{"selectedKey":"Water"}'));
    vi.stubGlobal("fetch", fetchMock);
    const { refineTodayPriority } = await loadProvider("gemini-2.5-flash");

    await expect(refineTodayPriority(input)).resolves.toEqual(candidates[0]);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
  });

  it("does not send data when consent is unavailable", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { refineTodayPriority } = await loadProvider();
    const { assertAiProviderConsent } = await import("../services/aiConsentService");
    vi.mocked(assertAiProviderConsent).mockRejectedValue(new Error("Private permission failure"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(refineTodayPriority(input)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/Private permission|test-gemini-key|Fictional test context/);
  });
});

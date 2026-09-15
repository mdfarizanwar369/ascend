import { beforeEach, describe, expect, it, vi } from "vitest";
import { AI_CONSENT_VERSION } from "@ascend/shared";

const queryMock = vi.hoisted(() => vi.fn());
vi.mock("../db/pool", () => ({ query: queryMock }));
vi.mock("../config/env", () => ({ env: { AI_PROVIDER: "gemini", GEMINI_API_KEY: "test-key", GEMINI_MODEL: "gemini-2.5-flash" } }));
import { assertAiProviderConsent, getAiConsent, saveAiConsent, withAiDataSubject } from "../services/aiConsentService";

const member = "11111111-1111-4111-8111-111111111111";
const trainer = "22222222-2222-4222-8222-222222222222";
beforeEach(() => { queryMock.mockReset(); queryMock.mockResolvedValue({ rows: [] }); });

describe("AI permission enforcement", () => {
  it("starts off when no choice exists and never writes during reads", async () => {
    expect(await getAiConsent(member)).toMatchObject({ allowed: false, decision: null, provider: "gemini" });
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(queryMock.mock.calls[0][0]).toMatch(/^select/);
  });
  it("rejects calls without an owner context, even if permission rows exist", async () => {
    queryMock.mockResolvedValue({ rows: [{ user_id: member }] });
    await expect(assertAiProviderConsent("gemini")).rejects.toMatchObject({ status: 403 });
    expect(queryMock).not.toHaveBeenCalled();
  });
  it("requires a current choice, and rechecks a revocation before the next request", async () => {
    await withAiDataSubject(member, async () => {
      await expect(assertAiProviderConsent("gemini")).rejects.toMatchObject({ status: 403 });
      queryMock.mockResolvedValueOnce({ rows: [{ user_id: member }] });
      await expect(assertAiProviderConsent("gemini")).resolves.toBeUndefined();
      await expect(assertAiProviderConsent("gemini")).rejects.toMatchObject({ status: 403 });
    });
    expect(queryMock.mock.calls[0][1]).toEqual([[member], "gemini", AI_CONSENT_VERSION]);
  });
  it("does not let a trainer authorize sharing a client's records", async () => {
    queryMock.mockResolvedValue({ rows: [{ user_id: trainer }] });
    await withAiDataSubject(trainer, () => withAiDataSubject(member, async () => {
      await expect(assertAiProviderConsent("gemini")).rejects.toMatchObject({ status: 403 });
      queryMock.mockResolvedValueOnce({ rows: [{ user_id: trainer }, { user_id: member }] });
      await expect(assertAiProviderConsent("gemini")).resolves.toBeUndefined();
    }));
    expect(queryMock.mock.calls[0][1][0]).toEqual([trainer, member]);
  });
  it("keeps concurrent account contexts separate", async () => {
    queryMock.mockImplementation(async (_sql, values) => ({ rows: values[0].includes(member) ? [{ user_id: member }] : [] }));
    const results = await Promise.allSettled([
      withAiDataSubject(member, () => assertAiProviderConsent("gemini")),
      withAiDataSubject(trainer, () => assertAiProviderConsent("gemini"))
    ]);
    expect(results.map(result => result.status)).toEqual(["fulfilled", "rejected"]);
  });
  it("does not transfer consent to a different provider or accept a stale disclosure", async () => {
    await expect(withAiDataSubject(member, () => assertAiProviderConsent("openai"))).rejects.toMatchObject({ status: 403 });
    await expect(saveAiConsent(member, { provider: "openai", version: AI_CONSENT_VERSION, allowed: true })).rejects.toMatchObject({ status: 409 });
    await expect(saveAiConsent(member, { provider: "gemini", version: "old", allowed: true })).rejects.toMatchObject({ status: 409 });
    expect(queryMock).not.toHaveBeenCalled();
  });
  it("persists explicit denial without upgrading it to permission", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ allowed: false, updated_at: "2026-09-15" }] });
    expect(await saveAiConsent(member, { provider: "gemini", version: AI_CONSENT_VERSION, allowed: false })).toMatchObject({ allowed: false, decision: false });
    expect(queryMock.mock.calls[0][1]).toEqual([member, "gemini", AI_CONSENT_VERSION, false]);
  });
  it("stops the real Gemini integration before any network transmission", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      const { createCoachZoeReply } = await import("../integrations/openai");
      await withAiDataSubject(member, () => createCoachZoeReply("Help with meals", "Fictional fitness profile"));
      expect(fetchMock).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
});

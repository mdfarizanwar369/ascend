import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, apiBlob } from "./api";

function jsonResponse(value: unknown): Response {
  return { ok: true, status: 200, json: async () => value } as Response;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("API read deadlines", () => {
  it("releases a GET stalled before response headers and aborts its fetch", async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url, options: RequestInit) => {
      signal = options.signal ?? undefined;
      return new Promise<Response>(() => undefined);
    }));

    const request = api("/me");
    const result = expect(request).rejects.toThrow("Ascend is taking too long to respond");
    await vi.advanceTimersByTimeAsync(20_000);
    await result;
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("also bounds a stalled JSON body read", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      json: () => new Promise(() => undefined)
    } as Response)));

    const request = api("/me");
    const result = expect(request).rejects.toThrow("Ascend is taking too long to respond");
    await vi.advanceTimersByTimeAsync(20_000);
    await result;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("also bounds a stalled blob body read", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      blob: () => new Promise(() => undefined)
    } as Response)));

    const request = apiBlob("/report");
    const result = expect(request).rejects.toThrow("Ascend is taking too long to respond");
    await vi.advanceTimersByTimeAsync(20_000);
    await result;
  });

  it("clears the GET timer after a successful response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ ready: true })));

    expect(await api("/ready")).toEqual({ ready: true });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("passes a caller's abort signal through without replacing it", async () => {
    const controller = new AbortController();
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url, options: RequestInit) => {
      signal = options.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      });
    }));

    const request = api("/ai", { signal: controller.signal });
    expect(signal).toBe(controller.signal);
    expect(vi.getTimerCount()).toBe(0);
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });

  it("leaves POST without a new deadline", async () => {
    let resolveFetch!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; })));

    const request = api("/food-logs", { method: "POST", body: "{}" });
    await vi.advanceTimersByTimeAsync(20_001);
    expect(vi.getTimerCount()).toBe(0);
    resolveFetch(jsonResponse({ saved: true }));
    expect(await request).toEqual({ saved: true });
  });
});

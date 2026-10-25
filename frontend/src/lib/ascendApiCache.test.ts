import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAscendResponseCache, getMe, saveProfilePhoto } from "./ascendApi";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  getFirebaseToken: vi.fn()
}));

vi.mock("./api", () => ({ api: mocks.api, apiBlob: vi.fn() }));
vi.mock("./authToken", () => ({ getFirebaseToken: mocks.getFirebaseToken }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function profile(id: string) {
  return { user: { id, email: `${id}@example.com`, full_name: id }, roles: [] };
}

beforeEach(() => {
  clearAscendResponseCache();
  mocks.api.mockReset();
  mocks.getFirebaseToken.mockReset();
  mocks.getFirebaseToken.mockResolvedValue("test-token");
});

afterEach(() => {
  clearAscendResponseCache();
  vi.restoreAllMocks();
});

describe("Ascend response cache invalidation", () => {
  it("does not let an invalidated GET refill the cache or remove its replacement request", async () => {
    const oldResponse = deferred<ReturnType<typeof profile>>();
    const freshResponse = deferred<ReturnType<typeof profile>>();
    const getResponses = [oldResponse, freshResponse];
    mocks.api.mockImplementation((path: string) => {
      if (path === "/me") {
        const next = getResponses.shift();
        if (!next) throw new Error("Unexpected third profile request");
        return next.promise;
      }
      if (path === "/me/profile-photo") return Promise.resolve({ profilePhotoUrl: "updated" });
      throw new Error(`Unexpected request: ${path}`);
    });

    const original = getMe();
    await vi.waitFor(() => expect(mocks.api).toHaveBeenCalledWith("/me", {}, "test-token"));
    await saveProfilePhoto("data:image/png;base64,test"); // Invalidates only the me: cache keys.
    const replacement = getMe();
    await vi.waitFor(() => expect(mocks.api.mock.calls.filter(([path]) => path === "/me")).toHaveLength(2));

    oldResponse.resolve(profile("old"));
    expect(await original).toEqual(profile("old"));

    const deduplicated = getMe();
    expect(mocks.api.mock.calls.filter(([path]) => path === "/me")).toHaveLength(2);
    freshResponse.resolve(profile("fresh"));
    expect(await replacement).toEqual(profile("fresh"));
    expect(await deduplicated).toEqual(profile("fresh"));
    expect(await getMe()).toEqual(profile("fresh"));
    expect(mocks.api.mock.calls.filter(([path]) => path === "/me")).toHaveLength(2);
  });

  it("also keeps an old GET from repopulating after a full cache clear", async () => {
    const oldResponse = deferred<ReturnType<typeof profile>>();
    const freshResponse = deferred<ReturnType<typeof profile>>();
    mocks.api.mockReturnValueOnce(oldResponse.promise).mockReturnValueOnce(freshResponse.promise);

    const original = getMe();
    await vi.waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(1));
    clearAscendResponseCache();
    const replacement = getMe();
    await vi.waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(2));

    oldResponse.resolve(profile("old"));
    expect(await original).toEqual(profile("old"));
    const deduplicated = getMe();
    expect(mocks.api).toHaveBeenCalledTimes(2);
    freshResponse.resolve(profile("fresh"));
    expect(await replacement).toEqual(profile("fresh"));
    expect(await deduplicated).toEqual(profile("fresh"));
    expect(await getMe()).toEqual(profile("fresh"));
    expect(mocks.api).toHaveBeenCalledTimes(2);
  });

  it("still deduplicates concurrent GETs and refreshes when the TTL expires", async () => {
    let now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const initialResponse = deferred<ReturnType<typeof profile>>();
    mocks.api.mockReturnValueOnce(initialResponse.promise).mockResolvedValueOnce(profile("after-ttl"));

    const first = getMe();
    const concurrent = getMe();
    await vi.waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(1));
    initialResponse.resolve(profile("initial"));
    expect(await first).toEqual(profile("initial"));
    expect(await concurrent).toEqual(profile("initial"));

    now += 14_999;
    expect(await getMe()).toEqual(profile("initial"));
    expect(mocks.api).toHaveBeenCalledTimes(1);
    now += 1;
    expect(await getMe()).toEqual(profile("after-ttl"));
    expect(mocks.api).toHaveBeenCalledTimes(2);
  });
});

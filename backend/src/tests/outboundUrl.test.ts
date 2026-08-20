import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPublicHttpUrl, isPublicNetworkAddress, readResponseBufferLimited, validatePublicHttpUrl } from "../utils/outboundUrl";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("public outbound URL validation", () => {
  it("allows an HTTP website resolving only to public addresses", async () => {
    const url = await validatePublicHttpUrl("https://gym.example/path", async () => [
      { address: "93.184.216.34", family: 4 }
    ]);
    expect(url.hostname).toBe("gym.example");
  });

  it("blocks local, private, link-local and metadata targets", async () => {
    await expect(validatePublicHttpUrl("http://localhost/admin")).rejects.toThrow("not allowed");
    await expect(validatePublicHttpUrl("http://127.0.0.1/admin")).rejects.toThrow("not allowed");
    await expect(validatePublicHttpUrl("http://169.254.169.254/latest/meta-data")).rejects.toThrow("not allowed");
    await expect(validatePublicHttpUrl("https://gym.example", async () => [
      { address: "10.0.0.12", family: 4 }
    ])).rejects.toThrow("not allowed");
  });

  it("rejects mixed DNS results and non-web protocols", async () => {
    await expect(validatePublicHttpUrl("https://gym.example", async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "192.168.1.12", family: 4 }
    ])).rejects.toThrow("not allowed");
    await expect(validatePublicHttpUrl("file:///etc/passwd")).rejects.toThrow("not allowed");
  });

  it("classifies common reserved network ranges as non-public", () => {
    expect(isPublicNetworkAddress("8.8.8.8")).toBe(true);
    expect(isPublicNetworkAddress("::1")).toBe(false);
    expect(isPublicNetworkAddress("fc00::1")).toBe(false);
    expect(isPublicNetworkAddress("2001:db8::1")).toBe(false);
  });

  it("validates redirect destinations before following them", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, {
      status: 302,
      headers: { location: "http://127.0.0.1/private" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPublicHttpUrl("https://gym.example", {}, {
      resolver: async () => [{ address: "93.184.216.34", family: 4 }]
    })).rejects.toThrow("not allowed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops reading streamed responses at the configured byte limit", async () => {
    const response = new Response(new Uint8Array([1, 2, 3, 4]));
    await expect(readResponseBufferLimited(response, 3)).rejects.toThrow("too large");
  });
});

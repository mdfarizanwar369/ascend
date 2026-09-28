import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
const { requestMock, responses } = vi.hoisted(() => ({ requestMock: vi.fn(), responses: [] as Array<{ status: number; headers?: string[]; body?: string }> }));
vi.mock("node:http", () => ({ request: requestMock }));
vi.mock("node:https", () => ({ request: requestMock }));
import { fetchPublicHttpUrl, isPublicNetworkAddress, readResponseBufferLimited, validatePublicHttpUrl } from "../utils/outboundUrl";

beforeEach(() => {
  responses.length = 0;
  requestMock.mockReset().mockImplementation((_url, _options, callback) => {
    const request = new EventEmitter() as EventEmitter & { end: () => void };
    request.end = () => {
      const response = responses.shift() ?? { status: 200, body: "public image" };
      const stream = Object.assign(Readable.from([Buffer.from(response.body ?? "")]), { statusCode: response.status, rawHeaders: response.headers ?? [] });
      callback(stream);
    };
    return request;
  });
});

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
    responses.push({ status: 302, headers: ["location", "http://127.0.0.1/private"] });

    await expect(fetchPublicHttpUrl("https://gym.example", {}, {
      resolver: async () => [{ address: "93.184.216.34", family: 4 }]
    })).rejects.toThrow("not allowed");
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it.each(["::ffff:7f00:1", "::ffff:127.0.0.1", "::ffff:a9fe:a9fe", "::ffff:192.168.1.1", "2002:7f00:1::", "64:ff9b::7f00:1", "fe80::1%1"])("blocks alternate private and translated address %s", address => {
    expect(isPublicNetworkAddress(address)).toBe(false);
  });

  it.each(["http://[::ffff:127.0.0.1]/", "http://[::ffff:169.254.169.254]/", "http://2130706433/", "http://0x7f000001/"])("rejects normalized internal URL %s without making a request", async url => {
    await expect(fetchPublicHttpUrl(url)).rejects.toThrow("not allowed");
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("pins checked addresses and preserves the original hostname for TLS", async () => {
    const resolver = vi.fn().mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }]).mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    const response = await fetchPublicHttpUrl("https://gym.example/photo", {}, { resolver });
    expect(await response.text()).toBe("public image");
    expect(resolver).toHaveBeenCalledTimes(1);
    const [url, options] = requestMock.mock.calls[0];
    expect(url.hostname).toBe("gym.example");
    expect(options.agent).toBe(false);
    const callback = vi.fn();
    options.lookup("gym.example", {}, callback);
    expect(callback).toHaveBeenLastCalledWith(null, "93.184.216.34", 4);
    options.lookup("gym.example", { all: true }, callback);
    expect(callback).toHaveBeenLastCalledWith(null, [{ address: "93.184.216.34", family: 4 }]);
  });

  it("bounds downloaded bytes before returning a response", async () => {
    responses.push({ status: 200, body: "too many bytes" });
    await expect(fetchPublicHttpUrl("https://gym.example", {}, { resolver: async () => [{ address: "8.8.8.8", family: 4 }], maxResponseBytes: 3 })).rejects.toThrow("too large");
  });

  it("honors cancellation while DNS resolution is still pending", async () => {
    const controller = new AbortController();
    const pending = fetchPublicHttpUrl("https://gym.example", { signal: controller.signal }, {
      resolver: () => new Promise(() => {})
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("rejects invalid upstream status codes without throwing inside a stream callback", async () => {
    responses.push({ status: 600 });
    await expect(fetchPublicHttpUrl("https://gym.example", {}, {
      resolver: async () => [{ address: "8.8.8.8", family: 4 }]
    })).rejects.toThrow("Unexpected response status");
  });

  it("keeps public IPv4, IPv6 and public mapped addresses usable", () => {
    for (const address of ["8.8.8.8", "2606:4700:4700::1111", "::ffff:808:808"]) expect(isPublicNetworkAddress(address)).toBe(true);
  });

  it("stops reading streamed responses at the configured byte limit", async () => {
    const response = new Response(new Uint8Array([1, 2, 3, 4]));
    await expect(readResponseBufferLimited(response, 3)).rejects.toThrow("too large");
  });
});

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import ipaddr from "ipaddr.js";

type ResolvedAddress = { address: string; family: number };
export type HostResolver = (hostname: string) => Promise<ResolvedAddress[]>;

export class UnsafeOutboundUrlError extends Error {
  status = 400;

  constructor() {
    super("Website URL is not allowed.");
    this.name = "UnsafeOutboundUrlError";
  }
}

function isPublicIpv4(address: string) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return false;
  const [first, second, third] = octets;

  if (first === 0 || first === 10 || first === 127 || first >= 224) return false;
  if (first === 100 && second >= 64 && second <= 127) return false;
  if (first === 169 && second === 254) return false;
  if (first === 172 && second >= 16 && second <= 31) return false;
  if (first === 192 && second === 168) return false;
  if (first === 192 && second === 0 && third === 0) return false;
  if (first === 192 && second === 0 && third === 2) return false;
  if (first === 198 && (second === 18 || second === 19)) return false;
  if (first === 198 && second === 51 && third === 100) return false;
  if (first === 203 && second === 0 && third === 113) return false;
  return true;
}

export function isPublicNetworkAddress(address: string) {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (!isIP(normalized) || normalized.includes("%")) return false;
  // Normalize mapped addresses before classification, including their hexadecimal form.
  const parsed = ipaddr.process(normalized);
  if (parsed.kind() === "ipv4") return isPublicIpv4(parsed.toString());
  const ipv6 = parsed as ipaddr.IPv6;
  return ipv6.range() === "unicast" && ipv6.match(ipaddr.IPv6.parseCIDR("2000::/3"));
}

const resolveHost: HostResolver = async (hostname) => {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  return addresses.map(({ address, family }) => ({ address, family }));
};

async function resolvePublicHttpUrl(rawUrl: string, resolver: HostResolver) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeOutboundUrlError();
  }

  if (!["http:", "https:"].includes(url.protocol)) throw new UnsafeOutboundUrlError();
  if (url.username || url.password) throw new UnsafeOutboundUrlError();
  if (url.port && !["80", "443"].includes(url.port)) throw new UnsafeOutboundUrlError();

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new UnsafeOutboundUrlError();
  }

  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await resolver(hostname);
  if (!addresses.length || addresses.some(({ address }) => !isPublicNetworkAddress(address))) {
    throw new UnsafeOutboundUrlError();
  }

  return { url, addresses };
}

export async function validatePublicHttpUrl(rawUrl: string, resolver: HostResolver = resolveHost) {
  return (await resolvePublicHttpUrl(rawUrl, resolver)).url;
}

function withinDeadline<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

// Use the checked DNS results for the actual socket while retaining the original
// hostname for Host and TLS certificate verification. Never resolve a second time.
async function requestPinnedUrl(url: URL, addresses: ResolvedAddress[], init: RequestInit, maxBytes: number, signal: AbortSignal) {
  const method = (init.method ?? "GET").toUpperCase();
  if (!["GET", "HEAD"].includes(method) || init.body) throw new UnsafeOutboundUrlError();
  const headers = new Headers(init.headers);
  headers.set("accept-encoding", "identity");
  headers.delete("host");
  return new Promise<Response>((resolve, reject) => {
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
      method,
      headers: Object.fromEntries(headers.entries()),
      agent: false,
      signal,
      lookup: (_hostname, options, callback) => {
        if (options.all) callback(null, addresses);
        else callback(null, addresses[0].address, addresses[0].family);
      }
    }, (incoming) => {
      const status = incoming.statusCode ?? 502;
      if (status < 200 || status > 599) {
        incoming.destroy();
        reject(new Error("Unexpected response status."));
        return;
      }
      const responseHeaders = new Headers();
      for (let i = 0; i < incoming.rawHeaders.length; i += 2) {
        responseHeaders.append(incoming.rawHeaders[i], incoming.rawHeaders[i + 1]);
      }
      if ([301, 302, 303, 307, 308].includes(status)) {
        incoming.destroy();
        resolve(new Response(null, { status, headers: responseHeaders }));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      incoming.on("error", reject);
      incoming.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) {
          const error = new Error("Response is too large.");
          incoming.destroy(error);
          reject(error);
        } else chunks.push(chunk);
      });
      incoming.on("end", () => {
        const body = method === "HEAD" || [204, 205, 304].includes(status) ? null : new Uint8Array(Buffer.concat(chunks));
        resolve(new Response(body, { status, headers: responseHeaders }));
      });
      if (Number(responseHeaders.get("content-length")) > maxBytes) incoming.destroy(new Error("Response is too large."));
    });
    request.on("error", reject);
    request.end();
  });
}

export async function fetchPublicHttpUrl(
  rawUrl: string,
  init: RequestInit = {},
  options: { maxRedirects?: number; resolver?: HostResolver; maxResponseBytes?: number } = {}
) {
  const maxRedirects = options.maxRedirects ?? 5;
  const maxBytes = options.maxResponseBytes ?? 5 * 1024 * 1024;
  const deadline = AbortSignal.timeout(20_000);
  const signal = init.signal ? AbortSignal.any([init.signal, deadline]) : deadline;
  let nextUrl = rawUrl;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const { url: safeUrl, addresses } = await withinDeadline(resolvePublicHttpUrl(nextUrl, options.resolver ?? resolveHost), signal);
    signal.throwIfAborted();
    const response = await requestPinnedUrl(safeUrl, addresses, init, maxBytes, signal);

    if (![301, 302, 303, 307, 308].includes(response.status)) return response;

    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location || redirectCount === maxRedirects) throw new UnsafeOutboundUrlError();
    nextUrl = new URL(location, safeUrl).toString();
  }

  throw new UnsafeOutboundUrlError();
}

export async function readResponseBufferLimited(response: Response, maxBytes: number) {
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    await response.body?.cancel();
    throw new Error("Response is too large.");
  }

  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new Error("Response is too large.");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, totalBytes);
}

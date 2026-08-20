import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

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
  const family = isIP(normalized);
  if (family === 4) return isPublicIpv4(normalized);
  if (family !== 6) return false;

  const mappedIpv4 = normalized.match(/^(?:::ffff:)(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mappedIpv4) return isPublicIpv4(mappedIpv4);
  if (normalized === "::" || normalized === "::1") return false;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return false;
  if (/^fe[89ab]/.test(normalized)) return false;
  if (normalized.startsWith("ff") || normalized.startsWith("2001:db8")) return false;
  return true;
}

const resolveHost: HostResolver = async (hostname) => {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  return addresses.map(({ address, family }) => ({ address, family }));
};

export async function validatePublicHttpUrl(rawUrl: string, resolver: HostResolver = resolveHost) {
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

  return url;
}

export async function fetchPublicHttpUrl(
  rawUrl: string,
  init: RequestInit = {},
  options: { maxRedirects?: number; resolver?: HostResolver } = {}
) {
  const maxRedirects = options.maxRedirects ?? 5;
  let nextUrl = rawUrl;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const safeUrl = await validatePublicHttpUrl(nextUrl, options.resolver ?? resolveHost);
    const response = await fetch(safeUrl, { ...init, redirect: "manual" });

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

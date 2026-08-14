import { lookup } from "dns/promises";
import { request } from "https";
import { isIP } from "net";
import { recordExternalFailure } from "../observability/logger";

const MAX_REDIRECTS = 3;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 10_000;
const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export class RemoteImageSecurityError extends Error {
  readonly status = 400;
  readonly code: string;

  constructor(code: string, message = "That image source is not allowed.") {
    super(message);
    this.name = "RemoteImageSecurityError";
    this.code = code;
  }
}

function normalizedHostname(hostname: string) {
  return hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

function ipv4Octets(address: string) {
  const octets = address.split(".").map(Number);
  return octets.length === 4 && octets.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)
    ? octets
    : null;
}

export function isPublicNetworkAddress(address: string) {
  const normalized = normalizedHostname(address).split("%")[0];
  const version = isIP(normalized);
  if (version === 4) {
    const octets = ipv4Octets(normalized)!;
    const [a, b, c] = octets;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 192 && b === 0 && c === 0) return false;
    if (a === 192 && b === 0 && c === 2) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    if (a === 198 && b === 51 && c === 100) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    return true;
  }

  if (version === 6) {
    const value = normalized.toLowerCase();
    if (value === "::" || value === "::1") return false;
    if (value.startsWith("fc") || value.startsWith("fd")) return false;
    if (/^fe[89ab]/.test(value)) return false;
    if (value.startsWith("ff")) return false;
    if (value.startsWith("2001:db8")) return false;

    const mapped = value.match(/(?:^|:)ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPublicNetworkAddress(mapped[1]);
    return true;
  }

  return false;
}

function parseAllowlist(value = process.env.FOOD_AI_REMOTE_IMAGE_HOSTS ?? "") {
  return new Set(value.split(",").map(normalizedHostname).filter(Boolean));
}

export function validateRemoteImageUrl(value: string, allowedHosts = parseAllowlist()) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new RemoteImageSecurityError("INVALID_URL");
  }

  const hostname = normalizedHostname(url.hostname);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    throw new RemoteImageSecurityError("UNSAFE_URL_SCHEME");
  }
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || !allowedHosts.has(hostname)) {
    throw new RemoteImageSecurityError("HOST_NOT_ALLOWED");
  }
  if (isIP(hostname) && !isPublicNetworkAddress(hostname)) {
    throw new RemoteImageSecurityError("NON_PUBLIC_DESTINATION");
  }
  return url;
}

async function resolvePublicAddresses(hostname: string) {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicNetworkAddress(address))) {
    throw new RemoteImageSecurityError("NON_PUBLIC_DESTINATION");
  }
  return addresses;
}

function readHttpsImage(input: {
  url: URL;
  address: string;
  family: number;
  maxBytes: number;
  timeoutMs: number;
}) {
  return new Promise<{ buffer: Buffer; contentType: string; location: string | null }>((resolve, reject) => {
    const req = request(input.url, {
      method: "GET",
      headers: { Accept: "image/jpeg,image/png,image/webp" },
      servername: input.url.hostname,
      lookup: (_hostname, _options, callback) => callback(null, input.address, input.family)
    }, (response) => {
      const location = response.headers.location ?? null;
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && location) {
        response.resume();
        resolve({ buffer: Buffer.alloc(0), contentType: "", location });
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new RemoteImageSecurityError("REMOTE_RESPONSE_REJECTED", "The image could not be retrieved."));
        return;
      }

      const contentType = String(response.headers["content-type"] ?? "").split(";", 1)[0].trim().toLowerCase();
      if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
        response.resume();
        reject(new RemoteImageSecurityError("UNSUPPORTED_CONTENT_TYPE", "The remote file is not a supported image."));
        return;
      }
      const contentLength = Number(response.headers["content-length"] ?? 0);
      if (contentLength > input.maxBytes) {
        response.destroy();
        reject(new RemoteImageSecurityError("IMAGE_TOO_LARGE", "The remote image is too large."));
        return;
      }

      const chunks: Buffer[] = [];
      let total = 0;
      response.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total > input.maxBytes) {
          response.destroy(new RemoteImageSecurityError("IMAGE_TOO_LARGE", "The remote image is too large."));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => resolve({ buffer: Buffer.concat(chunks), contentType, location: null }));
      response.on("error", reject);
    });

    req.setTimeout(input.timeoutMs, () => req.destroy(new RemoteImageSecurityError("REMOTE_TIMEOUT", "The image request timed out.")));
    req.on("error", reject);
    req.end();
  });
}

export async function loadSafeRemoteImage(
  value: string,
  options: { allowedHosts?: Set<string>; maxBytes?: number; timeoutMs?: number } = {}
) {
  const allowedHosts = options.allowedHosts ?? parseAllowlist();
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let current = validateRemoteImageUrl(value, allowedHosts);

  try {
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
      const addresses = await resolvePublicAddresses(current.hostname);
      const selected = addresses[0];
      const result = await readHttpsImage({
        url: current,
        address: selected.address,
        family: selected.family,
        maxBytes,
        timeoutMs
      });
      if (!result.location) return { buffer: result.buffer, contentType: result.contentType, finalUrl: current.toString() };
      if (redirect === MAX_REDIRECTS) throw new RemoteImageSecurityError("TOO_MANY_REDIRECTS");
      current = validateRemoteImageUrl(new URL(result.location, current).toString(), allowedHosts);
    }
  } catch (error) {
    recordExternalFailure("remote_image", error instanceof RemoteImageSecurityError ? error.code : "FETCH_FAILED");
    throw error;
  }

  throw new RemoteImageSecurityError("REMOTE_RESPONSE_REJECTED");
}

import { describe, expect, it } from "vitest";
import { parseBearerToken } from "../middleware/auth";
import { imageContentTypeSchema, imageDataUrlSchema, MAX_IMAGE_BYTES, parseImageDataUrl, validateImageDataUrl } from "../utils/images";
import { isPublicNetworkAddress, RemoteImageSecurityError, validateRemoteImageUrl } from "../security/safeRemoteImage";
import sharp from "sharp";

describe("security input validation", () => {
  it("accepts only a correctly formatted bearer token", () => {
    expect(parseBearerToken("Bearer valid-token")).toBe("valid-token");
    expect(parseBearerToken("bearer valid-token")).toBe("valid-token");
    expect(parseBearerToken("prefix Bearer valid-token")).toBeNull();
    expect(parseBearerToken("Bearer two tokens")).toBeNull();
    expect(parseBearerToken(undefined)).toBeNull();
  });

  it("allows supported images and rejects active or unexpected formats", async () => {
    const buffer = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).jpeg().toBuffer();
    const jpeg = `data:image/jpeg;base64,${buffer.toString("base64")}`;
    expect(imageDataUrlSchema.safeParse(jpeg).success).toBe(true);
    expect(parseImageDataUrl(jpeg).contentType).toBe("image/jpeg");
    await expect(validateImageDataUrl(jpeg)).resolves.toMatchObject({ contentType: "image/jpeg", width: 2, height: 2 });
    expect(imageContentTypeSchema.safeParse("image/svg+xml").success).toBe(false);
    expect(imageDataUrlSchema.safeParse("data:image/svg+xml;base64,PHN2Zz4=").success).toBe(false);
  });

  it("rejects disguised, malformed, and truncated image files", async () => {
    const disguised = `data:image/jpeg;base64,${Buffer.from("not a jpeg").toString("base64")}`;
    await expect(validateImageDataUrl(disguised)).rejects.toThrow(/contents do not match/i);

    const pngHeaderOnly = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await expect(validateImageDataUrl(`data:image/png;base64,${pngHeaderOnly.toString("base64")}`)).rejects.toThrow(/malformed|truncated/i);

    const webpDisguisedAsPng = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP")]);
    await expect(validateImageDataUrl(`data:image/png;base64,${webpDisguisedAsPng.toString("base64")}`)).rejects.toThrow(/contents do not match/i);
  });

  it("rejects decoded images above the upload limit", () => {
    const oversized = `data:image/jpeg;base64,${Buffer.alloc(MAX_IMAGE_BYTES + 1).toString("base64")}`;
    expect(imageDataUrlSchema.safeParse(oversized).success).toBe(false);
  });

  it("rejects unsupported signatures and excessive dimensions", async () => {
    const gif = `data:image/jpeg;base64,${Buffer.from("GIF89a").toString("base64")}`;
    await expect(validateImageDataUrl(gif)).rejects.toThrow(/contents do not match/i);

    const tooWide = await sharp({ create: { width: 8001, height: 1, channels: 3, background: "white" } }).png().toBuffer();
    await expect(validateImageDataUrl(`data:image/png;base64,${tooWide.toString("base64")}`)).rejects.toThrow(/dimensions/i);
  });
});

describe("remote image SSRF protection", () => {
  const allowed = new Set(["images.example.com", "127.0.0.1", "::1", "169.254.169.254"]);

  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "0.0.0.0",
    "::1",
    "fc00::1",
    "fe80::1",
    "ff02::1",
    "2001:db8::1",
    "::ffff:127.0.0.1"
  ])("rejects non-public destination %s", (address) => {
    expect(isPublicNetworkAddress(address)).toBe(false);
  });

  it("allows a public address and exact allowlisted HTTPS host", () => {
    expect(isPublicNetworkAddress("8.8.8.8")).toBe(true);
    expect(validateRemoteImageUrl("https://images.example.com/meal.jpg", allowed).hostname).toBe("images.example.com");
  });

  it.each([
    "http://images.example.com/meal.jpg",
    "https://user:pass@images.example.com/meal.jpg",
    "https://images.example.com:8443/meal.jpg",
    "https://evil.example.com/meal.jpg",
    "https://images.example.com.evil.test/meal.jpg",
    "https://127.0.0.1/meal.jpg",
    "https://2130706433/meal.jpg",
    "https://169.254.169.254/latest/meta-data"
  ])("rejects unsafe URL %s", (url) => {
    expect(() => validateRemoteImageUrl(url, allowed)).toThrow(RemoteImageSecurityError);
  });
});

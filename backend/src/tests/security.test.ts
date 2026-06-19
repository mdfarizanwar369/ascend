import { describe, expect, it } from "vitest";
import { parseBearerToken } from "../middleware/auth";
import { imageContentTypeSchema, imageDataUrlSchema, MAX_IMAGE_BYTES, parseImageDataUrl } from "../utils/images";

describe("security input validation", () => {
  it("accepts only a correctly formatted bearer token", () => {
    expect(parseBearerToken("Bearer valid-token")).toBe("valid-token");
    expect(parseBearerToken("bearer valid-token")).toBe("valid-token");
    expect(parseBearerToken("prefix Bearer valid-token")).toBeNull();
    expect(parseBearerToken("Bearer two tokens")).toBeNull();
    expect(parseBearerToken(undefined)).toBeNull();
  });

  it("allows supported images and rejects active or unexpected formats", () => {
    const jpeg = `data:image/jpeg;base64,${Buffer.from("image").toString("base64")}`;
    expect(imageDataUrlSchema.safeParse(jpeg).success).toBe(true);
    expect(parseImageDataUrl(jpeg).contentType).toBe("image/jpeg");
    expect(imageContentTypeSchema.safeParse("image/svg+xml").success).toBe(false);
    expect(imageDataUrlSchema.safeParse("data:image/svg+xml;base64,PHN2Zz4=").success).toBe(false);
  });

  it("rejects decoded images above the upload limit", () => {
    const oversized = `data:image/jpeg;base64,${Buffer.alloc(MAX_IMAGE_BYTES + 1).toString("base64")}`;
    expect(imageDataUrlSchema.safeParse(oversized).success).toBe(false);
  });
});

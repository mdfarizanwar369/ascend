import { describe, expect, it } from "vitest";
import { storageKeyBelongsToUser } from "../utils/storageOwnership";

describe("storage object ownership", () => {
  it("accepts an object created in the authenticated user's namespace", () => {
    expect(storageKeyBelongsToUser("food/member-1/photo.jpg", "food", "member-1")).toBe(true);
  });

  it("rejects another user's object and a prefix-only key", () => {
    expect(storageKeyBelongsToUser("progress/member-2/photo.jpg", "progress", "member-1")).toBe(false);
    expect(storageKeyBelongsToUser("progress/member-1/", "progress", "member-1")).toBe(false);
  });

  it("does not confuse similar user identifiers", () => {
    expect(storageKeyBelongsToUser("body-composition/member-10/scan.jpg", "body-composition", "member-1")).toBe(false);
  });

  it("supports separately checking an authorized actor namespace", () => {
    const key = "body-composition/trainer-123/scan.jpg";
    expect(storageKeyBelongsToUser(key, "body-composition", "client-456")).toBe(false);
    expect(storageKeyBelongsToUser(key, "body-composition", "trainer-123")).toBe(true);
  });
});

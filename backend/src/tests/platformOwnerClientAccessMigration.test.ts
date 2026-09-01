import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Platform Owner Client 360 audit migration", () => {
  const sql = readFileSync(join(__dirname, "../../migrations/038_ascend_coach_platform_owner_client_access.sql"), "utf8");

  it("adds only the two explicit owner-read audit events", () => {
    expect(sql).toContain("platform_owner_client_list_viewed");
    expect(sql).toContain("platform_owner_client_read");
    expect(sql).not.toMatch(/drop\s+table|truncate|delete\s+from/i);
  });
});

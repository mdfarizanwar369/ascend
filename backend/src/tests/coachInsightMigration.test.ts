import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Ascend Coach Insight cache migration", () => {
  const sql = readFileSync(join(__dirname, "../../migrations/037_ascend_coach_insight_cache.sql"), "utf8");

  it("is additive and authorization-bound", () => {
    expect(sql).toContain("create table if not exists ascend_coach_client_insights");
    for (const field of ["actor_user_id", "client_user_id", "relationship_id", "authorization_version", "scope_fingerprint", "source_fingerprint", "snapshot_schema_version", "prompt_version", "provider", "model", "expires_at"]) {
      expect(sql).toContain(field);
    }
    expect(sql).not.toMatch(/create table.*program|create table.*week|create table.*session/is);
  });
});

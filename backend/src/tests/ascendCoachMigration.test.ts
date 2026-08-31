import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(path.resolve(__dirname, "../../migrations/036_ascend_coach_foundation.sql"), "utf8").toLowerCase();

describe("Ascend Coach foundation migration", () => {
  it("is additive and defines the consent, audit, pilot, and break-glass foundation", () => {
    expect(migration).toContain("create table if not exists trainer_client_relationships");
    expect(migration).toContain("create table if not exists ascend_coach_access_audit_events");
    expect(migration).toContain("create table if not exists ascend_coach_pilot_access");
    expect(migration).toContain("create table if not exists ascend_coach_break_glass_grants");
    expect(migration).not.toMatch(/drop\s+table/);
    expect(migration).not.toMatch(/alter\s+table\s+(users|analytics_events)\s+drop/);
  });

  it("backfills current assignments with explicit legacy provenance and full legacy scopes", () => {
    expect(migration).toContain("'legacy_assigned_trainer'");
    expect(migration).toContain("join trainers t on t.id = u.assigned_trainer_id");
    expect(migration).toContain("where u.assigned_trainer_id is not null");
    for (const scope of ["profile", "training", "nutrition", "body", "recovery", "progress_photos"]) {
      expect(migration).toContain(`'${scope}'`);
    }
  });

  it("makes relationship changes invalidate authorization and project the temporary legacy pointer", () => {
    expect(migration).toContain("authorization_version = old.authorization_version + 1");
    expect(migration).toContain("sync_assigned_trainer_projection_for_client");
    expect(migration).toContain("assigned_trainer_id = projected_trainer_id");
  });

  it("does not create workouts, programs, exercise catalogs, or client intelligence models", () => {
    expect(migration).not.toContain("training_programs");
    expect(migration).not.toContain("exercise_definitions");
    expect(migration).not.toContain("client_intelligence");
    expect(migration).not.toContain("program_weeks");
  });
});

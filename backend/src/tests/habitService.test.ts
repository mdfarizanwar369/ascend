import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbQuery } = vi.hoisted(() => ({ dbQuery: vi.fn() }));

vi.mock("../db/pool", () => ({ query: dbQuery }));

import { createOwnedHabitLog } from "../services/habitService";

describe("habit ownership", () => {
  beforeEach(() => dbQuery.mockReset());

  it("inserts only through a habit owned by the authenticated user", async () => {
    dbQuery.mockResolvedValue({ rows: [{ id: "log-id" }] });

    await expect(createOwnedHabitLog("user-id", {
      habitId: "habit-id",
      completed: true
    })).resolves.toEqual({ id: "log-id" });

    expect(dbQuery).toHaveBeenCalledWith(
      expect.stringContaining("where h.id = $2 and h.user_id = $1 and h.active = true"),
      ["user-id", "habit-id", true, null]
    );
  });

  it("returns null when the habit is not owned by the user", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await expect(createOwnedHabitLog("user-id", {
      habitId: "another-users-habit",
      completed: true
    })).resolves.toBeNull();
  });
});

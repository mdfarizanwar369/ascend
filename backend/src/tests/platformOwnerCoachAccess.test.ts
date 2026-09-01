import { beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("../db/pool", () => ({ query }));
vi.mock("../config/env", () => ({ env: { BOOTSTRAP_OWNER_EMAIL: "owner@example.com" } }));

import { ensurePlatformOwnerCoachAccess } from "../services/platformOwnerService";

describe("Platform Owner coach capability", () => {
  beforeEach(() => query.mockReset());

  it("adds Trainer without replacing Owner/Admin and creates an active trainer profile", async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "trainer-profile" }] });

    await expect(ensurePlatformOwnerCoachAccess("owner-user", "gym-central")).resolves.toBe("trainer-profile");

    expect(String(query.mock.calls[0]?.[0])).toContain("'owner'), ($1, 'admin')");
    expect(String(query.mock.calls[1]?.[0])).toContain("'trainer'");
    expect(String(query.mock.calls[2]?.[0])).toContain("on conflict (user_id) do update");
    expect(String(query.mock.calls[2]?.[0])).toContain("status = 'active'");
    expect(query.mock.calls[2]?.[1]).toEqual(["owner-user", "gym-central"]);
  });

  it("does not create a trainer profile when the owner has no gym", async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await expect(ensurePlatformOwnerCoachAccess("owner-user", null)).resolves.toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
  });
});

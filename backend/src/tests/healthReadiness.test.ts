import { describe, expect, it, vi } from "vitest";
import { databaseReadiness } from "../routes/health";

describe("database readiness", () => {
  it("reports ready only after a successful database probe", async () => {
    const check = vi.fn().mockResolvedValue({ rows: [{ ready: 1 }] });

    await expect(databaseReadiness(check)).resolves.toEqual({ ready: true, status: 200 });
    expect(check).toHaveBeenCalledTimes(1);
  });

  it("reports unavailable without exposing database errors", async () => {
    const check = vi.fn().mockRejectedValue(new Error("sensitive connection detail"));

    await expect(databaseReadiness(check)).resolves.toEqual({ ready: false, status: 503 });
  });
});

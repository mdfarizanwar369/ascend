import { afterEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware/errors";

describe("production API error logging", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("does not log raw exception messages or return them to the client", () => {
    vi.stubEnv("NODE_ENV", "production");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const status = vi.fn().mockReturnThis();
    const json = vi.fn().mockReturnThis();
    const error = Object.assign(new Error("private database value"), { code: "XX999" });

    errorHandler(
      error,
      { method: "GET", path: "/private" } as never,
      { status, json } as never,
      vi.fn()
    );

    expect(consoleError).toHaveBeenCalledWith("[api-error]", {
      method: "GET",
      path: "/private",
      errorName: "Error",
      errorCode: "XX999"
    });
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({ error: "Internal server error", detail: undefined });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const { poolInstance, structuredLog } = vi.hoisted(() => {
  let errorHandler: ((error: Error) => void) | null = null;
  return {
    poolInstance: {
      query: vi.fn(),
      connect: vi.fn(),
      end: vi.fn(),
      on: vi.fn((event: string, handler: (error: Error) => void) => {
        if (event === "error") errorHandler = handler;
      }),
      emitError: (error: Error) => errorHandler?.(error)
    },
    structuredLog: vi.fn()
  };
});

vi.mock("pg", () => ({
  Pool: class {
    constructor() {
      return poolInstance;
    }
  }
}));
vi.mock("../observability/logger", () => ({ structuredLog }));
vi.mock("../config/env", () => ({
  env: {
    DATABASE_URL: "postgres://verification.invalid/ascend",
    DB_POOL_MAX: 2,
    DB_CONNECTION_TIMEOUT_MS: 500,
    DB_IDLE_TIMEOUT_MS: 1_000,
    DB_STATEMENT_TIMEOUT_MS: 1_000,
    NODE_ENV: "test"
  }
}));

describe("database pool recovery", () => {
  beforeEach(() => {
    vi.resetModules();
    structuredLog.mockReset();
    poolInstance.on.mockClear();
  });

  it("handles idle client errors without throwing from the emitter", async () => {
    await import("../db/pool");
    const error = Object.assign(new Error("database stopped"), { code: "57P01" });

    expect(() => poolInstance.emitError(error)).not.toThrow();
    expect(structuredLog).toHaveBeenCalledWith("error", "database_pool_idle_client_error", { error });
  });
});

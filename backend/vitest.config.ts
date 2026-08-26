import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/tests/**/*.test.ts"],
    exclude: ["dist/**", "node_modules/**"],
    maxWorkers: 2,
    testTimeout: 15_000,
    env: {
      DATABASE_URL: "postgres://test:test@localhost:5432/ascend_test"
    }
  }
});

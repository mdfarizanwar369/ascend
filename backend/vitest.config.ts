import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/tests/**/*.test.ts"],
    exclude: ["dist/**", "node_modules/**"],
    env: {
      DATABASE_URL: "postgres://test:test@localhost:5432/ascend_test"
    }
  }
});

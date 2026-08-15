import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["src/tests/setup.ts"],
    include: ["src/tests/**/*.test.ts"],
    exclude: ["dist/**", "node_modules/**"]
  }
});

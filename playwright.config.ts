import { defineConfig, devices } from "@playwright/test";

const frontendPort = Number(process.env.ASCEND_E2E_FRONTEND_PORT ?? 3100);

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${frontendPort}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  outputDir: "test-results/playwright",
  webServer: {
    command: `npx next dev frontend -p ${frontendPort}`,
    url: `http://localhost:${frontendPort}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      PORT: String(frontendPort),
      NEXT_PUBLIC_API_URL: `http://localhost:${frontendPort}/api/v1`,
      NEXT_PUBLIC_ASCEND_E2E_AUTH_TOKEN: "ascend-e2e-local-token",
      NEXT_PUBLIC_ASCEND_COACH_V1: "true",
      NEXT_PUBLIC_TRAINER_HOMEWORK_V1: "true",
      NEXT_PUBLIC_TRAINER_SESSION_CAPTURE_V1: "true",
      NEXT_PUBLIC_WORKOUT_CAPTURE_V1: "true",
      NEXT_PUBLIC_WORKOUT_PROGRESSION_INTELLIGENCE_V3: "true",
      NEXT_PUBLIC_COACH_ZOE_WORKOUT_DEBRIEF_V1: "true",
      NEXT_PUBLIC_FIREBASE_API_KEY: "e2e-local-only",
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "localhost",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "ascend-e2e",
      NEXT_PUBLIC_FIREBASE_APP_ID: "ascend-e2e"
    }
  },
  projects: [
    { name: "mobile-390", use: { ...devices["Pixel 5"], viewport: { width: 390, height: 844 } } },
    { name: "tablet-768", use: { viewport: { width: 768, height: 1024 } } },
    { name: "desktop-1440", use: { viewport: { width: 1440, height: 1000 } } }
  ]
});

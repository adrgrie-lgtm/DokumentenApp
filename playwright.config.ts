import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env["E2E_BASE_URL"] ?? "http://localhost:8080";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? [["list"], ["html", { open: "never" }]] : [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  // In CI läuft noch kein Dev-Server – Playwright startet ihn selbst.
  webServer: {
    command: "bun run dev",
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 180_000,
  },

  outputDir: "test-results",
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1280, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "public",
      testMatch: /(landing|login)\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "authenticated",
      testMatch: /(dashboard|upload|pdf-preview)\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/state.json",
      },
    },
  ],
});

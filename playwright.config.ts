import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;
const IS_CI = Boolean(process.env.CI);

/**
 * End-to-end tests boot the real game in headless Chromium against the
 * Vite dev server. WebGL runs on SwiftShader (software) in headless mode,
 * which recent Chromium versions only allow behind an explicit flag.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: IS_CI,
  retries: IS_CI ? 1 : 0,
  reporter: IS_CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: [
            "--use-angle=swiftshader",
            "--use-gl=angle",
            "--enable-unsafe-swiftshader",
          ],
        },
      },
    },
  ],
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !IS_CI,
    timeout: 60_000,
  },
});

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
  /*
   * 60 s rather than the 30 s default. Two specs play a whole mission out
   * turn by turn, which is tens of seconds of rendered frames, and the CI
   * runner is four to five times slower than a dev container: the same
   * suite takes about a minute here and 4.7 minutes there. A timeout is
   * a harness budget, not an assertion, and `--fail-on-flaky-tests`
   * (#584) still fails a spec that is genuinely unreliable.
   */
  timeout: 60_000,
  /*
   * Assertions get the same allowance the test timeout above already
   * makes for the runner (#690). Playwright's default is 5 s and is
   * separate from `timeout`, so raising only the harness budget left
   * every `toHaveAttribute` and `toBeVisible` in the suite judged on a
   * fast machine's clock — and on a runner four to five times slower, a
   * wait with four seconds of headroom locally has well under one.
   *
   * That is how `tactical-hud.spec.ts` came back flaky on a branch whose
   * only changes were doc comments: the page was `ready` and the units
   * had simply not been placed within five seconds of a 4.8 minute run.
   *
   * It weakens nothing. A genuinely broken assertion still fails, just
   * later, and the 60 s per-test ceiling still bounds it.
   */
  expect: { timeout: IS_CI ? 15_000 : 5_000 },
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

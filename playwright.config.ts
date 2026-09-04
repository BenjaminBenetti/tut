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
  fullyParallel: true,
  /*
   * Four workers locally, the runner's own default on CI (#578).
   *
   * Playwright defaults to half the cores, which is 16 in this dev
   * container — a box nine agents share. Measured at load average 63 on
   * 32 cores, a full run came back `7 flaky` across seven unrelated
   * specs at 2.7 minutes; alone it is 59 passed in 1.1. The specs that
   * fall over are simply the ones with the tightest timing budgets, so
   * hardening them one at a time treats the symptom.
   *
   * The cap is close to free: 4 workers ran the suite in 65 s against
   * 62 s at 16, because the suite is bound by per-spec setup and one
   * shared Vite server rather than by CPU. Three seconds to stop
   * twelve browsers competing for cores that are already gone.
   *
   * CI keeps the default: a GitHub runner has 2-4 cores, so half of
   * them is already 1-2, and pinning 4 there would oversubscribe it.
   */
  workers: IS_CI ? undefined : 4,
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

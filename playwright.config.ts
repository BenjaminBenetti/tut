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
  timeout: IS_CI ? 120_000 : 60_000,
  /*
   * 120 s on CI (#793). On 2026-09-05 seven e2e jobs went red on the
   * same shape — a tactical spec's first mount blowing the 60 s budget,
   * then passing on retry — four of them on `main` itself, two on a
   * docs-only PR. The suite's own wall time had gone from ~7 to ~9.5 min
   * on the runner after #776 made the first tactical mount heavier, and
   * a 60 s budget that was 4-5x local headroom no longer was. The budget
   * is the harness's, not an assertion's: `--fail-on-flaky-tests` still
   * fails a spec that needs its retry, and a genuine hang still fails,
   * at 120 s instead of 60. Locally the 60 s stays: a stall here is a
   * bug to look at, not a runner to wait for.
   */
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
   * CI runs one worker, pinned rather than "half the cores" (#793). A
   * GitHub runner has 2-4 cores, so the default was already 1 or 2 and
   * the suite's 8-9 minute wall time says it was mostly 1 — but "mostly"
   * is the problem: two headless Chromiums each rendering a tactical
   * first mount on SwiftShader is exactly the CPU contention #700 removed
   * locally, and the runner has no spare core to absorb it. Pinning to 1
   * costs nothing when the default was 1 and removes the case where it
   * was not. The stall this guards against is first-mount CPU work, not
   * per-spec setup, so the local reasoning above does not transfer.
   */
  workers: IS_CI ? 1 : 4,
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

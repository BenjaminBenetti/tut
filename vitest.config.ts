import { defineConfig } from "vitest/config";

/**
 * Vitest runs unit tests that sit beside the code they test
 * (`src/**\/*.test.ts`). Simulation code is pure TypeScript, so the
 * default environment is Node; a presentation test may opt into a DOM
 * environment per file with a `@vitest-environment` docblock.
 *
 * `testTimeout` is raised from the 5 s default because map generation
 * dominates this suite: seven mapgen cases sit between 1 s and 3 s on an
 * idle box, and a CI runner sharing a machine with headless Blender took
 * one of them past 5 s and turned a run red (#644). The budget is there
 * to survive a loaded runner, not to let a slow generator through — the
 * property sweep keeps its own tighter budget for that.
 *
 * On CI the budget is 120 s since ADR 0009 (#829, 2026-09-06). Map presets
 * went 32²/48²/64² → 48²/72²/96², and every test that generates maps
 * scaled with them. Measured on an idle dev box after #838 merged:
 *
 * ```
 *   connectivity-pass          14.8 s   ("every generated map satisfies all eight invariants")
 *   hook-pass                  11.1 s   (I6, I8 across the matrix)
 *   slope-pass                 11.1 s
 *   objective-reachability      9.8 s   (already cut to four seeds on CI, #852)
 *   elevation-pass              8.7 s
 *   map-assessment-service      7.9 s
 *   ramp-pass                   6.1 s
 *   lot-pass                    5.9 s
 * ```
 *
 * The runner is four to five times slower, so anything over ~4 s here
 * straddles 20 s there: two docs-only PRs went red in a row on
 * `objective-reachability` and then `hook-pass`, each having passed on
 * the previous run. Locally 20 s stays, so a slow generator is still a
 * bug to look at; on the runner the budget covers the slowest measured
 * case with headroom. Cutting each matrix under `CI`, the way #838 did for
 * the generation sweep, is the better fix and is MapGen's to do per test.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // The seeded sweep (#343) plays whole missions and takes seconds per
    // seed; it runs under `pnpm test:sim` with its own config.
    exclude: ["**/node_modules/**", "src/**/*.sim.test.ts"],
    environment: "node",
    testTimeout: process.env.CI === undefined ? 20_000 : 120_000,
  },
});

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
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // The seeded sweep (#343) plays whole missions and takes seconds per
    // seed; it runs under `pnpm test:sim` with its own config.
    exclude: ["**/node_modules/**", "src/**/*.sim.test.ts"],
    environment: "node",
    testTimeout: 20_000,
  },
});

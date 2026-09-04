import { defineConfig } from "vitest/config";

/**
 * The seeded simulation sweep (#343): `pnpm test:sim`.
 *
 * Kept out of `pnpm test` by file name rather than by directory, so a
 * sweep sits beside the code it exercises like every other test. It plays
 * dozens of whole missions through the real rules, which costs seconds
 * rather than milliseconds — too slow to sit in the suite a developer
 * runs on every save, and too valuable to run only by hand.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.sim.test.ts"],
    environment: "node",
    // One mission is tens of turns of real rules; the default 5 s cuts a
    // sweep off mid-run and reports it as a timeout rather than a result.
    testTimeout: 600_000,
    // The sweep plays its missions in `beforeAll`; without this it dies
    // at the 10 s default before a single seed finishes.
    hookTimeout: 600_000,
  },
});

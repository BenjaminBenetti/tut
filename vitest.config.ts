import { defineConfig } from "vitest/config";

/**
 * Vitest runs unit tests that sit beside the code they test
 * (`src/**\/*.test.ts`). Simulation code is pure TypeScript, so the
 * default environment is Node; a presentation test may opt into a DOM
 * environment per file with a `@vitest-environment` docblock.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});

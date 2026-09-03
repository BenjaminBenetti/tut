import { resolve } from "node:path";

import { defineConfig } from "vite";

/**
 * `TUT_BASE_PATH` is set by the release workflow to `/tut/` so a GitHub
 * Pages deploy resolves assets under the repository sub-path. Local dev,
 * tests, and the default build use `/`.
 */
const base = process.env.TUT_BASE_PATH ?? "/";

/**
 * Every HTML entry the build emits. The dev server serves any HTML file
 * at the root, but Rollup only bundles the pages listed here, so a new
 * page (ADR 0004 §7.5 preview harness convention) is added in this map.
 *
 * ```
 *   index.html           ──► src/main.ts              the game
 *   mapgen-preview.html  ──► src/mapgen-preview.ts    map generation preview
 * ```
 */
const pages = {
  main: resolve(import.meta.dirname, "index.html"),
  "mapgen-preview": resolve(import.meta.dirname, "mapgen-preview.html"),
};

export default defineConfig({
  base,
  build: {
    rollupOptions: {
      input: pages,
    },
  },
  server: {
    // Bind to all interfaces so the dev server is reachable from
    // outside the dev container.
    host: true,
    port: 5173,
  },
});

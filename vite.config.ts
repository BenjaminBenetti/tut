import { defineConfig } from "vite";

/**
 * `TUT_BASE_PATH` is set by the release workflow to `/tut/` so a GitHub
 * Pages deploy resolves assets under the repository sub-path. Local dev,
 * tests, and the default build use `/`.
 */
const base = process.env.TUT_BASE_PATH ?? "/";

export default defineConfig({
  base,
  server: {
    // Bind to all interfaces so the dev server is reachable from
    // outside the dev container.
    host: true,
    port: 5173,
  },
});

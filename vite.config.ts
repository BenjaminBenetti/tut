import { defineConfig } from "vite";

export default defineConfig({
  server: {
    // Bind to all interfaces so the dev server is reachable from
    // outside the dev container.
    host: true,
    port: 5173,
  },
});

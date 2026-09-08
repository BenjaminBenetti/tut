/** Stable art captures must not reload when another process updates pnpm's store. */
export default {
  cacheDir: "node_modules/.vite-art-capture",
  server: { watch: null, hmr: false },
};

/**
 * Read-only static server over the repository root, shared by the preview
 * scripts so `harness.html` can import three.js from `node_modules` and load
 * assets from `public/` through plain relative URLs.
 */
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path of the repository root. */
export const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

/** MIME types the preview pages need. */
const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".glb": "model/gltf-binary",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

/**
 * Starts serving the repository root on a loopback port.
 * @param {number} port - Port to listen on.
 * @returns {Promise<import("node:http").Server>} Listening server; call `close()` when done.
 */
export function serveRepo(port) {
  const server = createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const path = resolve(REPO_ROOT, `.${pathname}`);
    if (
      !path.startsWith(REPO_ROOT) ||
      !existsSync(path) ||
      statSync(path).isDirectory()
    ) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      "content-type": MIME[extname(path)] ?? "application/octet-stream",
    });
    createReadStream(path).pipe(res);
  });
  return new Promise((done) =>
    server.listen(port, "127.0.0.1", () => done(server)),
  );
}

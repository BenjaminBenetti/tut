#!/usr/bin/env node
/**
 * Screenshots a page from this repo with headless Chromium.
 *
 *   node tools/art/preview/shoot-page.mjs <repo-relative page> <out.png> [width] [height]
 *
 * Serves the repo root on a local port so relative links resolve, then
 * captures the full page. Used for `docs/design/ui-theme-preview.png`.
 */
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const [page, out, width = "1100", height = "900"] = process.argv.slice(2);
const PORT = 8791;

/** MIME types the preview pages need. */
const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

/**
 * Serves files under the repo root read-only.
 * @returns {Promise<import("node:http").Server>} Listening server.
 */
function serveRepo() {
  const server = createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const path = resolve(repoRoot, `.${pathname}`);
    if (
      !path.startsWith(repoRoot) ||
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
    server.listen(PORT, "127.0.0.1", () => done(server)),
  );
}

/**
 * Entry point: opens the page and writes a full-page screenshot.
 */
async function main() {
  if (!page || !out)
    throw new Error("usage: shoot-page.mjs <page> <out.png> [w] [h]");
  const { chromium } = await import("@playwright/test");
  const server = await serveRepo();
  const browser = await chromium.launch();
  const tab = await browser.newPage({
    viewport: { width: Number(width), height: Number(height) },
  });
  await tab.goto(`http://127.0.0.1:${PORT}/${page}`);
  await tab.waitForLoadState("networkidle");
  await tab.screenshot({ path: resolve(repoRoot, out), fullPage: true });
  await browser.close();
  server.close();
  console.log(`screenshot → ${out}`);
}

await main();

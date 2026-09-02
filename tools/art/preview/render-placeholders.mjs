#!/usr/bin/env node
/**
 * Renders every placeholder model in `tools/art/placeholders.manifest.json`
 * from two isometric yaws and writes one PNG per view.
 *
 *   node tools/art/preview/render-placeholders.mjs [--out tools/art/preview/out]
 *
 * Needs `@playwright/test` with Chromium installed (devcontainer). Serves the repo
 * root on a local port so `harness.html` can import three.js from
 * `node_modules` and load GLBs from `public/`.
 *
 *   manifest ──► static server ──► harness.html (three.js, ortho 35°) ──► screenshot
 */
import { createServer } from "node:http";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const outFlag = process.argv.indexOf("--out");
const outDir = resolve(
  outFlag >= 0 ? process.argv[outFlag + 1] : join(here, "out"),
);
const PORT = 8790;

/** MIME types the harness needs. */
const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".glb": "model/gltf-binary",
  ".png": "image/png",
};

/**
 * Serves files under the repo root read-only, for the harness page.
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
 * Picks pixels-per-tile so tall models fit the 320 px frame.
 * @param {number} height - Model height in world units.
 * @returns {number} Pixels per tile.
 */
function zoomFor(height) {
  return height > 2 ? 48 : height > 1.2 ? 64 : 96;
}

/**
 * Entry point: renders each manifest entry at yaw 45° and 225°.
 */
async function main() {
  const { chromium } = await import("@playwright/test");
  const manifest = JSON.parse(
    readFileSync(join(here, "..", "placeholders.manifest.json"), "utf8"),
  );
  mkdirSync(outDir, { recursive: true });
  const server = await serveRepo();
  const browser = await chromium.launch({
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const page = await browser.newPage({ viewport: { width: 320, height: 320 } });
  for (const entry of manifest) {
    const px = zoomFor(entry.height);
    const cy = Math.max(0.3, entry.height / 2);
    for (const yaw of [45, 225]) {
      const query = `file=/public/${entry.path}&px=${px}&cy=${cy}&yaw=${yaw}`;
      await page.goto(
        `http://127.0.0.1:${PORT}/tools/art/preview/harness.html?${query}`,
      );
      // Evaluated in the page, so it is a string rather than a closure.
      await page
        .waitForFunction(
          "document.title.startsWith('READY') || document.title.startsWith('ERROR')",
          null,
          { timeout: 15000 },
        )
        .catch(() => {});
      const title = await page.title();
      if (!title.startsWith("READY"))
        console.error(`FAIL ${entry.id}: ${title}`);
      await page.screenshot({ path: join(outDir, `${entry.id}@${yaw}.png`) });
    }
    console.log(`rendered ${entry.id}`);
  }
  await browser.close();
  server.close();
  console.log(`\n${manifest.length} models → ${outDir}`);
}

await main();

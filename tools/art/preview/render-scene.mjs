#!/usr/bin/env node
/**
 * Renders a composed scene of registered models for in-context review.
 *
 *   node tools/art/preview/render-scene.mjs <layout.json> <out.png>
 *
 * The layout lists placements by model path (see `scene.html`); the default
 * layout under `preview/layouts/` is a city block with units on it. Needs
 * `@playwright/test`.
 */
import { resolve } from "node:path";
import { REPO_ROOT, serveRepo } from "./serve-repo.mjs";

const [layoutPath, out] = process.argv.slice(2);
const PORT = 8795;

/**
 * Entry point: serves the repo, opens the scene page with the layout, screenshots it.
 */
async function main() {
  if (!layoutPath || !out)
    throw new Error("usage: render-scene.mjs <layout.json> <out.png>");
  const { chromium } = await import("@playwright/test");
  const server = await serveRepo(PORT);
  const browser = await chromium.launch({
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const rel = resolve(layoutPath).replace(REPO_ROOT, "");
  const page = await browser.newPage({ viewport: { width: 960, height: 960 } });
  await page.goto(
    `http://127.0.0.1:${PORT}/tools/art/preview/scene.html?layout=${rel}`,
  );
  await page.waitForFunction("document.title.startsWith('READY')", null, {
    timeout: 60000,
  });
  await page.screenshot({ path: resolve(REPO_ROOT, out) });
  await browser.close();
  server.close();
  console.log(`scene → ${out}`);
}

await main();

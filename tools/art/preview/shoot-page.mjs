#!/usr/bin/env node
/**
 * Screenshots a page from this repo with headless Chromium.
 *
 *   node tools/art/preview/shoot-page.mjs <repo-relative page> <out.png> [width] [height]
 *
 * Serves the repo root on a local port so relative links resolve, then
 * captures the full page. Used for `docs/design/ui-theme-preview.png`.
 */
import { resolve } from "node:path";
import { REPO_ROOT, serveRepo } from "./serve-repo.mjs";

const [page, out, width = "1100", height = "900"] = process.argv.slice(2);
const PORT = 8791;

/**
 * Entry point: opens the page and writes a full-page screenshot.
 */
async function main() {
  if (!page || !out)
    throw new Error("usage: shoot-page.mjs <page> <out.png> [w] [h]");
  const { chromium } = await import("@playwright/test");
  const server = await serveRepo(PORT);
  const browser = await chromium.launch();
  const tab = await browser.newPage({
    viewport: { width: Number(width), height: Number(height) },
  });
  await tab.goto(`http://127.0.0.1:${PORT}/${page}`);
  await tab.waitForLoadState("networkidle");
  await tab.screenshot({ path: resolve(REPO_ROOT, out), fullPage: true });
  await browser.close();
  server.close();
  console.log(`screenshot → ${out}`);
}

await main();

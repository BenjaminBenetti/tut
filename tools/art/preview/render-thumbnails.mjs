#!/usr/bin/env node
/**
 * Renders unit and mech-part thumbnails for the roster and mech-bay screens:
 * every `tdf.*` and `bug.*` model in `tools/art/placeholders.manifest.json`
 * to `public/assets/ui/thumbs/<model-id>.png`, 128×128 RGBA on a transparent
 * background, isometric 45°, framed to the model's bounding box.
 *
 *   node tools/art/preview/render-thumbnails.mjs
 *
 * Registered in `src/ui/data/thumbnail-manifest.ts`. Needs `@playwright/test`.
 */
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { REPO_ROOT, serveRepo } from "./serve-repo.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const SIZE = 128;
const PORT = 8792;

/**
 * Chooses which models get a thumbnail: units, mech parts and bugs.
 * @param {{id: string}} entry - Build manifest record.
 * @returns {boolean} True when the model belongs on a screen.
 */
function wantsThumbnail(entry) {
  return /^(tdf|bug)\./.test(entry.id);
}

/**
 * Entry point: renders one thumbnail per selected model.
 */
async function main() {
  const { chromium } = await import("@playwright/test");
  const manifest = JSON.parse(
    readFileSync(join(here, "..", "placeholders.manifest.json"), "utf8"),
  );
  const outDir = join(REPO_ROOT, "public", "assets", "ui", "thumbs");
  mkdirSync(outDir, { recursive: true });
  const server = await serveRepo(PORT);
  const browser = await chromium.launch({
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const page = await browser.newPage({
    viewport: { width: SIZE, height: SIZE },
  });
  for (const entry of manifest.filter(wantsThumbnail)) {
    const query = `file=/public/${entry.path}&size=${SIZE}&yaw=45&bg=transparent&fit=1`;
    await page.goto(
      `http://127.0.0.1:${PORT}/tools/art/preview/harness.html?${query}`,
    );
    await page
      .waitForFunction(
        "document.title.startsWith('READY') || document.title.startsWith('ERROR')",
        null,
        { timeout: 15000 },
      )
      .catch(() => {});
    const title = await page.title();
    if (!title.startsWith("READY")) console.error(`FAIL ${entry.id}: ${title}`);
    await page.screenshot({
      path: join(outDir, `${entry.id}.png`),
      omitBackground: true,
    });
    console.log(`thumb ${entry.id}`);
  }
  await browser.close();
  server.close();
}

await main();

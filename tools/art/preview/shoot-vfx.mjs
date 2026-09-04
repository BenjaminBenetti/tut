#!/usr/bin/env node
/**
 * Films one combat sequence from the VFX harness as a filmstrip.
 *
 *   node tools/art/preview/shoot-vfx.mjs <out.png> [ranged|melee|death] [px]
 *
 * The harness runs the real `TacticalAnimationQueue` against stand-in units,
 * and this steps it by a fixed delta so every frame is reproducible — which
 * playing to contact in a live mission is not. Use it to judge effect sizes,
 * anchors and timing against style guide §12.3.
 *
 *   vite dev ──► /tools/art/preview/vfx-harness.html?case=… ──► step ──► montage
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const PORT = 4180;
const BASE = `http://127.0.0.1:${PORT}`;
/** Seconds per filmstrip frame, and how many to take. */
const STEP_SECONDS = 0.06;
const FRAMES = 12;

/**
 * Starts the dev server and resolves once it answers.
 * @returns The child process, to kill when done.
 */
async function startServer() {
  const server = spawn(
    "node_modules/.bin/vite",
    ["--port", String(PORT), "--strictPort", "--host", "127.0.0.1"],
    { cwd: REPO_ROOT, stdio: "ignore" },
  );
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch(BASE)).ok) {
        return server;
      }
    } catch {
      // not up yet
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  server.kill();
  throw new Error(`vite did not answer on ${BASE}`);
}

/**
 * Steps the harness and writes one PNG per frame.
 * @param out - Filmstrip path.
 * @param which - Sequence name.
 * @param px - Pixels per tile.
 */
async function film(out, which, px) {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const page = await browser.newPage({ viewport: { width: 720, height: 720 } });
  await page.goto(
    `${BASE}/tools/art/preview/vfx-harness.html?case=${which}&px=${px}`,
  );
  await page.waitForFunction("document.title.startsWith('READY')", null, {
    timeout: 60000,
  });
  const dir = mkdtempSync(join(tmpdir(), "tut-vfx-"));
  const frames = [];
  for (let i = 0; i < FRAMES; i++) {
    const path = join(dir, `f${String(i).padStart(2, "0")}.png`);
    await page.screenshot({
      path,
      clip: { x: 0, y: 0, width: 720, height: 720 },
    });
    frames.push(path);
    // A string, not a closure: this file is linted with node globals, so a
    // closure mentioning `window` fails `no-undef` (as the other tools do).
    await page.evaluate(`window.__vfx__?.step(${String(STEP_SECONDS)})`);
  }
  await browser.close();
  const label = frames.map((_, i) => `${(i * STEP_SECONDS).toFixed(2)}s`);
  const montage = spawn(
    "montage",
    [
      ...frames.flatMap((f, i) => ["-label", label[i], f]),
      "-tile",
      "6x2",
      "-geometry",
      "300x300+4+4",
      "-background",
      "#12141a",
      "-fill",
      "#F08A24",
      "-pointsize",
      "18",
      resolve(REPO_ROOT, out),
    ],
    { stdio: "inherit" },
  );
  await new Promise((done) => montage.on("close", done));
  rmSync(dir, { recursive: true, force: true });
}

/**
 * Entry point: serve, film, stop.
 */
async function main() {
  const [out, which = "ranged", px = "64"] = process.argv.slice(2);
  if (!out) {
    throw new Error("usage: shoot-vfx.mjs <out.png> [ranged|melee|death] [px]");
  }
  const server = await startServer();
  try {
    await film(out, which, Number(px));
    console.log(`vfx ${which} → ${out}`);
  } finally {
    server.kill();
  }
}

await main();

#!/usr/bin/env node
/**
 * Shoots the radial menu harness, which renders the real `RadialMenuView`
 * over a still of a mission.
 *
 *   node tools/art/preview/shoot-radial.mjs <out.png> [items]
 *
 * The menu is in-world UI (ADR 0007): it belongs at a projected world point,
 * so judging it on a grey background says nothing about whether it reads.
 */
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const PORT = 4181;
const BASE = `http://127.0.0.1:${PORT}`;

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
 * Entry point: serve, shoot the stage, stop.
 */
async function main() {
  const [out, items = "5"] = process.argv.slice(2);
  if (!out) {
    throw new Error("usage: shoot-radial.mjs <out.png> [items]");
  }
  const server = await startServer();
  try {
    const { chromium } = await import("@playwright/test");
    const browser = await chromium.launch({
      args: [
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    });
    const page = await browser.newPage({
      viewport: { width: 960, height: 600 },
    });
    await page.goto(
      `${BASE}/tools/art/preview/radial-harness.html?items=${items}`,
    );
    await page.waitForFunction("document.title.startsWith('READY')", null, {
      timeout: 60000,
    });
    await page.waitForTimeout(500);
    await page
      .locator("#radial-stage")
      .screenshot({ path: resolve(REPO_ROOT, out) });
    await browser.close();
    console.log(`radial → ${out}`);
  } finally {
    server.kill();
  }
}

await main();

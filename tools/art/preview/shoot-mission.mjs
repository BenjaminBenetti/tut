#!/usr/bin/env node
/**
 * Screenshots a real tactical mission from the running game.
 *
 *   node tools/art/preview/shoot-mission.mjs <out.png> [seed] [--overworld]
 *
 * Every other preview in this folder renders assets in isolation. This one
 * boots the app on the Vite dev server, plays to the first mission with the
 * test hooks the e2e suite uses, and shoots the tactical screen — the only
 * way to see what a player sees, including which assets the scene actually
 * loads.
 *
 *   vite dev ──► chromium ──► new game(seed) ──► advance to a mission
 *                                 └──► __tut__.startTacticalMission ──► PNG
 *
 * Needs `@playwright/test`. The dev server is started here and stopped after.
 */
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const PORT = 4183;
const BASE_URL = `http://127.0.0.1:${PORT}`;
/** Days to advance before giving up on a mission appearing for the seed. */
const MAX_DAYS = 40;
/** Frames the scene gets to load models and settle before the shot. */
const SETTLE_MS = 2500;

/**
 * Starts the Vite dev server and resolves once it answers.
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
      const response = await fetch(BASE_URL);
      if (response.ok) {
        return server;
      }
    } catch {
      // not up yet
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  server.kill();
  throw new Error(`vite did not answer on ${BASE_URL}`);
}

/**
 * Plays to the first available mission and screenshots the tactical screen.
 * @param {string} out - Output PNG path.
 * @param {string} seed - New-game seed.
 * @param {boolean} overworldOnly - Shoot the overworld instead of a mission.
 */
async function shoot(out, seed, overworldOnly) {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  await page.goto(BASE_URL);
  // Predicates are strings: this file is linted with node globals, so a
  // closure mentioning `document` would fail `no-undef` (the other preview
  // tools do the same).
  await page.waitForFunction(
    'document.body.dataset.appState === "ready"',
    null,
    {
      timeout: 60000,
    },
  );
  await page.locator('[data-field="seed"]').fill(seed);
  await page.locator('[data-action="new-game"]').click();
  await page.waitForFunction(
    'document.body.dataset.screen === "overworld"',
    null,
    {
      timeout: 30000,
    },
  );
  if (!overworldOnly) {
    const rows = page.locator('[data-role="mission-list"] [data-mission-id]');
    const choice = page.locator('[data-role="event-dialog"] [data-choice-id]');
    for (let day = 0; day < MAX_DAYS && (await rows.count()) === 0; day++) {
      if (await choice.first().isVisible()) {
        await choice.first().click();
      }
      await page.locator('[data-action="advance-day"]').click();
    }
    const missionId = await rows.first().getAttribute("data-mission-id");
    await page.evaluate(
      (id) => globalThis.__tut__?.startTacticalMission(id),
      missionId ?? "",
    );
    await page.waitForFunction(
      'document.body.dataset.screen === "tactical"',
      null,
      {
        timeout: 30000,
      },
    );
    await page.locator("#tactical-viewport canvas").waitFor();
  }
  await page.waitForTimeout(SETTLE_MS);
  await page.screenshot({ path: resolve(REPO_ROOT, out) });
  await browser.close();
}

/**
 * Entry point: serve, shoot, stop.
 */
async function main() {
  const args = process.argv.slice(2);
  const overworldOnly = args.includes("--overworld");
  const [out, seed = "4242"] = args.filter((a) => !a.startsWith("--"));
  if (!out) {
    throw new Error("usage: shoot-mission.mjs <out.png> [seed] [--overworld]");
  }
  const server = await startServer();
  try {
    await shoot(out, seed, overworldOnly);
    console.log(`mission → ${out}`);
  } finally {
    server.kill();
  }
}

await main();

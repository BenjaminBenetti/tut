#!/usr/bin/env node
/**
 * Captures the armoured variants beside their base species (#1179) from
 * the lineup harness: rest at the tactical yaw for the design doc, and a
 * walk and a strike frame to check the variants pose like their bases.
 * Start a dev server first and pass its origin.
 */
/* global window */
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://127.0.0.1:5173";
const out = process.argv[3] ?? "docs/design";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  args: [
    "--use-angle=swiftshader",
    "--use-gl=angle",
    "--enable-unsafe-swiftshader",
  ],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(`${base}/tools/art/preview/armoured-bugs.html`);
  await page
    .locator("#status")
    .filter({ hasText: "Ready · 6 models" })
    .waitFor({ timeout: 120_000 });
  const shots = [
    ["bug-armoured-lineup.png", "rest", 0, 45],
    ["bug-armoured-lineup-walk.png", "walk", 0.18, 45],
    ["bug-armoured-lineup-strike.png", "strike", 0.44, 45],
  ];
  for (const [name, action, seconds, degrees] of shots) {
    await page.evaluate(
      ([a, s, d]) => window.__armoured.capture(a, s, d),
      [action, seconds, degrees],
    );
    await page.screenshot({ path: `${out}/${name}`, fullPage: true });
  }
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(`Lineup: six models loaded; ${shots.length} captures written.`);
} finally {
  await browser.close();
}

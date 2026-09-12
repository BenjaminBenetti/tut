#!/usr/bin/env node
/** Captures the real GLB gallery and checks its pose, camera and ground controls. Start pnpm dev first. */
/* global window, document */
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://127.0.0.1:5173";
const out = "docs/design/diagnostics/crescent-bugs";
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
    viewport: { width: 1600, height: 960 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(`${base}/tools/art/preview/crescent-bugs.html`);
  await page
    .locator("#status")
    .filter({ hasText: "Ready · 4 models" })
    .waitFor();
  await page.locator("#turn").click();
  await page.waitForFunction(
    () => Number(document.querySelector("#angle").value) > 46,
  );
  await page.locator("#turn").click();
  await page.locator("#angle").fill("45");
  await page.locator("#angle").dispatchEvent("input");
  await page.evaluate(() => window.__crescent.capture("rest", 0));
  await page.screenshot({ path: `${out}/family.png`, fullPage: true });
  await page.evaluate(() => window.__crescent.capture("walk", 0));
  const rest = await page.locator("canvas").first().screenshot();
  await page.evaluate(() => window.__crescent.capture("walk", 0.18));
  const walking = await page.locator("canvas").first().screenshot();
  if (walking.equals(rest))
    throw new Error("Swarmer walking pose did not change");
  await page.screenshot({ path: `${out}/walking.png`, fullPage: true });
  await page.evaluate(() => window.__crescent.capture("strike", 0.5));
  await page.screenshot({ path: `${out}/striking.png`, fullPage: true });
  await page.evaluate(() => window.__crescent.capture("rest", 0));
  await page.locator("#framing").selectOption("scale");
  await page.screenshot({ path: `${out}/relative-scale.png`, fullPage: true });
  await page.locator("#framing").selectOption("tactical");
  for (const [name, color] of [
    ["asphalt", "#3A3D42"],
    ["grass", "#5E7A3A"],
    ["rock", "#6E6A66"],
    ["earth", "#8B7355"],
  ]) {
    await page.locator("#ground").selectOption(color);
    await page.screenshot({
      path: `${out}/tactical-${name}.png`,
      fullPage: true,
    });
  }
  await page.locator("#framing").selectOption("detail");
  await page.locator("#angle").fill("225");
  await page.locator("#angle").dispatchEvent("input");
  await page.screenshot({ path: `${out}/rear.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${out}/mobile.png`, fullPage: true });
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "Gallery: four models loaded; pose, scale, ground, rear and mobile captures passed without browser errors.",
  );
} finally {
  await browser.close();
}

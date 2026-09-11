import { mkdirSync } from "node:fs";

import { expect, test } from "@playwright/test";

import {
  assertNoAssetFallback,
  drawnFrame,
  tacticalModelsReady,
  watchAssetFallback,
} from "./capture-frame.helper";
import { launchMission, settleForShot } from "./mission-capture.helper";

/** Real gameplay and Map Lab context for the #1110 close-up comparisons. */
const OUTPUT =
  process.env.CAPTURE_OUTPUT ?? "docs/design/diagnostics/1110/after";

test("map variety city overview", async ({ page }) => {
  test.skip(!process.env.CAPTURE, "set CAPTURE=1 to refresh review images");
  test.setTimeout(180_000);
  mkdirSync(OUTPUT, { recursive: true });
  watchAssetFallback(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(
    "/mapgen-preview.html?seed=mc-resume-01&biome=temperate&settlement=city&size=medium&models=1&units=1&slope=100",
  );
  await expect(page.locator("body")).toHaveAttribute(
    "data-preview-ready",
    "true",
    { timeout: 120_000 },
  );
  await expect(page.locator("body")).toHaveAttribute(
    "data-models-ready",
    "true",
  );
  await expect(page.locator("#status")).toBeEmpty();
  await page.mouse.move(0, 0);
  await drawnFrame(page);
  assertNoAssetFallback(page, "map variety overview");
  expect(errors).toEqual([]);
  await page.screenshot({ path: `${OUTPUT}/city-overview.png` });
});

test("map variety live mission with fog", async ({ page }) => {
  test.skip(!process.env.CAPTURE, "set CAPTURE=1 to refresh review images");
  test.setTimeout(180_000);
  mkdirSync(OUTPUT, { recursive: true });
  watchAssetFallback(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await launchMission(page, "mc-resume-01");
  await tacticalModelsReady(page);
  await settleForShot(page);
  await page.mouse.move(0, 0);
  await drawnFrame(page);
  assertNoAssetFallback(page, "map variety live mission");
  expect(errors).toEqual([]);
  await page.screenshot({ path: `${OUTPUT}/live-mission.png` });
});

test("map variety rooftop equipment follows indoor cutaway", async ({
  page,
}) => {
  test.skip(!process.env.CAPTURE, "set CAPTURE=1 to refresh review images");
  test.setTimeout(180_000);
  mkdirSync(OUTPUT, { recursive: true });
  watchAssetFallback(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1200, height: 950 });
  await page.goto(
    "/tools/art/preview/roof-cutaway.html?roof=flat&yaw=0&units=1",
  );
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true", {
    timeout: 120_000,
  });
  await expect(page.locator("body")).toHaveAttribute("data-ghost-count", "1");
  await page.mouse.move(0, 0);
  await drawnFrame(page);
  assertNoAssetFallback(page, "roof equipment cutaway");
  await page.screenshot({ path: `${OUTPUT}/roof-cutaway.png` });
  await page.keyboard.press("l");
  await expect(page.locator("body")).toHaveAttribute("data-left", "true");
  await page.waitForFunction(() => {
    const state = (
      globalThis as unknown as { __cutawayState(): { ghostCount: number } }
    ).__cutawayState();
    return state.ghostCount === 0;
  });
  await drawnFrame(page);
  expect(errors).toEqual([]);
  await page.screenshot({ path: `${OUTPUT}/roof-solid.png` });
});

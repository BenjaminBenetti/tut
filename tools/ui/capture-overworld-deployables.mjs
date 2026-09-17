/* global document, requestAnimationFrame */
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";

/**
 * Renders the deployable popover and the installation wheel for the
 * design docs (#1155): a battery built in Tokyo's region, the Build
 * option hovered for its popover, then the installation clicked on the
 * map for its wheel. Run against a dev server:
 *
 *   pnpm exec vite --port 4189 --strictPort &
 *   CAPTURE_BASE_URL=http://localhost:4189 node tools/ui/capture-overworld-deployables.mjs
 */
const baseUrl = process.env.CAPTURE_BASE_URL ?? "http://localhost:4189";
const output = process.env.CAPTURE_OUTPUT ?? "docs/design";
const SEED = "4242";
mkdirSync(output, { recursive: true });

const browser = await chromium.launch({
  args: [
    "--use-angle=swiftshader",
    "--use-gl=angle",
    "--enable-unsafe-swiftshader",
  ],
});

/** Waits for two frames after fonts. */
async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  });
}

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto(baseUrl);
  await expect(page.locator("body")).toHaveAttribute("data-app-state", "ready");
  await page.locator('[data-field="seed"]').fill(SEED);
  await page.locator('[data-action="new-game"]').click();
  await expect(page.locator("body")).toHaveAttribute("data-screen", "overworld");
  await expect(page.locator("body")).toHaveAttribute("data-map-ready", "true");

  // Tokyo's region in the panel, a battery built there.
  await page.evaluate(() => globalThis.__tut__.selectCity("tokyo"));
  await page.keyboard.press("Escape");
  const build = page.locator(
    '[data-action="build-deployable"][data-type-id="defensive-battery"]',
  );
  await build.click();
  const row = page.locator("#deployables [data-deployable-id]").first();
  await expect(row).toContainText("Defensive battery");
  const deployableId = await row.getAttribute("data-deployable-id");
  await expect
    .poll(
      () =>
        page.evaluate(
          (id) => globalThis.__tut__.installationLook(id),
          deployableId,
        ),
      { timeout: 10000 },
    )
    .toMatchObject({ model: "glb" });

  // 1. The popover on the Build option for the sensor array.
  const option = page.locator(
    '[data-action="build-deployable"][data-type-id="sensor-array"]',
  );
  await option.hover();
  await expect(page.locator('[data-role="popover"]')).toBeVisible();
  await settle(page);
  await page.screenshot({
    path: `${output}/overworld-deployable-popover.png`,
    animations: "disabled",
  });
  await page.mouse.move(0, 0);

  // 2. The installation wheel on the battery, the map zoomed on Tokyo's region.
  await page.evaluate(() => globalThis.__tut__.focusCity("seoul", 120));
  await settle(page);
  const at = await page.evaluate(
    (id) => globalThis.__tut__.installationScreenPosition(id),
    deployableId,
  );
  assert.ok(at, "the battery must project on screen");
  await page.mouse.click(at.x, at.y);
  await expect(page.locator("#radial-menu")).toHaveAttribute("data-open", "true");
  await expect(page.locator('#radial-menu [data-field="hub-value"]')).toHaveText("L1");
  await settle(page);
  await page.screenshot({
    path: `${output}/overworld-installation-wheel.png`,
    animations: "disabled",
  });
  assert.deepEqual(errors, []);
  console.log("captured", output);
} finally {
  await browser.close();
}

/* global document, requestAnimationFrame */
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";

/**
 * Renders the bank installation beside the other three on the strategic
 * map for the design docs (#1155): the three siblings are written into
 * the autosave for East Asia, then the bank is built through the region
 * panel the way a player builds one. Run against a dev server:
 *
 *   pnpm exec vite --port 4190 --strictPort &
 *   CAPTURE_BASE_URL=http://localhost:4190 node tools/ui/capture-overworld-bank.mjs
 */
const baseUrl = process.env.CAPTURE_BASE_URL ?? "http://localhost:4190";
const output = process.env.CAPTURE_OUTPUT ?? "docs/design";
const SEED = "4242";
const AUTOSAVE_KEY = "tut:save:autosave";
mkdirSync(output, { recursive: true });

const browser = await chromium.launch({
  args: [
    "--use-angle=swiftshader",
    "--use-gl=angle",
    "--enable-unsafe-swiftshader",
  ],
});

/** Waits for two frames after fonts, then moves the pointer off the map. */
async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  });
  await page.mouse.move(0, 0);
}

/** Boots the page to the overworld, from a fresh seed or the autosave. */
async function openOverworld(page, action) {
  await page.goto(baseUrl);
  await expect(page.locator("body")).toHaveAttribute("data-app-state", "ready");
  if (action === "new-game") {
    await page.locator('[data-field="seed"]').fill(SEED);
  }
  await page.locator(`[data-action="${action}"]`).click();
  await expect(page.locator("body")).toHaveAttribute(
    "data-screen",
    "overworld",
  );
  await expect(page.locator("body")).toHaveAttribute("data-map-ready", "true");
}

try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  // 1. A fresh campaign, then the three siblings written into East Asia.
  await openOverworld(page, "new-game");
  await page.evaluate((key) => {
    const save = JSON.parse(localStorage.getItem(key));
    save.state.overworld.deployables.push(
      ...["defensive-battery", "repellent-dispersal", "sensor-array"].map(
        (typeId) => ({
          id: `capture-${typeId}`,
          typeId,
          regionId: "east-asia",
          level: 1,
          builtDay: 1,
          online: true,
        }),
      ),
    );
    localStorage.setItem(key, JSON.stringify(save));
  }, AUTOSAVE_KEY);
  await openOverworld(page, "continue");

  // 2. Select Tokyo and build the bank through the region panel.
  await page.evaluate(() => globalThis.__tut__.selectCity("tokyo"));
  await expect(page.locator("#selected-region")).toHaveText("East Asia");
  const build = page.locator(
    '[data-action="build-deployable"][data-type-id="bank"]',
  );
  await expect(build).toBeEnabled();
  await build.click();
  await expect(build).toContainText("1/");

  // 3. The bank must be drawn from the GLB beside the three siblings.
  const bankId = await page.evaluate((key) => {
    const save = JSON.parse(localStorage.getItem(key));
    return save.state.overworld.deployables.find((d) => d.typeId === "bank")
      ?.id;
  }, AUTOSAVE_KEY);
  assert.ok(bankId, "the build must reach the autosave");
  const looks = await page.evaluate(
    (ids) => ids.map((id) => globalThis.__tut__.installationLook(id)),
    [
      "capture-defensive-battery",
      "capture-repellent-dispersal",
      "capture-sensor-array",
      bankId,
    ],
  );
  for (const look of looks) assert.equal(look?.model, "glb");

  await page.evaluate(() => globalThis.__tut__.focusCity("seoul", 160));
  await page.waitForTimeout(2500);
  await settle(page);
  await page.screenshot({
    path: `${output}/overworld-bank-on-map.png`,
    animations: "disabled",
  });
  assert.deepEqual(errors, []);
  console.log("captured", `${output}/overworld-bank-on-map.png`, bankId);
} finally {
  await browser.close();
}

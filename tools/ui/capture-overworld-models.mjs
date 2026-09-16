/* global document, requestAnimationFrame */
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";

/**
 * Renders the strategic map's models for the design docs (#1155):
 * settlements on the wireframe Earth, a city wearing the egg cue for a
 * mission on offer, and a region with its three installations, one of
 * them offline. Run against a dev server:
 *
 *   pnpm exec vite --port 4187 --strictPort &
 *   CAPTURE_BASE_URL=http://localhost:4187 node tools/ui/capture-overworld-models.mjs
 */
const baseUrl = process.env.CAPTURE_BASE_URL ?? "http://localhost:4187";
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
  const viewport = { width: 1280, height: 720 };
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  // 1. Settlements on the wireframe Earth at the default zoom.
  await openOverworld(page, "new-game");
  const looks = await page.evaluate(() =>
    ["tokyo", "london", "iquitos"].map((id) =>
      globalThis.__tut__.cityMarkerLook(id),
    ),
  );
  for (const look of looks) assert.equal(look.model, "glb");
  await settle(page);
  await page.screenshot({
    path: `${output}/overworld-settlement-models.png`,
    animations: "disabled",
  });

  // 1b. Close on Western Europe so the three scales read.
  await page.evaluate(() => globalThis.__tut__.focusCity("paris", 160));
  await settle(page);
  await page.screenshot({
    path: `${output}/overworld-settlement-models-close.png`,
    animations: "disabled",
  });

  // 2. Tokyo with a clearance mission on offer: the egg overlay.
  //    Also three installations in East Asia, the battery offline.
  await page.evaluate((key) => {
    const save = JSON.parse(localStorage.getItem(key));
    const overworld = save.state.overworld;
    overworld.map.cities.find((city) => city.id === "tokyo").infestation = 55;
    overworld.missions.push({
      id: "mission-capture",
      typeId: "infestation-clearance",
      cityId: "tokyo",
      difficulty: 5,
      mapParams: {
        biome: "temperate",
        settlement: "city",
        size: "medium",
        seed: "capture",
      },
      rewards: { credits: 1500 },
      createdDay: 1,
      expiresDay: 99,
      ignorePenalty: 10,
    });
    overworld.deployables.push(
      {
        id: "deployable-1",
        typeId: "defensive-battery",
        regionId: "east-asia",
        builtDay: 1,
        online: false,
      },
      {
        id: "deployable-2",
        typeId: "repellent-dispersal",
        regionId: "east-asia",
        builtDay: 1,
        online: true,
      },
      {
        id: "deployable-3",
        typeId: "sensor-array",
        regionId: "east-asia",
        builtDay: 1,
        online: true,
      },
    );
    localStorage.setItem(key, JSON.stringify(save));
  }, AUTOSAVE_KEY);
  await openOverworld(page, "continue");
  const tokyo = await page.evaluate(() =>
    globalThis.__tut__.cityMarkerLook("tokyo"),
  );
  assert.equal(tokyo.mission, true);
  await page.evaluate(() => globalThis.__tut__.focusCity("tokyo", 192));
  await settle(page);
  await page.screenshot({
    path: `${output}/overworld-egg-cue.png`,
    animations: "disabled",
  });

  // 3. The installations around East Asia's anchor, mid-idle.
  const installations = await page.evaluate(() =>
    ["deployable-1", "deployable-2", "deployable-3"].map((id) =>
      globalThis.__tut__.installationLook(id),
    ),
  );
  for (const look of installations) assert.equal(look.model, "glb");
  assert.equal(installations[0].online, false);
  assert.equal(installations[1].spraying, true);
  await page.evaluate(() => globalThis.__tut__.focusCity("seoul", 160));
  await page.waitForTimeout(2500);
  await settle(page);
  await page.screenshot({
    path: `${output}/overworld-deployables-on-map.png`,
    animations: "disabled",
  });
  assert.deepEqual(errors, []);
  console.log("captured", output);
} finally {
  await browser.close();
}

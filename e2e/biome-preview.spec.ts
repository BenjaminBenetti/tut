import { expect, test } from "@playwright/test";
import { BIOME_IDS } from "../src/content/model/biome-id";
import { BIOME_INFO } from "../src/content/data/biome-info";
import {
  assertNoAssetFallback,
  drawnFrame,
  watchAssetFallback,
} from "./capture-frame.helper";

/** New environments must render their actual terrain materials and vegetation kits. */
for (const biome of BIOME_IDS.slice(4)) {
  test(`renders ${biome} terrain and vegetation with the shipped models`, async ({
    page,
  }) => {
    watchAssetFallback(page);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto(
      `/mapgen-preview.html?seed=world-biomes&biome=${biome}&settlement=rural&size=small&models=1`,
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-models-ready",
      "true",
    );
    await expect(page.locator("#status")).toBeEmpty();
    await expect(page.locator("#biome option:checked")).toHaveText(
      BIOME_INFO[biome].name,
    );
    await drawnFrame(page);
    assertNoAssetFallback(page, biome);
    expect(errors).toEqual([]);
    if (process.env.CAPTURE) {
      await page.screenshot({ path: test.info().outputPath(`${biome}.png`) });
    }
  });
}

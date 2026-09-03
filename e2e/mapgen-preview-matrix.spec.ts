import { expect, test } from "@playwright/test";

import { BIOME_IDS } from "../src/content/model/biome-id";
import { SETTLEMENT_SCALES } from "../src/content/model/settlement-scale";

/** One fixed seed keeps the matrix deterministic across runs. */
const SEED = "matrix";

/**
 * Every biome × settlement combination generates and renders at the
 * small size without a generation error. The 2026-09-03 QA pass ran all
 * 72 biome × settlement × size × seed combinations clean; the suite
 * keeps the 12 small ones so a regression in any biome or settlement
 * definition is caught on every push.
 */
for (const biome of BIOME_IDS) {
  for (const settlement of SETTLEMENT_SCALES) {
    test(`mapgen preview generates ${biome} / ${settlement} / small`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") {
          errors.push(message.text());
        }
      });
      page.on("pageerror", (error) => {
        errors.push(error.message);
      });

      await page.goto(
        `/mapgen-preview.html?seed=${SEED}&biome=${biome}&settlement=${settlement}&size=small`,
      );

      const body = page.locator("body");
      await expect(body).toHaveAttribute("data-app-state", "ready");
      await expect(body).toHaveAttribute("data-map-seed", SEED);
      await expect(page.locator("#status")).toBeEmpty();
      await expect(page.locator("#stats")).toContainText("Buildings");
      await expect(page.locator("#ascii")).not.toBeEmpty();
      expect(errors).toEqual([]);
    });
  }
}

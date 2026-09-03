import { expect, test } from "@playwright/test";

import type { TutTestHooks } from "../src/app/model/test-hooks";
import { DEPLOYABLE_TYPES } from "../src/overworld/data/deployable-types";
import { EARTH_MAP } from "../src/overworld/data/earth-map";

/** The page's global object as seen from `page.evaluate`, with the dev hooks. */
interface HookGlobal {
  __tut__?: TutTestHooks;
}

/** Parses a `¢5,000` readout back to a number. */
function parseCredits(text: string | null): number {
  return Number((text ?? "").replace(/[^0-9-]/g, ""));
}

test("selecting a city and building a battery charges credits and lists it", async ({
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

  await page.goto("/");
  const body = page.locator("body");
  await expect(body).toHaveAttribute("data-app-state", "ready");
  await page.locator('[data-action="new-game"]').click();
  await expect(body).toHaveAttribute("data-screen", "overworld");

  const city = EARTH_MAP.cities[0];
  if (!city) {
    throw new Error("Shipped map has no cities");
  }
  await page.evaluate(
    (id) => (globalThis as HookGlobal).__tut__?.selectCity(id),
    city.id,
  );
  await expect(page.locator("#selected-city")).toHaveText(city.name);
  await expect(page.locator('#city-panel [data-field="region"]')).toHaveText(
    EARTH_MAP.regions.find((r) => r.id === city.regionId)?.name ?? "",
  );

  const credits = page.locator('#top-bar [data-field="credits"]');
  const before = parseCredits(await credits.textContent());
  const build = page.locator(
    '[data-action="build-deployable"][data-type-id="defensive-battery"]',
  );
  await expect(build).toBeEnabled();
  await build.click();

  const battery = DEPLOYABLE_TYPES["defensive-battery"];
  await expect(credits).toHaveText(
    `¢${(before - battery.buildCost).toLocaleString("en-US")}`,
  );
  const rows = page.locator("#deployables [data-deployable-id]");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(battery.name);
  await expect(rows.first().locator('[data-field="status"]')).toHaveText(
    "online",
  );
  await expect(build).toContainText("1/2");

  await rows.first().locator('[data-action="decommission-deployable"]').click();
  await expect(rows).toHaveCount(0);
  await expect(credits).toHaveText(
    `¢${(before - battery.buildCost).toLocaleString("en-US")}`,
  );

  expect(errors).toEqual([]);
});

import { expect, test } from "@playwright/test";

import type { TutTestHooks } from "../src/app/model/test-hooks";
import { MAP_READY_ATTRIBUTE } from "../src/ui/model/map-viewport-host";

/** The page's global object as seen from `page.evaluate`, with the dev hooks. */
interface HookGlobal {
  __tut__?: TutTestHooks;
}

/**
 * Region-first selection (#1154): clicking Tokyo's marker selects East
 * Asia, the Situation panel shows the region with its three cities and
 * Tokyo's row current, the mission list narrows to the region, and the
 * city wheel opens on the marker with Tokyo's infestation at the hub
 * over its name and population. Escape closes the wheel, the same click
 * reopens it, and Show all widens the mission list again.
 */
test("clicking a city selects its region, shows the region panel and opens the city wheel", async ({
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
  await page.locator('[data-field="seed"]').fill("4242");
  await page.locator('[data-action="new-game"]').click();
  await expect(body).toHaveAttribute("data-screen", "overworld");
  await expect(body).toHaveAttribute(MAP_READY_ATTRIBUTE, "true");

  const regionPanel = page.locator("#region-panel");
  await expect(regionPanel.locator('[data-role="no-region"]')).toBeVisible();
  await expect(page.locator('[data-field="missions-heading"]')).toHaveText(
    "Missions · all",
  );
  await expect(page.locator('[data-action="show-all-missions"]')).toBeHidden();

  const position = await page.evaluate(() =>
    (globalThis as HookGlobal).__tut__?.cityScreenPosition("tokyo"),
  );
  expect(position).toBeDefined();
  if (!position) {
    throw new Error("unreachable");
  }
  await page.mouse.click(position.x, position.y);

  await expect(body).toHaveAttribute("data-selected-city", "tokyo");
  await expect(body).toHaveAttribute("data-selected-region", "east-asia");
  await expect(page.locator("#selected-region")).toHaveText("East Asia");
  await expect(regionPanel.locator('[data-field="biome"]')).toHaveText(
    "Temperate",
  );
  await expect(regionPanel.locator('[data-field="worst"]')).toHaveText(/^\d+$/);
  await expect(regionPanel.locator('[data-field="mean"]')).toHaveText(/^\d+$/);
  const cityRows = regionPanel.locator("[data-city-id]");
  await expect(cityRows).toHaveCount(3);
  await expect(cityRows.filter({ hasText: "Tokyo" })).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(page.locator('[data-field="missions-heading"]')).toHaveText(
    "Missions · East Asia",
  );

  // The wheel: on the marker, infestation at the hub, name and
  // population beneath, the Region entry on the ring.
  const wheel = page.locator("#radial-menu");
  await expect(wheel).toHaveAttribute("data-open", "true");
  const left = await wheel.evaluate((el) => parseFloat(el.style.left));
  const top = await wheel.evaluate((el) => parseFloat(el.style.top));
  expect(Math.abs(left - position.x)).toBeLessThan(2);
  expect(Math.abs(top - position.y)).toBeLessThan(2);
  const infestation = await cityRows
    .filter({ hasText: "Tokyo" })
    .locator('[data-field="city-infestation"]')
    .textContent();
  await expect(wheel.locator('[data-field="hub-value"]')).toHaveText(
    infestation ?? "",
  );
  await expect(wheel.locator(".tut-radial__caption")).toHaveText("Tokyo · 37M");
  await expect(wheel.locator('[data-item="region"]')).toBeVisible();

  // Escape dismisses it; the same click reopens it.
  await page.keyboard.press("Escape");
  await expect(wheel).not.toHaveAttribute("data-open", "true");
  await page.mouse.click(position.x, position.y);
  await expect(wheel).toHaveAttribute("data-open", "true");

  // A click on a city row selects that city; the region stays.
  await cityRows.filter({ hasText: "Seoul" }).click();
  await expect(body).toHaveAttribute("data-selected-city", "seoul");
  await expect(body).toHaveAttribute("data-selected-region", "east-asia");
  await expect(cityRows.filter({ hasText: "Seoul" })).toHaveAttribute(
    "aria-current",
    "true",
  );
  // The click landed outside the ring, so the wheel is gone.
  await expect(wheel).not.toHaveAttribute("data-open", "true");

  // Show all clears the region and widens the list.
  await page.locator('[data-action="show-all-missions"]').click();
  await expect(body).not.toHaveAttribute("data-selected-region", /.+/);
  await expect(page.locator('[data-field="missions-heading"]')).toHaveText(
    "Missions · all",
  );
  await expect(regionPanel.locator('[data-role="no-region"]')).toBeVisible();

  expect(errors).toEqual([]);
});

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

/**
 * Deployables end to end (#1151, #1155): a battery built from the
 * Situation panel is charged, listed at L1 and stood on the map; the
 * Build option's popover says what it does; a real click on the model
 * opens the installation wheel with `L1` at the hub, and Upgrade on it
 * charges the next level and moves the row to `L2`; Decommission clears
 * the row and the map.
 */
test("building a battery lists it, its popover and wheel explain it, and Upgrade lifts it to L2", async ({
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
  await expect(
    page.locator('#region-panel [data-city-id][aria-current="true"]'),
  ).toContainText(city.name);
  await expect(page.locator("#selected-region")).toHaveText(
    EARTH_MAP.regions.find((r) => r.id === city.regionId)?.name ?? "",
  );

  const credits = page.locator('#top-bar [data-field="credits"]');
  const before = parseCredits(await credits.textContent());
  const build = page.locator(
    '[data-action="build-deployable"][data-type-id="defensive-battery"]',
  );
  await expect(build).toBeEnabled();

  // Resting on the Build option opens the popover: the type's name over
  // what level 1 does and what it costs (#1155).
  const popover = page.locator('[data-role="popover"]');
  await build.hover();
  await expect(popover).toBeVisible();
  await expect(popover.locator(".tut-popover__title")).toHaveText(
    "Defensive battery",
  );
  await expect(popover).toContainText("1 garrison turret on every mission map");
  await expect(popover).toContainText("Build ¢1,500 · upkeep ¢50/day");
  await page.mouse.move(0, 0);
  await expect(popover).toBeHidden();

  await build.click();

  const battery = DEPLOYABLE_TYPES["defensive-battery"];
  await expect(credits).toHaveText(
    `¢${(before - battery.levels[1].buildCost).toLocaleString("en-US")}`,
  );
  const rows = page.locator("#deployables [data-deployable-id]");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(battery.name);
  await expect(rows.first().locator('[data-field="status"]')).toHaveText(
    "online",
  );
  await expect(build).toContainText("1/1");
  await expect(rows.first().locator('[data-field="level"]')).toHaveText("L1");

  // The installation stands in its region on the map (#1155): its model is
  // loaded, it is lit as online and it projects to a point on the screen.
  const deployableId = await rows.first().getAttribute("data-deployable-id");
  expect(deployableId).not.toBeNull();
  await expect
    .poll(
      () =>
        page.evaluate(
          (id) => (globalThis as HookGlobal).__tut__?.installationLook(id),
          deployableId ?? "",
        ),
      { timeout: 10000 },
    )
    .toMatchObject({ typeId: "defensive-battery", online: true, model: "glb" });
  const onMap = await page.evaluate(
    (id) => (globalThis as HookGlobal).__tut__?.installationScreenPosition(id),
    deployableId ?? "",
  );
  expect(onMap).toBeDefined();
  if (!onMap) {
    throw new Error("unreachable");
  }

  // A real click on the model opens the installation wheel on it: the
  // level at the hub over the type and status, Upgrade with the next
  // level's price as the primary entry (#1155).
  await page.mouse.click(onMap.x, onMap.y);
  const wheel = page.locator("#radial-menu");
  await expect(wheel).toHaveAttribute("data-open", "true");
  await expect(wheel.locator('[data-field="hub-value"]')).toHaveText("L1");
  await expect(wheel.locator(".tut-radial__caption")).toHaveText(
    "Defensive battery · online",
  );
  await expect(body).toHaveAttribute("data-selected-region", city.regionId);
  const upgrade = wheel.locator('[data-item="upgrade"]');
  await expect(upgrade).toBeEnabled();
  await expect(upgrade).toContainText(
    `¢${battery.levels[2].buildCost.toLocaleString("en-US")}`,
  );
  await upgrade.click();
  await expect(wheel).not.toHaveAttribute("data-open", "true");
  await expect(rows.first().locator('[data-field="level"]')).toHaveText("L2");
  await expect(credits).toHaveText(
    `¢${(before - battery.levels[1].buildCost - battery.levels[2].buildCost).toLocaleString("en-US")}`,
  );
  // The panel's own Upgrade button now names level 3's price.
  await expect(
    rows.first().locator('[data-action="upgrade-deployable"]'),
  ).toHaveText(
    `Upgrade · ¢${battery.levels[3].buildCost.toLocaleString("en-US")}`,
  );

  await rows.first().locator('[data-action="decommission-deployable"]').click();
  await expect(rows).toHaveCount(0);
  // Decommissioned installations leave the map with the list.
  await expect
    .poll(() =>
      page.evaluate(
        (id) => (globalThis as HookGlobal).__tut__?.installationLook(id),
        deployableId ?? "",
      ),
    )
    .toBeUndefined();
  await expect(credits).toHaveText(
    `¢${(before - battery.levels[1].buildCost - battery.levels[2].buildCost).toLocaleString("en-US")}`,
  );

  expect(errors).toEqual([]);
});

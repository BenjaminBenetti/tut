import { expect, test } from "@playwright/test";

import { wallFamilyFor } from "../src/graphics/data/map-model-table";
import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";

/** The page's global object as seen from `page.evaluate`. */
interface HookGlobal {
  __tutTactical__?: TacticalTestHooks;
}

/** Days to advance before giving up on a mission appearing for the fixed seed. */
const MAX_DAYS = 40;

/** What the shot has to contain to be evidence of anything (#511). */
const MIN_FAMILIES = 2;

/**
 * Captures a block of buildings for the Art Director to judge, now that
 * a building picks a wall family from its id rather than every wall on
 * the map being brick (#511).
 *
 * Not an assertion of how it looks — that is a human call. What it does
 * assert is that the shot is of the real thing: a live mission on a
 * generated map, whose walled buildings really do fall into more than
 * one family, so a frame that still reads as one material is a drawing
 * bug rather than a map that happened to have one building on it.
 */
test("captures a block of buildings for review", async ({ page }) => {
  // A capture, not a gate. Its output is a file in docs/design, so it
  // stays out of every CI run:
  //   CAPTURE=1 pnpm exec playwright test e2e/wall-family-screenshot.spec.ts
  test.skip(
    process.env.CAPTURE === undefined,
    "set CAPTURE=1 to regenerate the wall-family screenshot",
  );
  await page.goto("/");
  const body = page.locator("body");
  await expect(body).toHaveAttribute("data-app-state", "ready");
  await page.locator('[data-field="seed"]').fill("4242");
  await page.locator('[data-action="new-game"]').click();
  await expect(body).toHaveAttribute("data-screen", "overworld");

  const rows = page.locator('[data-role="mission-list"] [data-mission-id]');
  const advance = page.locator('[data-action="advance-day"]');
  const choice = page.locator('[data-role="event-dialog"] [data-choice-id]');
  for (let day = 0; day < MAX_DAYS && (await rows.count()) === 0; day++) {
    if (await choice.first().isVisible()) {
      await choice.first().click();
    }
    await expect(advance).toBeEnabled();
    await advance.click();
  }
  await rows.first().click();
  await page
    .locator('[data-role="mission-details"] [data-action="plan-deployment"]')
    .click();
  await expect(body).toHaveAttribute("data-screen", "deployment");
  for (const box of await page
    .locator('[data-role="deployment-picker"] input[type="checkbox"]')
    .all()) {
    await box.check();
  }
  await page.locator('[data-action="launch"]').click();
  await expect(body).toHaveAttribute("data-screen", "tactical");
  await expect(page.locator("#tactical-viewport canvas")).toBeVisible();

  // Every building that actually has a wall face on it, from the map the
  // mission is being played on rather than from a regenerated copy.
  const buildings = await page.evaluate(() => {
    const raw = localStorage.getItem("tut:save:autosave");
    if (raw === null) return null;
    const envelope = JSON.parse(raw) as {
      state: {
        activeMission?: {
          map: {
            tiles: {
              buildingId?: string;
              walls: Record<string, string | undefined>;
            }[];
          };
        };
      };
    };
    const tiles = envelope.state.activeMission?.map.tiles;
    if (!tiles) return null;
    const ids = new Set<string>();
    for (const tile of tiles) {
      const walled = Object.values(tile.walls).some((w) => w !== undefined);
      if (walled && tile.buildingId !== undefined) {
        ids.add(tile.buildingId);
      }
    }
    return [...ids];
  });
  expect(buildings, "the mission's map was readable").not.toBeNull();
  if (!buildings) return;
  // The shot is worth taking only if the block is genuinely mixed.
  const families = new Set(buildings.map((id) => wallFamilyFor(id)));
  expect(
    families.size,
    `${String(buildings.length)} walled buildings drew ${String(families.size)} families`,
  ).toBeGreaterThanOrEqual(MIN_FAMILIES);

  // Frame the buildings rather than the deploy zone, and let the banner
  // clear before the shutter or it covers the map.
  await page.evaluate(() =>
    (globalThis as HookGlobal).__tutTactical__?.selectUnit("unit-1"),
  );
  await expect
    .poll(
      async () => page.locator("#phase-banner").getAttribute("data-visible"),
      { timeout: 15_000 },
    )
    .not.toBe("true");
  await page.waitForTimeout(600);
  await page.screenshot({ path: "docs/design/tactical-wall-families.png" });
});

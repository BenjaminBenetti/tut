import { expect, test } from "@playwright/test";

import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";

/** The page's global object as seen from `page.evaluate`. */
interface HookGlobal {
  __tutTactical__?: TacticalTestHooks;
}

/** Days to advance before giving up on a mission appearing for the fixed seed. */
const MAX_DAYS = 40;

/**
 * Captures a mission with fog of war in place, for the Director to judge
 * before it goes in front of the Executive Director (#531).
 *
 * Not an assertion of how it looks — that is a human call. What it does
 * assert is that the shot is of the real thing: a live mission, on a
 * generated map, with the player's own vision deciding what is drawn.
 */
test("captures a mission with fog of war for review", async ({ page }) => {
  // A capture, not a gate. It costs about twenty seconds and its output
  // is two files in docs/design, so it stays out of every CI run:
  //   CAPTURE=1 pnpm exec playwright test e2e/fog-screenshot.spec.ts
  test.skip(
    process.env.CAPTURE === undefined,
    "set CAPTURE=1 to regenerate the fog screenshots",
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

  // Select a unit so the range field and the selection ring are up too.
  await page.evaluate(() =>
    (globalThis as HookGlobal).__tutTactical__?.selectUnit("unit-1"),
  );
  await expect(body).toHaveAttribute("data-selected-unit", "unit-1");

  // The map is drawn from the player's own vision, so what the shot
  // shows is what the player knows: explored ground and nothing else.
  const known = await page.evaluate(() => {
    const raw = localStorage.getItem("tut:save:autosave");
    if (raw === null) return null;
    const envelope = JSON.parse(raw) as {
      state: {
        activeMission?: {
          map: { tiles: unknown[] };
          units: { team: string }[];
          vision: { tdf: { visible: number[]; explored: number[] } };
        };
      };
    };
    const m = envelope.state.activeMission;
    if (!m) return null;
    return {
      tiles: m.map.tiles.length,
      explored: m.vision.tdf.explored.length,
      visible: m.vision.tdf.visible.length,
      bugs: m.units.filter((u) => u.team === "bugs").length,
    };
  });
  expect(known).not.toBeNull();
  if (!known) return;
  // Fog is really hiding something: the squad has seen part of the map,
  // not all of it.
  expect(known.explored).toBeGreaterThan(0);
  expect(known.explored).toBeLessThan(known.tiles);

  await page.waitForTimeout(400);
  await page.screenshot({ path: "docs/design/tactical-fog-of-war.png" });

  // Turn one only shows "black beyond the edge". Walk the force and let
  // the bugs come on, so the second shot shows the parts that matter:
  // ground the squad remembers but cannot currently see, and a bug that
  // has actually been spotted.
  const step = await page.evaluate(() => {
    const raw = localStorage.getItem("tut:save:autosave");
    if (raw === null) return null;
    const envelope = JSON.parse(raw) as {
      state: {
        activeMission?: {
          units: {
            id: string;
            team: string;
            pos: { x: number; y: number; z: number };
          }[];
          extraction: { x: number; y: number; z: number }[];
        };
      };
    };
    const m = envelope.state.activeMission;
    const unit = m?.units.find((u) => u.id === "unit-1");
    if (!m || !unit) return null;
    const away = [...m.extraction].sort(
      (a, b) =>
        Math.abs(b.x - unit.pos.x) +
        Math.abs(b.z - unit.pos.z) -
        (Math.abs(a.x - unit.pos.x) + Math.abs(a.z - unit.pos.z)),
    );
    return away[0] ?? null;
  });
  if (step) {
    await page.evaluate(
      (tile) => (globalThis as HookGlobal).__tutTactical__?.selectTile(tile),
      step,
    );
  }
  for (let turn = 0; turn < 6; turn++) {
    await page.locator('#action-bar [data-action="end-turn"]').click();
    await page.waitForTimeout(150);
  }
  await page.evaluate(() =>
    (globalThis as HookGlobal).__tutTactical__?.selectUnit("unit-1"),
  );
  // Let the phase banner finish before the shutter, or it covers the map.
  await expect
    .poll(
      async () => page.locator("#phase-banner").getAttribute("data-visible"),
      { timeout: 15_000 },
    )
    .not.toBe("true");
  await page.waitForTimeout(600);
  await page.screenshot({ path: "docs/design/tactical-fog-of-war-turn7.png" });
});

import { expect, test } from "@playwright/test";

import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";

/** The page's global object as seen from `page.evaluate`. */
interface HookGlobal {
  __tutTactical__?: TacticalTestHooks;
}

/** Days to advance before giving up on a mission appearing for the fixed seed. */
const MAX_DAYS = 40;

/**
 * QA's repro for #627, walked in the browser: the context menu opened and
 * then nothing closed it, so it sat over the map for the rest of the
 * mission offering an action that no longer applied.
 *
 * The unit tests cover each dismissal path; this one exists because the
 * fault was in the wiring between two pieces that each had passing tests
 * of their own, and only a real mission puts them together.
 */
test("the context menu opens on a right click and every way out closes it", async ({
  page,
}) => {
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

  const menu = page.locator("#radial-menu");
  await expect(menu).toBeHidden();

  /** A tile the selected unit can walk to: the deploy zone it stands on. */
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
    const unit = m?.units.find((u) => u.team === "tdf");
    if (!m || !unit) return null;
    // Not one a squadmate is standing on: an occupied tile has no path
    // to it, so the menu would have nothing to offer.
    const taken = new Set(
      m.units.map((u) => `${u.pos.x},${u.pos.y},${u.pos.z}`),
    );
    const away = m.extraction
      .filter((t) => !taken.has(`${t.x},${t.y},${t.z}`))
      .sort(
        (a, b) =>
          Math.abs(a.x - unit.pos.x) +
          Math.abs(a.z - unit.pos.z) -
          (Math.abs(b.x - unit.pos.x) + Math.abs(b.z - unit.pos.z)),
      );
    return away[0] === undefined ? null : { unitId: unit.id, to: away[0] };
  });
  expect(step).not.toBeNull();
  if (!step) return;

  await page.evaluate(
    (unitId) => (globalThis as HookGlobal).__tutTactical__?.selectUnit(unitId),
    step.unitId,
  );
  // Arm Attack, so a right click on a tile is the gap the menu fills.
  await page.locator('#action-bar [data-action="attack"]').click();

  // Escape closes it.
  await page.evaluate(
    (tile) => (globalThis as HookGlobal).__tutTactical__?.invokeTile(tile),
    step.to,
  );
  await expect(menu).toHaveAttribute("data-open", "true");
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();

  // Choosing the item closes it and moves the unit — once.
  await page.locator('#action-bar [data-action="attack"]').click();
  await page.evaluate(
    (tile) => (globalThis as HookGlobal).__tutTactical__?.invokeTile(tile),
    step.to,
  );
  await expect(menu).toHaveAttribute("data-open", "true");
  await menu.locator("button[data-item]").first().click();
  await expect(menu).toBeHidden();

  await expect
    .poll(async () =>
      page.evaluate((unitId) => {
        const raw = localStorage.getItem("tut:save:autosave");
        if (raw === null) return null;
        const envelope = JSON.parse(raw) as {
          state: {
            activeMission?: {
              units: { id: string; pos: { x: number; y: number; z: number } }[];
            };
          };
        };
        const u = envelope.state.activeMission?.units.find(
          (unit) => unit.id === unitId,
        );
        return u ? `${u.pos.x},${u.pos.y},${u.pos.z}` : null;
      }, step.unitId),
    )
    .toBe(`${step.to.x},${step.to.y},${step.to.z}`);
});

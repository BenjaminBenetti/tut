import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";
import { openUnitWheel, wheelItem } from "./action-wheel.helper";

/** The page's global object as seen from `page.evaluate`. */
interface HookGlobal {
  __tutTactical__?: TacticalTestHooks;
}

/** Days to advance before giving up on a mission appearing for the fixed seed. */
const MAX_DAYS = 40;

/** The card's placeholder, shown for a field a unit has nothing to say about. */
const EMPTY_FIELD = "—";

/** Seed whose first mission deploys three TDF units on a temperate city map. */
const SEED = "4242";

/** Reads the selected unit's status list out of the autosave. */
async function statusInSave(page: Page, unitId: string) {
  return page.evaluate((id) => {
    const raw = localStorage.getItem("tut:save:autosave");
    if (raw === null) {
      return undefined;
    }
    const mission = (
      JSON.parse(raw) as {
        state: {
          activeMission?: {
            units: { id: string; status: string[]; ap: number }[];
          };
        };
      }
    ).state.activeMission;
    return mission?.units.find((unit) => unit.id === id);
  }, unitId);
}

/**
 * Overwatch is the one tactical action that reports its own state on three
 * surfaces at once — the card's Status row, the card's spent AP and Attacks,
 * and a line in the event log — and nothing in the suite asserted any of it
 * (found while playing the tactical layer for #1027).
 *
 * ```
 *   before ──► Status —        AP 2 / 2   Attacks 2
 *   press  ──► [3] Overwatch
 *   after  ──► Status overwatch AP 0 / 2  Attacks 0   log: "… is overwatch"
 * ```
 *
 * That agreement is the standard the other actions are held to, and #1026's
 * epic rewrites the surfaces it lives on, so it is pinned here before the
 * rewrite rather than after. The assertions are deliberately about what the
 * player can see: the save is checked last, to say the HUD and the mission
 * agree rather than to stand in for the HUD.
 */
test("overwatch reports itself on the unit card and in the event log", async ({
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
  await page.locator('[data-field="seed"]').fill(SEED);
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
  await expect(rows.first()).toBeVisible();

  await rows.first().click();
  await page
    .locator('[data-role="mission-details"] [data-action="plan-deployment"]')
    .click();
  await expect(body).toHaveAttribute("data-screen", "deployment");
  const picks = page.locator(
    '#deploy-squads input[type="checkbox"]:not(:disabled), #deploy-mechs input[type="checkbox"]:not(:disabled)',
  );
  for (let index = 0, count = await picks.count(); index < count; index++) {
    await picks.nth(index).check();
  }
  await page.locator('[data-action="launch"]').click();
  await expect(body).toHaveAttribute("data-screen", "tactical");
  await expect(page.locator("#tactical-viewport canvas")).toBeVisible();
  await expect(body).toHaveAttribute("data-tactical-units", /\d+/);

  const status = page.locator('.tut-hud__side [data-field="status"]');
  const actionPoints = page.locator('.tut-hud__side [data-field="ap"]');
  const attacks = page.locator('.tut-hud__side [data-field="attacks"]');
  const overwatch = wheelItem(page, "overwatch");

  // The control: a unit that has not acted holds its points and says nothing
  // about its status, so the assertions below cannot pass on a stale card.
  await page.evaluate(
    (id) => (globalThis as HookGlobal).__tutTactical__?.selectUnit(id),
    "unit-1",
  );
  await expect(status).toHaveText(EMPTY_FIELD);
  await expect(actionPoints).toHaveText("2 / 2");
  // Overwatch lives on the unit's wheel (#1112).
  await openUnitWheel(page, "unit-1");
  await expect(overwatch).toBeEnabled();

  await overwatch.click();

  // Surface one and two: the card names the state and shows what it cost.
  await expect(status).toHaveText("overwatch");
  await expect(actionPoints).toHaveText("0 / 2");
  await expect(attacks).toHaveText("0");

  // Surface three: the log carries it, so it survives the next selection.
  await expect(
    page.locator(".tut-log__list li", { hasText: "overwatch" }).last(),
  ).toBeVisible();

  // And the mission agrees with all three.
  const unit = await statusInSave(page, "unit-1");
  expect(unit?.status).toContain("overwatch");
  expect(unit?.ap).toBe(0);

  expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
});

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";
import { openUnitWheel, wheelItem } from "./action-wheel.helper";

/** The page's global object as seen from `page.evaluate`. */
interface HookGlobal {
  __tutTactical__?: TacticalTestHooks;
}

/** Days to advance before giving up on a mission appearing for the fixed seed. */
const MAX_DAYS = 40;

/** The mission a `launchMission` call played into: its id, and the city the list named it after. */
interface LaunchedMission {
  readonly missionId: string;
  readonly cityName: string;
}

/** Plays into a live mission on the fixed seed with one squad deployed. */
async function launchMission(page: Page): Promise<LaunchedMission> {
  await page.goto("/");
  const body = page.locator("body");
  await expect(body).toHaveAttribute("data-app-state", "ready");
  await page.locator('[data-field="seed"]').fill("4242");
  await page.locator('[data-action="new-game"]').click();
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
  const missionId = (await rows.first().getAttribute("data-mission-id")) ?? "";
  const cityName =
    (await rows.first().locator('[data-field="city"]').textContent())?.trim() ??
    "";
  await rows.first().click();
  await page
    .locator('[data-role="mission-details"] [data-action="plan-deployment"]')
    .click();
  await expect(body).toHaveAttribute("data-screen", "deployment");
  await page.locator('#deploy-squads input[type="checkbox"]').first().check();
  await page.locator('[data-action="launch"]').click();
  await expect(body).toHaveAttribute("data-screen", "tactical");
  return { missionId, cityName };
}

/**
 * #468 gave a mission left mid-fight a way back; #1132 removed the way
 * out that created the case — the banner's button now abandons the
 * mission rather than stepping to the overworld with it running — so
 * the mission that survives here is one the player closed the tab on.
 * The autosave brings it back through Continue, named by its city, and
 * it can still be finished; the overworld's Resume control appears only
 * while a mission is in progress and is gone once it is over.
 */
test("a mission in progress survives a reload, resumes through Continue, and is finished", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  const { missionId, cityName } = await launchMission(page);
  const body = page.locator("body");
  const resume = page.locator('#top-bar [data-action="resume-mission"]');

  // Walk away from the fight and come back to it: the autosave holds the
  // live mission and Continue lands straight on it.
  await page.reload();
  await expect(body).toHaveAttribute("data-app-state", "ready");
  await page.locator('[data-action="continue"]').click();
  await expect(body).toHaveAttribute("data-screen", "tactical");
  // Named by its city, not its id (#753) — and it is the one that was left.
  await expect(
    page.locator('#turn-banner [data-field="mission-name"]'),
  ).toHaveText(cityName);
  await expect(page.locator("#turn-banner")).not.toContainText(missionId);

  // And it can still be finished. Boarding is offered on the wheel of a
  // selected unit standing in the zone (#1112), and the force deployed
  // on the extraction hook, so the squad's own wheel is all it takes.
  await page.evaluate(() =>
    (globalThis as HookGlobal).__tutTactical__?.selectUnit("unit-1"),
  );
  await expect(body).toHaveAttribute("data-selected-unit", "unit-1");
  await openUnitWheel(page, "unit-1");
  const board = wheelItem(page, "extract");
  await expect(board).toBeEnabled();
  await board.click();
  await expect(body).toHaveAttribute("data-screen", "mission-results");

  // Once it is over the control is gone again.
  await page.locator('[data-action="continue"]').click();
  await expect(body).toHaveAttribute("data-screen", "overworld");
  await expect(resume).toBeHidden();

  expect(errors).toEqual([]);
});

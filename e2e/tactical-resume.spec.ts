import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";

/** The page's global object as seen from `page.evaluate`. */
interface HookGlobal {
  __tutTactical__?: TacticalTestHooks;
}

/** Days to advance before giving up on a mission appearing for the fixed seed. */
const MAX_DAYS = 40;

/** Plays into a live mission on the fixed seed with one squad deployed. */
async function launchMission(page: Page): Promise<string> {
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
  await rows.first().click();
  await page
    .locator('[data-role="mission-details"] [data-action="plan-deployment"]')
    .click();
  await expect(body).toHaveAttribute("data-screen", "deployment");
  await page.locator('#deploy-squads input[type="checkbox"]').first().check();
  await page.locator('[data-action="launch"]').click();
  await expect(body).toHaveAttribute("data-screen", "tactical");
  return missionId;
}

/**
 * #468: the HUD's Overworld button leaves a mission running, and before
 * this the campaign was stuck there — the overworld had no route back
 * and StartMission refused every other mission with `mission-active`.
 */
test("a mission left through the HUD can be resumed from the overworld, and finished", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  const missionId = await launchMission(page);
  const body = page.locator("body");
  const resume = page.locator('#top-bar [data-action="resume-mission"]');

  // Leave the fight the way a player can: the banner's Overworld button.
  await page.locator('#turn-banner [data-action="overworld"]').click();
  await expect(body).toHaveAttribute("data-screen", "overworld");

  // The way back is offered, and it is the mission that was left.
  await expect(resume).toBeVisible();
  await resume.click();
  await expect(body).toHaveAttribute("data-screen", "tactical");
  await expect(
    page.locator('#turn-banner [data-field="mission-id"]'),
  ).toHaveText(missionId);

  // And it can still be finished. Extract is offered for a selected unit
  // standing in the zone, and the force deployed on the extraction hook,
  // so selecting the squad is all it takes.
  await page.evaluate(() =>
    (globalThis as HookGlobal).__tutTactical__?.selectUnit("unit-1"),
  );
  await expect(body).toHaveAttribute("data-selected-unit", "unit-1");
  const extract = page.locator('#action-bar [data-action="extract"]');
  await expect(extract).toBeEnabled();
  await extract.click();
  await expect(body).toHaveAttribute("data-screen", "mission-results");

  // Once it is over the control is gone again.
  await page.locator('[data-action="continue"]').click();
  await expect(body).toHaveAttribute("data-screen", "overworld");
  await expect(resume).toBeHidden();

  expect(errors).toEqual([]);
});

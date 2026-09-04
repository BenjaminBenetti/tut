import { expect, test } from "@playwright/test";

import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";

/** The page's global object as seen from `page.evaluate`. */
interface HookGlobal {
  __tutTactical__?: TacticalTestHooks;
}

/** Days to advance before giving up on a mission appearing for the fixed seed. */
const MAX_DAYS = 40;

/**
 * The shipped M2 loop (#341): Launch plays the mission on a generated map
 * instead of rolling it, and the debrief is made from the mission that
 * was actually fought.
 *
 * The force deploys onto the extraction hook — baseline missions extract
 * where they deployed (ADR 0004 §4.6) — so a single squad can walk off
 * the map on turn one, which ends the mission as `extracted`.
 */
test("Launch plays the mission out, extraction ends it, and the debrief comes from the tactical result", async ({
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

  // Advance until the fixed seed offers a mission.
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
  const missionId = await rows.first().getAttribute("data-mission-id");
  expect(missionId).toMatch(/^mission-\d+$/);

  // Deploy one squad and launch into the mission itself.
  await rows.first().click();
  const dayBefore = Number(
    await page.locator('#top-bar [data-field="day"]').textContent(),
  );
  await page
    .locator('[data-role="mission-details"] [data-action="plan-deployment"]')
    .click();
  await expect(body).toHaveAttribute("data-screen", "deployment");
  await page.locator('#deploy-squads input[type="checkbox"]').first().check();
  await page.locator('[data-action="launch"]').click();

  await expect(body).toHaveAttribute("data-screen", "tactical");
  await expect(page.locator("#tactical-viewport canvas")).toBeVisible();
  await expect(
    page.locator('#turn-banner [data-field="mission-id"]'),
  ).toHaveText(missionId ?? "");
  await expect(page.locator('#turn-banner [data-field="turn"]')).toHaveText(
    "1",
  );
  await expect(
    page.locator('#turn-banner [data-field="tdf-units"]'),
  ).toHaveText("1");
  // The mission is still on offer: nothing is resolved until it ends.

  // The autosave carries the live mission: a reload resumes it here.
  await page.reload();
  await expect(body).toHaveAttribute("data-app-state", "ready");
  await page.locator('[data-action="continue"]').click();
  await expect(body).toHaveAttribute("data-screen", "tactical");
  await expect(
    page.locator('#turn-banner [data-field="mission-id"]'),
  ).toHaveText(missionId ?? "");

  // Walk the squad off the map. It deployed on the extraction hook, so
  // Extract is offered as soon as it is selected.
  const extract = page.locator('#action-bar [data-action="extract"]');
  await expect(extract).toBeDisabled();
  await page.evaluate(() =>
    (globalThis as HookGlobal).__tutTactical__?.selectUnit("unit-1"),
  );
  await expect(body).toHaveAttribute("data-selected-unit", "unit-1");
  await expect(extract).toBeEnabled();
  await extract.click();

  // The last unit off the map ends the mission, and the debrief is built
  // from it: extracted, with the extraction share of the reward.
  await expect(body).toHaveAttribute("data-screen", "mission-results");
  const results = page.locator('[data-screen="mission-results"]');
  await expect(results.locator('[data-field="outcome"]')).toHaveAttribute(
    "data-outcome",
    "extracted",
  );
  await expect(results.locator('[data-field="credits"]')).toBeVisible();

  // Continue advances the day, returns to the overworld, and the mission
  // is gone from the offers because it was resolved.
  await page.locator('[data-action="continue"]').click();
  await expect(body).toHaveAttribute("data-screen", "overworld");
  await expect(page.locator('#top-bar [data-field="day"]')).toHaveText(
    String(dayBefore + 1),
  );
  await expect(
    page.locator(
      `[data-role="mission-list"] [data-mission-id="${missionId ?? ""}"]`,
    ),
  ).toHaveCount(0);

  expect(errors).toEqual([]);
});

/**
 * Ending a turn hands the phase to the bugs. The bugs do not hand it back
 * yet (#412; #335's bug-phase runner is the fix), so this stops at the
 * handover rather than playing a full round.
 */
test("End turn hands the phase to the bugs", async ({ page }) => {
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
  await page.locator('#deploy-squads input[type="checkbox"]').first().check();
  await page.locator('[data-action="launch"]').click();
  await expect(body).toHaveAttribute("data-screen", "tactical");

  const phase = page.locator('#turn-banner [data-field="phase"]');
  await expect(phase).toHaveAttribute("data-phase", "player");
  await page.locator('#action-bar [data-action="end-turn"]').click();
  await expect(phase).toHaveAttribute("data-phase", "bugs");
});

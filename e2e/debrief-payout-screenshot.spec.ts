/// <reference types="node" />
import { readFileSync } from "node:fs";

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";

/** The page's global object as seen from `page.evaluate`. */
interface HookGlobal {
  __tutTactical__?: TacticalTestHooks;
}

/** Days to advance before giving up on a mission appearing for the fixed seed. */
const MAX_DAYS = 40;

/** The autosave slot the mech-loss case is staged through. */
const SAVE_KEY = "tut:save:autosave";

/** Where the frames go. */
const FRAMES = "docs/design/debrief-payout";

/** Advances to the first mission on the fixed seed and opens its deployment. */
async function toDeployment(page: Page, query: string): Promise<void> {
  await page.goto(`/${query}`);
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
  await rows.first().click();
  await page
    .locator('[data-role="mission-details"] [data-action="plan-deployment"]')
    .click();
  await expect(body).toHaveAttribute("data-screen", "deployment");
  for (const box of await page
    .locator(
      '#deploy-squads input[type="checkbox"], #deploy-mechs input[type="checkbox"]',
    )
    .all()) {
    await box.check();
  }
}

/** Screenshots the debrief panel once it has drawn. */
async function shootDebrief(page: Page, path: string): Promise<void> {
  await expect(page.locator("body")).toHaveAttribute(
    "data-screen",
    "mission-results",
  );
  const panel = page.locator('section[data-screen="mission-results"]');
  await expect(panel.locator('[data-field="credits"]')).toBeVisible();
  await panel.screenshot({ path });
}

/**
 * The #740 pair: the debrief after a mission that cost nothing, and
 * after one that cost a mech.
 *
 * The debrief is DOM rather than a WebGL canvas, so unlike the tactical
 * captures (#996) it does not depend on a camera and reproduces across
 * runs — asserted below rather than assumed.
 *
 * The mech-loss case is **staged, and says so**: the auto-resolver did
 * not destroy a mech on any seed I tried, including a lone mech at a
 * hundred times threat, so the mission's own mech is killed in the save
 * and the squads then walk off the map. The resolver reports the loss
 * because the loss is real in the mission state; only the route to it
 * is short.
 *
 *   CAPTURE=1 pnpm exec playwright test e2e/debrief-payout-screenshot.spec.ts
 */
test("captures the debrief payout, clean and after a mech loss", async ({
  page,
}) => {
  test.skip(
    process.env.CAPTURE === undefined,
    "set CAPTURE=1 to regenerate the debrief frames",
  );
  const body = page.locator("body");

  // Clean: the auto-resolver wins this mission outright on seed 4242.
  await toDeployment(page, "?autoResolve=1");
  await page.locator('[data-action="launch"]').click();
  await shootDebrief(page, `${FRAMES}-clean.png`);
  const clean = page.locator('section[data-screen="mission-results"]');
  expect(
    await clean
      .locator('[data-field="mechs-destroyed"]')
      .getAttribute("data-count"),
  ).toBe("0");
  expect(
    await clean.locator('[data-field="rewards"]').getAttribute("data-promoted"),
  ).toBe("true");

  // Mech loss: play the mission for real, kill the mech in the mission
  // state, then walk the squads off.
  await toDeployment(page, "");
  await page.locator('[data-action="launch"]').click();
  await expect(body).toHaveAttribute("data-screen", "tactical");
  await expect(body).toHaveAttribute("data-tactical-units", /^[1-9]\d*$/);
  await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (raw === null) {
      return;
    }
    const save = JSON.parse(raw) as {
      state: {
        activeMission?: { units: { id: string; kind: string; hp: number }[] };
      };
    };
    const mech = save.state.activeMission?.units.find((u) => u.kind === "mech");
    if (mech) {
      mech.hp = 0;
    }
    localStorage.setItem(key, JSON.stringify(save));
  }, SAVE_KEY);
  await page.reload();
  await expect(body).toHaveAttribute("data-app-state", "ready");
  await page.locator('[data-action="continue"]').click();
  await expect(body).toHaveAttribute("data-screen", "tactical");
  await expect(body).toHaveAttribute("data-tactical-units", /^[1-9]\d*$/);

  const extract = page.locator('#action-bar [data-action="extract"]');
  for (const unitId of ["unit-2", "unit-3"]) {
    await page.evaluate(
      (id) => (globalThis as HookGlobal).__tutTactical__?.selectUnit(id),
      unitId,
    );
    if (await extract.isEnabled()) {
      await extract.click();
    }
  }
  await shootDebrief(page, `${FRAMES}-mech-lost.png`);
  const lost = page.locator('section[data-screen="mission-results"]');
  expect(
    await lost
      .locator('[data-field="mechs-destroyed"]')
      .getAttribute("data-count"),
  ).not.toBe("0");
  // The case GDD 5.8 cares about: the payout stays at the foot.
  expect(
    await lost.locator('[data-field="rewards"]').getAttribute("data-promoted"),
  ).toBe("false");

  // The debrief is DOM: it must reproduce. Shot again, same run, same
  // state -- if this ever differs the frames are not evidence.
  await shootDebrief(page, `${FRAMES}-mech-lost-again.png`);
  expect(
    readFileSync(`${FRAMES}-mech-lost.png`).equals(
      readFileSync(`${FRAMES}-mech-lost-again.png`),
    ),
    "the debrief must render identically when nothing changed",
  ).toBe(true);
});

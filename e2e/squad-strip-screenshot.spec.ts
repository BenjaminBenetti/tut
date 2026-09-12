import { expect, test } from "@playwright/test";

import { drawnFrame } from "./capture-frame.helper";
import { launchMission, settleForShot } from "./mission-capture.helper";
import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";
import { openUnitWheel, wheelItem } from "./action-wheel.helper";

interface HookGlobal {
  __tutTactical__?: TacticalTestHooks;
}

/**
 * Captures the squad strip and the recovery it provides (#1041).
 *
 * The reported cases are QA's: readiness was answerable only by clicking
 * each unit, and a selected unit off screen had no way back. The
 * **control** is the scene itself — selection, the reach overlay and its
 * colour and shape encoding are untouched by a change that only adds a
 * reader of unit state.
 */
test("captures squad readiness, recovery, and the untouched scene", async ({
  page,
}) => {
  test.skip(
    process.env.CAPTURE === undefined,
    "set CAPTURE=1 to regenerate the squad strip screenshots",
  );
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await launchMission(page, "4242");
  await settleForShot(page);

  await page.evaluate(() =>
    (globalThis as HookGlobal).__tutTactical__?.selectUnit("unit-1"),
  );
  await drawnFrame(page);

  // The whole force with its readiness, beside the card that shows one.
  const rail = page.locator(".tut-hud__side");
  await expect(
    page.locator('[data-role="squad-list"] li').first(),
  ).toBeVisible();
  await rail.screenshot({ path: "docs/design/ui-squad-strip.png" });

  // The reach overlay and the selection ring, unchanged: the control.
  await page.screenshot({ path: "docs/design/ui-squad-strip-scene.png" });

  // Spend a unit, and the strip and End turn both say so.
  await openUnitWheel(page, "unit-1");
  await wheelItem(page, "overwatch").click({ force: true });
  await drawnFrame(page);
  await rail.screenshot({ path: "docs/design/ui-squad-strip-spent.png" });
  await expect(
    page.locator('[data-action="end-turn"] .tut-btn__label'),
  ).toContainText("unspent");
  await page.screenshot({ path: "docs/design/ui-squad-strip-endturn.png" });

  // Recovery: pick another unit from the strip and the camera follows.
  const other = page
    .locator('[data-role="squad-list"] li[data-selected="false"]')
    .first();
  await other.click();
  await drawnFrame(page);
  await page.screenshot({ path: "docs/design/ui-squad-strip-recovered.png" });
});

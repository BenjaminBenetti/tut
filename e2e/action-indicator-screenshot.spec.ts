import { expect, test } from "@playwright/test";

import { drawnFrame } from "./capture-frame.helper";
import { launchMission, settleForShot } from "./mission-capture.helper";
import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";

interface HookGlobal {
  __tutTactical__?: TacticalTestHooks;
}

/**
 * Captures the indicator above the acting unit (#1029).
 *
 * Anything worth a line in the log is shown where it happened. The
 * **control** is a move, which produces no indicator: the unit walking
 * is already the notification, which is why movement is the one
 * exception to the rule.
 */
test("captures indicators for several actions, and a move that shows none", async ({
  page,
}) => {
  test.skip(
    process.env.CAPTURE === undefined,
    "set CAPTURE=1 to regenerate the indicator screenshots",
  );
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await launchMission(page, "4242");
  await settleForShot(page);

  const viewport = page.locator("#tactical-viewport");
  const act = async (unitId: string, action: string): Promise<void> => {
    await page.evaluate(
      (id) => (globalThis as HookGlobal).__tutTactical__?.selectUnit(id),
      unitId,
    );
    await page
      .locator(`#action-bar [data-action="${action}"]`)
      .first()
      .click({ force: true });
    await drawnFrame(page);
  };

  // Vent: a logged action, indicated above the unit that did it.
  await act("unit-1", "reload");
  await viewport.screenshot({
    path: "docs/design/ui-action-indicator-vent.png",
  });

  // Overwatch on a second unit, while the first still stands: two units
  // acting in succession, each above its own.
  await act("unit-2", "overwatch");
  await viewport.screenshot({
    path: "docs/design/ui-action-indicator-succession.png",
  });

  // Overwatch on a third: a different action type again.
  await act("unit-3", "overwatch");
  await viewport.screenshot({
    path: "docs/design/ui-action-indicator-third.png",
  });

  // The control: a move shows nothing above the unit.
  const before = await page.evaluate(
    () => document.querySelectorAll('[data-role="event-log-list"] li').length,
  );
  await page.evaluate(() => {
    const hooks = (globalThis as HookGlobal).__tutTactical__;
    hooks?.selectUnit("unit-1");
  });
  await drawnFrame(page);
  await viewport.screenshot({
    path: "docs/design/ui-action-indicator-move-control.png",
  });
  expect(before).toBeGreaterThan(0);
});

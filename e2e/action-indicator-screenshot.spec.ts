import { expect, test } from "@playwright/test";

import { drawnFrame, neighbourTileOf } from "./capture-frame.helper";
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
  /**
   * How many events the log has recorded — **not** how many rows it
   * shows. The log collapses identical adjacent lines into `×N`, so two
   * Rifle Squads going on overwatch in succession produce one row, and
   * counting rows reports the second one as "nothing happened". That is
   * a real trap and it caught this spec: with the row count, the third
   * frame failed its own check for a unit that had acted perfectly well.
   */
  const logged = (): Promise<number> =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-role="event-log-list"] li')].reduce(
        (total, row) =>
          total + Number((row as HTMLElement).dataset.repeat ?? "1"),
        0,
      ),
    );

  /**
   * Performs an action and refuses to continue unless the rules actually
   * logged it.
   *
   * The indicator is drawn in the canvas, so no selector can assert it
   * directly — but it mirrors the log by construction (`describeEvent`
   * produces both), so "the log grew" is the precondition for a chip
   * existing. Without this check the spec screenshots whatever is on
   * screen, which is how the first version of it committed a frame named
   * `-vent` that showed **no indicator at all**: the mech starts at
   * heat 4/4, the rules refused the vent, and the capture passed because
   * nothing asked whether anything had happened.
   */
  const act = async (unitId: string, action: string): Promise<void> => {
    const before = await logged();
    await page.evaluate(
      (id) => (globalThis as HookGlobal).__tutTactical__?.selectUnit(id),
      unitId,
    );
    await page
      .locator(`#action-bar [data-action="${action}"]`)
      .first()
      .click({ force: true });
    await drawnFrame(page);
    expect(
      await logged(),
      `${action} on ${unitId} logged nothing, so there is no indicator to capture`,
    ).toBeGreaterThan(before);
  };

  // ===========================================
  // The control first, on a board where nothing has acted
  // ===========================================

  // A real move, with no indicator for it — and it runs **first** for
  // two reasons the previous version got wrong.
  //
  // It only *selected* a unit and called that a move, so the control for
  // "movement is the exception" never moved anything. And by the time it
  // ran, all three units had spent their action points on overwatch, so
  // it could not have moved one even if it had tried.
  //
  // Running it here also means no earlier chip can still be on screen.
  // A notice dwells for a couple of seconds, so a control taken after
  // the others shows the *previous* action's chip under a caption saying
  // there is none.
  const restBefore = await logged();
  const from = await page.evaluate(() =>
    (globalThis as HookGlobal).__tutTactical__?.unitScreenPosition("unit-2"),
  );
  const spot = await neighbourTileOf(page, "unit-2");
  expect(spot, "no neighbouring tile on screen to move onto").toBeDefined();
  await page.evaluate(() =>
    (globalThis as HookGlobal).__tutTactical__?.selectUnit("unit-2"),
  );
  await page.mouse.click(spot?.x ?? 0, spot?.y ?? 0, { button: "right" });
  await drawnFrame(page);
  const to = await page.evaluate(() =>
    (globalThis as HookGlobal).__tutTactical__?.unitScreenPosition("unit-2"),
  );
  // It really moved, so this is a control over movement rather than over
  // a click that did nothing.
  expect(to).not.toEqual(from);
  // ...and movement reaches neither the log (#1028) nor the unit (#1029).
  expect(await logged()).toBe(restBefore);
  await viewport.screenshot({
    path: "docs/design/ui-action-indicator-move-control.png",
  });

  // ===========================================
  // Then the actions that do show
  // ===========================================

  // A mech acting, indicated above it. This was a vent until the frame
  // showed that a vent is not something a mech can do on turn 1 — every
  // pool starts full, so the rules refuse it. #1062 makes the button
  // correctly unavailable in that state, which means the old frame was
  // evidence of that defect rather than of this feature.
  await act("unit-1", "overwatch");
  await viewport.screenshot({
    path: "docs/design/ui-action-indicator-mech.png",
  });

  // A second unit, while the first still stands: two units acting in
  // succession, each above its own.
  await act("unit-2", "overwatch");
  await viewport.screenshot({
    path: "docs/design/ui-action-indicator-succession.png",
  });

  // And a third.
  await act("unit-3", "overwatch");
  await viewport.screenshot({
    path: "docs/design/ui-action-indicator-third.png",
  });
});

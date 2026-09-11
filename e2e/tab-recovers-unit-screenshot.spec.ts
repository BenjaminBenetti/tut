import { expect, test } from "@playwright/test";

import { drawnFrame, tapCameraKey } from "./capture-frame.helper";
import { launchMission, settleForShot } from "./mission-capture.helper";
import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";

interface HookGlobal {
  __tutTactical__?: TacticalTestHooks;
}

/** Pan taps to push the whole squad out of view (96 px each). */
const PAN_TAPS = 14;

/**
 * Captures Tab bringing an off-screen unit back into view (#1073).
 *
 * Before this, Tab selected the next unit and left the camera where it
 * was, so a player cycling with Tab could land on an armed unit they
 * could not see — the defect a squad-strip row had already fixed for the
 * mouse. Both frames assert their own precondition, so neither can be a
 * picture of something other than its caption: every player unit is off
 * screen before the press, and the selected one is on screen after it.
 */
test("captures Tab recovering a unit the camera had panned away from", async ({
  page,
}) => {
  test.skip(
    process.env.CAPTURE === undefined,
    "set CAPTURE=1 to regenerate the Tab-recovery screenshots",
  );
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await launchMission(page, "4242");
  await settleForShot(page);

  const viewport = page.locator("#tactical-viewport");
  const box = await viewport.boundingBox();
  if (!box) throw new Error("no tactical viewport");

  /** Whether a unit's feet are drawn inside the tactical viewport. */
  const onScreen = async (unitId: string): Promise<boolean> => {
    const at = await page.evaluate(
      (id) =>
        (globalThis as HookGlobal).__tutTactical__?.unitScreenPosition(id),
      unitId,
    );
    return (
      at !== undefined &&
      at.x >= box.x &&
      at.x <= box.x + box.width &&
      at.y >= box.y &&
      at.y <= box.y + box.height
    );
  };
  const squad = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-role="squad-list"] li')]
      .map((row) => row.dataset.unitId ?? "")
      .filter((id) => id !== ""),
  );
  expect(squad.length, "the strip lists the force").toBeGreaterThan(1);

  await page.evaluate(
    (id) => (globalThis as HookGlobal).__tutTactical__?.selectUnit(id),
    squad[0] ?? "",
  );
  for (let tap = 0; tap < PAN_TAPS; tap++) {
    await tapCameraKey(page, "ArrowLeft");
  }

  // Before: nobody in view, so whichever unit Tab picks, it was lost.
  for (const id of squad) {
    expect(await onScreen(id), `${id} should be panned out of view`).toBe(
      false,
    );
  }
  await viewport.screenshot({
    path: "docs/design/ui-tab-recovers-before.png",
  });

  // A real key, not the next-unit intent: the claim is about what a
  // player pressing Tab gets.
  await page.keyboard.press("Tab");
  await drawnFrame(page);

  const selected = await page.evaluate(
    () =>
      document.querySelector<HTMLElement>(
        '[data-role="squad-list"] li[data-selected="true"]',
      )?.dataset.unitId,
  );
  expect(selected, "Tab selected a unit").toBeDefined();
  expect(selected, "Tab moved to the next unit").not.toBe(squad[0]);
  // After: the unit Tab selected is back in view.
  expect(await onScreen(selected ?? ""), "Tab brought it on screen").toBe(true);
  await viewport.screenshot({
    path: "docs/design/ui-tab-recovers-after.png",
  });
});

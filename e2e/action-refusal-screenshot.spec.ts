import { expect, test } from "@playwright/test";

import { drawnFrame } from "./capture-frame.helper";
import { launchMission, settleForShot } from "./mission-capture.helper";
import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";
import { openUnitWheel, wheelItem } from "./action-wheel.helper";

interface HookGlobal {
  __tutTactical__?: TacticalTestHooks;
}

/**
 * Captures refusals that used to be silent (#1030).
 *
 * Each frame is an action the player attempted and could not take, with
 * the reason above the unit that could not act. The **control** is the
 * same rail with an available action, which must read exactly as it did
 * before: this change adds words to refusals, it does not alter an
 * action that works.
 */
test("captures refusals that used to be silent, and an available action", async ({
  page,
}) => {
  test.skip(
    process.env.CAPTURE === undefined,
    "set CAPTURE=1 to regenerate the refusal screenshots",
  );
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await launchMission(page, "4242");
  await settleForShot(page);

  const viewport = page.locator("#tactical-viewport");
  const status = page.locator('[data-role="status"]');
  // The action's letter, which is the one way left to *ask* for an
  // action the wheel has already marked closed (#1112): a closed wheel
  // entry carries its reason on its face and cannot be picked, so the
  // refusal below is the keyboard's. The key goes through the real
  // document listener, so this is what a player can produce.
  const press = async (
    action: "interact" | "overwatch" | "move",
  ): Promise<void> => {
    await page.evaluate(() =>
      (globalThis as HookGlobal).__tutTactical__?.selectUnit("unit-1"),
    );
    await page.locator("#tactical-viewport canvas").hover();
    await page.keyboard.press(
      { interact: "i", overwatch: "o", move: "m" }[action],
    );
    await drawnFrame(page);
  };

  // The control first: an available action, unchanged.
  await page.evaluate(() =>
    (globalThis as HookGlobal).__tutTactical__?.selectUnit("unit-1"),
  );
  await drawnFrame(page);
  await expect(status).toBeHidden();
  await viewport.screenshot({
    path: "docs/design/ui-action-refusal-control.png",
  });

  // The wheel says why before anything is pressed: the unit's own wheel
  // with Interact absent (nothing in reach) and Reload closed.
  await openUnitWheel(page, "unit-1");
  await expect(wheelItem(page, "reload")).toBeDisabled();
  await viewport.screenshot({
    path: "docs/design/ui-action-refusal-wheel.png",
  });
  await page.keyboard.press("Escape");

  // Interact with no objective in reach: previously silent.
  await press("interact");
  await expect(status).toBeVisible();
  await viewport.screenshot({
    path: "docs/design/ui-action-refusal-interact.png",
  });

  // Spend the unit's actions, then ask it to act. Overwatch costs one
  // action point each time, so this presses until the refusal appears
  // rather than assuming how many the unit has.
  for (let i = 0; i < 4; i++) {
    await press("overwatch");
    const text = await status.textContent();
    if ((text ?? "").includes("action points")) {
      break;
    }
  }
  await expect(status).toContainText("action points");
  await viewport.screenshot({
    path: "docs/design/ui-action-refusal-spent.png",
  });

  // ...and the same unit refusing a different action for the same
  // reason, which is the consistency the ticket is about.
  await press("move");
  await expect(status).toContainText("action points");
  await viewport.screenshot({
    path: "docs/design/ui-action-refusal-move.png",
  });

  // The right click, which is how a player actually moves (#1062). The
  // frame above is the *button* refusing; this one is the gesture, and
  // it said nothing at all until #1062. It goes through real mouse
  // input rather than `invokeTile`, because the claim is about what a
  // player can produce, and the hook bypasses tile picking entirely.
  await page.evaluate(() =>
    (globalThis as HookGlobal).__tutTactical__?.selectUnit("unit-1"),
  );
  const spot = await page.evaluate(() => {
    const hooks = (globalThis as HookGlobal).__tutTactical__;
    const here = hooks?.unitScreenPosition("unit-1");
    if (!hooks || !here) {
      return undefined;
    }
    // The hooks say where a tile is drawn, not which tile a unit stands
    // on, so the unit's tile is found as the one drawn nearest its feet
    // and the target is that tile's neighbour. No pixel thresholds: the
    // first version guessed a distance band for "one tile away" and
    // found nothing, which measured my guess rather than the map.
    let mine: { x: number; y: number; z: number } | undefined;
    let best = Infinity;
    for (let x = 0; x < 96; x++) {
      for (let z = 0; z < 96; z++) {
        for (let y = 0; y < 4; y++) {
          const at = hooks.tileScreenPosition({ x, y, z });
          if (!at) {
            continue;
          }
          const d = Math.hypot(at.x - here.x, at.y - here.y);
          if (d < best) {
            best = d;
            mine = { x, y, z };
          }
        }
      }
    }
    if (!mine) {
      return undefined;
    }
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const at = hooks.tileScreenPosition({
        x: mine.x + (dx ?? 0),
        y: mine.y,
        z: mine.z + (dz ?? 0),
      });
      if (at) {
        return { x: at.x, y: at.y, from: mine };
      }
    }
    return undefined;
  });
  expect(spot, "no neighbouring tile found to right click").toBeDefined();
  await page.mouse.click(spot?.x ?? 0, spot?.y ?? 0, { button: "right" });
  await drawnFrame(page);
  await expect(status).toContainText("action points");
  await viewport.screenshot({
    path: "docs/design/ui-action-refusal-rightclick.png",
  });
});

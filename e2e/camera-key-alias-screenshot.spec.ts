/// <reference types="node" />
import { readFileSync, rmSync } from "node:fs";

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";
import { drawnFrame, tapCameraKey } from "./capture-frame.helper";
import { launchMission, settleForShot } from "./mission-capture.helper";

/** The page's global object as seen from `page.evaluate`. */
interface HookGlobal {
  __tutTactical__?: TacticalTestHooks;
}

/** Where the frames go. */
const FRAMES = "docs/design/camera-key-alias";

/** The unit that pans past its own refusal: the mech. */
const UNIT = "unit-1";

/** The banner's status line, as rendered. */
async function status(page: Page): Promise<string> {
  return (
    (await page.locator('#turn-banner [data-role="status"]').textContent()) ??
    ""
  );
}

/** Where the unit is drawn, so a pan can be seen to have happened. */
async function unitOnScreen(page: Page): Promise<{ x: number; y: number }> {
  const at = await page.evaluate(
    (id) => (globalThis as HookGlobal).__tutTactical__?.unitScreenPosition(id),
    UNIT,
  );
  if (!at) {
    throw new Error("the unit must be on screen");
  }
  return at;
}

/**
 * The #1091 evidence: panning left past a unit that has spent its turn.
 *
 * `a` was the camera's pan-left key and an Attack alias at once, so each
 * leftward pan armed Attack and, on a unit with no action points, said
 * so above the unit and in the status line. After the change the camera
 * moves and nothing is said.
 *
 * `KEY_FRAME=before` captures the same presses against the baseline tree
 * and asserts the refusal really appears, so a "before" cannot be a
 * second copy of the fix.
 *
 *   CAPTURE=1 pnpm exec playwright test e2e/camera-key-alias-screenshot.spec.ts
 */
test("captures a leftward pan past a spent unit", async ({ page }) => {
  test.skip(
    process.env.CAPTURE === undefined,
    "set CAPTURE=1 to regenerate the camera key alias frames",
  );
  const baseline = process.env.KEY_FRAME === "before";
  await page.setViewportSize({ width: 1280, height: 720 });
  await launchMission(page, "4242");
  await settleForShot(page);

  // Spend the turn by walking: six tiles up the column and back takes
  // both action points and leaves the mech where the camera frames it. Moving rather than going on overwatch, because a
  // move is not logged (#1028) and so raises no chip of its own -- any
  // words above the unit in the frame can only have come from the pan
  // keys. Overwatch's chip outlived a three-second wait under SwiftShader.
  for (const z of [23, 29]) {
    await page.evaluate(
      (id) => (globalThis as HookGlobal).__tutTactical__?.selectUnit(id),
      UNIT,
    );
    await page.evaluate(
      (target) =>
        (globalThis as HookGlobal).__tutTactical__?.invokeTile({
          x: 8,
          y: 2,
          z: target,
        }),
      z,
    );
    await page.waitForTimeout(700);
  }
  await page.evaluate(
    (id) => (globalThis as HookGlobal).__tutTactical__?.selectUnit(id),
    UNIT,
  );
  await expect(page.locator('#unit-card [data-field="ap"]')).toHaveText(
    /^0 \//,
  );
  await page.evaluate(() => {
    const line = document.querySelector('#turn-banner [data-role="status"]');
    if (line) {
      line.textContent = "";
    }
  });
  await drawnFrame(page);

  const from = await unitOnScreen(page);
  for (let press = 0; press < 2; press++) {
    await tapCameraKey(page, "a");
  }
  await drawnFrame(page);
  const to = await unitOnScreen(page);

  // The camera pans in both trees; that half was never broken.
  expect(
    Math.abs(to.x - from.x) + Math.abs(to.y - from.y),
    "pressing a must pan the view",
  ).toBeGreaterThan(20);

  const said = await status(page);
  if (baseline) {
    expect(said, "the baseline must refuse on a pan key").toContain(
      "no action points",
    );
  } else {
    expect(said, "a pan key must not produce a refusal").toBe("");
  }

  const path = `${FRAMES}-${baseline ? "before" : "after"}.png`;
  await page.screenshot({ path });

  // The chip above the unit fades, so the whole frame is not
  // byte-stable; the banner that carries the status line is DOM and must
  // be. The banner rather than the line itself, which has no size when
  // it is empty -- exactly the after state.
  const banner = page.locator("#turn-banner");
  const first = `${FRAMES}-banner-a.png`;
  const again = `${FRAMES}-banner-b.png`;
  await banner.screenshot({ path: first });
  await banner.screenshot({ path: again });
  const stable = readFileSync(first).equals(readFileSync(again));
  rmSync(first, { force: true });
  rmSync(again, { force: true });
  expect(stable, "the banner must render identically twice").toBe(true);
});

import { expect, test } from "@playwright/test";

import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";
import { drawnFrame } from "./capture-frame.helper";
import { launchMission, settleForShot } from "./mission-capture.helper";

/** The page's global object as seen from `page.evaluate`. */
interface HookGlobal {
  __tutTactical__?: TacticalTestHooks;
}

/** The starter mech, the one unit that carries two weapons. */
const MECH = "unit-1";

/**
 * Resting on a weapon in the unit panel paints its reach on the ground
 * (#1132): the card's row for the Autocannon is hovered and the body
 * counts the painted tiles, then the pointer leaves and the count is
 * gone. A hover is an ordinary pointer gesture, so this drives the real
 * card rather than a hook.
 *
 *   CAPTURE=1 pnpm exec playwright test e2e/weapon-range-preview.spec.ts
 */
test("hovering a weapon on the unit panel paints its reach, and leaving clears it", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 720 });
  await launchMission(page, "4242");
  await settleForShot(page);

  await expect
    .poll(() =>
      page.evaluate(
        (id) =>
          (globalThis as HookGlobal).__tutTactical__?.unitScreenPosition(id) !==
          undefined,
        MECH,
      ),
    )
    .toBe(true);
  await page.evaluate(
    (id) => (globalThis as HookGlobal).__tutTactical__?.selectUnit(id),
    MECH,
  );
  const body = page.locator("body");
  await expect(body).toHaveAttribute("data-tactical-selected", MECH);
  await expect(body).not.toHaveAttribute("data-tactical-range-tiles", /.+/);

  const gun = page.locator(
    '#unit-card [data-role="weapon-row"][data-weapon-id="arm-weapon"]',
  );
  await expect(gun).toContainText("Autocannon");
  await gun.hover();
  await expect(body).toHaveAttribute("data-tactical-range-tiles", /^[1-9]\d*$/);
  const gunTiles = Number(await body.getAttribute("data-tactical-range-tiles"));

  // The pod reaches further, so it paints more ground.
  const pod = page.locator(
    '#unit-card [data-role="weapon-row"][data-weapon-id="back-weapon"]',
  );
  await pod.hover();
  await expect
    .poll(async () =>
      Number(await body.getAttribute("data-tactical-range-tiles")),
    )
    .toBeGreaterThan(gunTiles);
  await drawnFrame(page);
  if (process.env.CAPTURE !== undefined) {
    await page.locator("#tactical-viewport").screenshot({
      path: "docs/design/ui-weapon-range-preview.png",
    });
  }

  // Leaving the card takes the paint with it.
  await page.mouse.move(40, 400);
  await expect(body).not.toHaveAttribute("data-tactical-range-tiles", /.+/);
  expect(errors).toEqual([]);
});

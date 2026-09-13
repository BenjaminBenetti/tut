import { expect, test } from "@playwright/test";

import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";
import { drawnFrame } from "./capture-frame.helper";
import { launchMission, settleForShot } from "./mission-capture.helper";

/** The page's global object as seen from `page.evaluate`. */
interface HookGlobal {
  __tutTactical__?: TacticalTestHooks;
}

/** The starter mech; its pilot holds a rank like any squad. */
const MECH = "unit-1";

/**
 * Resting on the rank badge of the unit panel opens the popover that
 * says what the rank boosts and by how much (#1134). A hover is an
 * ordinary pointer gesture, so this drives the real badge.
 *
 *   CAPTURE=1 pnpm exec playwright test e2e/rank-tooltip.spec.ts
 */
test("hovering a rank on the unit panel says what the rank is worth", async ({
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
  await expect(page.locator("body")).toHaveAttribute(
    "data-tactical-selected",
    MECH,
  );

  const badge = page.locator('#unit-card [data-field="unit-rank"]');
  await expect(badge).toBeVisible();
  const tooltip = page.locator('[data-role="rank-tooltip"]');
  await badge.hover();
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText("move");
  await expect(tooltip).toContainText("accuracy");
  await expect(tooltip).toContainText("AP");
  if (process.env.CAPTURE !== undefined) {
    await drawnFrame(page);
    await page.screenshot({ path: "docs/design/ui-rank-tooltip.png" });
  }

  // Leaving the badge closes it; Escape would too.
  await page.mouse.move(40, 400);
  await expect(tooltip).toBeHidden();
  expect(errors).toEqual([]);
});

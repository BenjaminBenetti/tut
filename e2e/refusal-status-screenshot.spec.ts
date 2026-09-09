/// <reference types="node" />
import { readFileSync, rmSync } from "node:fs";

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";
import { drawnFrame, tacticalModelsReady } from "./capture-frame.helper";
import { launchMission, settleForShot } from "./mission-capture.helper";

/** The page's global object as seen from `page.evaluate`. */
interface HookGlobal {
  __tutTactical__?: TacticalTestHooks;
}

/** Where the frames go. */
const FRAMES = "docs/design/refusal-status";

/** The unit whose refusal is being read: the mech, which starts loaded. */
const UNIT = "unit-1";

/** The banner's status line, as rendered. */
async function status(page: Page): Promise<string> {
  return (
    (await page.locator('#turn-banner [data-role="status"]').textContent()) ??
    ""
  );
}

/**
 * The #1035 evidence: a refused command, read off the screen.
 *
 * Select a mech that has not fired and press `r`. The command is
 * refused because its charges are already full, and the refusal is the
 * one line the player reads.
 *
 * `REFUSAL_FRAME=before` captures the same keypress against the
 * baseline tree, where the sentence is the simulation's own and names
 * the unit by id.
 *
 *   CAPTURE=1 pnpm exec playwright test e2e/refusal-status-screenshot.spec.ts
 */
test("captures a refused reload as the player reads it", async ({ page }) => {
  test.skip(
    process.env.CAPTURE === undefined,
    "set CAPTURE=1 to regenerate the refusal frames",
  );
  const baseline = process.env.REFUSAL_FRAME === "before";
  await launchMission(page, "4242");
  await tacticalModelsReady(page);
  await settleForShot(page);

  await page.evaluate(
    (id) => (globalThis as HookGlobal).__tutTactical__?.selectUnit(id),
    UNIT,
  );
  await expect(page.locator("body")).toHaveAttribute(
    "data-selected-unit",
    UNIT,
  );
  const name = await page
    .locator('#unit-card [data-field="unit-name"]')
    .textContent();
  expect(name, "the card must name the selected unit").toBeTruthy();

  await page.keyboard.press("r");
  await expect
    .poll(async () => status(page), {
      message: "the refusal must reach the banner",
    })
    .not.toBe("");
  await drawnFrame(page);

  const shown = await status(page);
  if (baseline) {
    // The frame is only a "before" if it exhibits the defect. A
    // baseline that happened not to leak would make the comparison
    // meaningless, and it would look exactly like a fix.
    expect(
      shown,
      "the baseline must show the id, or it is not the case",
    ).toContain(UNIT);
  } else {
    expect(shown).not.toContain(UNIT);
    expect(shown).toBe(`${String(name)} is already fully loaded`);
  }

  const path = `${FRAMES}-${baseline ? "before" : "after"}.png`;
  await page.screenshot({ path });

  // The HUD is DOM over a canvas: it must reproduce before either frame
  // is evidence (#996).
  const again = `${FRAMES}-reproducibility-check.png`;
  await page.screenshot({ path: again });
  const stable = readFileSync(path).equals(readFileSync(again));
  rmSync(again, { force: true });
  expect(stable, "the frame must render identically twice").toBe(true);
});

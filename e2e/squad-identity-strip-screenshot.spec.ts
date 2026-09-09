/// <reference types="node" />
import { readFileSync, rmSync } from "node:fs";

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";
import { drawnFrame } from "./capture-frame.helper";
import { launchMission, settleForShot } from "./mission-capture.helper";

/** The page's global object as seen from `page.evaluate`. */
interface HookGlobal {
  __tutTactical__?: TacticalTestHooks;
}

/** Where the frames go. */
const FRAMES = "docs/design/squad-identity-strip";

/** The names rendered in the readiness strip, in order. */
async function railNames(page: Page): Promise<string[]> {
  return page
    .locator('[data-role="squad-list"] li .tut-squad__name')
    .allTextContents();
}

/**
 * The frame the Director asked for on #1047: does the readiness strip
 * name the squads, or still call both of them by their type?
 *
 * QA's finding 3 on #1027 was filed from this panel — two rows reading
 * `Rifle Squad 20 hp 2 AP`, identical and adjacent, so a player worked
 * out which had died by elimination. The event log and roster frames
 * cannot answer it; this one can.
 *
 * `STRIP_FRAME=before` captures the same view against the baseline tree
 * and asserts the strip really does repeat a name, so a "before" cannot
 * be a second copy of the fix.
 *
 *   CAPTURE=1 pnpm exec playwright test e2e/squad-identity-strip-screenshot.spec.ts
 */
test("captures the readiness strip naming each squad", async ({ page }) => {
  test.skip(
    process.env.CAPTURE === undefined,
    "set CAPTURE=1 to regenerate the squad identity strip frames",
  );
  const baseline = process.env.STRIP_FRAME === "before";
  await page.setViewportSize({ width: 1280, height: 720 });
  await launchMission(page, "4242");
  await settleForShot(page);
  await page.evaluate(() =>
    (globalThis as HookGlobal).__tutTactical__?.selectUnit("unit-1"),
  );
  await drawnFrame(page);

  const names = await railNames(page);
  // The fixture, examined: the panel is only evidence about repeated
  // identities if the force actually contains two squads of one type.
  expect(
    names.length,
    `the strip must list the deployed force; got ${names.join(", ")}`,
  ).toBeGreaterThanOrEqual(3);

  if (baseline) {
    // Two rows sharing a name is the defect QA reported. A baseline
    // where every row is already distinct would look exactly like the
    // fix and prove nothing.
    expect(
      new Set(names).size,
      `the baseline must repeat a name; got ${names.join(", ")}`,
    ).toBeLessThan(names.length);
  } else {
    expect(
      new Set(names).size,
      `every row must name a different unit; got ${names.join(", ")}`,
    ).toBe(names.length);
    // And by the roster's names, not the template's or an id.
    expect(names).toContain("Alpha");
    expect(names).toContain("Bravo");
    for (const name of names) {
      expect(name).not.toMatch(/^unit-/);
    }
  }

  const path = `${FRAMES}-${baseline ? "before" : "after"}.png`;
  await page.locator('[data-role="squad-list"]').screenshot({ path });

  // DOM over a canvas: it must reproduce before either frame is
  // evidence (#996).
  const again = `${FRAMES}-reproducibility-check.png`;
  await page.locator('[data-role="squad-list"]').screenshot({ path: again });
  const stable = readFileSync(path).equals(readFileSync(again));
  rmSync(again, { force: true });
  expect(stable, "the strip must render identically twice").toBe(true);
});

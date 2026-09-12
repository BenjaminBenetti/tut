/// <reference types="node" />
import { readFileSync, rmSync } from "node:fs";

import { expect, test } from "@playwright/test";

import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";
import { drawnFrame } from "./capture-frame.helper";
import { launchMission, settleForShot } from "./mission-capture.helper";

/** The page's global object as seen from `page.evaluate`. */
interface HookGlobal {
  __tutTactical__?: TacticalTestHooks;
}

/** Where the frames go. */
const FRAMES = "docs/design/spawner-naming";

/**
 * The #1072 evidence: the HUD naming an egg spawner it is aimed at.
 *
 * Aim the mech at the nest from the deploy zone. On seed 4242 a
 * building stands between them, so the preview refuses with
 * `no-line-of-sight` — the refusal that resolved its target through the
 * unit resolver, and so called an egg spawner "that unit".
 *
 * Deliberately a targeting frame rather than a log frame. Reaching a
 * cleared objective means driving a whole mission, and that drive stops
 * being reproducible whenever the map changes: #1042 moved seed 4242's
 * deploy zone and the same script that cleared the nest three times in
 * a row before it now sometimes lands no shot at all. A frame captured
 * from a drive that does not reproduce is not evidence.
 *
 * `TARGET_FRAME=before` captures the same view against the baseline
 * tree and asserts it exhibits the defect.
 *
 *   CAPTURE=1 pnpm exec playwright test e2e/spawner-naming-screenshot.spec.ts
 */
test("captures the HUD naming the egg spawner it is aimed at", async ({
  page,
}) => {
  test.skip(
    process.env.CAPTURE === undefined,
    "set CAPTURE=1 to regenerate the spawner naming frames",
  );
  test.setTimeout(180_000);
  const baseline = process.env.TARGET_FRAME === "before";
  await page.setViewportSize({ width: 1280, height: 720 });
  await launchMission(page, "4242");
  await settleForShot(page);

  // Walk the mech up the column to where the nest is inside the
  // autocannon's ten tiles but a building still blocks the shot. Three
  // straight moves along z, each verified, each ending the turn -- the
  // same three positions every run, which is what makes this frame
  // reproducible where a full mission drive is not.
  for (const target of [23, 17, 13]) {
    await page.evaluate(() =>
      (globalThis as HookGlobal).__tutTactical__?.selectUnit("unit-1"),
    );
    await page.waitForTimeout(200);
    await page.evaluate(
      (z) =>
        (globalThis as HookGlobal).__tutTactical__?.invokeTile({
          x: 8,
          y: 2,
          z,
        }),
      target,
    );
    await page.waitForTimeout(700);
    const at = await page.evaluate(() => {
      const save = JSON.parse(
        localStorage.getItem("tut:save:autosave") ?? "{}",
      ) as {
        state: {
          activeMission?: {
            units: { id: string; pos: { z: number } }[];
          };
        };
      };
      return save.state.activeMission?.units.find((u) => u.id === "unit-1")?.pos
        .z;
    });
    expect(at, `the mech must reach z=${String(target)}`).toBe(target);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(2500);
  }

  await page.evaluate(() =>
    (globalThis as HookGlobal).__tutTactical__?.selectUnit("unit-1"),
  );
  await page.waitForTimeout(200);
  await page.keyboard.press("f");
  await page.waitForTimeout(200);
  await page.evaluate(() =>
    (globalThis as HookGlobal).__tutTactical__?.selectSpawner("spawner-1"),
  );
  await expect(page.locator("#hit-preview")).toBeVisible();
  await drawnFrame(page);

  const preview = (await page.locator("#hit-preview").textContent()) ?? "";
  // The fixture, examined: this frame is only about naming a spawner if
  // the HUD is actually pointed at one and has something to say.
  expect(
    preview,
    `the preview must be aimed at the nest; got: ${preview}`,
  ).toContain("Egg spawner");

  if (baseline) {
    // Either form of the defect counts: the anonymous fallback, or the
    // raw id it used to print.
    const leaks =
      preview.includes("that unit") || preview.includes("spawner-1");
    expect(leaks, `the baseline must exhibit the defect; got: ${preview}`).toBe(
      true,
    );
  } else {
    expect(preview).toContain("spawner 1");
    expect(preview).not.toContain("that unit");
    expect(preview).not.toContain("spawner-1");
  }

  const path = `${FRAMES}-${baseline ? "before" : "after"}.png`;
  await page.locator("#hit-preview").screenshot({ path });

  // DOM over a canvas: it must reproduce before either frame is
  // evidence (#996).
  const again = `${FRAMES}-reproducibility-check.png`;
  await page.locator("#hit-preview").screenshot({ path: again });
  const stable = readFileSync(path).equals(readFileSync(again));
  rmSync(again, { force: true });
  expect(stable, "the preview must render identically twice").toBe(true);
});

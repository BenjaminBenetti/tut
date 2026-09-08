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

/** The autosave the fixture is examined through. */
const SAVE_KEY = "tut:save:autosave";

/** Where the frames go. */
const FRAMES = "docs/design/flat-map-cut-control";

/** What the capture seed's map actually is, read rather than assumed. */
interface MapShape {
  readonly grounds: readonly number[];
  readonly floors: readonly number[];
  readonly roofTiles: number;
  readonly roofLevels: readonly number[];
}

/**
 * Reads the mission's buildings out of the save.
 *
 * The control only means something on a map that is genuinely flat and
 * genuinely has roofs, so both are asserted from the real map rather
 * than assumed from a seed someone once checked.
 *
 * @param page - The page holding the live mission.
 * @returns The shape of the map's buildings.
 */
async function mapShape(page: Page): Promise<MapShape> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    const save = JSON.parse(raw ?? "{}") as {
      state: {
        activeMission?: {
          map: {
            tiles: { y: number; buildingId?: string; floorIndex?: number }[];
            buildings: { id: string; groundLevel: number; floors: unknown[] }[];
          };
        };
      };
    };
    const map = save.state.activeMission?.map;
    const buildings = map?.buildings ?? [];
    const roofs = (map?.tiles ?? []).filter(
      (t) => t.buildingId !== undefined && t.floorIndex === undefined,
    );
    return {
      grounds: buildings.map((b) => b.groundLevel),
      floors: buildings.map((b) => b.floors.length),
      roofTiles: roofs.length,
      roofLevels: [...new Set(roofs.map((t) => t.y))].sort((a, b) => a - b),
    };
  }, SAVE_KEY);
}

/** Steps the view to `storey`, counting down from wherever it is. */
async function toStorey(
  page: Page,
  storey: number,
  storeys: number,
): Promise<void> {
  for (let i = 0; i < storeys; i++) {
    await page.evaluate(() =>
      (globalThis as HookGlobal).__tutTactical__?.stepLayer(-1),
    );
  }
  for (let i = 0; i < storey; i++) {
    await page.evaluate(() =>
      (globalThis as HookGlobal).__tutTactical__?.stepLayer(1),
    );
  }
  await expect(page.locator("body")).toHaveAttribute(
    "data-tactical-storey",
    String(storey + 1),
  );
  await drawnFrame(page);
}

/** Screenshots the viewport once the scene has drawn the change. */
async function shoot(page: Page, path: string): Promise<void> {
  await drawnFrame(page);
  await page.locator("#tactical-viewport").screenshot({ path });
}

/**
 * The flat-map control owed for #978, delivered on #1019.
 *
 * On a map whose buildings all stand on one ground level, the
 * per-building storey cut and the single height cut it replaced are the
 * same number at every step of the range. So the two must draw the same
 * pixels — at the ground floor, in the middle, and at the top where "no
 * cut" has to mean no cut for roofs as well as for terrain.
 *
 * Both members of every pair are drawn **in one run on one camera**, and
 * the old rule is the real one: `applyHeightCut` puts the map back on
 * the plain height cut rather than imitating it.
 *
 *   CAPTURE=1 pnpm exec playwright test e2e/flat-map-cut-control.spec.ts
 */
test("a flat map draws the same under the storey cut and the height cut", async ({
  page,
}) => {
  test.skip(
    process.env.CAPTURE === undefined,
    "set CAPTURE=1 to regenerate the flat-map control frames",
  );
  const body = page.locator("body");
  await launchMission(page, "4242");
  await tacticalModelsReady(page);
  await settleForShot(page);

  // The fixture, examined. A map with buildings at different heights
  // would make this comparison meaningless, and one without roof tiles
  // would not exercise the omission the control exists for.
  const shape = await mapShape(page);
  expect(new Set(shape.grounds).size, "the control needs a flat map").toBe(1);
  expect(shape.roofTiles, "the control needs real roof tiles").toBeGreaterThan(
    0,
  );
  const ground = shape.grounds[0] ?? 0;
  const storeys = Number(await body.getAttribute("data-tactical-storeys"));
  expect(storeys).toBe(Math.max(...shape.floors));

  const heightCutFor = (storey: number): number | undefined =>
    storey === storeys - 1 ? undefined : ground + (storey + 1) * 2 - 1;

  // Ground floor, one above it, and the top of the range.
  for (const storey of [0, 1, storeys - 1]) {
    const label =
      storey === storeys - 1 ? "top" : `floor-${String(storey + 1)}`;
    await toStorey(page, storey, storeys);
    await shoot(page, `${FRAMES}-${label}-storey.png`);

    await page.evaluate(
      (cut) => (globalThis as HookGlobal).__tutTactical__?.applyHeightCut(cut),
      heightCutFor(storey),
    );
    await shoot(page, `${FRAMES}-${label}-height.png`);

    expect(
      readFileSync(`${FRAMES}-${label}-storey.png`).equals(
        readFileSync(`${FRAMES}-${label}-height.png`),
      ),
      `${label}: the storey cut must draw what the height cut drew`,
    ).toBe(true);
  }

  // The instrument itself: shot twice with nothing changed. Equality is
  // only evidence once this holds (#996).
  const again = `${FRAMES}-reproducibility-check.png`;
  await shoot(page, again);
  const stable = readFileSync(`${FRAMES}-top-height.png`).equals(
    readFileSync(again),
  );
  rmSync(again, { force: true });
  expect(
    stable,
    "the capture must reproduce before equality means anything",
  ).toBe(true);
});

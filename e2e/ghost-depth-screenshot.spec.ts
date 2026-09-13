import { expect, test } from "@playwright/test";

import { manhattanDistance } from "../src/core/service/grid-math";
import { allows, PassMask } from "../src/mapgen/model/pass-mask";
import type { TileCoord } from "../src/mapgen/model/tile-coord";
import { TileIndex } from "../src/mapgen/service/tile-index";
import type { GameState } from "../src/save/model/game-state";
import type { SaveEnvelope } from "../src/save/model/save-envelope";
import { initialVision } from "../src/tactical/service/vision-service";
import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";
import {
  assertNoAssetFallback,
  drawnFrame,
  tacticalModelsReady,
  watchAssetFallback,
} from "./capture-frame.helper";
import { CITY_MISSION_FIXTURE } from "./fixtures/mission-maps";
import { launchMission, settleForShot } from "./mission-capture.helper";

/** The page's global object as seen from `page.evaluate`. */
interface HookGlobal {
  __tutTactical__?: TacticalTestHooks;
}

/** The autosave the mission is rewritten through. */
const SAVE_KEY = "tut:save:autosave";

/** The building the interior-movement spec already relies on. */
const BUILDING = "building-3";

/** The squad put inside. */
const SQUAD = "unit-2";

/**
 * The cutaway opens only what stands between the camera and the unit
 * (#1132). A rifle squad is put deep inside the pinned city map's
 * building-3, the storey cut is lifted so the roof is drawn, and the
 * frame is taken: the wall and roof on the camera's side of the squad
 * fade in the usual dithered window, while the far wall of the room and
 * the floor stay solid, so the interior reads as a room with a wall cut
 * out of it rather than a spotlight that dissolves the back of the
 * building too.
 *
 *   CAPTURE=1 pnpm exec playwright test e2e/ghost-depth-screenshot.spec.ts
 */
test("the cutaway fades the wall in front of a squad and leaves the wall behind it solid", async ({
  page,
}) => {
  test.skip(
    process.env.CAPTURE === undefined,
    "set CAPTURE=1 to regenerate the ghost-depth screenshot",
  );
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  watchAssetFallback(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await launchMission(page, "4242", CITY_MISSION_FIXTURE);
  await tacticalModelsReady(page);

  const save = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!) as SaveEnvelope<GameState>,
    SAVE_KEY,
  );
  const original = save.state.activeMission!;
  const building = original.map.buildings.find((b) => b.id === BUILDING);
  expect(building).toBeDefined();
  const entry = building!.entrances[0].tile;
  const index = new TileIndex(original.map);
  // The ground-floor interior tile farthest from the door: deep enough
  // in that a wall stands on every side of the squad.
  const interior = original.map.tiles
    .filter(
      (tile) =>
        tile.buildingId === BUILDING &&
        tile.y === entry.y &&
        allows(tile.pass, PassMask.INFANTRY),
    )
    .map((tile): TileCoord => ({ x: tile.x, y: tile.y, z: tile.z }))
    .sort(
      (a, b) => manhattanDistance(b, entry) - manhattanDistance(a, entry),
    )[0];
  expect(interior, "no walkable interior tile in the building").toBeDefined();
  expect(index.getAt(interior)?.buildingId).toBe(BUILDING);
  const positioned = {
    ...original,
    units: original.units.map((unit) =>
      unit.id === SQUAD ? { ...unit, pos: interior } : unit,
    ),
  };
  const mission = { ...positioned, vision: initialVision(positioned) };
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
    key: SAVE_KEY,
    value: JSON.stringify({
      ...save,
      state: { ...save.state, activeMission: mission },
    }),
  });
  await page.reload();
  await page.locator('[data-action="continue"]').click();
  await tacticalModelsReady(page);
  await settleForShot(page);

  // No storey cut: the roof is drawn, so only the cutaway can show the
  // squad. Selecting it centres the HUD's attention; the ghost is on
  // regardless of selection.
  await page.evaluate((id) => {
    const hooks = (globalThis as HookGlobal).__tutTactical__;
    hooks?.stepLayer(999);
    hooks?.selectUnit(id);
  }, SQUAD);
  await expect(page.locator("body")).toHaveAttribute(
    "data-tactical-selected",
    SQUAD,
  );
  // The cutaway ramps in over 0.15 s; give it a few frames.
  await page.waitForTimeout(400);
  await drawnFrame(page);
  assertNoAssetFallback(page, "the ghost-depth frame");
  await page.locator("#tactical-viewport").screenshot({
    path: "docs/design/ui-ghost-depth.png",
  });
  expect(errors).toEqual([]);
});

import { expect, test } from "@playwright/test";

import {
  directionOffset,
  oppositeDirection,
  stepGridPos,
} from "../src/core/service/grid-math";
import type { TileCoord } from "../src/mapgen/model/tile-coord";
import { TileIndex } from "../src/mapgen/service/tile-index";
import type { GameState } from "../src/save/model/game-state";
import type { SaveEnvelope } from "../src/save/model/save-envelope";
import {
  reachable,
  buildMoveGraph,
} from "../src/tactical/service/movement-service";
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

/**
 * Move bands above the storey view are not painted (#1134, item 4).
 *
 * Alpha stands in the doorway of building-3 on the pinned city map, so
 * its reach runs up the stairs onto the first floor. With the view cut
 * to the ground floor, the bands on the floor above must be gone; the
 * spec asserts from the rules that the reach really includes a tile a
 * storey up, so a frame with no upper bands is a frame of the cut and
 * not of a squad with nowhere to climb.
 *
 *   CAPTURE=1 pnpm exec playwright test e2e/storey-cut-overlays-screenshot.spec.ts
 */
test("move bands on a floor above the storey view are not painted", async ({
  page,
}) => {
  test.skip(
    process.env.CAPTURE === undefined,
    "set CAPTURE=1 to regenerate the storey cut overlay screenshot",
  );
  test.setTimeout(180_000);
  watchAssetFallback(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await launchMission(page, "4242", CITY_MISSION_FIXTURE);
  await tacticalModelsReady(page);

  const envelope = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!) as SaveEnvelope<GameState>,
    SAVE_KEY,
  );
  const original = envelope.state.activeMission!;
  const building = original.map.buildings.find((b) => b.id === "building-3")!;
  expect(building).toBeDefined();
  const entrance = building.entrances[0];
  const entry = entrance.tile;
  const inward = stepGridPos(entry, oppositeDirection(entrance.side));
  const outward = directionOffset(entrance.side);
  /** A tile on the entrance's exterior apron, `distance` out and `lateral` across. */
  const outside = (distance: number, lateral = 0): TileCoord => ({
    x: entry.x + outward.x * distance - outward.z * lateral,
    y: entry.y,
    z: entry.z + outward.z * distance + outward.x * lateral,
  });
  const index = new TileIndex(original.map);
  expect(index.getAt(inward)?.buildingId).toBe(building.id);
  // Alpha in the doorway, the rest of the force well clear of it.
  const positions: Record<string, TileCoord> = { "unit-2": inward };
  let lateral = -4;
  for (const unit of original.units) {
    if (unit.team !== "tdf" || unit.id === "unit-2") continue;
    positions[unit.id] = outside(3, lateral);
    lateral += 2;
  }
  const positioned = {
    ...original,
    units: original.units.map((u) => ({
      ...u,
      pos: positions[u.id] ?? u.pos,
      ap: u.team === "tdf" ? u.maxAp : u.ap,
    })),
  };
  const mission = { ...positioned, vision: initialVision(positioned) };
  // The case the frame must exhibit: the squad can reach a tile a storey up.
  const reach = reachable(mission, "unit-2", buildMoveGraph(mission.map));
  const upstairs = [...reach.keys()].filter((key) => {
    const tile = mission.map.tiles.find((t) => index.keyOf(t) === key);
    return tile !== undefined && tile.y >= inward.y + 2;
  });
  expect(
    upstairs.length,
    "Alpha must be able to climb a storey",
  ).toBeGreaterThan(0);
  await page.evaluate(
    ({ key, saved }) => {
      localStorage.setItem(key, JSON.stringify(saved));
    },
    {
      key: SAVE_KEY,
      saved: {
        ...envelope,
        state: { ...envelope.state, activeMission: mission },
      },
    },
  );

  await page.reload();
  await page.locator('[data-action="continue"]').click();
  await tacticalModelsReady(page);
  await settleForShot(page);
  const body = page.locator("body");
  await page.evaluate(() =>
    (globalThis as HookGlobal).__tutTactical__?.stepLayer(-999),
  );
  await expect(body).toHaveAttribute("data-tactical-storey", "1");
  await page.evaluate(() =>
    (globalThis as HookGlobal).__tutTactical__?.selectUnit("unit-2"),
  );
  await expect(body).toHaveAttribute("data-tactical-selected", "unit-2");
  await drawnFrame(page);
  assertNoAssetFallback(page, "the storey cut overlay frame");
  await page.locator("#tactical-viewport").screenshot({
    path: "docs/design/ui-storey-cut-overlays.png",
  });
});

import { expect, test } from "@playwright/test";

import {
  directionOffset,
  oppositeDirection,
  stepGridPos,
} from "../src/core/service/grid-math";
import { allows, PassMask } from "../src/mapgen/model/pass-mask";
import type { TileCoord } from "../src/mapgen/model/tile-coord";
import { TileIndex } from "../src/mapgen/service/tile-index";
import type { GameState } from "../src/save/model/game-state";
import type { SaveEnvelope } from "../src/save/model/save-envelope";
import {
  buildMoveGraph,
  pathTo,
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

/** The building `interior-movement.spec.ts` walks a squad into, on the same fixture. */
const BUILDING_ID = "building-3";

/** The squad the frame is judged on: standing deep enough inside for walls on every side. */
const INSIDE_ID = "unit-2";

/** The second squad, one step in from the doorway, so the door reads as a door. */
const DOOR_ID = "unit-3";

/** Steps in from the doorway the judged squad stands, along a real path. */
const DEPTH = { min: 2, max: 3 } as const;

/**
 * Wheel notches that zoom the tactical camera in on the room. One notch
 * is clamped to 120 px and the zoom factor is `exp(-px × 0.0015)`, so
 * four notches are ×2.05, about 131 px per tile from the opening 64.
 * The interior is legible at that size and the doorway and the
 * neighbouring rooms are still in the frame.
 */
const ZOOM_IN = { notches: 4, px: -120 } as const;

/**
 * A squad inside a real generated building, seen through the cutaway,
 * for the Executive Director's call on #1138: the ray radius after
 * #1134 was too tight to navigate a room by. The frame is the judge.
 *
 * ```
 *   before (#1134)                    after (#1138)
 *   radius 0.6, 11 rays               radius 1.2, 11 body rays + a ring
 *   ┌──────────────┐                   of 8 at waist height 0.75 u out
 *   │ ████▒▒◉▒▒███ │  the unit and a   ┌──────────────┐
 *   │ ████▒▒▒▒▒███ │  sliver of wall   │ ▒▒░░░░◉░░░▒▒ │  the unit, its tile,
 *   │ ████████████ │  around it        │ ▒░░░░░░░░░░▒ │  a two-tile ring, the
 *   └──────────────┘                   │ ▒▒░░░░░░░▒▒█ │  door and the near
 *                                      └──────────────┘  internal walls
 * ```
 *
 * Before: the radius was a little over half a tile and the rays left
 * from the unit's body only, so the window on a wall in front was the
 * unit's silhouette plus a rim and the roof over the next tile stayed
 * solid — the unit was visible and nothing around it was, which the
 * Executive Director could not navigate by. After: the radius is 1.2
 * tiles and a ring of eight rays leaves from waist height 0.75 tiles
 * outside the footprint, so the window is a cone around the unit that
 * opens the roof and the near walls over about a two-tile ring on its
 * floor — the tile grid, the door with the second squad in it and the
 * desk by the far wall all read — while walls a few tiles off stay
 * solid and the four-storey block keeps its shape. Tried on the way:
 * 1.1 with a 0.5 margin, a touch narrower on both frames; 0.6 with the
 * ring alone was still a keyhole. The soft edge went from 0.25 to 0.45
 * with the radius. `e2e/tile-attack.spec.ts`, the wheel-heavy spec CI
 * timed out on before #1134, ran 8.2–8.5 s before and 7.6–7.9 s after
 * under SwiftShader: the reach reject still drops most fragments after
 * one length (Executive Director, 2026-09-14, #1138).
 *
 * The starter force is launched for real on the pinned city fixture,
 * then the board is rewritten: one squad two or three steps inside the
 * building `interior-movement.spec.ts` uses, one squad a step in from
 * its door, the rest of the force well outside. The storey cut is
 * lifted so the roof is drawn, the camera is brought to the inside
 * squad and zoomed in, and the frame is taken. The placement is
 * asserted from the saved state on both sides of the reload, so a
 * frame of the wrong thing fails instead of passing.
 *
 *   CAPTURE=1 pnpm exec playwright test e2e/ghost-interior-screenshot.spec.ts
 */
test("the cutaway opens a cone around a squad inside a generated building", async ({
  page,
}) => {
  test.skip(
    process.env.CAPTURE === undefined,
    "set CAPTURE=1 to regenerate the ghost-interior screenshot",
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
  const building = original.map.buildings.find((b) => b.id === BUILDING_ID);
  expect(building, `${BUILDING_ID} is on the fixture`).toBeDefined();
  const entrance = building!.entrances[0];
  const entry = entrance.tile;
  const inward = stepGridPos(entry, oppositeDirection(entrance.side));
  const outward = directionOffset(entrance.side);
  /** Positions on the entrance's exterior apron, in door-relative coordinates. */
  const outside = (distance: number, lateral = 0): TileCoord => ({
    x: entry.x + outward.x * distance - outward.z * lateral,
    y: entry.y,
    z: entry.z + outward.z * distance + outward.x * lateral,
  });
  const index = new TileIndex(original.map);
  expect(index.getAt(inward)?.buildingId).toBe(BUILDING_ID);

  // The judged squad's tile: an interior floor tile of the building a
  // real path of two or three steps in from the doorway, so there is
  // building on every side of it and the door is still near.
  const graph = buildMoveGraph(original.map);
  const atDoor = {
    ...original,
    units: original.units.map((unit) =>
      unit.id === INSIDE_ID ? { ...unit, pos: inward } : unit,
    ),
  };
  const deep = original.map.tiles
    .filter(
      (tile) =>
        tile.buildingId === BUILDING_ID &&
        tile.y === inward.y &&
        allows(tile.pass, PassMask.INFANTRY) &&
        !(tile.x === inward.x && tile.z === inward.z),
    )
    .map((tile) => {
      const to = { x: tile.x, y: tile.y, z: tile.z };
      return { to, steps: pathTo(atDoor, INSIDE_ID, to, graph)?.length ?? 0 };
    })
    .filter(({ steps }) => steps >= DEPTH.min && steps <= DEPTH.max)
    .sort((a, b) => b.steps - a.steps)[0];
  expect(deep, "an interior tile a few steps in from the door").toBeDefined();

  const positions: Record<string, TileCoord> = {
    "unit-1": outside(4, -4),
    [INSIDE_ID]: deep.to,
    [DOOR_ID]: inward,
  };
  for (const [id, pos] of Object.entries(positions)) {
    const tile = index.getAt(pos);
    expect(
      allows(
        tile?.pass ?? PassMask.NONE,
        id === "unit-1" ? PassMask.MECH : PassMask.INFANTRY,
      ),
      `${id} stands on a passable tile`,
    ).toBe(true);
  }
  expect(index.getAt(positions["unit-1"])?.buildingId).toBeUndefined();
  const positioned = {
    ...original,
    // Only the three units the scene is staged for: the rest of the
    // force would stand on the apron and open its own windows.
    units: original.units
      .filter((u) => u.team !== "tdf" || u.id in positions)
      .map((u) => ({ ...u, pos: positions[u.id] ?? u.pos })),
    spawners: [],
    effects: [],
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
  await expect(page.locator("body")).toHaveAttribute(
    "data-tactical-units",
    String(Object.keys(positions).length),
  );
  await settleForShot(page);

  // The rewrite persisted: the squad the frame is judged on is inside.
  const resumed = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!) as SaveEnvelope<GameState>,
    SAVE_KEY,
  );
  const standing = resumed.state.activeMission!.units.find(
    (unit) => unit.id === INSIDE_ID,
  );
  expect(standing?.pos).toEqual(deep.to);
  expect(
    new TileIndex(resumed.state.activeMission!.map).getAt(standing!.pos)
      ?.buildingId,
  ).toBe(BUILDING_ID);

  // No storey cut: the roof is drawn, so only the cutaway can show the
  // squads. The roster row brings the camera to the inside squad
  // (#1041) and the wheel zooms in on it.
  await page.evaluate(() => {
    (globalThis as HookGlobal).__tutTactical__?.stepLayer(999);
  });
  await page
    .locator(`[data-role="squad-list"] li[data-unit-id="${INSIDE_ID}"]`)
    .click();
  await expect(page.locator("body")).toHaveAttribute(
    "data-tactical-selected",
    INSIDE_ID,
  );
  const box = await page.locator("#tactical-viewport").boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  for (let notch = 0; notch < ZOOM_IN.notches; notch++) {
    await page.mouse.wheel(0, ZOOM_IN.px);
  }
  await page.mouse.move(-10, -10);
  // The zoom eases and the cutaway ramps in over 0.15 s; let both land.
  await page.waitForTimeout(1200);
  const unitAt = await page.evaluate(
    (id) => (globalThis as HookGlobal).__tutTactical__?.unitScreenPosition(id),
    INSIDE_ID,
  );
  expect(unitAt, "the inside squad is on screen").toBeDefined();
  expect(unitAt!.x).toBeGreaterThan(box!.x);
  expect(unitAt!.x).toBeLessThan(box!.x + box!.width);
  expect(unitAt!.y).toBeGreaterThan(box!.y);
  expect(unitAt!.y).toBeLessThan(box!.y + box!.height);
  await drawnFrame(page);
  assertNoAssetFallback(page, "the ghost-interior frame");
  await page.locator("#tactical-viewport").screenshot({
    path: "docs/design/ghost-interior.png",
  });
  expect(errors).toEqual([]);
});

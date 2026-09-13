import { expect, test } from "@playwright/test";

import type { Building } from "../src/mapgen/model/building";
import { allows, PassMask } from "../src/mapgen/model/pass-mask";
import type { TileCoord } from "../src/mapgen/model/tile-coord";
import { SurfaceIds } from "../src/mapgen/data/surfaces";
import { FixtureMapBuilder } from "../src/mapgen/service/fixture-map-builder";
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
import { launchMission, settleForShot } from "./mission-capture.helper";

/** The page's global object as seen from `page.evaluate`. */
interface HookGlobal {
  __tutTactical__?: TacticalTestHooks;
}

/** The autosave the mission is rewritten through. */
const SAVE_KEY = "tut:save:autosave";

/** The one-room building the board is built around. */
const ROOM_ID = "room-1";

/** The room's floor: three by three, ground level. */
const ROOM = { x: 10, z: 8, w: 3, d: 3 } as const;

/** Where the squad stands: the middle of the room, a wall on every side. */
const INSIDE: TileCoord = { x: 11, y: 0, z: 9 };

/** Where the rest of the force stands, outside the cutaway's radius of the room. */
const OUTSIDE: Readonly<Record<string, TileCoord>> = {
  mech: { x: 5, y: 0, z: 13 },
  other: { x: 17, y: 0, z: 14 },
};

/**
 * A flat field with one walled, roofed room: solid walls on all four
 * sides and a door on the north (far) side, a building floor inside
 * and a flat roof two layers up. Everything a cutaway can be judged on,
 * with nothing else in the radius.
 *
 * ```
 *   z=8   ┌──door──┐        n: door + solid   (far from the camera)
 *   z=9   │  ◉ squad │      w: solid           (far)
 *   z=10  └────────┘        s, e: solid        (toward the camera)
 *         x=10  x=12        roof over all nine tiles at y=2
 * ```
 */
function roomField(): ReturnType<FixtureMapBuilder["build"]> {
  const builder = new FixtureMapBuilder(24, 20, 3).fillGround();
  for (let z = ROOM.z; z < ROOM.z + ROOM.d; z++) {
    for (let x = ROOM.x; x < ROOM.x + ROOM.w; x++) {
      builder.tile({ x, y: 0, z }, SurfaceIds.FLOOR, {
        buildingId: ROOM_ID,
        floorIndex: 0,
      });
      builder.tile({ x, y: 2, z }, SurfaceIds.ROOF, { buildingId: ROOM_ID });
    }
  }
  for (let x = ROOM.x; x < ROOM.x + ROOM.w; x++) {
    builder.wall(
      { x, y: 0, z: ROOM.z },
      "n",
      x === INSIDE.x ? "door" : "solid",
    );
    builder.wall({ x, y: 0, z: ROOM.z + ROOM.d - 1 }, "s", "solid");
  }
  for (let z = ROOM.z; z < ROOM.z + ROOM.d; z++) {
    builder.wall({ x: ROOM.x, y: 0, z }, "w", "solid");
    builder.wall({ x: ROOM.x + ROOM.w - 1, y: 0, z }, "e", "solid");
  }
  // Two free-standing wall segments off to the side but nearer the
  // camera than the squad (#1134): under the old plane rule both faded
  // for standing on the camera's side within the radius; no ray from
  // the squad to the camera passes through either, so both stay solid.
  for (const x of [ROOM.x + ROOM.w + 1, ROOM.x + ROOM.w + 2]) {
    builder.wall({ x, y: 0, z: ROOM.z + ROOM.d - 1 }, "s", "solid");
  }
  for (const z of [ROOM.z + ROOM.d + 1, ROOM.z + ROOM.d + 2]) {
    builder.wall({ x: ROOM.x - 2, y: 0, z }, "e", "solid");
  }
  const building: Building = {
    id: ROOM_ID,
    kind: "fixture-room",
    footprint: [{ ...ROOM }],
    groundLevel: 0,
    floors: [{ index: 0, y: 0, rooms: [] }],
    roof: { kind: "flat", walkable: true },
    entrances: [{ tile: { x: INSIDE.x, y: 0, z: ROOM.z }, side: "n" }],
    connectorIds: [],
  };
  return builder.building(building).build();
}

/**
 * The cutaway opens only what a ray from the squad to the camera passes
 * through (#1132, rays since #1134). The starter force is launched for
 * real, then the board is rewritten onto a flat field with one walled,
 * roofed room, the first squad in the middle of it, and two stray wall
 * segments off to the side of the room on the camera's side. The storey
 * cut is lifted so the roof is drawn, and the frame is taken: the parts
 * of the south and east walls and of the roof that stand over the squad
 * on screen fade in the usual dithered window, while the north and west
 * walls, the floor, the rest of the near walls and both stray segments
 * stay solid — so the room reads as a room with a window cut where the
 * squad is, not a disc dissolving everything on the camera's side.
 *
 * The placement is asserted from the saved state on both sides of the
 * reload, so a frame of the wrong thing fails instead of passing.
 *
 *   CAPTURE=1 pnpm exec playwright test e2e/ghost-depth-screenshot.spec.ts
 */
test("the cutaway fades only what a ray from the squad to the camera passes through", async ({
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
  await launchMission(page, "4242");
  await tacticalModelsReady(page);

  const map = roomField();
  const index = new TileIndex(map);
  // The board exhibits the case before anything is saved: the squad's
  // tile is inside the building, and the sides of the room that face
  // the camera at the yaw a mission opens on — +x runs down-right and
  // +z down-left on screen, so south and east — carry solid walls.
  expect(index.getAt(INSIDE)?.buildingId).toBe(ROOM_ID);
  expect(
    allows(index.getAt(INSIDE)?.pass ?? PassMask.NONE, PassMask.INFANTRY),
  ).toBe(true);
  expect(
    index.getAt({ x: INSIDE.x, y: 0, z: ROOM.z + ROOM.d - 1 })?.walls.s,
  ).toBe("solid");
  expect(
    index.getAt({ x: ROOM.x + ROOM.w - 1, y: 0, z: INSIDE.z })?.walls.e,
  ).toBe("solid");
  expect(index.getAt({ x: INSIDE.x, y: 2, z: INSIDE.z })?.surface).toBe(
    SurfaceIds.ROOF,
  );
  // The stray segments are there to stay solid (#1134).
  expect(
    index.getAt({ x: ROOM.x + ROOM.w + 1, y: 0, z: ROOM.z + ROOM.d - 1 })?.walls
      .s,
  ).toBe("solid");
  expect(
    index.getAt({ x: ROOM.x - 2, y: 0, z: ROOM.z + ROOM.d + 1 })?.walls.e,
  ).toBe("solid");

  const save = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!) as SaveEnvelope<GameState>,
    SAVE_KEY,
  );
  const original = save.state.activeMission!;
  const force = original.units.filter(
    (unit) => unit.team === "tdf" && unit.hp > 0,
  );
  const squad = force.find((unit) => unit.kind === "squad");
  const mech = force.find((unit) => unit.kind === "mech");
  expect(squad, "the starter force has a squad").toBeDefined();
  expect(mech, "the starter force has a mech").toBeDefined();
  const placed = force.map((unit) => ({
    ...unit,
    pos:
      unit.id === squad!.id
        ? INSIDE
        : unit.id === mech!.id
          ? OUTSIDE.mech
          : OUTSIDE.other,
    facing: "s" as const,
  }));
  const { vision: _stale, ...blind } = {
    ...original,
    map,
    units: placed,
    spawners: [],
    objectives: [],
    extraction: [],
    radars: [],
    effects: [],
  };
  const mission = { ...blind, vision: initialVision(blind) };
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
    String(force.length),
  );
  await settleForShot(page);

  // The rewrite persisted: the mission the page resumed has the squad
  // where the board put it, inside the building.
  const resumed = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!) as SaveEnvelope<GameState>,
    SAVE_KEY,
  );
  const standing = resumed.state.activeMission!.units.find(
    (unit) => unit.id === squad!.id,
  );
  expect(standing?.pos).toEqual(INSIDE);
  expect(
    new TileIndex(resumed.state.activeMission!.map).getAt(standing!.pos)
      ?.buildingId,
  ).toBe(ROOM_ID);

  // No storey cut: the roof is drawn, so only the cutaway can show the
  // squad. Selecting it names it on the HUD; the ghost is on regardless.
  await page.evaluate((id) => {
    const hooks = (globalThis as HookGlobal).__tutTactical__;
    hooks?.stepLayer(999);
    hooks?.selectUnit(id);
  }, squad!.id);
  await expect(page.locator("body")).toHaveAttribute(
    "data-tactical-selected",
    squad!.id,
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

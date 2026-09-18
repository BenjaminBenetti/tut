import { describe, expect, it } from "vitest";
import { PassMask } from "../../mapgen/model/pass-mask";
import { SurfaceIds } from "../../mapgen/data/surfaces";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { ReachabilityService } from "../../mapgen/service/reachability-service";
import { TileIndex } from "../../mapgen/service/tile-index";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import { STARTER_PARTS } from "../../roster/data/parts";
import { mechAction } from "../model/mech-action-command";
import { move } from "../model/move-command";
import {
  createMechActionHandler,
  validateMechAction,
} from "./mech-action-service";
import { jumpObstruction } from "./mech-jump-service";
import { buildMoveGraph, pathTo } from "./movement-service";
import { createMoveHandler } from "./move-handler";
import {
  ctxWith,
  missionWith,
  riggedRng,
  unitAt,
} from "./tactical-fixtures.test-helper";

/** Four-storey roof with a scout observing the landing from above. */
function rooftopBattle() {
  const builder = new FixtureMapBuilder(18, 6, 12).fillGround();
  const floors = Array.from({ length: 4 }, (_, index) => ({
    index,
    y: index * 2,
    rooms: [],
  }));
  builder.building({
    id: "tower",
    kind: "fixture",
    footprint: [{ x: 11, z: 2, w: 4, d: 3 }],
    groundLevel: 0,
    floors,
    roof: { kind: "flat", walkable: true },
    entrances: [],
    connectorIds: [],
  });
  for (let x = 11; x <= 14; x++)
    for (let z = 2; z <= 4; z++) {
      for (const floor of floors)
        builder.tile({ x, y: floor.y, z }, SurfaceIds.FLOOR, {
          buildingId: "tower",
          floorIndex: floor.index,
        });
      builder.tile({ x, y: 8, z }, SurfaceIds.ROOF, { buildingId: "tower" });
    }
  const mech = unitAt("mech", "mech", { x: 1, y: 0, z: 3 });
  const scout = unitAt("scout", "infantry", { x: 14, y: 8, z: 4 });
  const base = missionWith(builder.build(), [mech, scout]);
  return {
    ...base,
    templates: {
      ...base.templates,
      [mech.templateId]: {
        ...base.templates[mech.templateId]!,
        systems: {
          heatCapacity: 22,
          cooling: 4,
          idleHeat: 0,
          movementHeat: 0,
          ...STARTER_PARTS.find(({ id }) => id === "legs-jumper")!.traits,
        },
      },
    },
  };
}

const LANDING = { x: 13, y: 8, z: 3 };
const ORDER = { unitId: "mech", action: "jump" as const, tile: LANDING };

describe("jump jets and roof traversal", () => {
  it("jumps twelve tiles up four storeys, then walks on the roof with the remaining action", () => {
    const initial = rooftopBattle();
    const jumped = createMechActionHandler()(
      initial,
      mechAction(ORDER),
      ctxWith(riggedRng(true)),
    );
    expect(jumped.ok).toBe(true);
    if (!jumped.ok) return;
    expect(jumped.value.state.units[0]).toMatchObject({
      pos: LANDING,
      ap: 1,
      heat: 5,
    });
    expect(jumped.value.events.at(-1)).toMatchObject({
      type: "tactical:unit-moved",
      payload: { jump: true, jumpApex: 10 },
    });
    const to = { x: 12, y: 8, z: 3 };
    const path = pathTo(jumped.value.state, "mech", to);
    expect(path).toEqual([to]);
    const walked = createMoveHandler()(
      jumped.value.state,
      move("mech", path!),
      ctxWith(riggedRng(true)),
    );
    expect(walked.ok && walked.value.state.units[0]?.pos).toEqual(to);
    expect(initial.units[0]?.pos).toEqual({ x: 1, y: 0, z: 3 });
  });

  it("keeps mapgen connectivity and infantry-only interiors intact", () => {
    const { map } = rooftopBattle();
    const graph = buildMoveGraph(map);
    const roof = graph.index.getAt(LANDING)!;
    const floor = graph.index.get(LANDING.x, 6, LANDING.z)!;
    expect(
      new ReachabilityService(graph.index, map.connectors).canOccupy(
        roof,
        PassMask.MECH,
      ),
    ).toBe(false);
    expect(graph.reachability.canOccupy(roof, PassMask.MECH)).toBe(true);
    expect(graph.reachability.canOccupy(floor, PassMask.MECH)).toBe(false);
    expect(
      graph.reachability.canOccupy(
        { ...roof, pass: PassMask.NONE },
        PassMask.MECH,
      ),
    ).toBe(false);
  });

  it("refuses occupied, unseen, pitched, blocked and out-of-range rooftop landings", () => {
    const initial = rooftopBattle();
    const blocked = {
      ...initial,
      map: {
        ...initial.map,
        tiles: initial.map.tiles.map((tile) =>
          tile.x === LANDING.x && tile.y === LANDING.y && tile.z === LANDING.z
            ? { ...tile, pass: PassMask.NONE }
            : tile,
        ),
      },
    };
    const pitched = {
      ...initial,
      map: {
        ...initial.map,
        buildings: initial.map.buildings.map((building) => ({
          ...building,
          roof: { kind: "pitched" as const, walkable: false },
        })),
      },
    };
    const unseen = { ...initial, units: [initial.units[0]!] };
    const occupied = {
      ...initial,
      units: [...initial.units, unitAt("blocker", "infantry", LANDING)],
    };
    for (const mission of [blocked, pitched, unseen, occupied])
      expect(validateMechAction(mission, ORDER).ok).toBe(false);
    expect(
      validateMechAction(initial, { ...ORDER, tile: { ...LANDING, x: 14 } }).ok,
    ).toBe(false);
    expect(
      validateMechAction(initial, { ...ORDER, tile: { ...LANDING, y: 10 } }).ok,
    ).toBe(false);
  });

  it("clears full-height freestanding walls during a ground-to-ground jump", () => {
    const map = new FixtureMapBuilder(8, 4, 5)
      .fillGround()
      .wall({ x: 3, y: 0, z: 2 }, "e", "solid")
      .build();
    expect(
      jumpObstruction(
        map,
        new TileIndex(map),
        { x: 1, y: 0, z: 2 },
        { x: 6, y: 0, z: 2 },
      ),
    ).toBeUndefined();
  });

  it("clears a low building but rejects a taller building and takeoff through a ceiling", () => {
    const initial = rooftopBattle();
    const obstacle = (height: number): TacticalMap => ({
      ...initial.map,
      buildings: [
        ...initial.map.buildings,
        {
          id: "obstacle",
          kind: "fixture",
          footprint: [{ x: 6, z: 3, w: 1, d: 1 }],
          groundLevel: 0,
          floors: Array.from({ length: height / 2 }, (_, index) => ({
            index,
            y: index * 2,
            rooms: [],
          })),
          roof: { kind: "pitched", walkable: false },
          entrances: [],
          connectorIds: [],
        },
      ],
      tiles: initial.map.tiles.map((tile) =>
        tile.x === 6 && tile.z === 3
          ? { ...tile, buildingId: "obstacle" }
          : tile,
      ),
    });
    const low = obstacle(2),
      tall = obstacle(10);
    expect(
      jumpObstruction(low, new TileIndex(low), initial.units[0]!.pos, LANDING),
    ).toBeUndefined();
    expect(
      jumpObstruction(
        tall,
        new TileIndex(tall),
        initial.units[0]!.pos,
        LANDING,
      ),
    ).toContain("blocks");
    expect(
      jumpObstruction(
        initial.map,
        new TileIndex(initial.map),
        { ...LANDING, y: 0 },
        LANDING,
      ),
    ).toContain("open sky");
  });
});

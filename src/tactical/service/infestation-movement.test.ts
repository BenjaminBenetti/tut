import { describe, expect, it } from "vitest";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import { move } from "../model/move-command";
import { createMoveHandler } from "./move-handler";
import {
  buildMoveGraph,
  pathCost,
  pathTo,
  reachable,
  stepCost,
} from "./movement-service";
import {
  blockUnitAt,
  missionWith,
  openField,
  unitAt,
} from "./tactical-fixtures.test-helper";

/** Marks selected surfaces while retaining the fixture's passability and topology. */
function coat(
  map: TacticalMap,
  predicate: (tile: TileCoord) => boolean,
): TacticalMap {
  return {
    ...map,
    tiles: map.tiles.map((tile) =>
      predicate(tile) ? { ...tile, infested: true } : tile,
    ),
  };
}
/** Flat fixture coordinate. */
function at(x: number, z = 0, y = 0): TileCoord {
  return { x, y, z };
}
const context = { rng: new Mulberry32Rng(1), ids: new SequentialIdGenerator() };

describe("resin movement", () => {
  it.each(["infantry", "mech"] as const)(
    "halves %s reach on covered ground and charges the same weighted AP",
    (kind) => {
      const map = coat(openField().build(), () => true);
      const unit = unitAt("u", kind, at(0));
      const mission = missionWith(map, [unit]);
      const graph = buildMoveGraph(map);
      expect(reachable(mission, "u", graph).get(graph.index.keyOf(at(3)))).toBe(
        6,
      );
      expect(pathTo(mission, "u", at(4))).toBeUndefined();
      const result = createMoveHandler()(
        mission,
        move("u", [at(1), at(2)]),
        context,
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.state.units[0]?.ap).toBe(0);
      expect(unit.ap).toBe(2);
    },
  );

  it("takes a longer clean route when it is cheaper than a short infested one", () => {
    const map = coat(
      openField().build(),
      (t) => t.z === 1 && t.x >= 1 && t.x <= 3,
    );
    const unit = unitAt("u", "infantry", at(0, 1));
    const mission = missionWith(map, [unit]);
    const route = pathTo(mission, "u", at(4, 1))!;
    expect(route).toHaveLength(6);
    expect(pathCost(mission, unit, route)).toBe(6);
    expect(route.every((t) => !(t.z === 1 && t.x >= 1 && t.x <= 3))).toBe(true);
    expect(pathTo(mission, "u", at(4, 1))).toEqual(route);
  });

  it("charges the destination, so leaving infestation for clean ground costs one", () => {
    const map = coat(openField().build(), (t) => t.x === 0);
    const unit = unitAt("u", "infantry", at(0));
    const mission = missionWith(map, [unit]);
    expect(pathCost(mission, unit, [at(1)])).toBe(1);
    expect(pathCost(mission, unit, [at(1), at(0)])).toBe(3);
  });

  it("rejects an over-budget submitted route even when every destination is otherwise reachable", () => {
    const map = coat(openField().build(), (t) => t.x === 1);
    const mission = missionWith(map, [unitAt("u", "infantry", at(0))]);
    const result = createMoveHandler()(
      mission,
      move("u", [at(1), at(0), at(1), at(0), at(1)]),
      context,
    );
    expect(result).toEqual({
      ok: false,
      error: { kind: "illegal-move", unitId: "u", reason: "over-budget" },
    });
  });

  it("charges only weighted distance actually taken before a reaction stops the move", () => {
    const map = coat(openField().build(), () => true);
    const mission = missionWith(map, [unitAt("u", "infantry", at(0))]);
    const handler = createMoveHandler((state, id) => ({
      state: {
        ...state,
        units: state.units.map((unit) =>
          unit.id === id && unit.pos.x === 2 ? { ...unit, hp: 0 } : unit,
        ),
      },
      events: [],
    }));
    const result = handler(mission, move("u", [at(1), at(2), at(3)]), context);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.state.units[0]).toMatchObject({
        pos: at(2),
        hp: 0,
        ap: 0,
      });
      expect(result.value.events).toHaveLength(2);
    }
  });

  it("doubles half-step and connector destinations and applies the same rule to bugs", () => {
    const low = at(0),
      half = at(1, 0, 1),
      high = at(2, 0, 3);
    const builder = new FixtureMapBuilder(3, 1, 4)
      .tile(low, "grass")
      .tile(half, "grass")
      .tile(high, "grass");
    builder.connector("ramp", half, high);
    const map = coat(builder.build(), () => true);
    const unit = unitAt("u", "infantry", low, { team: "bugs" });
    const mission = missionWith(map, [unit]);
    expect(pathTo(mission, "u", high)).toEqual([half, high]);
    expect(pathCost(mission, unit, [half, high])).toBe(4);
  });

  it("doubles a footprint step once when a non-anchor cell lands on resin", () => {
    const map = coat(openField().build(), (t) => t.x === 2 && t.z === 1);
    const unit = blockUnitAt("b", at(0));
    const mission = missionWith(map, [unit]);
    expect(stepCost(mission, unit, at(1), buildMoveGraph(map).index)).toBe(2);
    expect(stepCost(mission, unit, at(0), buildMoveGraph(map).index)).toBe(1);
  });
});

import { STOREY_LAYERS } from "../../core/model/elevation";
import { describe, expect, it } from "vitest";

import { SurfaceIds } from "../../mapgen/data/surfaces";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { manhattanDistance } from "../../core/service/grid-math";
import { PassMask } from "../../mapgen/model/pass-mask";
import { PropKindIds } from "../../mapgen/data/props";
import {
  blockUnitAt,
  missionWith,
  openField,
  twoFloorBuilding,
  unitAt,
  walledField,
} from "./tactical-fixtures.test-helper";
import {
  apCostOf,
  buildMoveGraph,
  footprintCanStep,
  footprintFits,
  moveBudget,
  occupiedKeys,
  pathTo,
  reachable,
} from "./movement-service";

// ===========================================
// Fixtures
// ===========================================

const at = (x: number, z: number, y = 0): TileCoord => ({
  x,
  y: y * STOREY_LAYERS,
  z,
});

describe("half-height traversal (ADR 0008)", () => {
  for (const kind of ["infantry", "mech"] as const) {
    it(`${kind} walks one-layer steps both ways at flat cost, but needs a connector for two`, () => {
      const low = { x: 0, y: 0, z: 0 };
      const half = { x: 1, y: 1, z: 0 };
      const upper = { x: 2, y: 3, z: 0 };
      const builder = new FixtureMapBuilder(3, 1, 4)
        .tile(low, SurfaceIds.GRASS)
        .tile(half, SurfaceIds.GRASS)
        .tile(upper, SurfaceIds.GRASS);
      const map = builder.build();
      const graph = buildMoveGraph(map);
      const up = missionWith(map, [unitAt("u", kind, low)]);
      const down = missionWith(map, [unitAt("u", kind, half)]);
      expect(reachable(up, "u", graph).get(graph.index.keyOf(half))).toBe(1);
      expect(pathTo(up, "u", half, graph)).toEqual([half]);
      expect(pathTo(down, "u", low, graph)).toEqual([low]);
      expect(pathTo(up, "u", upper, graph)).toBeUndefined();
      expect(
        pathTo(missionWith(map, [unitAt("u", kind, upper)]), "u", half),
      ).toBeUndefined();
      builder.connector("ramp", half, upper);
      expect(
        pathTo(
          missionWith(builder.build(), [unitAt("u", kind, low)]),
          "u",
          upper,
        ),
      ).toEqual([half, upper]);
    });
  }
});

// ===========================================
// Budget
// ===========================================

describe("moveBudget and apCostOf", () => {
  it("gives ap × move tiles and charges one action per started block of move tiles", () => {
    const mission = missionWith(openField().build(), []);
    const full = unitAt("u", "infantry", at(0, 0));
    expect(moveBudget(mission, full)).toBe(6);
    expect(
      moveBudget(mission, unitAt("u", "infantry", at(0, 0), { ap: 1 })),
    ).toBe(3);
    expect(
      moveBudget(mission, unitAt("u", "infantry", at(0, 0), { hp: 0 })),
    ).toBe(0);
    expect(apCostOf(mission, full, 0)).toBe(0);
    expect(apCostOf(mission, full, 3)).toBe(1);
    expect(apCostOf(mission, full, 4)).toBe(2);
    expect(apCostOf(mission, full, 6)).toBe(2);
  });
});

// ===========================================
// Reachable
// ===========================================

describe("reachable", () => {
  it("covers every tile within the budget on open ground, at its manhattan distance", () => {
    const map = openField().build();
    const mission = missionWith(map, [unitAt("u", "infantry", at(0, 0))]);
    const graph = buildMoveGraph(map);
    const reach = reachable(mission, "u", graph);
    expect(reach.size).toBe(28);
    expect(reach.get(graph.index.keyOf(at(0, 0)))).toBe(0);
    for (const tile of map.tiles) {
      const distance = manhattanDistance(tile, at(0, 0));
      expect(reach.get(graph.index.keyOf(tile))).toBe(
        distance <= 6 ? distance : undefined,
      );
    }
    expect(
      reachable(
        missionWith(map, [unitAt("u", "infantry", at(0, 0), { ap: 1 })]),
        "u",
      ).size,
    ).toBe(10);
  });

  it("is empty for an unknown unit and just the origin for a unit that is down", () => {
    const map = openField().build();
    expect(reachable(missionWith(map, []), "ghost").size).toBe(0);
    const down = missionWith(map, [unitAt("u", "mech", at(3, 3), { hp: 0 })]);
    expect([...reachable(down, "u").values()]).toEqual([0]);
  });

  it("lets infantry through a door in a wall that stops a mech", () => {
    const map = walledField();
    const graph = buildMoveGraph(map);
    const infantry = reachable(
      missionWith(map, [unitAt("u", "infantry", at(2, 2))]),
      "u",
      graph,
    );
    expect(infantry.get(graph.index.keyOf(at(4, 2)))).toBe(2);
    expect(infantry.get(graph.index.keyOf(at(4, 3)))).toBe(3);
    expect(infantry.get(graph.index.keyOf(at(4, 0)))).toBe(4);
    const mech = reachable(
      missionWith(map, [unitAt("u", "mech", at(2, 2))]),
      "u",
      graph,
    );
    for (const tile of map.tiles) {
      expect(mech.has(graph.index.keyOf(tile))).toBe(
        tile.x <= 3 && manhattanDistance(tile, at(2, 2)) <= 6,
      );
    }
  });

  it("takes infantry through a building and up its stairs while a mech stays outside", () => {
    const map = twoFloorBuilding();
    const graph = buildMoveGraph(map);
    const infantry = reachable(
      missionWith(map, [unitAt("u", "infantry", at(3, 5))]),
      "u",
      graph,
    );
    expect(infantry.get(graph.index.keyOf(at(5, 5)))).toBe(2);
    expect(infantry.get(graph.index.keyOf(at(5, 6)))).toBe(3);
    expect(infantry.get(graph.index.keyOf(at(5, 5, 1)))).toBe(4);
    expect(infantry.get(graph.index.keyOf(at(6, 6, 1)))).toBe(6);
    expect(infantry.has(graph.index.keyOf(at(6, 5)))).toBe(true);
    const oneAction = reachable(
      missionWith(map, [unitAt("u", "infantry", at(3, 5), { ap: 1 })]),
      "u",
      graph,
    );
    expect(oneAction.has(graph.index.keyOf(at(5, 6)))).toBe(true);
    expect(oneAction.has(graph.index.keyOf(at(5, 5, 1)))).toBe(false);
    const mech = reachable(
      missionWith(map, [unitAt("u", "mech", at(3, 5))]),
      "u",
      graph,
    );
    for (const tile of map.tiles) {
      if (tile.surface !== SurfaceIds.GRASS) {
        expect(mech.has(graph.index.keyOf(tile))).toBe(false);
      }
    }
  });

  it("treats a ledge without a connector as a cliff", () => {
    const map = openField()
      .tile(at(1, 0, 1), SurfaceIds.ROOF)
      .build();
    const graph = buildMoveGraph(map);
    const reach = reachable(
      missionWith(map, [unitAt("u", "infantry", at(0, 0))]),
      "u",
      graph,
    );
    expect(reach.has(graph.index.keyOf(at(1, 0, 1)))).toBe(false);
    expect(reach.has(graph.index.keyOf(at(1, 0)))).toBe(true);
  });

  it("walks around living units of either team but not through them, and ignores the dead", () => {
    const map = openField().build();
    const graph = buildMoveGraph(map);
    const blocked = missionWith(map, [
      unitAt("u", "infantry", at(0, 0)),
      unitAt("ally", "mech", at(1, 0)),
      unitAt("bug", "infantry", at(0, 1), { team: "bugs" }),
    ]);
    const reach = reachable(blocked, "u", graph);
    expect(reach.has(graph.index.keyOf(at(1, 0)))).toBe(false);
    expect(reach.has(graph.index.keyOf(at(0, 1)))).toBe(false);
    expect(reach.size).toBe(1);
    const corpse = missionWith(map, [
      unitAt("u", "infantry", at(0, 0)),
      unitAt("dead", "mech", at(1, 0), { hp: 0 }),
    ]);
    expect(reachable(corpse, "u", graph).get(graph.index.keyOf(at(1, 0)))).toBe(
      1,
    );
    const detour = missionWith(map, [
      unitAt("u", "infantry", at(0, 0)),
      unitAt("ally", "mech", at(1, 0)),
    ]);
    expect(reachable(detour, "u", graph).get(graph.index.keyOf(at(2, 0)))).toBe(
      4,
    );
  });
});

// ===========================================
// Paths
// ===========================================

describe("pathTo", () => {
  it("returns a shortest step-by-step path ending on the target, and [] for the unit's own tile", () => {
    const map = openField().build();
    const mission = missionWith(map, [unitAt("u", "infantry", at(0, 0))]);
    const path = pathTo(mission, "u", at(2, 3));
    expect(path).toHaveLength(5);
    expect(path?.at(-1)).toEqual(at(2, 3));
    let previous: TileCoord = at(0, 0);
    for (const step of path ?? []) {
      expect(manhattanDistance(previous, step)).toBe(1);
      previous = step;
    }
    expect(pathTo(mission, "u", at(0, 0))).toEqual([]);
  });

  it("is undefined beyond the budget, off the map, and for an unknown unit", () => {
    const map = openField().build();
    const mission = missionWith(map, [unitAt("u", "infantry", at(0, 0))]);
    expect(pathTo(mission, "u", at(7, 7))).toBeUndefined();
    expect(pathTo(mission, "u", at(9, 0))).toBeUndefined();
    expect(pathTo(mission, "ghost", at(1, 0))).toBeUndefined();
  });

  it("threads the door, the stairs and the stairwell hole to the upper floor", () => {
    const map = twoFloorBuilding();
    const mission = missionWith(map, [unitAt("u", "infantry", at(3, 5))]);
    expect(pathTo(mission, "u", at(6, 6, 1))).toEqual([
      at(4, 5),
      at(5, 5),
      at(5, 6),
      at(5, 5, 1),
      at(6, 5, 1),
      at(6, 6, 1),
    ]);
  });
});

// ===========================================
// Footprints (#1130)
// ===========================================

describe("units on a 2×2 block (#1130)", () => {
  it("reaches every anchor its whole block fits at, one step per anchor, and stops short of the edge", () => {
    const map = openField().build();
    const graph = buildMoveGraph(map);
    const mission = missionWith(map, [blockUnitAt("b", at(0, 0))], {
      phase: "bugs",
    });
    const reach = reachable(mission, "b", graph);
    // The same 28 anchors a soldier reaches from the corner within six
    // steps: the block never needs x = 7 or z = 7, which are out of reach
    // anyway, so the count and every cost are unchanged.
    expect(reach.size).toBe(28);
    for (const tile of map.tiles) {
      const distance = manhattanDistance(tile, at(0, 0));
      const fits = tile.x <= 6 && tile.z <= 6;
      expect(reach.get(graph.index.keyOf(tile))).toBe(
        distance <= 6 && fits ? distance : undefined,
      );
    }
    // A block against the far edge has nowhere to put its second row.
    const cornered = missionWith(map, [blockUnitAt("b", at(6, 6))], {
      phase: "bugs",
    });
    const fromCorner = reachable(cornered, "b", graph);
    expect(fromCorner.get(graph.index.keyOf(at(7, 6)))).toBeUndefined();
    expect(fromCorner.get(graph.index.keyOf(at(6, 7)))).toBeUndefined();
    expect(fromCorner.get(graph.index.keyOf(at(5, 6)))).toBe(1);
  });

  it("is stopped by a doorway a soldier walks through", () => {
    // The wall between x = 3 and x = 4 has one door, at z = 2: a soldier
    // crosses there, a block two tiles wide cannot.
    const map = walledField();
    const graph = buildMoveGraph(map);
    const mission = missionWith(map, [blockUnitAt("b", at(0, 2))], {
      phase: "bugs",
    });
    const anchors = [...reachable(mission, "b", graph).keys()].map((key) =>
      map.tiles.find((tile) => graph.index.keyOf(tile) === key)!,
    );
    expect(anchors.length).toBeGreaterThan(0);
    expect(anchors.every((anchor) => anchor.x <= 2)).toBe(true);
    expect(pathTo(mission, "b", at(4, 2), graph)).toBeUndefined();
    const soldier = missionWith(map, [unitAt("u", "infantry", at(2, 2))]);
    expect(pathTo(soldier, "u", at(4, 2), graph)).toEqual([at(3, 2), at(4, 2)]);
  });

  it("holds four tiles that others walk around, and never straddles a wall between its own tiles", () => {
    const map = openField().build();
    const graph = buildMoveGraph(map);
    const mission = missionWith(map, [
      unitAt("u", "infantry", at(0, 3)),
      blockUnitAt("b", at(3, 3)),
    ]);
    expect(occupiedKeys(mission, graph.index, "u")).toEqual(
      new Set(
        [at(3, 3), at(4, 3), at(3, 4), at(4, 4)].map((t) =>
          graph.index.keyOf(t),
        ),
      ),
    );
    const reach = reachable(mission, "u", graph);
    for (const held of [at(3, 3), at(4, 3), at(3, 4), at(4, 4)]) {
      expect(reach.get(graph.index.keyOf(held))).toBeUndefined();
    }
    expect(reach.get(graph.index.keyOf(at(2, 3)))).toBe(2);
    expect(pathTo(mission, "u", at(5, 2), graph)).toHaveLength(6);

    // A wall on the south edge of (5,2) runs between the tiles a block
    // anchored at (4,2) or (5,2) would hold: neither anchor is standable,
    // while (4,1), whose tiles the wall only borders, is.
    const split = openField().wall(at(5, 2), "s", "solid").build();
    const splitGraph = buildMoveGraph(split);
    const walker = missionWith(split, [blockUnitAt("b", at(0, 2))], {
      phase: "bugs",
    });
    const along = reachable(walker, "b", splitGraph);
    expect(along.get(splitGraph.index.keyOf(at(3, 2)))).toBe(3);
    expect(along.get(splitGraph.index.keyOf(at(4, 2)))).toBeUndefined();
    expect(along.get(splitGraph.index.keyOf(at(5, 2)))).toBeUndefined();
    expect(along.get(splitGraph.index.keyOf(at(4, 1)))).toBe(5);
  });

  it("walks around another block and cannot share a tile with it", () => {
    const map = openField().build();
    const graph = buildMoveGraph(map);
    const mission = missionWith(
      map,
      [blockUnitAt("a", at(0, 3)), blockUnitAt("b", at(3, 3))],
      { phase: "bugs" },
    );
    const reach = reachable(mission, "a", graph);
    // Anchors whose block would overlap b's tiles (x 3..4, z 3..4).
    for (const anchor of [at(2, 2), at(2, 3), at(2, 4), at(3, 2), at(4, 2)]) {
      expect(reach.get(graph.index.keyOf(anchor))).toBeUndefined();
    }
    expect(reach.get(graph.index.keyOf(at(1, 3)))).toBe(1);
    expect(reach.get(graph.index.keyOf(at(2, 1)))).toBe(4);
  });

  it("answers footprintFits and footprintCanStep tile by tile", () => {
    const map = openField().prop(PropKindIds.CRATE, at(5, 5)).build();
    const graph = buildMoveGraph(map);
    const infantry = PassMask.INFANTRY;
    expect(footprintFits(graph, at(0, 0), 2, infantry)).toBe(true);
    expect(footprintFits(graph, at(6, 6), 2, infantry)).toBe(true);
    expect(footprintFits(graph, at(7, 6), 2, infantry)).toBe(false);
    expect(footprintFits(graph, at(4, 4), 2, infantry)).toBe(false);
    expect(footprintFits(graph, at(7, 7), 1, infantry)).toBe(true);
    const from = graph.index.getAt(at(0, 0))!;
    const east = graph.index.getAt(at(1, 0))!;
    expect(footprintCanStep(graph, from, east, 2, infantry)).toBe(true);
    // The block's second row would step onto the crate.
    const near = graph.index.getAt(at(3, 4))!;
    const onto = graph.index.getAt(at(4, 4))!;
    expect(footprintCanStep(graph, near, onto, 1, infantry)).toBe(
      graph.reachability.canStep(near, onto, infantry),
    );
    expect(footprintCanStep(graph, near, onto, 2, infantry)).toBe(false);
  });
});

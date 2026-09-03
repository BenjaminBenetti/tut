import { describe, expect, it } from "vitest";

import { SurfaceIds } from "../../mapgen/data/surfaces";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { manhattanDistance } from "../../core/service/grid-math";
import {
  missionWith,
  openField,
  twoFloorBuilding,
  unitAt,
  walledField,
} from "./tactical-fixtures.test-helper";
import {
  apCostOf,
  buildMoveGraph,
  moveBudget,
  pathTo,
  reachable,
} from "./movement-service";

// ===========================================
// Fixtures
// ===========================================

const at = (x: number, z: number, y = 0): TileCoord => ({ x, y, z });

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

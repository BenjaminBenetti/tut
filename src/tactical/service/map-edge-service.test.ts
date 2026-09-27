import { describe, expect, it } from "vitest";

import { edgeExits, leaveByMapEdge, touchesMapEdge } from "./map-edge-service";
import { buildMoveGraph, searchMoves } from "./movement-service";
import {
  missionWith,
  openField,
  unitAt,
} from "./tactical-fixtures.test-helper";

const MAP = { width: 10, depth: 8 };

describe("touchesMapEdge (#1179)", () => {
  it("finds a single tile on each side of the outer ring and nowhere inside", () => {
    expect(touchesMapEdge(MAP, { x: 0, y: 0, z: 4 }, 1)).toBe(true);
    expect(touchesMapEdge(MAP, { x: 9, y: 0, z: 4 }, 1)).toBe(true);
    expect(touchesMapEdge(MAP, { x: 4, y: 0, z: 0 }, 1)).toBe(true);
    expect(touchesMapEdge(MAP, { x: 4, y: 0, z: 7 }, 1)).toBe(true);
    expect(touchesMapEdge(MAP, { x: 1, y: 0, z: 1 }, 1)).toBe(false);
    expect(touchesMapEdge(MAP, { x: 8, y: 0, z: 6 }, 1)).toBe(false);
  });

  it("reaches the far edges with the block's far tiles, not its anchor", () => {
    // A 3×3 anchored at x = 7 covers x 7..9, and 9 is the east edge.
    expect(touchesMapEdge(MAP, { x: 7, y: 0, z: 3 }, 3)).toBe(true);
    expect(touchesMapEdge(MAP, { x: 6, y: 0, z: 3 }, 3)).toBe(false);
    expect(touchesMapEdge(MAP, { x: 3, y: 0, z: 5 }, 3)).toBe(true);
    expect(touchesMapEdge(MAP, { x: 3, y: 0, z: 4 }, 3)).toBe(false);
    expect(touchesMapEdge(MAP, { x: 1, y: 0, z: 1 }, 3)).toBe(false);
  });

  it("ignores levels: a rooftop on the ring is the edge too", () => {
    expect(touchesMapEdge(MAP, { x: 0, y: 4, z: 4 }, 1)).toBe(true);
  });
});

describe("edgeExits (#1179)", () => {
  it("lists every reached anchor whose block touches the edge, with its cost, in search order", () => {
    const mission = missionWith(openField().build(), [
      unitAt("runner", "infantry", { x: 3, y: 0, z: 3 }),
    ]);
    const runner = mission.units[0]!;
    const search = searchMoves(
      mission,
      { ...runner, ap: 100 },
      buildMoveGraph(mission.map),
    );
    const exits = edgeExits(mission.map, search, 1);
    const reached = [...search.tiles].filter(([, tile]) =>
      touchesMapEdge(mission.map, tile, 1),
    );
    // The 8×8 field's ring is 28 tiles, all reachable in the open.
    expect(exits).toHaveLength(28);
    expect(exits.map((exit) => exit.key)).toEqual(reached.map(([key]) => key));
    for (const exit of exits)
      expect(exit.cost).toBe(search.costs.get(exit.key));
    // From (3, 3) the nearest ring tiles are three steps away.
    expect(Math.min(...exits.map((exit) => exit.cost))).toBe(3);
  });

  it("finds none when the search reaches no edge, and counts a block's far tiles", () => {
    // Ground tiles moved onto MAP's 10 × 8 grid; only x and z matter.
    const ground = openField().build().tiles[0]!;
    const tile = (x: number, z: number) => ({ ...ground, x, y: 0, z });
    const search = {
      tiles: new Map([
        [1, tile(4, 3)],
        [2, tile(6, 3)],
      ]),
      costs: new Map([
        [1, 0],
        [2, 2],
      ]),
    };
    expect(edgeExits(MAP, search, 1)).toEqual([]);
    // A 3×3 anchored at x = 7 would cover x 9, the east edge; at 6, not.
    expect(edgeExits(MAP, search, 3)).toEqual([]);
    expect(
      edgeExits(
        MAP,
        {
          tiles: new Map([...search.tiles, [3, tile(7, 3)]]),
          costs: new Map([...search.costs, [3, 3]]),
        },
        3,
      ),
    ).toEqual([{ key: 3, cost: 3 }]);
  });
});

describe("leaveByMapEdge (#1179)", () => {
  it("moves the unit from the map into the escaped list, frozen as it was", () => {
    const leaving = unitAt(
      "leaving",
      "infantry",
      { x: 0, y: 0, z: 3 },
      {
        team: "bugs",
        hp: 4,
      },
    );
    const staying = unitAt("staying", "infantry", { x: 2, y: 0, z: 3 });
    const mission = missionWith(openField().build(), [leaving, staying]);
    const after = leaveByMapEdge(mission, "leaving");
    expect(after.units.map((u) => u.id)).toEqual(["staying"]);
    expect(after.escaped).toEqual([leaving]);
    // Pure: the input is untouched.
    expect(mission.units).toHaveLength(2);
    expect(mission.escaped).toBeUndefined();
    // A second escape appends.
    const again = leaveByMapEdge(after, "staying");
    expect(again.escaped?.map((u) => u.id)).toEqual(["leaving", "staying"]);
  });

  it("leaves the mission as it was for a unit that is not on the map", () => {
    const mission = missionWith(openField().build(), []);
    expect(leaveByMapEdge(mission, "nobody")).toBe(mission);
  });
});

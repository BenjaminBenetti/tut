import { describe, expect, it } from "vitest";

import type { TileCoord } from "../../mapgen/model/tile-coord";
import { snapshotMap } from "../../mapgen/service/hatch-space";
import { placementHeldKeys } from "./placement-occupancy";
import {
  missionWith,
  openField,
  unitAt,
} from "./tactical-fixtures.test-helper";

// ===========================================
// Fixtures
// ===========================================

const MAP = openField().build();
const INDEX = snapshotMap(MAP).index;

/** The key of the ground tile at (x, z). */
function key(x: number, z: number): number {
  const tile: TileCoord = { x, y: 0, z };
  return INDEX.keyOf(tile);
}

/** A nest at `pos`: not solid, so movement's rule leaves its tile open. */
function nest(id: string, pos: TileCoord, destroyed = false) {
  return {
    id,
    pos,
    hatchRadius: 3,
    hp: destroyed ? 0 : 20,
    timer: 3,
    destroyed,
  };
}

// ===========================================
// Tests
// ===========================================

describe("placementHeldKeys (#1130, #1179)", () => {
  it("holds a surfaced unit's tile, a buried burrower's and a standing nest's, and nothing else", () => {
    const mission = missionWith(
      MAP,
      [
        unitAt("s1", "infantry", { x: 1, y: 0, z: 1 }),
        unitAt(
          "burrower",
          "infantry",
          { x: 3, y: 0, z: 3 },
          { team: "bugs", status: ["burrowed"] },
        ),
        unitAt("dead", "infantry", { x: 4, y: 0, z: 4 }, { hp: 0 }),
        unitAt(
          "dead-burrower",
          "infantry",
          { x: 4, y: 0, z: 5 },
          { team: "bugs", hp: 0, status: ["burrowed"] },
        ),
      ],
      {
        spawners: [
          nest("spawner-1", { x: 6, y: 0, z: 6 }),
          nest("spawner-2", { x: 7, y: 0, z: 2 }, true),
        ],
      },
    );

    expect(
      [...placementHeldKeys(mission, INDEX)].sort((a, b) => a - b),
    ).toEqual([key(1, 1), key(3, 3), key(6, 6)].sort((a, b) => a - b));
  });

  it("hands each caller a fresh set it may add to", () => {
    const mission = missionWith(MAP, []);
    const first = placementHeldKeys(mission, INDEX);
    first.add(key(2, 2));

    expect(placementHeldKeys(mission, INDEX).has(key(2, 2))).toBe(false);
  });
});

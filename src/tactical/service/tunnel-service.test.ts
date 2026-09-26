import { describe, expect, it } from "vitest";

import { STOREY_LAYERS } from "../../core/model/elevation";
import { SurfaceIds } from "../../mapgen/data/surfaces";
import { TileIndex } from "../../mapgen/service/tile-index";
import type { Spawner } from "../model/tactical-state";
import {
  burrowerAt,
  missionWith,
  openField,
  twoFloorBuilding,
  unitAt,
  walledField,
} from "./tactical-fixtures.test-helper";
import { searchMoves } from "./movement-service";
import {
  buriedKeys,
  groundTileAt,
  isDiggable,
  searchTunnel,
  tunnelCost,
  tunnelDestinations,
  tunnelHeldKeys,
} from "./tunnel-service";

// ===========================================
// Fixtures
// ===========================================

/** A live egg spawner on the tile. */
function spawnerAt(x: number, z: number): Spawner {
  return {
    id: `spawner-${x}-${z}`,
    pos: { x, y: 0, z },
    hatchRadius: 1,
    hp: 10,
    timer: 2,
    destroyed: false,
  };
}

/** `x,z` of each destination, for comparing sets of columns. */
function columns(
  destinations: readonly { tile: { x: number; z: number } }[],
): string[] {
  return destinations.map(({ tile }) => `${tile.x},${tile.z}`).sort();
}

// ===========================================
// The rule
// ===========================================

describe("searchTunnel", () => {
  it("goes straight under a wall that a walk has to go round by the door", () => {
    // walledField: a solid wall between x = 3 and x = 4, one door at z = 2.
    const digger = burrowerAt("digger", { x: 2, y: 0, z: 5 });
    const mission = missionWith(walledField(), [digger]);
    const index = new TileIndex(mission.map);
    const target = groundTileAt(index, 5, 5);
    expect(target).toBeDefined();
    if (target === undefined) return;
    // Three columns east, whatever stands on them.
    expect(tunnelCost(mission, digger, target, index)).toBe(3);
    // The same unit on foot cannot get there this turn: the door is nine
    // steps round, and it has six.
    const walker = { ...digger, status: [] };
    const walked = searchMoves(
      missionWith(walledField(), [walker]),
      walker,
    ).costs.get(index.keyOf(target));
    expect(walked).toBeUndefined();
  });

  it("ignores props and cover: a column under a crate costs one step like any other", () => {
    const map = openField()
      .patchTile({ x: 3, y: 0, z: 3 }, { pass: 0, blocksLos: true })
      .build();
    const digger = burrowerAt("digger", { x: 2, y: 0, z: 3 });
    const mission = missionWith(map, [digger]);
    const search = searchTunnel(mission, digger);
    const index = new TileIndex(map);
    expect(search.costs.get(index.keyOf({ x: 3, y: 0, z: 3 }))).toBe(1);
    expect(search.costs.get(index.keyOf({ x: 4, y: 0, z: 3 }))).toBe(2);
  });

  it("goes round water and bedrock, which it cannot dig through", () => {
    const map = openField()
      .tile({ x: 4, y: 0, z: 3 }, SurfaceIds.WATER)
      .tile({ x: 4, y: 0, z: 4 }, SurfaceIds.BEDROCK)
      .build();
    const digger = burrowerAt("digger", { x: 3, y: 0, z: 3 });
    const mission = missionWith(map, [digger]);
    const index = new TileIndex(map);
    const search = searchTunnel(mission, digger, index);
    expect(search.costs.has(index.keyOf({ x: 4, y: 0, z: 3 }))).toBe(false);
    expect(search.costs.has(index.keyOf({ x: 4, y: 0, z: 4 }))).toBe(false);
    // Two columns east, but round the water to the north: four.
    expect(search.costs.get(index.keyOf({ x: 5, y: 0, z: 3 }))).toBe(4);
    const water = index.getAt({ x: 4, y: 0, z: 3 });
    expect(water === undefined ? undefined : isDiggable(water)).toBe(false);
  });

  it("stops at the map's edge and spends exactly its move budget", () => {
    // From the corner with two actions of three: every column within six
    // steps that is on the map, 28 of them less the one it is under.
    const digger = burrowerAt("digger", { x: 0, y: 0, z: 0 });
    const mission = missionWith(openField().build(), [digger]);
    const destinations = tunnelDestinations(mission, digger);
    expect(destinations).toHaveLength(27);
    for (const { tile, cost } of destinations) {
      expect(tile.x).toBeGreaterThanOrEqual(0);
      expect(tile.z).toBeGreaterThanOrEqual(0);
      expect(cost).toBe(tile.x + tile.z);
      expect(cost).toBeLessThanOrEqual(6);
    }
    // One action left: three steps, the 10 columns with x + z ≤ 3 less one.
    const tired = { ...digger, ap: 1 };
    expect(
      tunnelDestinations(missionWith(openField().build(), [tired]), tired),
    ).toHaveLength(9);
  });

  it("travels the lowest tile of each column: under a building, never up its stairs", () => {
    const digger = burrowerAt("digger", { x: 3, y: 0, z: 5 });
    const mission = missionWith(twoFloorBuilding(), [digger]);
    const upstairs = tunnelDestinations(mission, digger).filter(
      ({ tile }) => tile.y > 0,
    );
    expect(upstairs).toEqual([]);
    const index = new TileIndex(mission.map);
    expect(groundTileAt(index, 5, 5)?.y).toBe(0);
    expect(index.column(5, 5).map((tile) => tile.y)).toEqual([
      0,
      STOREY_LAYERS,
    ]);
  });

  it("reaches nothing from a column it cannot dig", () => {
    const map = openField().tile({ x: 2, y: 0, z: 2 }, SurfaceIds.BEDROCK);
    const digger = burrowerAt("digger", { x: 2, y: 0, z: 2 });
    const mission = missionWith(map.build(), [digger]);
    expect(searchTunnel(mission, digger).costs.size).toBe(0);
  });

  it("gives the same answer, in the same order, every time", () => {
    const digger = burrowerAt("digger", { x: 3, y: 0, z: 3 });
    const mission = missionWith(walledField(), [digger]);
    const once = tunnelDestinations(mission, digger);
    const again = tunnelDestinations(mission, digger);
    expect(again).toEqual(once);
  });
});

// ===========================================
// Held ground
// ===========================================

describe("tunnelDestinations", () => {
  it("passes under a squad, a burrower and a spawner but never ends on one", () => {
    const digger = burrowerAt("digger", { x: 1, y: 0, z: 1 });
    const squad = unitAt("squad", "infantry", { x: 2, y: 0, z: 1 });
    const other = burrowerAt("other", { x: 1, y: 0, z: 2 });
    const mission = missionWith(openField().build(), [digger, squad, other], {
      spawners: [spawnerAt(0, 1)],
    });
    const reached = columns(tunnelDestinations(mission, digger));
    expect(reached).not.toContain("2,1");
    expect(reached).not.toContain("1,2");
    expect(reached).not.toContain("0,1");
    expect(reached).not.toContain("1,1");
    // …and the columns beyond each are reached at the straight cost.
    const index = new TileIndex(mission.map);
    expect(tunnelCost(mission, digger, { x: 3, y: 0, z: 1 }, index)).toBe(2);
    expect(tunnelCost(mission, digger, { x: 1, y: 0, z: 3 }, index)).toBe(2);
  });

  it("frees a dead unit's tile and a destroyed spawner's", () => {
    const digger = burrowerAt("digger", { x: 1, y: 0, z: 1 });
    const dead = unitAt("dead", "infantry", { x: 2, y: 0, z: 1 }, { hp: 0 });
    const mission = missionWith(openField().build(), [digger, dead], {
      spawners: [{ ...spawnerAt(0, 1), destroyed: true }],
    });
    const reached = columns(tunnelDestinations(mission, digger));
    expect(reached).toContain("2,1");
    expect(reached).toContain("0,1");
  });
});

describe("buriedKeys and tunnelHeldKeys", () => {
  it("lists the living burrowed units' tiles, and leaves out the one asking", () => {
    const digger = burrowerAt("digger", { x: 1, y: 0, z: 1 });
    const other = burrowerAt("other", { x: 4, y: 0, z: 4 });
    const up = burrowerAt("up", { x: 5, y: 0, z: 5 }, { status: [] });
    const gone = burrowerAt("gone", { x: 6, y: 0, z: 6 }, { hp: 0 });
    const mission = missionWith(openField().build(), [digger, other, up, gone]);
    const index = new TileIndex(mission.map);
    expect([...buriedKeys(mission, index, "digger")]).toEqual([
      index.keyOf({ x: 4, y: 0, z: 4 }),
    ]);
    const held = tunnelHeldKeys(mission, index, "digger");
    expect(held.has(index.keyOf({ x: 4, y: 0, z: 4 }))).toBe(true);
    expect(held.has(index.keyOf({ x: 5, y: 0, z: 5 }))).toBe(true);
    expect(held.has(index.keyOf({ x: 6, y: 0, z: 6 }))).toBe(false);
    expect(held.has(index.keyOf({ x: 1, y: 0, z: 1 }))).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { BRUTE, HIVE_GUARD, LURKER, SWARMER } from "../../bugs/data/species";
import { PropKindIds } from "../../mapgen/data/props";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import type { Spawner, TacticalState } from "../model/tactical-state";
import { UNIT_ID_PREFIX } from "../model/unit";
import {
  placeBugAtFirst,
  placeBugsAt,
  placeHiveGuards,
} from "./placed-bug-service";
import {
  burrowerAt,
  missionWith,
  unitAt,
} from "./tactical-fixtures.test-helper";

// ===========================================
// Fixtures
// ===========================================

const at = (x: number, z: number): TileCoord => ({ x, y: 0, z });

/** An egg spawner on `pos`, live unless told otherwise. */
function spawnerAt(id: string, pos: TileCoord, destroyed = false): Spawner {
  return { id, pos, hatchRadius: 3, hp: 20, timer: 5, destroyed };
}

/**
 * A 10×10 field: a squad at the west edge, a crate (impassable) at
 * (5, 5), a live spawner at (6, 6) and a destroyed one at (7, 7).
 *
 * ```
 *   z=2  M . . . . . . . . .     M the squad
 *   z=5  . . . . . C . . . .     C crate
 *   z=6  . . . . . . S . . .     S live spawner
 *   z=7  . . . . . . . x . .     x destroyed spawner
 * ```
 */
function field(): TacticalState {
  const map = new FixtureMapBuilder(10, 10, 1)
    .fillGround()
    .prop(PropKindIds.CRATE, at(5, 5))
    .build();
  return missionWith(map, [unitAt("mark", "infantry", at(0, 2))], {
    spawners: [spawnerAt("live", at(6, 6)), spawnerAt("dead", at(7, 7), true)],
  });
}

/** The ids a fresh generator issues first, in order. */
function firstIds(count: number): string[] {
  const ids = new SequentialIdGenerator();
  return Array.from({ length: count }, () => ids.nextId(UNIT_ID_PREFIX));
}

/** The units `after` has that `before` did not. */
function added(before: TacticalState, after: TacticalState) {
  const had = new Set(before.units.map((u) => u.id));
  return after.units.filter((u) => !had.has(u.id));
}

// ===========================================
// Tests
// ===========================================

describe("placeHiveGuards", () => {
  it("stands a ready Hive Guard on each position, in order, bypassing the roll", () => {
    const state = field();
    const positions = [at(4, 2), at(8, 3), at(3, 8)];
    const placed = placeHiveGuards(state, positions, {
      ids: new SequentialIdGenerator(),
      guard: HIVE_GUARD,
    });
    const guards = added(state, placed);
    expect(guards.map((u) => u.id)).toEqual(firstIds(3));
    expect(guards.map((u) => u.pos)).toEqual(positions);
    for (const guard of guards) {
      expect(guard).toMatchObject({
        kind: "bug",
        team: "bugs",
        sourceId: "hive-guard",
        templateId: "bug:hive-guard",
        hp: HIVE_GUARD.hp,
        maxHp: HIVE_GUARD.hp,
        // Ready, unlike a hatchling: it was there before the squad landed.
        ap: HIVE_GUARD.ap,
        maxAp: HIVE_GUARD.ap,
      });
    }
    // One template for all of them, carrying the rooted stat block.
    expect(placed.templates["bug:hive-guard"]).toMatchObject({
      move: 0,
      modelId: "bug.hive-guard",
      xpValue: HIVE_GUARD.xpValue,
    });
    expect(Object.keys(placed.templates).length).toBe(
      Object.keys(state.templates).length + 1,
    );
  });

  it("skips a position that cannot hold one, and draws no id for it", () => {
    const state = field();
    const placed = placeHiveGuards(
      state,
      [
        at(0, 2), // the squad stands there
        at(5, 5), // the crate
        at(6, 6), // a live spawner
        at(12, 3), // off the map
        at(2, 2), // free
        at(2, 2), // taken by the guard just placed
        at(7, 7), // a destroyed spawner's rubble holds a guard
      ],
      { ids: new SequentialIdGenerator(), guard: HIVE_GUARD },
    );
    const guards = added(state, placed);
    expect(guards.map((u) => u.pos)).toEqual([at(2, 2), at(7, 7)]);
    expect(guards.map((u) => u.id)).toEqual(firstIds(2));
  });

  it("faces each guard at the nearest living enemy, else the map's centre", () => {
    const state = field();
    const withDead = {
      ...state,
      units: [
        ...state.units,
        unitAt("fallen", "infantry", at(5, 2), { hp: 0 }),
      ],
    };
    const placed = placeHiveGuards(withDead, [at(4, 2), at(0, 8), at(0, 0)], {
      ids: new SequentialIdGenerator(),
      guard: HIVE_GUARD,
    });
    // (4,2) → west along x to the squad at (0,2); (0,8) → north up z;
    // (0,0) is 2 tiles north of the squad → south. The fallen squad at
    // (5,2), one tile east of the first guard, does not count.
    expect(added(withDead, placed).map((u) => u.facing)).toEqual([
      "w",
      "n",
      "s",
    ]);

    const empty = { ...state, units: [] };
    const alone = placeHiveGuards(empty, [at(1, 1), at(8, 5)], {
      ids: new SequentialIdGenerator(),
      guard: HIVE_GUARD,
    });
    expect(alone.units.map((u) => u.facing)).toEqual(["e", "w"]);
  });

  it("returns the mission itself when nothing could be placed, and never mutates it", () => {
    const state = field();
    const frozen = JSON.stringify(state);
    const ids = new SequentialIdGenerator();
    const unchanged = placeHiveGuards(state, [at(0, 2), at(5, 5)], {
      ids,
      guard: HIVE_GUARD,
    });
    expect(unchanged).toBe(state);
    expect(ids.nextId(UNIT_ID_PREFIX)).toBe(firstIds(1)[0]);
    expect(placeHiveGuards(state, [], { ids, guard: HIVE_GUARD })).toBe(state);

    placeHiveGuards(state, [at(3, 3)], {
      ids: new SequentialIdGenerator(),
      guard: HIVE_GUARD,
    });
    expect(JSON.stringify(state)).toBe(frozen);
  });
});

describe("placeBugsAt", () => {
  it("holds a species on a block to its whole footprint", () => {
    // A brute stands on 2×2 (#1130): anchored at (5,4) its block would
    // take the crate's tile, and at (0,1) the squad's.
    const state = field();
    const placed = placeBugsAt(state, BRUTE, [at(5, 4), at(0, 1), at(2, 5)], {
      ids: new SequentialIdGenerator(),
    });
    expect(added(state, placed).map((u) => u.pos)).toEqual([at(2, 5)]);
    expect(placed.templates["bug:brute"]?.footprint).toBe(2);
  });

  it("never stands a bug over a burrower under the ground, though the burrower holds no tile (#1179)", () => {
    // A burrower under (4, 2), and a brute whose block anchored at (3, 1)
    // would reach over it: both are skipped, and (8, 8) still takes one.
    const base = field();
    const state = {
      ...base,
      units: [...base.units, burrowerAt("dug-in", at(4, 2))],
    };
    const swarmers = placeBugsAt(state, SWARMER, [at(4, 2), at(8, 8)], {
      ids: new SequentialIdGenerator(),
    });
    expect(added(state, swarmers).map((u) => u.pos)).toEqual([at(8, 8)]);
    const brutes = placeBugsAt(state, BRUTE, [at(3, 1), at(2, 5)], {
      ids: new SequentialIdGenerator(),
    });
    expect(added(state, brutes).map((u) => u.pos)).toEqual([at(2, 5)]);
  });
});

describe("placeBugAtFirst (#1179)", () => {
  it("stands one bug on the first candidate that can hold it and tries no more", () => {
    // (5,5) is the crate, (0,2) the squad, (6,6) the live spawner.
    const state = field();
    const ids = new SequentialIdGenerator();
    const placed = placeBugAtFirst(
      state,
      LURKER,
      [at(5, 5), at(0, 2), at(6, 6), at(3, 3), at(4, 4)],
      { ids },
    );
    const bugs = added(state, placed);
    expect(bugs.map((u) => [u.id, u.sourceId, u.pos])).toEqual([
      [firstIds(1)[0], "lurker", at(3, 3)],
    ]);
    // One id drawn, for the one bug.
    expect(ids.nextId(UNIT_ID_PREFIX)).toBe(firstIds(2)[1]);
  });

  it("returns the mission itself, drawing no id, when no candidate fits", () => {
    const state = field();
    const frozen = JSON.stringify(state);
    const ids = new SequentialIdGenerator();
    expect(placeBugAtFirst(state, LURKER, [at(5, 5), at(0, 2)], { ids })).toBe(
      state,
    );
    expect(placeBugAtFirst(state, LURKER, [], { ids })).toBe(state);
    expect(ids.nextId(UNIT_ID_PREFIX)).toBe(firstIds(1)[0]);
    expect(JSON.stringify(state)).toBe(frozen);
  });

  it("passes over a candidate above a burrower under the ground, as placeBugsAt does (#1179)", () => {
    // Live Specimen's lurker goes through here: a burrower under (3, 3)
    // holds no tile on the surface, yet its column is no place to stand
    // a bug, so the next candidate takes it.
    const base = field();
    const state = {
      ...base,
      units: [...base.units, burrowerAt("dug-in", at(3, 3))],
    };
    const ids = new SequentialIdGenerator();
    const placed = placeBugAtFirst(state, LURKER, [at(3, 3), at(4, 4)], {
      ids,
    });
    expect(added(state, placed).map((u) => u.pos)).toEqual([at(4, 4)]);
    // With the burrower's column the only candidate, nothing is placed.
    expect(placeBugAtFirst(state, LURKER, [at(3, 3)], { ids })).toBe(state);
  });
});

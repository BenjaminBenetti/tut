import { describe, expect, it } from "vitest";

import { PropKindIds } from "../../mapgen/data/props";
import { CoverLevel } from "../../mapgen/model/cover";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { TileIndex } from "../../mapgen/service/tile-index";
import { SurfaceIds } from "../../mapgen/data/surfaces";
import type { PlaneCell } from "./sight-service";
import {
  coverAgainst,
  elevationBonus,
  hasLineOfSight,
  traceLine,
} from "./sight-service";

// ===========================================
// Fixtures
// ===========================================

const at = (x: number, z: number, y = 0): TileCoord => ({ x, y, z });

/** An open 8×8 field on the ground level. */
function field(): FixtureMapBuilder {
  return new FixtureMapBuilder(8, 8, 3).fillGround();
}

/** Line of sight both ways, so every rule is checked for symmetry. */
function los(map: TacticalMap, a: TileCoord, b: TileCoord): boolean {
  const index = new TileIndex(map);
  const forward = hasLineOfSight(map, a, b, index);
  expect(hasLineOfSight(map, b, a, index)).toBe(forward);
  return forward;
}

// ===========================================
// Line tracing
// ===========================================

describe("traceLine", () => {
  it("walks a straight line cell by cell with one edge per crossing", () => {
    const line = traceLine({ x: 1, z: 2 }, { x: 4, z: 2 });
    expect(line.cells.map((c) => [c.x, c.z])).toEqual([
      [1, 2],
      [2, 2],
      [3, 2],
      [4, 2],
    ]);
    expect(line.crossings.map((c) => c.edges)).toEqual([
      [{ x: 1, z: 2, side: "e" }],
      [{ x: 2, z: 2, side: "e" }],
      [{ x: 3, z: 2, side: "e" }],
    ]);
    expect(line.cells[0]?.tEnter).toBe(0);
    expect(line.cells.at(-1)?.tExit).toBe(1);
  });

  it("steps through exact corners, recording the four edges that meet there", () => {
    const line = traceLine({ x: 0, z: 0 }, { x: 2, z: 2 });
    expect(line.cells.map((c) => [c.x, c.z])).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
    ]);
    expect(line.crossings[0]?.edges).toHaveLength(4);
    expect(line.crossings[0]?.edges).toEqual(
      expect.arrayContaining([
        { x: 0, z: 0, side: "e" },
        { x: 0, z: 0, side: "s" },
        { x: 1, z: 1, side: "w" },
        { x: 1, z: 1, side: "n" },
      ]),
    );
  });

  it("visits every cell a shallow line passes through", () => {
    const line = traceLine({ x: 0, z: 0 }, { x: 4, z: 1 });
    expect(line.cells.map((c) => [c.x, c.z])).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
      [3, 1],
      [4, 1],
    ]);
    for (let i = 1; i < line.cells.length; i++) {
      expect(line.cells[i]?.tEnter).toBe(line.cells[i - 1]?.tExit);
    }
  });
});

// ===========================================
// Line of sight
// ===========================================

describe("hasLineOfSight", () => {
  it("is clear across open ground and to the same tile", () => {
    const map = field().build();
    expect(los(map, at(0, 0), at(7, 7))).toBe(true);
    expect(los(map, at(3, 3), at(3, 3))).toBe(true);
  });

  it("is blocked by a solid wall and a door on the crossed edge, not by a window", () => {
    const solid = field().wall(at(2, 3), "e", "solid").build();
    expect(los(solid, at(1, 3), at(5, 3))).toBe(false);
    expect(los(solid, at(1, 4), at(5, 4))).toBe(true);
    const door = field().wall(at(2, 3), "e", "door").build();
    expect(los(door, at(1, 3), at(5, 3))).toBe(false);
    const window = field().wall(at(2, 3), "e", "window").build();
    expect(los(window, at(1, 3), at(5, 3))).toBe(true);
  });

  it("is blocked by a prop that blocks sight, not by one that only gives cover", () => {
    const boulder = field().prop(PropKindIds.BOULDER, at(3, 3)).build();
    expect(los(boulder, at(1, 3), at(5, 3))).toBe(false);
    expect(los(boulder, at(1, 2), at(5, 2))).toBe(true);
    const sandbags = field().prop(PropKindIds.SANDBAGS, at(3, 3)).build();
    expect(los(sandbags, at(1, 3), at(5, 3))).toBe(true);
  });

  it("never lets the endpoint tiles block", () => {
    const map = field().wall(at(2, 3), "w", "solid").build();
    expect(los(map, at(2, 3), at(5, 3))).toBe(true);
  });

  it("treats a wall touching an exactly crossed corner as blocking", () => {
    const map = field().wall(at(1, 1), "e", "solid").build();
    // The wall runs along x = 2 from z = 1 to z = 2; both diagonals below
    // pass exactly through one of its end corners and are blocked.
    expect(los(map, at(0, 0), at(3, 3))).toBe(false);
    expect(los(map, at(0, 3), at(3, 0))).toBe(false);
    // A diagonal whose corners stay clear of the wall's ends is not.
    expect(los(map, at(0, 4), at(3, 1))).toBe(true);
  });

  it("lets a shooter one level up look over a prop near its feet but not one at the target", () => {
    const map = field()
      .tile(at(0, 3, 1), SurfaceIds.GRASS)
      .prop(PropKindIds.BOULDER, at(1, 3))
      .build();
    expect(los(map, at(0, 3, 1), at(6, 3))).toBe(true);
    const shielded = field()
      .tile(at(0, 3, 1), SurfaceIds.GRASS)
      .prop(PropKindIds.BOULDER, at(5, 3))
      .build();
    expect(los(shielded, at(0, 3, 1), at(6, 3))).toBe(false);
  });
});

// ===========================================
// Cover
// ===========================================

describe("coverAgainst", () => {
  const target = at(4, 4);

  it("gives high cover behind a solid wall and none when flanked around it", () => {
    const map = field().wall(target, "n", "solid").build();
    expect(coverAgainst(map, target, at(4, 0))).toBe(CoverLevel.HIGH);
    expect(coverAgainst(map, target, at(5, 1))).toBe(CoverLevel.HIGH);
    expect(coverAgainst(map, target, at(4, 7))).toBe(CoverLevel.NONE);
    expect(coverAgainst(map, target, at(7, 4))).toBe(CoverLevel.NONE);
    expect(coverAgainst(map, target, at(7, 2))).toBe(CoverLevel.NONE);
  });

  it("counts both sides on an exact diagonal and takes the better one", () => {
    const map = field()
      .wall(target, "n", "window")
      .prop(PropKindIds.BOULDER, at(5, 4))
      .build();
    expect(coverAgainst(map, target, at(6, 2))).toBe(CoverLevel.HIGH);
    expect(coverAgainst(map, target, at(2, 2))).toBe(CoverLevel.LOW);
    expect(coverAgainst(map, target, at(2, 6))).toBe(CoverLevel.NONE);
  });

  it("reads low cover from windows, doors and low props, high from high props", () => {
    const window = field().wall(target, "w", "window").build();
    expect(coverAgainst(window, target, at(0, 4))).toBe(CoverLevel.LOW);
    const door = field().wall(target, "w", "door").build();
    expect(coverAgainst(door, target, at(0, 4))).toBe(CoverLevel.LOW);
    const sandbags = field().prop(PropKindIds.SANDBAGS, at(4, 5)).build();
    expect(coverAgainst(sandbags, target, at(4, 7))).toBe(CoverLevel.LOW);
    const dumpster = field().prop(PropKindIds.DUMPSTER, at(4, 5)).build();
    expect(coverAgainst(dumpster, target, at(4, 7))).toBe(CoverLevel.HIGH);
  });

  it("gives no cover in the open, from the same tile, or from a prop on another level", () => {
    const open = field().build();
    expect(coverAgainst(open, target, at(0, 0))).toBe(CoverLevel.NONE);
    expect(coverAgainst(open, target, target)).toBe(CoverLevel.NONE);
    const above = field()
      .tile(at(4, 5, 1), SurfaceIds.GRASS)
      .prop(PropKindIds.BOULDER, at(4, 5, 1))
      .build();
    expect(coverAgainst(above, target, at(4, 7))).toBe(CoverLevel.NONE);
  });
});

// ===========================================
// Elevation
// ===========================================

describe("elevationBonus", () => {
  it("measures levels the attacker stands above the target", () => {
    expect(elevationBonus(at(0, 0, 2), at(3, 3, 0))).toBe(2);
    expect(elevationBonus(at(0, 0, 0), at(3, 3, 1))).toBe(-1);
    expect(elevationBonus(at(0, 0, 1), at(3, 3, 1))).toBe(0);
  });
});

describe("half walls", () => {
  it("gives low cover and does not block the line (#508)", () => {
    const map = new FixtureMapBuilder(5, 1, 1)
      .fillGround()
      .wall({ x: 2, y: 0, z: 0 }, "e", "half")
      .build();
    const index = new TileIndex(map);
    const defender = { x: 2, y: 0, z: 0 };
    const attacker = { x: 4, y: 0, z: 0 };
    // A parapet is something to crouch behind, not to hide inside.
    expect(coverAgainst(map, defender, attacker, index)).toBe(CoverLevel.LOW);
    // And it is waist-high, so the shot still has a line.
    expect(hasLineOfSight(map, attacker, defender, index)).toBe(true);
  });
});

// ===========================================
// Terrain
// ===========================================

/**
 * A 9×3 plat at level 0 with the columns at x = 4 and x = 5 raised to
 * level 2 — a two-level ridge across the middle, with solid rock and no
 * tile record beneath its crest (ADR 0004 §4.2).
 *
 * ```
 *   level 2            ####            x = 4, 5
 *   level 1            ????            no record: rock
 *   level 0   ......... .. .........
 *             ^ (0,0,1)        (8,0,1) ^
 * ```
 */
function ridge(): TacticalMap {
  const builder = new FixtureMapBuilder(9, 3, 3).fillGround();
  for (const x of [4, 5]) {
    for (let z = 0; z < 3; z++) {
      builder.removeTile({ x, y: 0, z });
      builder.tile({ x, y: 2, z }, SurfaceIds.ROCK);
    }
  }
  return builder.build();
}

describe("terrain", () => {
  it("blocks the line through a hill, which has no tile to read (#593)", () => {
    // Solid rock is the absence of a record, so the old rule found
    // nothing in the way and let both sight and fire pass through.
    expect(los(ridge(), at(0, 1), at(8, 1))).toBe(false);
  });

  it("still lets the crest of that hill see the ground on either side", () => {
    // The line descends with the shooter, so it leaves the rock behind
    // rather than tunnelling on through it: high ground stays worth
    // taking.
    const map = ridge();
    expect(los(map, { x: 4, y: 2, z: 1 }, at(0, 1))).toBe(true);
    expect(los(map, { x: 4, y: 2, z: 1 }, at(8, 1))).toBe(true);
  });

  it("does not block on the open sky above lower ground", () => {
    // Same missing tile, nothing above it: two units on facing ledges
    // see across the valley between them.
    const map = new FixtureMapBuilder(9, 3, 3)
      .fillGround()
      .tile({ x: 0, y: 2, z: 1 }, SurfaceIds.ROCK)
      .tile({ x: 8, y: 2, z: 1 }, SurfaceIds.ROCK)
      .build();
    expect(los(map, { x: 0, y: 2, z: 1 }, { x: 8, y: 2, z: 1 })).toBe(true);
  });

  it("blocks the line through the void a staircase occupies", () => {
    // A stairs tile spans a storey, so the level above it holds no
    // record either; that void was a free firing lane between floors.
    const map = new FixtureMapBuilder(3, 3, 3)
      .fillGround(0, SurfaceIds.FLOOR)
      .tile({ x: 1, y: 0, z: 1 }, SurfaceIds.STAIRS)
      .tile({ x: 1, y: 2, z: 1 }, SurfaceIds.FLOOR)
      .tile({ x: 2, y: 2, z: 1 }, SurfaceIds.FLOOR)
      .build();
    expect(los(map, at(0, 1), { x: 2, y: 2, z: 1 })).toBe(false);
  });
});

// ===========================================
// Corner seams
// ===========================================

/**
 * A field with the two columns at `(1, 2)` and `(2, 1)` raised to level
 * 2 and no tile beneath them: two hills that meet only at the corner
 * between `(1, 1)` and `(2, 2)`.
 *
 * ```
 *   z=1   .   ##          ## raised to level 2
 *   z=2   ##   .          .  ground at level 0
 *        x=1  x=2
 * ```
 */
function cornerHills(...raised: readonly PlaneCell[]): TacticalMap {
  const builder = new FixtureMapBuilder(5, 5, 3).fillGround();
  for (const cell of raised) {
    builder.removeTile({ x: cell.x, y: 0, z: cell.z });
    builder.tile({ x: cell.x, y: 2, z: cell.z }, SurfaceIds.ROCK);
  }
  return builder.build();
}

/**
 * The same field as `cornerHills`, but the corner is made of opaque
 * props standing on ordinary ground rather than raised rock.
 *
 * ```
 *   z=1   .   PP          PP  prop with blocksLos
 *   z=2   PP   .          .   bare ground
 *        x=1  x=2
 * ```
 */
function cornerProps(...occupied: readonly PlaneCell[]): TacticalMap {
  const builder = new FixtureMapBuilder(5, 5, 3).fillGround();
  for (const cell of occupied) {
    builder.prop(PropKindIds.CAR, at(cell.x, cell.z));
  }
  return builder.build();
}

describe("corner seams", () => {
  it("does not let sight thread the seam between two hills (#646)", () => {
    // The line steps diagonally through the corner and never enters
    // either hill, so the cell rule is never asked about them.
    const map = cornerHills({ x: 1, z: 2 }, { x: 2, z: 1 });
    expect(los(map, at(1, 1), at(2, 2))).toBe(false);
  });

  it("leaves the diagonal open when only one side of the corner is rock", () => {
    // One hill touched at a single corner still has an open gap beside
    // it; sealing that would make terrain stricter than masonry.
    const map = cornerHills({ x: 1, z: 2 });
    expect(los(map, at(1, 1), at(2, 2))).toBe(true);
  });

  it("agrees with what a wall on the same corner already did", () => {
    // The wall rule reads all four edges meeting at the corner, which is
    // why it never had this hole. Terrain now matches it.
    const walled = new FixtureMapBuilder(5, 5, 3)
      .fillGround()
      .wall({ x: 1, y: 0, z: 2 }, "n", "solid")
      .build();
    expect(los(walled, at(1, 1), at(2, 2))).toBe(false);
  });

  it("does not let sight thread the seam between two opaque props (#679)", () => {
    // The same hole as the hills above, one layer up: a prop is opaque
    // by tuning rather than by nature, and the corner rule used to ask
    // only about rock.
    const map = cornerProps({ x: 1, z: 2 }, { x: 2, z: 1 });
    expect(los(map, at(1, 1), at(2, 2))).toBe(false);
  });

  it("seals a corner where a prop meets rock (#679)", () => {
    // The mixed pair is the case worth naming: the gap a soldier would
    // be looking through is the same gap whichever side is which, so
    // both sides seal it.
    const builder = new FixtureMapBuilder(5, 5, 3).fillGround();
    builder.removeTile({ x: 1, y: 0, z: 2 });
    builder.tile({ x: 1, y: 2, z: 2 }, SurfaceIds.ROCK);
    builder.prop(PropKindIds.CAR, at(2, 1));
    expect(los(builder.build(), at(1, 1), at(2, 2))).toBe(false);
  });

  it("leaves the diagonal open when only one side of the corner is a prop", () => {
    // Parity with rock: one opaque thing touched at a single corner
    // still has an open gap beside it.
    const map = cornerProps({ x: 1, z: 2 });
    expect(los(map, at(1, 1), at(2, 2))).toBe(true);
  });

  it("leaves the diagonal open when the props do not block sight", () => {
    // `blocksLos` is what the rule reads, not the presence of a prop:
    // two crates at the same corner are see-through and stay so.
    const map = new FixtureMapBuilder(5, 5, 3)
      .fillGround()
      .prop(PropKindIds.CRATE, at(1, 2))
      .prop(PropKindIds.CRATE, at(2, 1))
      .build();
    expect(los(map, at(1, 1), at(2, 2))).toBe(true);
  });

  it("does not call ground with a floor above it rock (#646)", () => {
    // The near-miss this rule shipped with: asking only "is there ground
    // higher in this column" makes any tile under a storey read as solid,
    // and a corner between two building floors seals for no reason. It
    // blocked three times as many lines as the rule intends.
    const map = new FixtureMapBuilder(5, 5, 3)
      .fillGround()
      .tile({ x: 1, y: 1, z: 2 }, SurfaceIds.FLOOR)
      .tile({ x: 2, y: 1, z: 1 }, SurfaceIds.FLOOR)
      .build();
    expect(los(map, at(1, 1), at(2, 2))).toBe(true);
  });

  it("names the cells a corner step grazes, and none for a straight one", () => {
    // Geometry the sight rule should not have to re-derive from the
    // order of the four edges.
    const diagonal = traceLine({ x: 0, z: 0 }, { x: 2, z: 2 });
    const corner = diagonal.crossings.find((c) => c.edges.length === 4);
    expect(corner?.grazed).toEqual([
      { x: 1, z: 0 },
      { x: 0, z: 1 },
    ]);
    const straight = traceLine({ x: 0, z: 0 }, { x: 3, z: 0 });
    expect(straight.crossings.every((c) => c.grazed.length === 0)).toBe(true);
  });
});

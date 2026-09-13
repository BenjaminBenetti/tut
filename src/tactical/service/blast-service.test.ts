import { STOREY_LAYERS } from "../../core/model/elevation";
import { describe, expect, it } from "vitest";

import { PropKindIds } from "../../mapgen/data/props";
import { SurfaceIds } from "../../mapgen/data/surfaces";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { blastFootprint, blastVictims } from "./blast-service";
import {
  missionWith,
  openField,
  unitAt,
} from "./tactical-fixtures.test-helper";

const at = (x: number, z: number, y = 0): TileCoord => ({ x, y, z });

/** The footprint as `x,z` strings, in the order returned. */
const cells = (map: TacticalMap, impact: TileCoord, radius: number): string[] =>
  blastFootprint(map, impact, radius).map(
    ({ tile, distance }) =>
      `${String(tile.x)},${String(tile.z)}@${String(distance)}`,
  );

describe("blastFootprint", () => {
  it("is the impact alone at radius 0 and the Manhattan diamond otherwise, impact first", () => {
    const map = openField().build();
    expect(cells(map, at(3, 3), 0)).toEqual(["3,3@0"]);
    const one = cells(map, at(3, 3), 1);
    expect(one[0]).toBe("3,3@0");
    expect(one.slice(1).sort()).toEqual(
      ["2,3@1", "3,2@1", "3,4@1", "4,3@1"].sort(),
    );
    // 1 + 4 + 8 = 13 tiles at radius 2 on open ground.
    expect(cells(map, at(3, 3), 2)).toHaveLength(13);
  });

  it("stops at the map edge rather than inventing tiles", () => {
    const map = openField().build();
    expect(cells(map, at(0, 0), 1).sort()).toEqual(
      ["0,0@0", "0,1@1", "1,0@1"].sort(),
    );
  });

  it("does not pass a solid wall, and does pass a window", () => {
    const walled = openField()
      .wall(at(3, 3), "e", "solid")
      .wall(at(3, 3), "w", "window")
      .build();
    const reached = cells(walled, at(3, 3), 2);
    // Everything east of the wall is out; west of the window is in.
    expect(reached).not.toContain("4,3@1");
    expect(reached).not.toContain("5,3@2");
    expect(reached).toContain("2,3@1");
    expect(reached).toContain("1,3@2");
  });

  it("does not pass a floor slab either way: a roof blast leaves the room beneath alone (#1130)", () => {
    const builder = openField();
    // A slab two layers up over (3,3): a roof with the ground-floor
    // room beneath it. Within a radius-2 blast by distance (1.5 tiles
    // rounds to 2), so it is the slab, not the range, that keeps it out.
    builder.tile(at(3, 3, STOREY_LAYERS), SurfaceIds.ROOF);
    const map = builder.build();
    const fromGround = blastFootprint(map, at(3, 3), 2).map((b) => b.tile.y);
    expect(fromGround).toHaveLength(13);
    expect(fromGround.every((y) => y === 0)).toBe(true);
    const fromRoof = blastFootprint(map, at(3, 3, STOREY_LAYERS), 2).map(
      ({ tile, distance }) =>
        `${String(tile.x)},${String(tile.z)},${String(tile.y)}@${String(distance)}`,
    );
    // The room under the slab is out; the ground beside a roof edge
    // with no parapet is in, 1.8 tiles down and over.
    expect(fromRoof[0]).toBe("3,3,2@0");
    expect(fromRoof).not.toContain("3,3,0@2");
    expect(fromRoof).toContain("4,3,0@2");
  });

  it("measures in three dimensions: a ledge beside the impact is one tile away, the roof edge next door is two (#1130)", () => {
    // ```
    //   y = 2                  ═══·═══  roof over (5,3)
    //   y = 1            ▄▄▄            half-height ledge at (4,3)
    //   y = 0   · · ●    ▀▀▀  │ room │  impact at (3,3); solid wall west of (5,3)
    //           1 2 3     4      5
    // ```
    const builder = openField()
      .removeTile(at(4, 3))
      .tile(at(4, 3, 1), SurfaceIds.GRASS)
      .tile(at(5, 3, STOREY_LAYERS), SurfaceIds.ROOF)
      .wall(at(5, 3), "w", "solid");
    const map = builder.build();
    const one = blastFootprint(map, at(3, 3), 1).map(
      ({ tile, distance }) =>
        `${String(tile.x)},${String(tile.z)},${String(tile.y)}@${String(distance)}`,
    );
    // The ledge: √(1² + 0.75²) rounds to 1, so it is in a radius-1 blast.
    expect(one).toContain("4,3,1@1");
    expect(one).not.toContain("5,3,2@2");
    const two = blastFootprint(map, at(3, 3), 2).map(
      ({ tile, distance }) =>
        `${String(tile.x)},${String(tile.z)},${String(tile.y)}@${String(distance)}`,
    );
    // The roof edge: √(2² + 1.5²) = 2.5 rounds to 3 — out at radius 2
    // from two columns away, and the wall keeps the room out.
    expect(two).toContain("4,3,1@1");
    expect(two).not.toContain("5,3,2@3");
    expect(two).not.toContain("5,3,0@2");
    // From the foot of the wall the roof edge is √(1² + 1.5²) ≈ 1.8,
    // two tiles: reached over the parapet, at falloff distance 2.
    const atWall = blastFootprint(map, at(4, 3, 1), 2).map(
      ({ tile, distance }) =>
        `${String(tile.x)},${String(tile.z)},${String(tile.y)}@${String(distance)}`,
    );
    expect(atWall).toContain("5,3,2@1");
    expect(atWall).not.toContain("5,3,0@1");
  });

  it("reaches the open ground a storey below a roof edge, by line of sight, and not the ground beyond it (#1130)", () => {
    // A roof over a room at (5,3); open ground west of it.
    const map = openField()
      .tile(at(5, 3, STOREY_LAYERS), SurfaceIds.ROOF)
      .wall(at(5, 3), "w", "solid")
      .build();
    const reached = blastFootprint(map, at(5, 3, STOREY_LAYERS), 2).map(
      ({ tile, distance }) =>
        `${String(tile.x)},${String(tile.z)},${String(tile.y)}@${String(distance)}`,
    );
    // Next door on the ground: 1.8 tiles, seen over the parapet.
    expect(reached).toContain("4,3,0@2");
    // Two out on the ground: 2.5 tiles rounds to 3.
    expect(reached).not.toContain("3,3,0@3");
    // The room under the slab: never.
    expect(reached).not.toContain("5,3,0@2");
  });

  it("reaches a tile with an opaque prop on it, but nothing behind it", () => {
    const map = openField().prop(PropKindIds.DUMPSTER, at(4, 3)).build();
    const reached = cells(map, at(3, 3), 2);
    expect(reached).toContain("4,3@1");
    expect(reached).not.toContain("5,3@2");
  });
});

describe("blastVictims", () => {
  it("lists living units of both sides and undestroyed spawners in footprint order, less the excluded", () => {
    const map = openField().build();
    const mission = missionWith(
      map,
      [
        unitAt("centre", "infantry", at(3, 3)),
        unitAt("north", "infantry", at(3, 2), { team: "bugs" }),
        unitAt("dead", "infantry", at(4, 3), { hp: 0 }),
        unitAt("far", "infantry", at(6, 3)),
      ],
      {
        spawners: [
          {
            id: "spawner-1",
            pos: at(3, 4),
            hatchRadius: 1,
            hp: 20,
            timer: 3,
            destroyed: false,
          },
          {
            id: "spawner-2",
            pos: at(2, 3),
            hatchRadius: 1,
            hp: 0,
            timer: 3,
            destroyed: true,
          },
        ],
      },
    );
    const footprint = blastFootprint(map, at(3, 3), 1);
    const all = blastVictims(mission, footprint, new Set()).map(
      (v) => `${v.target.id}@${String(v.distance)}`,
    );
    expect(all).toEqual(["centre@0", "north@1", "spawner-1@1"]);
    const spared = blastVictims(mission, footprint, new Set(["centre"])).map(
      (v) => v.target.id,
    );
    expect(spared).toEqual(["north", "spawner-1"]);
  });
});

import { STOREY_LAYERS } from "../../core/model/elevation";
import { describe, expect, it } from "vitest";

import { PropKindIds } from "../../mapgen/data/props";
import { SurfaceIds } from "../../mapgen/data/surfaces";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { blastFootprint, blastVictims } from "./blast-service";
import {
  blockUnitAt,
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

  it("stays on its own storey: a roof blast leaves the floor beneath alone", () => {
    const builder = openField();
    // A slab two layers up over (3,3): the same column, one storey above.
    builder.tile(at(3, 3, STOREY_LAYERS), SurfaceIds.ROOF);
    const map = builder.build();
    const fromGround = blastFootprint(map, at(3, 3), 1).map((b) => b.tile.y);
    expect(fromGround.every((y) => y === 0)).toBe(true);
    const fromRoof = blastFootprint(map, at(3, 3, STOREY_LAYERS), 0).map(
      (b) => b.tile.y,
    );
    expect(fromRoof).toEqual([STOREY_LAYERS]);
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

describe("blastVictims with a unit on a 2×2 block (#1130)", () => {
  it("strikes the block once, at the distance of its nearest reached tile", () => {
    const map = openField().build();
    const mission = missionWith(map, [
      unitAt("shooter", "infantry", at(0, 0)),
      blockUnitAt("block", at(4, 3)),
    ]);
    // Radius 2 from (3,3) reaches (4,3) at 1 and (5,3), (4,4) at 2.
    const footprint = blastFootprint(map, at(3, 3), 2);
    const victims = blastVictims(mission, footprint, new Set()).map(
      (v) => `${v.target.id}@${String(v.distance)}`,
    );
    expect(victims).toEqual(["block@1"]);
    // A blast that reaches only the block's far corner still finds it.
    const corner = blastFootprint(map, at(6, 5), 2);
    expect(
      blastVictims(mission, corner, new Set()).map(
        (v) => `${v.target.id}@${String(v.distance)}`,
      ),
    ).toEqual(["block@2"]);
  });
});

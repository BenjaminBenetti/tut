import { describe, expect, it } from "vitest";

import { STOREY_LAYERS } from "../../core/model/elevation";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { COMBAT_TUNING } from "../data/combat-tuning";
import { PRIMARY_WEAPON_ID } from "../model/unit-weapon";
import {
  blockUnitAt,
  missionWith,
  openField,
  ridgedField,
  unitAt,
  walledField,
} from "./tactical-fixtures.test-helper";
import { weaponRangeTiles } from "./weapon-range-service";

/** The fixture weapon's reach on level ground. */
const RANGE = 5;

const key = (t: TileCoord): string => `${t.x},${t.y},${t.z}`;

describe("weaponRangeTiles (#1132)", () => {
  it("paints the Manhattan disc of the range on a flat field, less the unit's own tile", () => {
    const mission = missionWith(openField().build(), [
      unitAt("s1", "infantry", { x: 3, y: 0, z: 3 }),
    ]);
    const tiles = weaponRangeTiles(mission, "s1", undefined, COMBAT_TUNING);
    const expected: string[] = [];
    for (const tile of mission.map.tiles) {
      const distance = Math.abs(tile.x - 3) + Math.abs(tile.z - 3);
      if (distance > 0 && distance <= RANGE) {
        expected.push(key(tile));
      }
    }
    expect(tiles.map(key).sort()).toEqual(expected.sort());
    expect(tiles.map(key)).not.toContain("3,0,3");
  });

  it("names the weapon by id and answers nothing for one the unit does not carry", () => {
    const mission = missionWith(openField().build(), [
      unitAt("s1", "infantry", { x: 3, y: 0, z: 3 }),
    ]);
    expect(
      weaponRangeTiles(mission, "s1", PRIMARY_WEAPON_ID, COMBAT_TUNING),
    ).toEqual(weaponRangeTiles(mission, "s1", undefined, COMBAT_TUNING));
    expect(weaponRangeTiles(mission, "s1", "back", COMBAT_TUNING)).toEqual([]);
    expect(
      weaponRangeTiles(mission, "nobody", undefined, COMBAT_TUNING),
    ).toEqual([]);
  });

  it("stops at a wall the shot cannot see through", () => {
    const mission = missionWith(walledField(), [
      unitAt("s1", "infantry", { x: 2, y: 0, z: 5 }),
    ]);
    const tiles = weaponRangeTiles(mission, "s1", undefined, COMBAT_TUNING);
    const keys = tiles.map(key);
    // Its own side of the wall is in reach as far as the range goes...
    expect(keys).toContain("3,0,5");
    expect(keys).toContain("0,0,2");
    // ...and nothing behind the solid stretch of the wall is painted,
    // although (4,5) and (5,5) are only two and three tiles away.
    for (const tile of tiles) {
      expect(tile.x < 4 || tile.z === 2, key(tile)).toBe(true);
    }
  });

  it("reaches further from a storey up, as the reach rule does", () => {
    const crest = missionWith(ridgedField(), [
      unitAt("s1", "infantry", { x: 4, y: STOREY_LAYERS, z: 3 }),
    ]);
    const ground = missionWith(openField().build(), [
      unitAt("s1", "infantry", { x: 3, y: 0, z: 3 }),
    ]);
    const fromCrest = weaponRangeTiles(crest, "s1", undefined, COMBAT_TUNING);
    const fromGround = weaponRangeTiles(ground, "s1", undefined, COMBAT_TUNING);
    // (0,0,0) is seven tiles from the crest on the plane; the storey buys
    // the two extra tiles the range alone does not have.
    expect(fromCrest.map(key)).toContain("0,0,0");
    // The same weapon on the ground stops at its five: six is out.
    expect(fromGround.map(key)).not.toContain("0,0,0");
    expect(fromGround.map(key)).toContain("0,0,1");
  });

  it("measures a 2×2 unit's reach from the tile of its block nearest the mark", () => {
    const mission = missionWith(openField().build(), [
      blockUnitAt("b1", { x: 2, y: 0, z: 2 }),
    ]);
    const keys = weaponRangeTiles(mission, "b1", undefined, COMBAT_TUNING).map(
      key,
    );
    // Five from the block's (3,3) corner, seven from its anchor.
    expect(keys).toContain("7,0,4");
    // The block's own four tiles are never a mark.
    for (const own of ["2,0,2", "3,0,2", "2,0,3", "3,0,3"]) {
      expect(keys).not.toContain(own);
    }
  });
});

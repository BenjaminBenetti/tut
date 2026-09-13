import { describe, expect, it } from "vitest";

import type { TileCoord } from "../../mapgen/model/tile-coord";
import {
  BREACHING_CHARGE,
  EQUIPMENT,
  GRENADE,
  RADAR_DISH,
} from "../data/equipment";
import { createEquipmentCatalogue } from "../repository/equipment-catalogue";
import { equipmentRangeTiles } from "./equipment-range-service";
import {
  missionWith,
  openField,
  unitAt,
  walledField,
} from "./tactical-fixtures.test-helper";

const CATALOGUE = createEquipmentCatalogue(EQUIPMENT);

const key = (t: TileCoord): string => `${t.x},${t.y},${t.z}`;

describe("equipmentRangeTiles (#1134)", () => {
  it("paints a grenade's throw as the disc of its range on a flat field, less the unit's own tile", () => {
    const mission = missionWith(openField().build(), [
      unitAt("s1", "infantry", { x: 3, y: 0, z: 3 }),
    ]);
    const tiles = equipmentRangeTiles(mission, "s1", GRENADE.id, CATALOGUE);
    const expected: string[] = [];
    for (const tile of mission.map.tiles) {
      const distance = Math.abs(tile.x - 3) + Math.abs(tile.z - 3);
      if (distance > 0 && distance <= GRENADE.range) {
        expected.push(key(tile));
      }
    }
    expect(tiles.map(key).sort()).toEqual(expected.sort());
    expect(tiles.map(key)).not.toContain("3,0,3");
  });

  it("stops a throw at a wall it cannot see through", () => {
    const mission = missionWith(walledField(), [
      unitAt("s1", "infantry", { x: 2, y: 0, z: 5 }),
    ]);
    const keys = equipmentRangeTiles(mission, "s1", GRENADE.id, CATALOGUE).map(
      key,
    );
    expect(keys).toContain("3,0,5");
    // Past the wall at x = 4 the tiles are in range by distance and out
    // of sight, which is what the rules refuse a throw with.
    expect(keys).not.toContain("5,0,5");
    expect(keys).not.toContain("6,0,5");
  });

  it("keeps a breaching charge to its two tiles", () => {
    const mission = missionWith(openField().build(), [
      unitAt("s1", "infantry", { x: 3, y: 0, z: 3 }),
    ]);
    const keys = equipmentRangeTiles(
      mission,
      "s1",
      BREACHING_CHARGE.id,
      CATALOGUE,
    ).map(key);
    expect(keys).toContain("5,0,3");
    expect(keys).toContain("4,0,4");
    expect(keys).not.toContain("6,0,3");
    expect(keys).toHaveLength(12);
  });

  it("paints a radar's sites as the free tiles a short walk away, not the ones a comrade stands on", () => {
    const mission = missionWith(openField().build(), [
      unitAt("s1", "infantry", { x: 3, y: 0, z: 3 }),
      unitAt("s2", "infantry", { x: 4, y: 0, z: 3 }),
    ]);
    const keys = equipmentRangeTiles(
      mission,
      "s1",
      RADAR_DISH.id,
      CATALOGUE,
    ).map(key);
    // A diagonal is one tile of walk and 1.41 of distance: allowed.
    expect(keys).toContain("4,0,4");
    expect(keys).toContain("5,0,3");
    expect(keys).not.toContain("4,0,3");
    expect(keys).not.toContain("3,0,3");
    expect(keys).not.toContain("6,0,3");
  });

  it("keeps a radar on its own side of a wall the walk cannot cross", () => {
    const mission = missionWith(walledField(), [
      unitAt("s1", "infantry", { x: 3, y: 0, z: 5 }),
    ]);
    const keys = equipmentRangeTiles(
      mission,
      "s1",
      RADAR_DISH.id,
      CATALOGUE,
    ).map(key);
    expect(keys).toContain("2,0,5");
    expect(keys).not.toContain("5,0,5");
  });

  it("answers nothing for an unknown unit or item", () => {
    const mission = missionWith(openField().build(), [
      unitAt("s1", "infantry", { x: 3, y: 0, z: 3 }),
    ]);
    expect(
      equipmentRangeTiles(mission, "nobody", GRENADE.id, CATALOGUE),
    ).toEqual([]);
    expect(equipmentRangeTiles(mission, "s1", "jetpack", CATALOGUE)).toEqual(
      [],
    );
  });
});

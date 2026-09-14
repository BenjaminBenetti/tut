import { describe, expect, it } from "vitest";

import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { UnitTemplate } from "../model/unit-template";
import {
  footprintCentre,
  footprintContains,
  footprintSizeOf,
  footprintTiles,
  unitFootprintSize,
  unitFootprintTiles,
} from "./footprint-service";
import {
  FIXTURE_TEMPLATES,
  missionWith,
  openField,
  unitAt,
} from "./tactical-fixtures.test-helper";

const at = (x: number, z: number, y = 0): TileCoord => ({ x, y, z });

describe("footprintSizeOf", () => {
  it("is one for a template that declares nothing, and the declared side otherwise", () => {
    expect(footprintSizeOf({})).toBe(1);
    expect(footprintSizeOf({ footprint: undefined })).toBe(1);
    expect(footprintSizeOf({ footprint: 2 })).toBe(2);
    expect(footprintSizeOf({ footprint: 3 })).toBe(3);
  });

  it("never reads below one, whatever a save says", () => {
    expect(footprintSizeOf({ footprint: 0 })).toBe(1);
    expect(footprintSizeOf({ footprint: -4 })).toBe(1);
    expect(footprintSizeOf({ footprint: 2.7 })).toBe(2);
  });
});

describe("footprintTiles", () => {
  it("is the anchor alone for size one", () => {
    expect(footprintTiles(at(4, 6, 2), 1)).toEqual([at(4, 6, 2)]);
  });

  it("is the anchor, then row-major with z outer and x inner, all on the anchor's level", () => {
    expect(footprintTiles(at(4, 6, 2), 2)).toEqual([
      at(4, 6, 2),
      at(5, 6, 2),
      at(4, 7, 2),
      at(5, 7, 2),
    ]);
    expect(footprintTiles(at(0, 0), 3)).toHaveLength(9);
    expect(footprintTiles(at(0, 0), 3)[8]).toEqual(at(2, 2));
  });

  it("treats a size below one as one", () => {
    expect(footprintTiles(at(1, 1), 0)).toEqual([at(1, 1)]);
  });
});

describe("footprintCentre", () => {
  it("is the tile's centre for one tile and the shared corner for a 2×2", () => {
    expect(footprintCentre(at(4, 6), 1)).toEqual({ x: 4.5, z: 6.5 });
    expect(footprintCentre(at(4, 6), 2)).toEqual({ x: 5, z: 7 });
    expect(footprintCentre(at(0, 0), 3)).toEqual({ x: 1.5, z: 1.5 });
  });
});

describe("footprintContains", () => {
  it("covers exactly the square on the anchor's level", () => {
    const anchor = at(4, 6, 2);
    for (const tile of footprintTiles(anchor, 2)) {
      expect(footprintContains(anchor, 2, tile)).toBe(true);
    }
    expect(footprintContains(anchor, 2, at(6, 6, 2))).toBe(false);
    expect(footprintContains(anchor, 2, at(3, 6, 2))).toBe(false);
    expect(footprintContains(anchor, 2, at(4, 8, 2))).toBe(false);
    expect(footprintContains(anchor, 2, at(4, 5, 2))).toBe(false);
    // The same column a level up is not the footprint.
    expect(footprintContains(anchor, 2, at(5, 7, 4))).toBe(false);
    expect(footprintContains(anchor, 1, at(5, 6, 2))).toBe(false);
    expect(footprintContains(anchor, 1, anchor)).toBe(true);
  });
});

describe("unitFootprintSize and unitFootprintTiles", () => {
  it("read the unit's template, and treat a missing template as one tile", () => {
    const big: UnitTemplate = {
      id: "bug:big",
      name: "Big",
      maxHp: 30,
      maxAp: 2,
      move: 3,
      weapons: [],
      sightRange: 8,
      armor: 0,
      passClass: "infantry",
      modelId: "bug.brute",
      footprint: 2,
    };
    const small = unitAt("small", "infantry", at(1, 1));
    const brute = {
      ...unitAt("brute", "infantry", at(4, 4), { team: "bugs" }),
      templateId: big.id,
    };
    const ghost = { ...small, id: "ghost", templateId: "bug:missing" };
    const base = missionWith(openField().build(), [small, brute, ghost]);
    const mission = {
      ...base,
      templates: { ...base.templates, [big.id]: big },
    };
    expect(FIXTURE_TEMPLATES.infantry in mission.templates).toBe(true);
    expect(unitFootprintSize(mission, small)).toBe(1);
    expect(unitFootprintSize(mission, brute)).toBe(2);
    expect(unitFootprintSize(mission, ghost)).toBe(1);
    expect(unitFootprintTiles(mission, small)).toEqual([at(1, 1)]);
    expect(unitFootprintTiles(mission, brute)).toEqual([
      at(4, 4),
      at(5, 4),
      at(4, 5),
      at(5, 5),
    ]);
    expect(unitFootprintTiles(mission, ghost)).toEqual([at(1, 1)]);
  });
});

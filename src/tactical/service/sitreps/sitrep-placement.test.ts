import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../../core/service/mulberry32-rng";
import { TileIndex } from "../../../mapgen/service/tile-index";
import {
  countForArea,
  groundDistance,
  missionPoints,
  nearestDistance,
  openGround,
  spreadSites,
} from "./sitrep-placement";
import {
  EXTRACTION,
  fieldMission,
  keyOf,
  NEST,
  sitrepField,
} from "./sitrep-fixtures.test-helper";

describe("countForArea", () => {
  it("rounds the map's share and clamps it", () => {
    const small = { width: 48, depth: 48 };
    const medium = { width: 72, depth: 72 };
    const large = { width: 96, depth: 96 };
    // Spore Fog's shipped share.
    expect([small, medium, large].map((m) => countForArea(m, 576, 1))).toEqual([
      4, 9, 16,
    ]);
    // City Ablaze's shipped share and clamp.
    expect(
      [small, medium, large].map((m) => countForArea(m, 1728, 2, 4)),
    ).toEqual([2, 3, 4]);
  });
});

describe("nearestDistance", () => {
  it("is the ground distance to the nearest point, and infinite for none", () => {
    const tile = { x: 5, y: 3, z: 5 };
    expect(
      nearestDistance(tile, [
        { x: 0, y: 0, z: 0 },
        { x: 5, y: 0, z: 7 },
      ]),
    ).toBe(2);
    expect(nearestDistance(tile, [])).toBe(Infinity);
  });
});

describe("openGround", () => {
  it("is every standable, outdoor, lowest tile of its column", () => {
    const map = sitrepField();
    const ground = openGround(map, new TileIndex(map));
    // 576 tiles less the 16 of the building and the 4 of the pond.
    expect(ground).toHaveLength(576 - 16 - 4);
    expect(ground.some((tile) => keyOf(tile) === "16,0,16")).toBe(false);
    expect(ground.some((tile) => keyOf(tile) === "10,0,20")).toBe(false);
  });
});

describe("missionPoints", () => {
  it("names objective, extraction and edge hook tiles, live spawners and carcasses", () => {
    const mission = fieldMission([], {
      spawners: [
        {
          id: "spawner-1",
          pos: { x: 9, y: 0, z: 9 },
          hatchRadius: 2,
          hp: 5,
          timer: 2,
          destroyed: false,
        },
        {
          id: "spawner-2",
          pos: { x: 3, y: 0, z: 9 },
          hatchRadius: 2,
          hp: 0,
          timer: 2,
          destroyed: true,
        },
      ],
      carcasses: [
        {
          id: "carcass-1",
          pos: { x: 14, y: 0, z: 3 },
          techPoints: 10,
          harvested: false,
        },
      ],
    });
    expect(missionPoints(mission).map(keyOf).sort()).toEqual(
      [NEST, ...EXTRACTION, { x: 9, y: 0, z: 9 }, { x: 14, y: 0, z: 3 }]
        .map(keyOf)
        .sort(),
    );
  });
});

describe("spreadSites", () => {
  const map = sitrepField();
  const ground = openGround(map, new TileIndex(map));

  it("keeps sites apart from each other and from what already stands", () => {
    const existing = [{ x: 12, y: 0, z: 12 }];
    const sites = spreadSites(ground, 6, 7, new Mulberry32Rng(3), existing);
    expect(sites.length).toBeGreaterThan(1);
    for (const [i, a] of sites.entries()) {
      expect(groundDistance(a, existing[0]!)).toBeGreaterThanOrEqual(7);
      for (const b of sites.slice(i + 1)) {
        expect(groundDistance(a, b)).toBeGreaterThanOrEqual(7);
      }
    }
  });

  it("draws nothing when there is nothing to draw", () => {
    const rng = new Mulberry32Rng(3);
    expect(spreadSites(ground, 0, 7, rng)).toEqual([]);
    expect(spreadSites([], 3, 7, rng)).toEqual([]);
    expect(rng.next()).toBe(new Mulberry32Rng(3).next());
  });
});

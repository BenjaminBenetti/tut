import { describe, expect, it } from "vitest";

import { cityId } from "../model/city";
import type { EarthMapSpec } from "../model/earth-map-spec";
import { regionId } from "../model/region";
import { buildEarthMap } from "./earth-map-builder";

// ===========================================
// Fixture
// ===========================================

const A = cityId("a");
const B = cityId("b");
const C = cityId("c");
const WEST = regionId("west");
const EAST = regionId("east");

/**
 * Two regions, three cities, one intra-region link and one cross-region
 * link:
 *
 *   west: a ── b     east: c
 *              └───────── c
 */
const SPEC: EarthMapSpec = {
  regions: [
    {
      id: WEST,
      name: "West",
      biome: "temperate",
      cities: [
        { id: A, name: "A", layout: { x: 0.1, y: 0.2 } },
        { id: B, name: "B", layout: { x: 0.3, y: 0.4 }, infestation: 25 },
      ],
    },
    {
      id: EAST,
      name: "East",
      biome: "desert",
      layout: { x: 0.9, y: 0.9 },
      cities: [{ id: C, name: "C", layout: { x: 0.8, y: 0.5 } }],
    },
  ],
  links: [
    [A, B],
    [B, C],
  ],
};

// ===========================================
// Tests
// ===========================================

describe("buildEarthMap", () => {
  const map = buildEarthMap(SPEC);

  it("emits cities in region order with their region id", () => {
    expect(map.cities.map((city) => city.id)).toEqual([A, B, C]);
    expect(map.cities.map((city) => city.regionId)).toEqual([WEST, WEST, EAST]);
  });

  it("expands each link into both cities' neighbour lists", () => {
    const [a, b, c] = map.cities;
    expect(a?.neighbourIds).toEqual([B]);
    expect(b?.neighbourIds).toEqual([A, C]);
    expect(c?.neighbourIds).toEqual([B]);
  });

  it("defaults infestation to zero and keeps a declared value", () => {
    const [a, b] = map.cities;
    expect(a?.infestation).toBe(0);
    expect(b?.infestation).toBe(25);
  });

  it("derives region city lists and symmetric region adjacency", () => {
    const [west, east] = map.regions;
    expect(west?.cityIds).toEqual([A, B]);
    expect(east?.cityIds).toEqual([C]);
    expect(west?.neighbourRegionIds).toEqual([EAST]);
    expect(east?.neighbourRegionIds).toEqual([WEST]);
  });

  it("defaults a region's layout to its cities' centroid and keeps an override", () => {
    const [west, east] = map.regions;
    expect(west?.layout.x).toBeCloseTo(0.2);
    expect(west?.layout.y).toBeCloseTo(0.3);
    expect(east?.layout).toEqual({ x: 0.9, y: 0.9 });
  });

  it("copies name and biome through", () => {
    expect(map.regions[1]?.name).toBe("East");
    expect(map.regions[1]?.biome).toBe("desert");
    expect(map.cities[2]?.name).toBe("C");
  });

  it("rejects duplicate region ids", () => {
    const spec: EarthMapSpec = {
      regions: [SPEC.regions[0]!, { ...SPEC.regions[1]!, id: WEST }],
      links: [],
    };
    expect(() => buildEarthMap(spec)).toThrow(/Duplicate region id "west"/);
  });

  it("rejects duplicate city ids across regions", () => {
    const spec: EarthMapSpec = {
      regions: [
        SPEC.regions[0]!,
        {
          ...SPEC.regions[1]!,
          cities: [{ id: A, name: "A again", layout: { x: 0, y: 0 } }],
        },
      ],
      links: [],
    };
    expect(() => buildEarthMap(spec)).toThrow(/Duplicate city id "a"/);
  });

  it("rejects an empty region", () => {
    const spec: EarthMapSpec = {
      regions: [{ ...SPEC.regions[1]!, cities: [] }],
      links: [],
    };
    expect(() => buildEarthMap(spec)).toThrow(/has no cities/);
  });

  it("rejects links to unknown cities, self links and repeated links", () => {
    const unknown = cityId("nowhere");
    expect(() => buildEarthMap({ ...SPEC, links: [[A, unknown]] })).toThrow(
      /unknown city "nowhere"/,
    );
    expect(() => buildEarthMap({ ...SPEC, links: [[A, A]] })).toThrow(
      /linked to itself/,
    );
    expect(() =>
      buildEarthMap({
        ...SPEC,
        links: [
          [A, B],
          [B, A],
        ],
      }),
    ).toThrow(/declared twice/);
  });

  it("rejects infestation outside the integer range 0..100", () => {
    const withInfestation = (infestation: number): EarthMapSpec => ({
      regions: [
        {
          ...SPEC.regions[1]!,
          cities: [{ id: C, name: "C", layout: { x: 0, y: 0 }, infestation }],
        },
      ],
      links: [],
    });
    expect(() => buildEarthMap(withInfestation(101))).toThrow(/infestation/);
    expect(() => buildEarthMap(withInfestation(-1))).toThrow(/infestation/);
    expect(() => buildEarthMap(withInfestation(2.5))).toThrow(/infestation/);
    expect(buildEarthMap(withInfestation(100)).cities[0]?.infestation).toBe(
      100,
    );
  });
});

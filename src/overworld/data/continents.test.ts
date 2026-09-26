import { describe, expect, it } from "vitest";

import { CONTINENT_IDS } from "../model/continent";
import { CONTINENTS } from "./continents";
import { EARTH_MAP } from "./earth-map";

describe("CONTINENTS", () => {
  it("puts every region of the Earth map on exactly one continent", () => {
    const owners = new Map<string, string[]>();
    for (const id of CONTINENT_IDS) {
      for (const regionId of CONTINENTS[id].regionIds) {
        owners.set(regionId, [...(owners.get(regionId) ?? []), id]);
      }
    }
    for (const region of EARTH_MAP.regions) {
      expect(owners.get(region.id), region.id).toHaveLength(1);
    }
    expect([...owners.keys()].sort()).toEqual(
      EARTH_MAP.regions.map((region) => region.id).sort(),
    );
  });

  it("keys each continent by its own id, in CONTINENT_IDS order", () => {
    expect(Object.keys(CONTINENTS)).toEqual(CONTINENT_IDS);
    for (const id of CONTINENT_IDS) {
      expect(CONTINENTS[id].id).toBe(id);
    }
  });

  it("lists each continent's regions in map order", () => {
    const order = EARTH_MAP.regions.map((region) => region.id);
    for (const id of CONTINENT_IDS) {
      const indices = CONTINENTS[id].regionIds.map((r) => order.indexOf(r));
      expect(indices).toEqual([...indices].sort((a, b) => a - b));
    }
  });
});

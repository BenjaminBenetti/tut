import { describe, expect, it } from "vitest";

import { BIOME_IDS } from "../../content/model/biome-id";
import { SETTLEMENT_SCALES } from "../../content/model/settlement-scale";
import type { CityId } from "../model/city";
import { MAX_INFESTATION, MIN_INFESTATION } from "../model/city";
import {
  citiesInRegion,
  getCity,
  getRegion,
  neighboursOf,
  regionOf,
} from "../service/earth-map-query-service";
import { EARTH_MAP } from "./earth-map";

// ===========================================
// Helpers
// ===========================================

/** Ids reachable from `start` by walking neighbour links. */
function reachableFrom(start: CityId): Set<CityId> {
  const seen = new Set<CityId>([start]);
  const pending: CityId[] = [start];
  let current = pending.pop();
  while (current !== undefined) {
    for (const neighbourId of getCity(EARTH_MAP, current).neighbourIds) {
      if (!seen.has(neighbourId)) {
        seen.add(neighbourId);
        pending.push(neighbourId);
      }
    }
    current = pending.pop();
  }
  return seen;
}

// ===========================================
// Tests
// ===========================================

describe("EARTH_MAP seed data", () => {
  const { regions, cities } = EARTH_MAP;

  it("ships at least 8 regions and 20 cities", () => {
    expect(regions.length).toBeGreaterThanOrEqual(8);
    expect(cities.length).toBeGreaterThanOrEqual(20);
  });

  it("has unique region ids, city ids and display names", () => {
    expect(new Set(regions.map((region) => region.id)).size).toBe(
      regions.length,
    );
    expect(new Set(cities.map((city) => city.id)).size).toBe(cities.length);
    expect(new Set(regions.map((region) => region.name)).size).toBe(
      regions.length,
    );
    expect(new Set(cities.map((city) => city.name)).size).toBe(cities.length);
    for (const named of [...regions, ...cities]) {
      expect(named.name.trim().length, named.id).toBeGreaterThan(0);
    }
  });

  it("places every city in exactly one region, matching that region's cityIds", () => {
    for (const city of cities) {
      const owners = regions.filter((region) =>
        region.cityIds.includes(city.id),
      );
      expect(
        owners.map((region) => region.id),
        city.id,
      ).toEqual([city.regionId]);
      expect(regionOf(EARTH_MAP, city.id).id).toBe(city.regionId);
    }
    const listed = regions.flatMap((region) => region.cityIds);
    expect(listed.length).toBe(cities.length);
  });

  it("gives every region at least one city", () => {
    for (const region of regions) {
      expect(
        citiesInRegion(EARTH_MAP, region.id).length,
        region.id,
      ).toBeGreaterThan(0);
    }
  });

  it("has symmetric city adjacency with no self links or duplicates", () => {
    for (const city of cities) {
      expect(city.neighbourIds, city.id).not.toContain(city.id);
      expect(new Set(city.neighbourIds).size, city.id).toBe(
        city.neighbourIds.length,
      );
      for (const neighbour of neighboursOf(EARTH_MAP, city.id)) {
        expect(
          neighbour.neighbourIds,
          `${neighbour.id} → ${city.id}`,
        ).toContain(city.id);
      }
    }
  });

  it("has symmetric region adjacency that matches the city links", () => {
    for (const region of regions) {
      const viaCities = new Set(
        citiesInRegion(EARTH_MAP, region.id)
          .flatMap((city) => neighboursOf(EARTH_MAP, city.id))
          .map((neighbour) => neighbour.regionId)
          .filter((id) => id !== region.id),
      );
      expect(new Set(region.neighbourRegionIds), region.id).toEqual(viaCities);
      for (const otherId of region.neighbourRegionIds) {
        expect(
          getRegion(EARTH_MAP, otherId).neighbourRegionIds,
          otherId,
        ).toContain(region.id);
      }
    }
  });

  it("connects every city to every other city", () => {
    const first = cities[0]!;
    expect(reachableFrom(first.id).size).toBe(cities.length);
  });

  it("gives every region at least one cross-region link", () => {
    for (const region of regions) {
      expect(region.neighbourRegionIds.length, region.id).toBeGreaterThan(0);
    }
  });

  it("starts every city bug-free with an integer infestation in range", () => {
    for (const city of cities) {
      expect(Number.isInteger(city.infestation), city.id).toBe(true);
      expect(city.infestation, city.id).toBeGreaterThanOrEqual(MIN_INFESTATION);
      expect(city.infestation, city.id).toBeLessThanOrEqual(MAX_INFESTATION);
      expect(city.infestation, city.id).toBe(MIN_INFESTATION);
    }
  });

  it("keeps every layout inside normalised map space", () => {
    for (const placed of [...regions, ...cities]) {
      expect(placed.layout.x, placed.id).toBeGreaterThanOrEqual(0);
      expect(placed.layout.x, placed.id).toBeLessThanOrEqual(1);
      expect(placed.layout.y, placed.id).toBeGreaterThanOrEqual(0);
      expect(placed.layout.y, placed.id).toBeLessThanOrEqual(1);
    }
  });

  it("uses every shipped biome at least once", () => {
    const used = new Set(regions.map((region) => region.biome));
    for (const biome of BIOME_IDS) {
      expect(used.has(biome), biome).toBe(true);
    }
  });

  it("is plain JSON-serializable data", () => {
    expect(JSON.parse(JSON.stringify(EARTH_MAP))).toEqual(EARTH_MAP);
  });
});

describe("EARTH_MAP settlement scales", () => {
  it("gives every city a shipped settlement scale", () => {
    for (const city of EARTH_MAP.cities) {
      expect(SETTLEMENT_SCALES).toContain(city.scale);
    }
  });

  it("uses more than one scale so map generation is exercised across them", () => {
    const scales = new Set(EARTH_MAP.cities.map((city) => city.scale));
    expect(scales.size).toBeGreaterThan(1);
  });
});

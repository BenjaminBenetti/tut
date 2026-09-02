import { describe, expect, it } from "vitest";

import { cityId } from "../model/city";
import { regionId } from "../model/region";
import { buildEarthMap } from "./earth-map-builder";
import {
  allCities,
  allRegions,
  citiesInRegion,
  findCity,
  findRegion,
  getCity,
  getRegion,
  neighboursOf,
  regionOf,
} from "./earth-map-query-service";

// ===========================================
// Fixture
// ===========================================

const A = cityId("a");
const B = cityId("b");
const C = cityId("c");
const WEST = regionId("west");
const EAST = regionId("east");

const MAP = buildEarthMap({
  regions: [
    {
      id: WEST,
      name: "West",
      biome: "temperate",
      cities: [
        { id: A, name: "A", layout: { x: 0.1, y: 0.1 } },
        { id: B, name: "B", layout: { x: 0.2, y: 0.2 } },
      ],
    },
    {
      id: EAST,
      name: "East",
      biome: "snowy",
      cities: [{ id: C, name: "C", layout: { x: 0.8, y: 0.8 } }],
    },
  ],
  links: [
    [A, B],
    [C, B],
  ],
});

// ===========================================
// Tests
// ===========================================

describe("earth-map-query-service", () => {
  it("lists all cities and regions in data order", () => {
    expect(allCities(MAP).map((city) => city.id)).toEqual([A, B, C]);
    expect(allRegions(MAP).map((region) => region.id)).toEqual([WEST, EAST]);
  });

  it("finds cities and regions by id, or returns undefined", () => {
    expect(findCity(MAP, B)?.name).toBe("B");
    expect(findCity(MAP, cityId("z"))).toBeUndefined();
    expect(findRegion(MAP, EAST)?.name).toBe("East");
    expect(findRegion(MAP, regionId("nowhere"))).toBeUndefined();
  });

  it("gets cities and regions by id, throwing on unknown ids", () => {
    expect(getCity(MAP, C).regionId).toBe(EAST);
    expect(getRegion(MAP, WEST).biome).toBe("temperate");
    expect(() => getCity(MAP, cityId("z"))).toThrow(/Unknown city "z"/);
    expect(() => getRegion(MAP, regionId("nowhere"))).toThrow(
      /Unknown region "nowhere"/,
    );
  });

  it("returns a region's cities in cityIds order", () => {
    expect(citiesInRegion(MAP, WEST).map((city) => city.id)).toEqual([A, B]);
    expect(citiesInRegion(MAP, EAST).map((city) => city.id)).toEqual([C]);
    expect(() => citiesInRegion(MAP, regionId("nowhere"))).toThrow(
      /Unknown region/,
    );
  });

  it("returns a city's neighbours in neighbourIds order", () => {
    expect(neighboursOf(MAP, B).map((city) => city.id)).toEqual([A, C]);
    expect(neighboursOf(MAP, A).map((city) => city.id)).toEqual([B]);
    expect(() => neighboursOf(MAP, cityId("z"))).toThrow(/Unknown city/);
  });

  it("returns the region a city belongs to", () => {
    expect(regionOf(MAP, A).id).toBe(WEST);
    expect(regionOf(MAP, C).id).toBe(EAST);
  });
});

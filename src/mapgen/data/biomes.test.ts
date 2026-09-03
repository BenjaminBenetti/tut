import { describe, expect, it } from "vitest";

import { BIOME_IDS } from "../../content/model/biome-id";
import { createRegistry } from "../service/definition-registry";
import { BIOME_DEFINITIONS } from "./biomes";
import { KNOWN_BUILDING_KIND_IDS } from "./building-kind-ids";
import { PROP_DEFINITIONS } from "./props";
import { SURFACE_DEFINITIONS } from "./surfaces";

describe("biome definitions", () => {
  const biomes = createRegistry("biome", Object.values(BIOME_DEFINITIONS));
  const surfaces = createRegistry("surface", SURFACE_DEFINITIONS);
  const props = createRegistry("prop", PROP_DEFINITIONS);

  it("define every shipped biome exactly once", () => {
    for (const id of BIOME_IDS) {
      expect(biomes.has(id), id).toBe(true);
    }
    expect(biomes.ids.length).toBe(BIOME_IDS.length);
  });

  it("only reference surfaces that exist, with positive weights", () => {
    for (const biome of biomes.values) {
      expect(biome.groundSurfaces.length, biome.id).toBeGreaterThan(0);
      for (const entry of biome.groundSurfaces) {
        expect(
          surfaces.has(entry.surface),
          `${biome.id}/${entry.surface}`,
        ).toBe(true);
        expect(entry.weight).toBeGreaterThan(0);
      }
      expect(surfaces.has(biome.roadSurface), biome.id).toBe(true);
      expect(surfaces.has(biome.trailSurface), biome.id).toBe(true);
    }
  });

  it("paint trails in a surface that reads against the dominant ground", () => {
    for (const biome of biomes.values) {
      const dominant = [...biome.groundSurfaces].sort(
        (a, b) => b.weight - a.weight,
      )[0];
      expect(dominant, biome.id).toBeDefined();
      expect(biome.trailSurface, biome.id).not.toBe(dominant?.surface);
    }
  });

  it("only scatter ground props that are allowed in that biome", () => {
    for (const biome of biomes.values) {
      for (const entry of biome.vegetation) {
        const prop = props.get(entry.prop);
        expect(prop.placements, `${biome.id}/${prop.id}`).toContain("ground");
        if (prop.biomes !== undefined) {
          expect(prop.biomes, `${biome.id}/${prop.id}`).toContain(biome.id);
        }
        expect(entry.density).toBeGreaterThan(0);
      }
    }
  });

  it("only weight building kinds that ship", () => {
    for (const biome of biomes.values) {
      expect(biome.buildingKinds.length, biome.id).toBeGreaterThan(0);
      for (const entry of biome.buildingKinds) {
        expect(
          KNOWN_BUILDING_KIND_IDS,
          `${biome.id}/${entry.template}`,
        ).toContain(entry.template);
        expect(entry.weight).toBeGreaterThan(0);
      }
    }
  });

  it("keep terrain profiles sane", () => {
    for (const biome of biomes.values) {
      const terrain = biome.terrain;
      expect(Number.isInteger(terrain.amplitudeLevels), biome.id).toBe(true);
      expect(terrain.amplitudeLevels).toBeGreaterThanOrEqual(0);
      expect(terrain.amplitudeLevels).toBeLessThanOrEqual(4);
      expect(terrain.frequency).toBeGreaterThan(0);
      expect(terrain.frequency).toBeLessThan(1);
      expect(terrain.octaves).toBeGreaterThanOrEqual(1);
      expect(terrain.roughness).toBeGreaterThan(0);
      expect(terrain.roughness).toBeLessThan(1);
    }
  });

  it("give only the coastal biome a shoreline", () => {
    const withShoreline = biomes.values
      .filter((biome) => biome.hasShoreline)
      .map((biome) => biome.id);
    expect(withShoreline).toEqual(["coastal"]);
  });
});

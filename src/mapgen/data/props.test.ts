import { describe, expect, it } from "vitest";

import { COVER_LEVELS, CoverLevel } from "../model/cover";
import { createRegistry } from "../../core/service/definition-registry";
import { BIOME_IDS } from "../../content/model/biome-id";
import { PROP_DEFINITIONS, PropKindIds } from "./props";

describe("prop definitions", () => {
  const registry = createRegistry("prop", PROP_DEFINITIONS);

  it("define every well-known kind exactly once", () => {
    for (const id of Object.values(PropKindIds)) {
      expect(registry.has(id), id).toBe(true);
    }
    expect(registry.ids.length).toBe(Object.values(PropKindIds).length);
  });

  it("give every kind a valid cover level and at least one placement", () => {
    for (const definition of registry.values) {
      expect(COVER_LEVELS, definition.id).toContain(definition.cover);
      expect(definition.placements.length, definition.id).toBeGreaterThan(0);
    }
  });

  it("only restrict kinds to biomes that exist", () => {
    for (const definition of registry.values) {
      for (const biome of definition.biomes ?? []) {
        expect(BIOME_IDS, `${definition.id} → ${biome}`).toContain(biome);
      }
    }
  });

  it("offer at least one unrestricted kind per placement", () => {
    for (const placement of ["ground", "road", "interior"] as const) {
      const unrestricted = registry.values.filter(
        (definition) =>
          definition.biomes === undefined &&
          definition.placements.includes(placement),
      );
      expect(unrestricted.length, placement).toBeGreaterThan(0);
    }
  });

  it("make the great pod's hull a wall a d1 squad can breach (#1238)", () => {
    const hull = [
      PropKindIds.GREAT_POD_HULL_PLATE,
      PropKindIds.GREAT_POD_HULL_CURVE,
      PropKindIds.GREAT_POD_HULL_SEAM,
    ].map((id) => registry.get(id));
    for (const piece of hull) {
      // A full-height wall: no shot, no step, no sight through it.
      expect(piece.blocksLos, piece.id).toBe(true);
      expect(piece.cover, piece.id).toBe(CoverLevel.HIGH);
      expect(piece.footprint ?? { w: 1, d: 1 }, piece.id).toEqual({ w: 1, d: 1 });
      expect(piece.placements, piece.id).toEqual(["site"]);
    }
    // A rocket (force 2) opens any piece; a grenade or an autocannon
    // (force 1) only the seams in line with the mouths.
    expect(hull.map((piece) => piece.demolition)).toEqual([2, 2, 1]);
  });
});

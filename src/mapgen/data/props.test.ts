import { describe, expect, it } from "vitest";

import { COVER_LEVELS } from "../model/cover";
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
});

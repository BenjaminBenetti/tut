import { describe, expect, it } from "vitest";

import { PassMask } from "../model/pass-mask";
import { createRegistry } from "../service/definition-registry";
import { SURFACE_DEFINITIONS, SurfaceIds } from "./surfaces";

describe("surface definitions", () => {
  const registry = createRegistry("surface", SURFACE_DEFINITIONS);

  it("define every well-known id exactly once", () => {
    for (const id of Object.values(SurfaceIds)) {
      expect(registry.has(id), id).toBe(true);
    }
    expect(registry.ids.length).toBe(Object.values(SurfaceIds).length);
  });

  it("admit nobody on water", () => {
    expect(registry.get(SurfaceIds.WATER).defaultPass).toBe(PassMask.NONE);
  });

  it("restrict interiors and roofs to infantry", () => {
    for (const id of [SurfaceIds.FLOOR, SurfaceIds.STAIRS, SurfaceIds.ROOF]) {
      expect(registry.get(id).defaultPass, id).toBe(PassMask.INFANTRY);
    }
    expect(registry.get(SurfaceIds.FLOOR).isInterior).toBe(true);
    expect(registry.get(SurfaceIds.STAIRS).isInterior).toBe(true);
    expect(registry.get(SurfaceIds.ROOF).isInterior).toBe(false);
  });

  it("admit every class on exterior ground", () => {
    const ground = [
      SurfaceIds.GRASS,
      SurfaceIds.DIRT,
      SurfaceIds.SAND,
      SurfaceIds.SNOW,
      SurfaceIds.ROCK,
      SurfaceIds.ROAD,
      SurfaceIds.SIDEWALK,
    ];
    for (const id of ground) {
      const definition = registry.get(id);
      expect(definition.defaultPass, id).toBe(PassMask.ALL);
      expect(definition.isInterior, id).toBe(false);
    }
  });
});

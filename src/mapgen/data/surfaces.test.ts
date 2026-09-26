import { describe, expect, it } from "vitest";

import { PassMask } from "../model/pass-mask";
import { createRegistry } from "../../core/service/definition-registry";
import {
  IMPASSABLE_GROUND_SURFACES,
  SURFACE_DEFINITIONS,
  SurfaceIds,
} from "./surfaces";

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

  it("admit nobody on the bedrock a hive cavern is cut into (#1179)", () => {
    const bedrock = registry.get(SurfaceIds.BEDROCK);
    expect(bedrock.defaultPass).toBe(PassMask.NONE);
    expect(bedrock.isInterior).toBe(false);
  });

  it("count exactly water and bedrock as impassable ground", () => {
    expect([...IMPASSABLE_GROUND_SURFACES].sort()).toEqual(
      [SurfaceIds.BEDROCK, SurfaceIds.WATER].sort(),
    );
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

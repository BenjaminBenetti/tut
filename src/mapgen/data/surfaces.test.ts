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

  it("count exactly water, bedrock and void as impassable ground", () => {
    expect([...IMPASSABLE_GROUND_SURFACES].sort()).toEqual(
      [SurfaceIds.BEDROCK, SurfaceIds.VOID, SurfaceIds.WATER].sort(),
    );
  });

  it("admit nobody on the void past a spore platform's edge (#1179)", () => {
    const space = registry.get(SurfaceIds.VOID);
    expect(space.defaultPass).toBe(PassMask.NONE);
    expect(space.isInterior).toBe(false);
  });

  it("let everyone walk the spore platform's hull plates (#1179)", () => {
    for (const id of [
      SurfaceIds.HULL_PLATE,
      SurfaceIds.HULL_PLATE_DARK,
      SurfaceIds.HULL_RIM,
    ]) {
      expect(registry.get(id).defaultPass, id).toBe(PassMask.ALL);
      expect(registry.get(id).isInterior, id).toBe(false);
    }
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

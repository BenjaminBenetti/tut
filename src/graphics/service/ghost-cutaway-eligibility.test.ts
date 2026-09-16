import { describe, expect, it } from "vitest";

import { MODEL_MANIFEST } from "../data/model-manifest";
import {
  FOUNDATION_MODEL,
  HIPPED_ROOF_MODEL,
  LADDER_CONNECTOR_MODEL,
  PITCHED_ROOF_MODEL,
  PROP_MODELS,
  RAMP_CONNECTOR_MODEL,
  SURFACE_MODELS,
  WALL_MODELS,
  HALF_WALL_MODELS,
} from "../data/map-model-table";
import { SurfaceIds } from "../../mapgen/data/surfaces";
import { PropKindIds } from "../../mapgen/data/props";
import {
  GHOST_SOLID_MODELS,
  takesGhostCutaway,
} from "./ghost-cutaway-eligibility";

describe("takesGhostCutaway", () => {
  it("keeps the slabs a unit stands on solid, so its movement tiles read (#1143)", () => {
    expect(takesGhostCutaway(SURFACE_MODELS[SurfaceIds.FLOOR])).toBe(false);
    expect(takesGhostCutaway(SURFACE_MODELS[SurfaceIds.STAIRS])).toBe(false);
    expect(takesGhostCutaway("building.floor")).toBe(false);
    expect(takesGhostCutaway("building.stairs")).toBe(false);
  });

  it("keeps every roof solid, so a roof never opens a window onto a solid floor (#1143)", () => {
    for (const id of [
      SURFACE_MODELS[SurfaceIds.ROOF],
      PITCHED_ROOF_MODEL,
      HIPPED_ROOF_MODEL,
      "building.roof",
      "building.roof-pitched",
      "building.roof-hipped",
    ]) {
      expect(takesGhostCutaway(id), id).toBe(false);
    }
  });

  it("ghosts every wall model in every family", () => {
    const walls = [
      ...Object.values(WALL_MODELS).flatMap((family) => Object.values(family)),
      ...Object.values(HALF_WALL_MODELS),
    ];
    for (const id of walls) expect(takesGhostCutaway(id), id).toBe(true);
  });

  it("ghosts parapets, ladders and rooftop props, which stand between the camera and a unit on the roof", () => {
    for (const id of [
      "building.roof-parapet",
      "building.viaduct-parapet",
      LADDER_CONNECTOR_MODEL,
      PROP_MODELS[PropKindIds.ROOFTOP_HVAC],
      PROP_MODELS[PropKindIds.ROOFTOP_WATER_TANK],
      "prop.rooftop-anything",
    ]) {
      expect(takesGhostCutaway(id), id).toBe(true);
    }
  });

  it("never ghosts ground, terrain, roads, ramps, foundations or street props", () => {
    for (const id of [
      SURFACE_MODELS[SurfaceIds.GRASS],
      SURFACE_MODELS[SurfaceIds.ROAD],
      SURFACE_MODELS[SurfaceIds.SIDEWALK],
      SURFACE_MODELS[SurfaceIds.WATER],
      RAMP_CONNECTOR_MODEL,
      FOUNDATION_MODEL,
      PROP_MODELS[PropKindIds.CAR],
      "tile.slope.straight",
      "unit.squad",
    ]) {
      expect(takesGhostCutaway(id), id).toBe(false);
    }
  });

  it("names only registered building models as solid, so a renamed slab cannot slip back into the cutaway", () => {
    for (const id of GHOST_SOLID_MODELS) {
      expect(MODEL_MANIFEST[id], `${id} registered`).toBeDefined();
      expect(id.startsWith("building."), `${id} is building geometry`).toBe(
        true,
      );
    }
  });
});

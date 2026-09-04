import { describe, expect, it } from "vitest";

import { PropKindIds } from "../../mapgen/data/props";
import { SurfaceIds } from "../../mapgen/data/surfaces";
import type { WallKind } from "../../mapgen/model/wall";
import { MODEL_MANIFEST } from "./model-manifest";
import {
  PROP_MODELS,
  propModel,
  ROAD_VARIANTS,
  SIDEWALK_VARIANTS,
  SURFACE_MODELS,
  surfaceModel,
  wallModel,
  WALL_MODELS,
} from "./map-model-table";

describe("map model table", () => {
  it("registers every model it names, so nothing resolves to a missing asset", () => {
    const named = [
      ...Object.values(SURFACE_MODELS),
      ...Object.values(PROP_MODELS),
      ...Object.values(WALL_MODELS),
      ...Object.values(ROAD_VARIANTS),
      ...Object.values(SIDEWALK_VARIANTS),
    ];
    for (const id of named) {
      expect(MODEL_MANIFEST[id], `${id} registered`).toBeDefined();
    }
  });

  it("covers every well-known surface and prop kind mapgen can emit", () => {
    for (const surface of Object.values(SurfaceIds)) {
      expect(surfaceModel(surface), surface).toBeDefined();
    }
    for (const kind of Object.values(PropKindIds)) {
      expect(propModel(kind), kind).toBeDefined();
    }
  });

  it("gives every wall kind a model", () => {
    const kinds: readonly WallKind[] = ["solid", "window", "door"];
    for (const kind of kinds) {
      expect(MODEL_MANIFEST[wallModel(kind)], kind).toBeDefined();
    }
  });

  it("resolves an unregistered surface or prop kind to nothing rather than guessing", () => {
    expect(surfaceModel("lava")).toBeUndefined();
    expect(propModel("statue")).toBeUndefined();
  });

  it("draws tiles from the tile and building kits, and props from the prop kit", () => {
    for (const [surface, id] of Object.entries(SURFACE_MODELS)) {
      expect(["tiles", "buildings"], `${surface} -> ${id}`).toContain(
        MODEL_MANIFEST[id].category,
      );
    }
    for (const id of Object.values(PROP_MODELS)) {
      expect(MODEL_MANIFEST[id].category).toBe("props");
    }
    for (const id of Object.values(WALL_MODELS)) {
      expect(MODEL_MANIFEST[id].category).toBe("buildings");
    }
  });
});

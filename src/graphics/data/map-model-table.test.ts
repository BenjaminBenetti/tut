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
  WALL_FAMILIES,
  wallFamilyFor,
  WALL_MODELS,
  HALF_WALL_MODEL,
  HALF_WALL_MODELS,
  wallFamilyForWall,
} from "./map-model-table";

/** Every wall model the table names, across all three families. */
const allWallModels = [
  ...WALL_FAMILIES.flatMap((family) => Object.values(WALL_MODELS[family])),
  HALF_WALL_MODEL,
];

describe("map model table", () => {
  it("registers every model it names, so nothing resolves to a missing asset", () => {
    const named = [
      ...Object.values(SURFACE_MODELS),
      ...Object.values(PROP_MODELS),
      ...allWallModels,
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

  it("gives every wall kind a model in every family", () => {
    const kinds: readonly WallKind[] = ["solid", "window", "door", "half"];
    for (const family of WALL_FAMILIES) {
      for (const kind of kinds) {
        expect(
          MODEL_MANIFEST[wallModel(kind, family)],
          `${family}/${kind}`,
        ).toBeDefined();
      }
    }
  });

  it("draws a half wall in brick whatever the family, the only one modelled", () => {
    for (const family of WALL_FAMILIES) {
      expect(wallModel("half", family)).toBe(HALF_WALL_MODELS[family]);
    }
  });

  it("gives each family a distinct model for the kinds it does carry", () => {
    for (const kind of ["solid", "window", "door"] as const) {
      const ids = WALL_FAMILIES.map((family) => wallModel(kind, family));
      expect(new Set(ids).size, kind).toBe(WALL_FAMILIES.length);
    }
  });

  it("gives a building one family, and no building brick — bar the civic parapet (#766)", () => {
    // Same id, same family, however often it is asked.
    const ids = ["building-1", "b-42", "block-a/3"];
    for (const id of ids) {
      const family = wallFamilyFor(id);
      expect(wallFamilyFor(id), id).toBe(family);
      expect(WALL_FAMILIES, id).toContain(family);
    }
    // Brick where a wall belongs to no building: a building's own
    // ground-floor walls stand on untagged tiles (#766).
    expect(wallFamilyFor(undefined)).toBe("brick");
    // The one civic exception is the parapet, which with no building is
    // concrete — a viaduct's lip drew brick and read as a brick building
    // the road sat on (#748, #766).
    expect(wallFamilyForWall("half", undefined)).toBe("concrete");
    expect(wallFamilyForWall("solid", undefined)).toBe("brick");
    expect(wallModel("half", wallFamilyForWall("half", undefined))).toBe(
      "building.wall-half-concrete",
    );
    expect(wallModel("half", "brick")).toBe(HALF_WALL_MODEL);
  });

  it("spreads buildings across all three families", () => {
    // A block that came out all one material is the bug this fixes, so
    // it is not enough that the choice is stable — it has to vary.
    const seen = new Set(
      Array.from({ length: 60 }, (_, i) =>
        wallFamilyFor(`building-${String(i)}`),
      ),
    );
    expect(seen.size).toBe(WALL_FAMILIES.length);
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
    for (const id of allWallModels) {
      expect(MODEL_MANIFEST[id].category).toBe("buildings");
    }
  });
});

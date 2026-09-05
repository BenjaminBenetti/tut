import type { ModelAssetId } from "../../content/data/model-ids";
import { hashSeed } from "../../core/service/seed-hash";
import { PropKindIds } from "../../mapgen/data/props";
import type { KnownPropKindId } from "../../mapgen/data/props";
import { SurfaceIds } from "../../mapgen/data/surfaces";
import type { KnownSurfaceId } from "../../mapgen/data/surfaces";
import type { PropKindId } from "../../mapgen/model/prop";
import type { SurfaceId } from "../../mapgen/model/surface";
import type { WallKind } from "../../mapgen/model/wall";

// ===========================================
// Surfaces
// ===========================================

/**
 * Style guide §7, `surface id → model id`. Road and sidewalk name their
 * straight piece here; `map-model-resolver` swaps in the corner, T and
 * cross variants once it can see a tile's neighbours.
 *
 * Keyed by the closed `KnownSurfaceId` union so a surface added to
 * `mapgen/data/surfaces` without art fails typecheck rather than
 * rendering nothing. A biome that adds its own id in data resolves
 * through `surfaceModelFor`, which falls back rather than throwing.
 */
export const SURFACE_MODELS: Readonly<Record<KnownSurfaceId, ModelAssetId>> = {
  [SurfaceIds.GRASS]: "tile.ground.grass",
  [SurfaceIds.DIRT]: "tile.ground.dirt",
  [SurfaceIds.SAND]: "tile.ground.sand",
  [SurfaceIds.SNOW]: "tile.ground.snow",
  [SurfaceIds.ROCK]: "tile.ground.rock",
  [SurfaceIds.ROAD]: "tile.city.road-straight",
  [SurfaceIds.SIDEWALK]: "tile.city.sidewalk",
  [SurfaceIds.WATER]: "tile.ground.water",
  [SurfaceIds.FLOOR]: "building.floor",
  [SurfaceIds.ROOF]: "building.roof",
  [SurfaceIds.STAIRS]: "building.stairs",
};

/**
 * The road piece for each count of road-bearing neighbours. A straight
 * run and a dead end share the straight piece; the resolver decides the
 * yaw. Two neighbours are a straight only when they face each other,
 * which the resolver checks before reaching here.
 */
export const ROAD_VARIANTS = {
  straight: "tile.city.road-straight",
  corner: "tile.city.road-corner",
  t: "tile.city.road-t",
  cross: "tile.city.road-cross",
} as const satisfies Record<string, ModelAssetId>;

/** Sidewalk ships a straight and a corner only; anything else uses the straight. */
export const SIDEWALK_VARIANTS = {
  straight: "tile.city.sidewalk",
  corner: "tile.city.sidewalk-corner",
} as const satisfies Record<string, ModelAssetId>;

// ===========================================
// Props
// ===========================================

/**
 * Style guide §7, `prop kind → model id`. `car` takes the 1×1 compact;
 * the 2×1 `prop.car-sedan` is for hand-placed wrecks and mapgen never
 * emits it.
 */
export const PROP_MODELS: Readonly<Record<KnownPropKindId, ModelAssetId>> = {
  [PropKindIds.CAR]: "prop.car-compact",
  [PropKindIds.CRATE]: "prop.crate",
  [PropKindIds.BARRIER]: "prop.barrier-concrete",
  [PropKindIds.SANDBAGS]: "prop.sandbags",
  [PropKindIds.DUMPSTER]: "prop.dumpster",
  [PropKindIds.SHELVING]: "prop.shelving",
  [PropKindIds.TABLE]: "prop.table",
  [PropKindIds.FENCE]: "prop.fence",
  [PropKindIds.BOULDER]: "prop.boulder",
  [PropKindIds.TREE_PINE]: "prop.tree-pine",
  [PropKindIds.TREE_OAK]: "prop.tree-oak",
  [PropKindIds.TREE_PALM]: "prop.tree-palm",
  [PropKindIds.CACTUS]: "prop.cactus",
};

// ===========================================
// Walls
// ===========================================

/**
 * The material a wall face is built from (#510). Three families of
 * identical geometry, so a block of buildings stops reading as one
 * extruded material; which one a building draws in is `wallFamilyFor`.
 */
export type WallFamily = "brick" | "concrete" | "panel";

/** Civic edges have their own geometry; buildings never draw this family. */
export type WallPlacementFamily = WallFamily | "road";

/**
 * Building families, in a fixed order. `wallFamilyFor` indexes into this, so
 * the order is part of what a building's family depends on: reordering
 * it redraws every map. Append rather than insert.
 */
export const WALL_FAMILIES: readonly WallFamily[] = [
  "brick",
  "concrete",
  "panel",
];

/** The wall kinds #510 models in all three families. */
type FamilyWallKind = Exclude<WallKind, "half">;

/**
 * Style guide §7, wall kind → model id, one row per family.
 *
 * ```
 *            solid                 window                       door
 *   brick    building.wall         building.wall-window         building.wall-door
 *   concrete building.wall-…-conc  building.wall-window-conc    building.wall-door-conc
 *   panel    building.wall-…-panel building.wall-window-panel   building.wall-door-panel
 * ```
 */
export const WALL_MODELS: Readonly<
  Record<WallFamily, Readonly<Record<FamilyWallKind, ModelAssetId>>>
> = {
  brick: {
    solid: "building.wall",
    window: "building.wall-window",
    door: "building.wall-door",
  },
  concrete: {
    solid: "building.wall-concrete",
    window: "building.wall-window-concrete",
    door: "building.wall-door-concrete",
  },
  panel: {
    solid: "building.wall-panel",
    window: "building.wall-window-panel",
    door: "building.wall-door-panel",
  },
};

/**
 * Building half walls keep their existing brick/concrete meshes (#766).
 * The road family uses an open steel rail on a concrete kerb (#782),
 * sharing the half wall's bounds and base pivot without its silhouette.
 */
export const HALF_WALL_MODELS: Readonly<
  Record<WallPlacementFamily, ModelAssetId>
> = {
  brick: "building.wall-half",
  concrete: "building.wall-half-concrete",
  panel: "building.wall-half-concrete",
  road: "building.viaduct-parapet",
};

/** The brick half wall, kept for the brick family's own parapets. */
export const HALF_WALL_MODEL: ModelAssetId = HALF_WALL_MODELS.brick;

// ===========================================
// Lookups
// ===========================================

/** The model for a surface id, or undefined for one with no art registered. */
export function surfaceModel(surface: SurfaceId): ModelAssetId | undefined {
  return Object.hasOwn(SURFACE_MODELS, surface)
    ? SURFACE_MODELS[surface as KnownSurfaceId]
    : undefined;
}

/** The model for a prop kind, or undefined for one with no art registered. */
export function propModel(kind: PropKindId): ModelAssetId | undefined {
  return Object.hasOwn(PROP_MODELS, kind)
    ? PROP_MODELS[kind as KnownPropKindId]
    : undefined;
}

/**
 * The model for a wall kind in one family. Every kind mapgen can emit
 * has one; `half` follows the family too, see `HALF_WALL_MODELS`. Road
 * edges use concrete for full-height kinds, though only half walls are
 * assigned the road family by `wallFamilyForWall`.
 */
export function wallModel(
  kind: WallKind,
  family: WallPlacementFamily,
): ModelAssetId {
  return kind === "half"
    ? HALF_WALL_MODELS[family]
    : WALL_MODELS[family === "road" ? "concrete" : family][kind];
}

/**
 * The family a building draws in: one per `buildingId`, so a building
 * is a single material rather than a patchwork, and brick where a wall
 * belongs to no building — a building's own ground-floor walls stand on
 * untagged tiles, so this default is what keeps a brick tower brick to
 * the pavement. The one civic exception is the parapet: see
 * `wallFamilyForWall`.
 *
 * Hashed rather than drawn from the mission's `Rng`. Graphics observes
 * simulation state and never draws from its stream, and the same map
 * has to come back looking the same after a reload — which a generator
 * position cannot promise and a hash of the id gives for free.
 */
export function wallFamilyFor(buildingId: string | undefined): WallFamily {
  if (buildingId === undefined) {
    return "brick";
  }
  const index = hashSeed(buildingId) % WALL_FAMILIES.length;
  return WALL_FAMILIES[index] ?? "brick";
}

/**
 * The family one wall draws in (#766, #782). A building's walls take the
 * building's family. A wall that belongs to no building is brick — except
 * a `half` wall, which with no building is civic: the parapet along a
 * viaduct or the lip of a raised park, and takes the road's kerb and rail.
 * Only the parapet changes, because a building's own
 * ground-floor walls also stand on untagged tiles.
 */
export function wallFamilyForWall(
  kind: WallKind,
  buildingId: string | undefined,
): WallPlacementFamily {
  if (buildingId === undefined && kind === "half") {
    return "road";
  }
  return wallFamilyFor(buildingId);
}

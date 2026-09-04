import type { ModelAssetId } from "../../content/data/model-ids";
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

/** Style guide §7, wall kind → model id. */
export const WALL_MODELS: Readonly<Record<WallKind, ModelAssetId>> = {
  solid: "building.wall",
  window: "building.wall-window",
  door: "building.wall-door",
  half: "building.wall-half",
};

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

/** The model for a wall kind. Every kind mapgen can emit has one. */
export function wallModel(kind: WallKind): ModelAssetId {
  return WALL_MODELS[kind];
}

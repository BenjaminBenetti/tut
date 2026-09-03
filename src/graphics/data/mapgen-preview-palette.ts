import type { ConnectorKind } from "../../mapgen/model/connector";
import type { CoverLevel } from "../../mapgen/model/cover";
import { HookKinds } from "../../mapgen/model/hook";
import type { WallKind } from "../../mapgen/model/wall";

// ===========================================
// Scale
// ===========================================

/** World units per map level: one building floor (style guide §3). */
export const LEVEL_HEIGHT = 1.5;

/** Thickness of a tile slab, so a level's top sits just above its base. */
export const SLAB_HEIGHT = 0.15;

/** Thickness of a wall segment. */
export const WALL_THICKNESS = 0.08;

// ===========================================
// Colours
// ===========================================

/**
 * Placeholder colours for the map generation preview, keyed by the ids
 * mapgen emits (style guide §4.3 environment tokens where one exists).
 * Real materials come from the model manifest once the tactical scene
 * builder lands; this palette exists so the preview never references an
 * asset path.
 */
export const SURFACE_COLOURS: Readonly<Record<string, number>> = {
  grass: 0x5e7a3a,
  dirt: 0x7a6045,
  sand: 0xc9b37a,
  snow: 0xe8ecf0,
  rock: 0x6f6f6f,
  road: 0x3a3a3f,
  sidewalk: 0x8e8a82,
  water: 0x2a5d8f,
  floor: 0x9a8f7a,
  roof: 0x55514c,
  stairs: 0xb08a4a,
};

/** Loud magenta so an unknown surface is impossible to miss. */
export const FALLBACK_SURFACE_COLOUR = 0xff00ff;

/** Wall segments by kind: concrete, glass, accent orange for doors. */
export const WALL_COLOURS: Readonly<Record<WallKind, number>> = {
  solid: 0xc8c2b4,
  window: 0x7fd1ff,
  door: 0xf08a24,
};

/** Props by the cover they provide; darker means more cover. */
export const PROP_COLOURS: Readonly<Record<CoverLevel, number>> = {
  0: 0x8b94a6,
  1: 0x9b7b3a,
  2: 0x4a5a3a,
};

/** Prop box height in world units by cover level. */
export const PROP_HEIGHTS: Readonly<Record<CoverLevel, number>> = {
  0: 0.3,
  1: 0.6,
  2: 1.2,
};

/** Vertical links: ramps and stairs are planks, ladders are rungs. */
export const CONNECTOR_COLOURS: Readonly<Record<ConnectorKind, number>> = {
  ramp: 0xd0a060,
  stairs: 0xb08a4a,
  ladder: 0xd9d9d9,
};

/** Hook markers: TDF green for deploy, bug green for eggs, danger red for edges, info cyan for extraction. */
export const HOOK_COLOURS: Readonly<Record<string, number>> = {
  [HookKinds.DEPLOY]: 0x7ccb5a,
  [HookKinds.EGG_SPAWNER]: 0x9cff3d,
  [HookKinds.EDGE_SPAWN]: 0xe0453c,
  [HookKinds.EXTRACTION]: 0x7fd1ff,
};

/** Warning yellow for hook kinds the palette does not know. */
export const FALLBACK_HOOK_COLOUR = 0xf0c63c;

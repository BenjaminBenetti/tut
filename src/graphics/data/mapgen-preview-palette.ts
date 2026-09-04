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
 * World-surface colours for the tactical scene and the map generation
 * preview, keyed by the ids mapgen emits. Every value is a style guide §4.3
 * environment token, because until a map cell resolves to a model (#474)
 * these boxes are what a player actually sees.
 *
 * Nothing here may use a §4.4 UI colour or one of the four overlay colours
 * (§12.2): `ui-info` marks where a unit can move and `ui-accent` marks the
 * unit itself, so a window painted `tdf-visor` and a door painted
 * `tdf-orange` made every building shout in the two colours that are
 * supposed to mean "you".
 */
export const SURFACE_COLOURS: Readonly<Record<string, number>> = {
  grass: 0x5e7a3a,
  dirt: 0x7a6045,
  sand: 0xd9b87a,
  snow: 0xe8ecf0,
  rock: 0x6e6a66,
  road: 0x3a3d42,
  sidewalk: 0xa7a297,
  water: 0x3f8fa8,
  floor: 0x8e8a82,
  roof: 0x55524c,
  stairs: 0xa7a297,
};

/** Loud magenta so an unknown surface is impossible to miss. */
export const FALLBACK_SURFACE_COLOUR = 0xff00ff;

/**
 * Wall segments by kind: brick body, glass pane, a dark opening for a
 * door, and `env-concrete` for a parapet, which is what a low wall is
 * cast from.
 */
export const WALL_COLOURS: Readonly<Record<WallKind, number>> = {
  solid: 0x8a4b3a,
  window: 0x6e8fa6,
  door: 0x3a3d42,
  half: 0x8e8a82,
};

/**
 * Wall height as a fraction of a level, so a parapet reads as something
 * to crouch behind rather than a wall to hide inside (style guide §7:
 * `wall-half` is 0.5 u against a 1 u storey).
 */
export const WALL_HEIGHTS: Readonly<Record<WallKind, number>> = {
  solid: 1,
  window: 1,
  door: 1,
  half: 0.5,
};

/**
 * Props by the cover they provide, as materials rather than a warning ramp:
 * scrub and debris, then timber, then steel. `PROP_HEIGHTS` is what encodes
 * cover — a knee-high box and a chest-high one read at a glance, and the
 * cover overlay (§12.2) says it again in `ui-warn` / `ui-danger`.
 */
export const PROP_COLOURS: Readonly<Record<CoverLevel, number>> = {
  0: 0x8a8a4a,
  1: 0x5a4634,
  2: 0x6f7378,
};

/** Prop box height in world units by cover level. */
export const PROP_HEIGHTS: Readonly<Record<CoverLevel, number>> = {
  0: 0.3,
  1: 0.6,
  2: 1.2,
};

/** Vertical links: concrete ramp, paved steps, steel ladder. */
export const CONNECTOR_COLOURS: Readonly<Record<ConnectorKind, number>> = {
  ramp: 0x8e8a82,
  stairs: 0xa7a297,
  ladder: 0x6f7378,
};

/**
 * Hook markers: TDF green for deploy, bug green for eggs, danger red for
 * edges, info cyan for extraction. These are the one place UI colours belong
 * on the tactical plane — they are markers over the world, not surfaces of it.
 */
export const HOOK_COLOURS: Readonly<Record<string, number>> = {
  [HookKinds.DEPLOY]: 0x7ccb5a,
  [HookKinds.EGG_SPAWNER]: 0x9cff3d,
  [HookKinds.EDGE_SPAWN]: 0xe0453c,
  [HookKinds.EXTRACTION]: 0x7fd1ff,
};

/** Warning yellow for hook kinds the palette does not know. */
export const FALLBACK_HOOK_COLOUR = 0xf0c63c;

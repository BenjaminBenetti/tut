import { LAYER_TILES } from "../../core/model/elevation";
import type { ConnectorKind } from "../../mapgen/model/connector";
import type { CoverLevel } from "../../mapgen/model/cover";
import { HookKinds } from "../../mapgen/model/hook";
import type { WallKind } from "../../mapgen/model/wall";

// ===========================================
// Scale
// ===========================================

/**
 * World units per half-height layer; two layers span one building storey.
 * A tile is one world unit, so this is `LAYER_TILES`: the rules measure
 * attack distance with the same number (#1119).
 */
export const LAYER_HEIGHT = LAYER_TILES;

/**
 * Thickness of the **placeholder box** a tile is drawn as before its
 * model loads, and — because `tileTop` is `level * LAYER_HEIGHT +
 * SLAB_HEIGHT` — the number that defines where the world's ground
 * surface actually is.
 *
 * That second job is the surprising one, and it is why this constant is
 * load-bearing far outside the preview this file is named for. The
 * authored slab is fitted to this plane rather than the other way
 * round: `map-model-resolver` drops a centre-pivoted model by
 * `GROUND_SLAB_THICKNESS / 2` so its top face lands here.
 *
 * **Not the same number as `GROUND_SLAB_THICKNESS` (0.05) and not meant
 * to be.** That one is how thick the artist made the slab; this one is
 * how high the surface sits. Confusing the two is what put the visible
 * ground half a slab high and everything standing on it half a slab low
 * (#557, #626).
 */
export const SLAB_HEIGHT = 0.15;

/** Thickness of a wall segment. */
export const WALL_THICKNESS = 0.08;

// ===========================================
// Colours
// ===========================================

/**
 * World-surface colours for the tactical scene and the map generation
 * preview, keyed by the ids mapgen emits. Values use style guide §4.3
 * environment tokens, with §4.2 bug flesh for infested ground, because until a map cell resolves to a model (#474)
 * these boxes are what a player actually sees.
 *
 * Nothing here may use a §4.4 UI colour or one of the four overlay colours
 * (§12.2): `ui-info` marks where a unit can move and `ui-accent` marks the
 * unit itself, so a window painted `tdf-visor` and a door painted
 * `tdf-orange` made every building shout in the two colours that are
 * supposed to mean "you".
 */
export const SURFACE_COLOURS: Readonly<Record<string, number>> = {
  paving: 0xa7a297,
  hardstand: 0x3a3d42,
  infested: 0x73452e,
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
  // The hive cavern's surrounding rock (#1179): `env-roof`, a shade under
  // the floor's `env-rock` so the walls read apart from what is walked.
  bedrock: 0x55524c,
  // The spore platform (#1179): space is `ui-bg`, the scene's clear colour,
  // and never drawn; plates are the bugs' own chitin, walnut and chestnut,
  // with `bug-chitin-tan` only on the rims.
  void: 0x0b0d12,
  "hull-plate": 0x8b5d36,
  "hull-plate-dark": 0x5c3b25,
  "hull-rim": 0xb88b58,
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
  // A dead thing worth something: bone against the spawner's live green (#1171).
  [HookKinds.TECH_CARCASS]: 0xd9c9a3,
  // Something of ours to hold: TDF amber, apart from the drop-zone green (#1175).
  [HookKinds.GENERATOR]: 0xffb347,
  // Alien and alive: spore violet, apart from every TDF and terrain hue
  // and from the spawners' green, so the crater's objective reads at once.
  [HookKinds.SPORE_POD]: 0xc15bff,
  // The hive's heart glows `bug-bio-magenta`; each brood chamber is marked
  // in `bug-chitin-tan`, the colour of the egg ribs waiting there (#1179).
  [HookKinds.HIVE_CORE]: 0xe23dff,
  [HookKinds.BROOD_CHAMBER]: 0xb88b58,
  // People to fetch: a warm white, apart from the generators' amber and
  // the carcass's bone, so a sheltering group reads as not ours to fight.
  [HookKinds.CIVILIAN]: 0xfff1d6,
  // Something of ours that was lost: scorched gunmetal orange, the burnt
  // edge of TDF amber, apart from the generator's clean amber (arc §6.6).
  [HookKinds.WRECK]: 0xc2643a,
  // A hole the swarm dug: `bug-flesh` russet, the colour between the
  // throat's ribs, darker than the carcass's bone and apart from the
  // wreck's scorched orange, so three mouths read as the bugs' (arc §6.7).
  [HookKinds.TUNNEL_MOUTH]: 0x73452e,
  // The spore platform (#1179): the docking ring's iris and the core seed
  // glow `bug-bio-magenta` like the hive's heart; the hatch to stage 2 is
  // spore violet; the Sovereign's dais is `bug-horn` #DDC39B, the crown
  // it waits under, and its guards' posts `bug-chitin-light`.
  [HookKinds.DOCKING_RING]: 0xe23dff,
  [HookKinds.PLATFORM_EXIT]: 0xc15bff,
  [HookKinds.PLATFORM_CORE]: 0xe23dff,
  [HookKinds.SOVEREIGN_DAIS]: 0xddc39b,
  [HookKinds.GUARD_POST]: 0xc6a275,
};

/** Warning yellow for hook kinds the palette does not know. */
export const FALLBACK_HOOK_COLOUR = 0xf0c63c;

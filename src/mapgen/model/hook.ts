import type { PassMask } from "./pass-mask";
import type { TileCoord } from "./tile-coord";

// ===========================================
// Placement hooks
// ===========================================

/**
 * Identifier of a hook kind. Kinds are open-ended: a new kind is a new
 * placer in the registry plus data, never a model edit (ADR 0004 §4.6).
 */
export type HookKind = string;

/** The hook kinds the shipped placers serve (`DEFAULT_HOOK_PLACERS`). */
export const HookKinds = {
  DEPLOY: "deploy",
  EGG_SPAWNER: "egg-spawner",
  EDGE_SPAWN: "edge-spawn",
  EXTRACTION: "extraction",
  /** A harvestable dead bug worth tech points (#1171); at most one a map. */
  TECH_CARCASS: "tech-carcass",
  /**
   * A generator the squad holds through timed bug waves (#1175): one
   * point hook per generator, placed at its facility's service sockets.
   */
  GENERATOR: "generator",
  /**
   * The spore pod a crash site is fought over (campaign arc §6.3): one
   * point hook on the crater floor, near the centre of the bowl, that
   * the squad destroys before it matures.
   */
  SPORE_POD: "spore-pod",
  /**
   * The heart of a hive cavern (#1179): exactly one, a 3×3 pad in the
   * deepest chamber. Meta `{ chamberId, footprint }`.
   */
  HIVE_CORE: "hive-core",
  /**
   * One per chamber of a hive cavern other than its mouth (#1179): the
   * chamber's floor centre, where dormant broods wait. Meta
   * `{ chamberId, radius, depth }`.
   */
  BROOD_CHAMBER: "brood-chamber",
  /**
   * A civilian group trapped in a building (campaign arc §6.4): one
   * point hook per group on an interior floor tile, at most one group a
   * building, each with an infantry route from deploy to its door.
   */
  CIVILIAN: "civilian",
  /**
   * A lost mech's wreck (arc §6.6): one square zone the size of the lost
   * chassis on open, level ground an infantry squad can walk to, where
   * the squad strips the parts. Meta `{ footprint }`, the square's side.
   */
  WRECK: "wreck",
} as const;

/** Scalar metadata a hook or requirement may carry, e.g. `hatchRadius`. */
export type HookMetaValue = number | string | boolean;

/** Metadata bag; plain data so it serialises. */
export type HookMeta = Readonly<Record<string, HookMetaValue>>;

/**
 * A place the mission runtime cares about. Zones list every tile; point
 * hooks list one. Invariant I7 guarantees that for every class in
 * `requiredPass` some tile is reachable from a deploy zone.
 */
export interface Hook {
  readonly id: string;
  readonly kind: HookKind;
  /** At least one tile. */
  readonly tiles: readonly TileCoord[];
  /** Classes that must be able to reach this hook. */
  readonly requiredPass: PassMask;
  readonly meta?: HookMeta;
}

/**
 * Hooks grouped by the role tactical and UI address them by
 * (architecture §5). Extensibility lives in each hook's `kind` and `meta`.
 */
export interface PlacementHooks {
  /** At least one; kind `deploy`. */
  readonly deployZones: readonly Hook[];
  /** Mission objectives; at least what the recipe demanded. */
  readonly objectives: readonly Hook[];
  /** At least one; kind `edge-spawn`; tiles on the map boundary. */
  readonly edgeSpawns: readonly Hook[];
  /** Kind `extraction`; may share tiles with a deploy zone. */
  readonly extraction: Hook;
}

/**
 * Returns every hook in the map in a fixed order, for validation and
 * iteration.
 */
export function allHooks(hooks: PlacementHooks): readonly Hook[] {
  return [
    ...hooks.deployZones,
    ...hooks.objectives,
    ...hooks.edgeSpawns,
    hooks.extraction,
  ];
}

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

/** Hook kinds every settlement map carries. */
export const HookKinds = {
  DEPLOY: "deploy",
  EGG_SPAWNER: "egg-spawner",
  EDGE_SPAWN: "edge-spawn",
  EXTRACTION: "extraction",
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

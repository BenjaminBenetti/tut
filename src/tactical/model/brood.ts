import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { TacticalPhase } from "./tactical-state";
import type { UnitId } from "./unit";

// ===========================================
// Ids and causes
// ===========================================

/** Identifies a brood within its mission: `brood-<chamberId>` for a cavern's. */
export type BroodId = string;

/**
 * What woke a brood (campaign arc §7.5):
 *
 * | cause    | the squad …                                                      |
 * |----------|------------------------------------------------------------------|
 * | `enter`  | ended a move step with a unit inside the wake zone               |
 * | `attack` | hurt a sleeper, or shot, blasted or set fire inside the zone     |
 * | `noise`  | fired a heavy gun or set off an explosion within earshot of it   |
 */
export type BroodWakeCause = "enter" | "attack" | "noise";

/**
 * A brood's wake radius when its chamber hook carries none: a small
 * room's worth. Every generated `brood-chamber` hook has a `radius`.
 */
export const DEFAULT_BROOD_RADIUS = 6;

/** Every `BroodWakeCause`, in a fixed order. */
export const BROOD_WAKE_CAUSES = [
  "enter",
  "attack",
  "noise",
] as const satisfies readonly BroodWakeCause[];

// ===========================================
// Brood
// ===========================================

/**
 * The ground a brood guards: a circle on the ground plane around the
 * chamber's `brood-chamber` hook tile, with the hook's `radius`.
 * Euclidean and height-blind — a tile is inside when
 * `dx² + dz² ≤ radius²` from `centre`, whatever its layer — because a
 * cavern chamber is a round hall and a unit on a ledge above the eggs
 * is still in it.
 */
export interface BroodWakeZone {
  /** The chamber's hook tile, nearest its centre. */
  readonly centre: TileCoord;
  /** Tiles from `centre`; the hook's `meta.radius`. Positive. */
  readonly radius: number;
}

/** When and why a brood woke; recorded once, never cleared. */
export interface BroodWaking {
  readonly turn: number;
  /** The phase it woke in: a brood woken in a bug phase sits that phase out. */
  readonly phase: TacticalPhase;
  readonly cause: BroodWakeCause;
}

/**
 * A group of dormant bugs that wake together (#1179, campaign arc
 * §7.5): one per hive-cavern chamber. The table on `TacticalState`
 * owns the grouping, rather than a `broodId` on every `Unit`, because
 * the wake zone has to live somewhere and a brood with no zone is not
 * a brood; a member is an ordinary bug with the `dormant` status.
 *
 * ```
 *   TacticalState.broods[]
 *   └── Brood { id, wake { centre, radius }, memberIds[], label?, woke? }
 *            │                                 │
 *            └── units[] with status dormant ◄─┘  until woke is set,
 *                then plain bugs that act from the next bug phase
 * ```
 */
export interface Brood {
  readonly id: BroodId;
  readonly wake: BroodWakeZone;
  /** The bugs that wake together, in placement order. */
  readonly memberIds: readonly UnitId[];
  /** Where it sleeps, for the log: `"east chamber"`, `"core chamber"`. */
  readonly label?: string;
  /** Set when the brood woke; absent while it sleeps. */
  readonly woke?: BroodWaking;
}

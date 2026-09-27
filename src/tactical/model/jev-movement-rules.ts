import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { Unit } from "./unit";

// ===========================================
// Named-enemy movement rules for Jev
// ===========================================

/**
 * What a Jev actor's movement offer must respect beyond the map and the
 * move rules (#1179, ADR 0012): the parts of a named enemy's character
 * that shape where it may go. Tactical plans the moves; the bugs domain,
 * which owns the personas, answers these questions, and the app injects
 * the answers through `JevActionRules.movement`.
 *
 * ```
 *   app ──► JevActionRules.movement ──► jevDestinations  (map_edge_exit)
 *                                   └─► jevMovementCandidates (leash)
 * ```
 *
 * Without it (tests, tools, a game without named enemies) no actor is
 * offered the edge exit unless it is already fleeing, and none is
 * leashed.
 */
export interface JevMovementRules {
  /**
   * True when the actor's persona runs for a map edge once hurt (the
   * Broodmother) and it is hurt enough to run now, so Jev is offered
   * the edge exit from the decision it turns, even before the next
   * phase start marks it `fleeing`. Never before: the exit is flight,
   * not a destination for a healthy actor. A unit already `fleeing`
   * gets it regardless.
   *
   * @param actor - The Jev-driven unit.
   * @returns Whether it may be offered the map edge exit.
   */
  readonly canFlee: (actor: Unit) => boolean;
  /**
   * The ground the actor must not leave (the Sovereign's core, arc §9),
   * or `undefined` when it roams free. Jev is offered no move that ends
   * further than `radius` from `core`.
   *
   * @param actor - The Jev-driven unit.
   * @returns Its leash, or `undefined`.
   */
  readonly leashOf: (actor: Unit) => JevLeash | undefined;
}

/**
 * A circle of ground a Jev actor's moves must end in (#1179): the
 * ground-plane Manhattan distance from the nearest tile of the actor's
 * block to `core`, the measure the Sovereign's fallback uses.
 */
export interface JevLeash {
  /** The tile it guards. */
  readonly core: TileCoord;
  /** Tiles it may range from `core`. */
  readonly radius: number;
}

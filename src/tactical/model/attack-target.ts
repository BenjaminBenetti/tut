import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { Team } from "./unit";

// ===========================================
// Attack target
// ===========================================

/** What sort of thing is being shot at; resolution writes damage back accordingly. */
export type AttackTargetKind = "unit" | "spawner";

/**
 * Anything an attack can be aimed at (#426). Units and egg spawners are
 * stored in different collections and carry different stat blocks, but
 * the combat rules only ever ask a target where it stands, whose side it
 * is on, what it has left and what armor a hit must get through — so
 * they depend on this and not on either concretion (ADR 0003 §2.2,
 * dependency inversion).
 *
 * ```
 *   Unit    ─ unitAttackTarget ───┐
 *                                 ├──► AttackTarget ──► range, sight, cover,
 *   Spawner ─ spawnerAttackTarget ┘                     hit chance, damage
 * ```
 *
 * A projection, not a store: `id` and `kind` together say where the
 * damage lands, and the adapters in `attack-target-service` build one
 * from the mission's own records.
 */
export interface AttackTarget {
  readonly kind: AttackTargetKind;
  /** The unit or spawner id; unique across both, as both come from the same generator. */
  readonly id: string;
  /** What the HUD calls it. */
  readonly name: string;
  /** The tile it occupies; range, sight and cover are judged against this. */
  readonly pos: TileCoord;
  /** Hit points left; at zero it is dead or destroyed and no longer targetable. */
  readonly hp: number;
  /** Armor subtracted from each hit after the weapon's penetration. Non-negative. */
  readonly armor: number;
  /** The side it belongs to, so a shot at one's own is refused. */
  readonly team: Team;
}

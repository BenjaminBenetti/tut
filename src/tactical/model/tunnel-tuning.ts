import type { EquipmentId } from "./equipment";

// ===========================================
// Tunnel tuning
// ===========================================

/**
 * The knobs of a Tunnel Sabotage's mouths (campaign arc §6.7). Defaults
 * live in `tactical/data/tunnel-tuning.ts`; the seal-tunnels objective
 * and the surfacing step receive them rather than importing the data.
 *
 * ```
 *   Interact beside an open mouth on turn T
 *     ──► PlacedCharge { equipmentId: chargeEquipmentId, detonatesOnTurn: T + fuseTurns }
 *     ──► goes off as turn T + fuseTurns opens; the mouth is sealed
 *
 *   bug phase of turn t, mouth i (hook order), open:
 *     t ≥ firstSurfaceTurn + i  ∧  (t − firstSurfaceTurn − i) mod surfaceEvery = 0
 *       ──► one burrower under the mouth
 * ```
 */
export interface TunnelTuning {
  /** Turns a charge set on a mouth burns before it goes off. Positive integer. */
  readonly fuseTurns: number;
  /**
   * The equipment whose blast a mouth's charge sets off: its profile is
   * the damage, radius and demolition force the collapse deals.
   */
  readonly chargeEquipmentId: EquipmentId;
  /** The first turn whose bug phase a mouth may surface a burrower in. Positive integer. */
  readonly firstSurfaceTurn: number;
  /**
   * Turns between one mouth's burrowers; each later mouth runs a turn
   * behind the one before it, so the mouths take turns. Positive integer.
   */
  readonly surfaceEvery: number;
}

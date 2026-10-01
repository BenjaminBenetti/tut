import type { TileCoord } from "../../mapgen/model/tile-coord";

// ===========================================
// Tunnel mouth
// ===========================================

/** Id of a tunnel mouth on the map, issued with the `"tunnel"` prefix. */
export type TunnelMouthId = string;

/** The prefix every `TunnelMouthId` is issued with. */
export const TUNNEL_MOUTH_ID_PREFIX = "tunnel";

/**
 * A hole the bugs have dug toward the next city, on the map's
 * `tunnel-mouth` hook (campaign arc §6.7, Tunnel Sabotage). An
 * objective entity, not a unit: it takes no hits, blocks nothing — its
 * heaved slabs stand under a third of a tile and give no cover — and
 * never acts. Burrowers come up through it while it is open; a charge
 * set on it collapses it when the fuse burns down, unless a bug pulls
 * it first: a bug's melee attack on the burning charge disarms it
 * (Ben's rule, 2026-09-28), and the mouth is open and uncharged again.
 *
 * ```
 *   open ──(Interact: set a charge)──► charged ──(fuse burns out)──► sealed
 *    ▲ │                                 │ │
 *    │ └── burrowers surface ◄───────────┘ │       sealed: nothing comes up
 *    │                                     │
 *    └──── pulled ◄──(a bug's melee attack on the charge, meleeHitsToDisarm)
 *          open again: burrowers still come up, Interact sets a new
 *          charge on a full fuse
 *
 *   hook tiles (2 × 2, one level)
 *     ├── tiles   every tile it covers; a unit sets the charge from beside any
 *     └── pos     the middle tile: where it is drawn, blipped and blown
 * ```
 */
export interface TunnelMouth {
  readonly id: TunnelMouthId;
  /** The middle of the footprint: where the mouth is drawn, marked and charged. */
  readonly pos: TileCoord;
  /** Every tile the mouth covers, in hook order. */
  readonly tiles: readonly TileCoord[];
  /**
   * The breaching charge burning on it, while one is (#1132's
   * `PlacedCharge` in `TacticalState.charges`). Kept after the charge
   * goes off, as the record of which charge sealed it.
   */
  readonly chargeId?: string;
  /**
   * Melee hits the burning charge still takes before it is pulled: the
   * tunnel tuning's `meleeHitsToDisarm` when it is set, one less for
   * each hit. Absent while no charge burns; a charge set before the
   * rule (#1179) reads as one hit from pulled.
   */
  readonly chargeHitsLeft?: number;
  /**
   * How many charges the bugs have pulled off this mouth. Absent means
   * none. The tracker reads it to say a mouth was pulled rather than
   * never charged, and the next charge's id counts from it.
   */
  readonly chargesPulled?: number;
  /** The turn it collapsed on. Absent while it is open, charged or not. */
  readonly sealedOnTurn?: number;
}

// ===========================================
// Predicates
// ===========================================

/**
 * Whether the mouth has collapsed: nothing comes up through it again.
 *
 * @param mouth - The mouth to read.
 */
export function isSealed(mouth: Pick<TunnelMouth, "sealedOnTurn">): boolean {
  return mouth.sealedOnTurn !== undefined;
}

/**
 * Whether a charge is burning on the mouth: set, and the mouth not yet
 * sealed by it.
 *
 * @param mouth - The mouth to read.
 */
export function isCharged(
  mouth: Pick<TunnelMouth, "chargeId" | "sealedOnTurn">,
): boolean {
  return mouth.chargeId !== undefined && !isSealed(mouth);
}

/**
 * Whether the bugs pulled the last charge set on the mouth and none has
 * been set since: open, uncharged, and pulled at least once. What the
 * tracker calls "pulled" (campaign arc §6.7).
 *
 * @param mouth - The mouth to read.
 */
export function isPulled(
  mouth: Pick<TunnelMouth, "chargeId" | "sealedOnTurn" | "chargesPulled">,
): boolean {
  return (
    !isSealed(mouth) && !isCharged(mouth) && (mouth.chargesPulled ?? 0) > 0
  );
}

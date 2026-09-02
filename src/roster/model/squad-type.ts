/**
 * Key of a squad type in the catalogue, e.g. `"rifle"`. Plain string so
 * the catalogue stays data-driven and new types (Track: Arsenal) need no
 * code change.
 */
export type SquadTypeId = string;

/**
 * Static definition of a kind of infantry squad (GDD §5.7). One record
 * per type lives in `roster/data/squad-types.ts`; owned squads reference
 * it by `id`.
 *
 * ```
 *   SquadType (catalogue, static)      Squad (roster entry, owned)
 *   ┌────────────────────────┐         ┌──────────────────────┐
 *   │ id: "rocket"           │◄────────│ typeId: "rocket"     │
 *   │ hireCost               │         │ strength / max       │
 *   │ reinforceCostPerSoldier│         │ kills, xp, ...       │
 *   │ combatRating           │         └──────────────────────┘
 *   └────────────────────────┘
 * ```
 *
 * Tactical stats for M2 will be added here later; keep the shape open
 * for extension rather than folding new concerns into existing fields.
 */
export interface SquadType {
  /** Unique catalogue key. */
  readonly id: SquadTypeId;
  /** Display name, e.g. `"Rifle Squad"`. */
  readonly name: string;
  /** Credits to hire a fresh, full-strength squad. */
  readonly hireCost: number;
  /** Credits per soldier when reinforcing a depleted squad. */
  readonly reinforceCostPerSoldier: number;
  /**
   * Strength of one full squad in the M1 auto-resolver. The resolver
   * scales it by `strength / maxStrength` of the owned squad.
   */
  readonly combatRating: number;
  /** One or two sentences for the roster and hire screens. */
  readonly description: string;
}

import type { DomainEvent } from "../../core/model/domain-event";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { AttackTargetKind } from "./attack-target";
import type { UnitId } from "./unit";

// ===========================================
// BlastResolved
// ===========================================

/** Event type: a weapon's blast landed, or a shot aimed at the ground missed. */
export const BLAST_RESOLVED = "tactical:blast-resolved";

/** One unit or spawner a blast reached, besides whatever the shot was aimed at. */
export interface BlastVictim {
  readonly targetId: string;
  readonly kind: AttackTargetKind;
  /** Hit points removed after armor and falloff; can be zero at the edge. */
  readonly damage: number;
  /** Its hit points afterwards. */
  readonly hp: number;
}

/**
 * How the blast got to its impact (#1132), for the animation: a shot or
 * a throw leaves the attacker with a flash and a tracer; a placed charge
 * simply goes off where it lies.
 */
export type BlastDelivery = "shot" | "thrown" | "placed";

/** Payload of `BlastResolved`. */
export interface BlastResolvedPayload {
  readonly attackerId: UnitId;
  /** Where the shot landed, or was aimed when it missed. */
  readonly impact: TileCoord;
  /** False for a miss at the ground: nothing happened and `victims` is empty. */
  readonly hit: boolean;
  /** Tiles from the impact the blast reached. */
  readonly radius: number;
  /** True when the shot was aimed at the tile rather than at a unit or spawner (#1121). */
  readonly aimedAtTile: boolean;
  /** The attacking weapon's reach, as `AttackResolved` carries it (#457). */
  readonly weaponRange: number;
  /**
   * What made the blast when it was not the attacker's weapon (#1132):
   * `"grenade"`, `"breaching charge"`. Absent for a shot, which the log
   * calls a blast as it always has.
   */
  readonly source?: string;
  /** How it arrived; absent means a shot. */
  readonly delivery?: BlastDelivery;
  /**
   * Everything the blast reached other than the aimed target, whose own
   * damage is on the `AttackResolved` that precedes this. Impact tile
   * first, then by distance.
   */
  readonly victims: readonly BlastVictim[];
}

/** A blast was rolled and applied (#1121). */
export type BlastResolvedEvent = DomainEvent<
  typeof BLAST_RESOLVED,
  BlastResolvedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [BLAST_RESOLVED]: BlastResolvedEvent;
  }
}

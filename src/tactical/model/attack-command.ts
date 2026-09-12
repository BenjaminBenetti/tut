import type { Command } from "../../core/model/command";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { UnitId } from "./unit";
import type { WeaponId } from "./unit-weapon";

// ===========================================
// Attack
// ===========================================

/** Command type: one unit fires on another, or at a tile (GDD §6.2, #1121). */
export const ATTACK = "tactical:attack";

/**
 * Payload of `Attack`. Aimed at one of two things, never both:
 *
 * ```
 *   { targetId }   a unit or an egg spawner     every weapon
 *   { tile }       a tile, enemy or not         weapons with a blast or a force (#1121)
 * ```
 *
 * `targetId` stays first and optional rather than the pair becoming a
 * tagged union, because every caller since #328 builds `attack(a, t)`
 * and every save's replay carries that shape; a tile shot is the new
 * case and says so by carrying `tile`. The handler refuses a payload
 * that names neither, or both.
 */
export interface AttackPayload {
  readonly attackerId: UnitId;
  /** The unit or egg spawner aimed at. Absent for a shot at the ground. */
  readonly targetId?: UnitId;
  /** The tile aimed at, for a weapon that can fire at the ground (#1121). Absent for a shot at a target. */
  readonly tile?: TileCoord;
  /**
   * Which of the attacker's weapons fires (#532). Omitted means its
   * first, which is what a bare "attack" has always meant and what every
   * single-weapon unit does.
   */
  readonly weaponId?: WeaponId;
}

/** Resolves one attack with the attacker's weapon against the target, cover and elevation applied (#328). */
export type AttackCommand = Command<typeof ATTACK, AttackPayload>;

/** Builds an `Attack` command aimed at a unit or an egg spawner. */
export function attack(
  attackerId: UnitId,
  targetId: UnitId,
  weaponId?: WeaponId,
): AttackCommand {
  return {
    type: ATTACK,
    payload: {
      attackerId,
      targetId,
      ...(weaponId === undefined ? {} : { weaponId }),
    },
  };
}

/**
 * Builds an `Attack` command aimed at a tile (#1121): what a mortar or a
 * flamer fires at the ground with, whether or not anything stands there.
 */
export function attackTile(
  attackerId: UnitId,
  tile: TileCoord,
  weaponId?: WeaponId,
): AttackCommand {
  return {
    type: ATTACK,
    payload: {
      attackerId,
      tile,
      ...(weaponId === undefined ? {} : { weaponId }),
    },
  };
}

// ===========================================
// Registration
// ===========================================

declare module "./tactical-command" {
  interface TacticalCommandMap {
    [ATTACK]: AttackCommand;
  }
}

declare module "../../overworld/model/overworld-command" {
  interface OverworldCommandMap {
    [ATTACK]: AttackCommand;
  }
}

import type { Command } from "../../core/model/command";
import type { UnitId } from "./unit";
import type { WeaponId } from "./unit-weapon";

// ===========================================
// Attack
// ===========================================

/** Command type: one unit fires on another (GDD §6.2). */
export const ATTACK = "tactical:attack";

/** Payload of `Attack`. */
export interface AttackPayload {
  readonly attackerId: UnitId;
  readonly targetId: UnitId;
  /**
   * Which of the attacker's weapons fires (#532). Omitted means its
   * first, which is what a bare "attack" has always meant and what every
   * single-weapon unit does.
   */
  readonly weaponId?: WeaponId;
}

/** Resolves one attack with the attacker's weapon against the target, cover and elevation applied (#328). */
export type AttackCommand = Command<typeof ATTACK, AttackPayload>;

/** Builds a `Attack` command. */
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

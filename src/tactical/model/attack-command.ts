import type { Command } from "../../core/model/command";
import type { UnitId } from "./unit";

// ===========================================
// Attack
// ===========================================

/** Command type: one unit fires on another (GDD §6.2). */
export const ATTACK = "tactical:attack";

/** Payload of `Attack`. */
export interface AttackPayload {
  readonly attackerId: UnitId;
  readonly targetId: UnitId;
}

/** Resolves one attack with the attacker's weapon against the target, cover and elevation applied (#328). */
export type AttackCommand = Command<typeof ATTACK, AttackPayload>;

/** Builds a `Attack` command. */
export function attack(attackerId: UnitId, targetId: UnitId): AttackCommand {
  return { type: ATTACK, payload: { attackerId, targetId } };
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

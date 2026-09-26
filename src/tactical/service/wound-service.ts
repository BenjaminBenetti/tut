import type { NemesisWound } from "../../overworld/model/nemesis";
import { ATTACK_RESOLVED } from "../model/attack-resolved-event";
import { BLAST_RESOLVED } from "../model/blast-resolved-event";
import { EFFECT_DAMAGED } from "../model/effect-damaged-event";
import type { TacticalEvent } from "../model/tactical-event";
import type { TacticalState } from "../model/tactical-state";
import type { UnitId, UnitKind } from "../model/unit";

// ===========================================
// Last wound
// ===========================================

/**
 * What last hurt `unitId` this mission (#1179, campaign arc §6.8, §11),
 * for the scar a named enemy that got away carries into the nemesis
 * record. Read backwards off the mission's log, so it is the last hit
 * that drew blood, not the biggest:
 *
 * ```
 *   AttackResolved  hit on it, damage > 0 ──► by the attacker's kind:
 *                                              mech ──► "mech"
 *                                              turret ──► "turret"
 *                                              anything else ──► "gunfire"
 *   BlastResolved   it among the victims, damage > 0 ──► "blast"
 *                   (a mortar, a grenade, a charge: the blast is the wound)
 *   EffectDamaged   fire burned it, damage > 0 ──► "fire"
 *   nothing drew blood ──► undefined
 * ```
 *
 * The log is the account the debrief reads, and the resolver reads kills
 * and harvests off it the same way. A driver that applies commands
 * without appending to the log (the sim sweeps) sees no wound, and the
 * scar is then the unmarked one.
 *
 * @param mission - The finished (or running) mission.
 * @param unitId - The named enemy.
 * @returns Its last wound, or undefined when nothing hurt it.
 */
export function lastWoundOf(
  mission: TacticalState,
  unitId: UnitId,
): NemesisWound | undefined {
  const kinds = new Map<UnitId, UnitKind>();
  for (const unit of [...mission.units, ...mission.extracted]) {
    kinds.set(unit.id, unit.kind);
  }
  for (let index = mission.log.length - 1; index >= 0; index--) {
    const event = mission.log[index];
    const wound =
      event === undefined ? undefined : woundIn(event, unitId, kinds);
    if (wound !== undefined) {
      return wound;
    }
  }
  return undefined;
}

// ===========================================
// Helpers
// ===========================================

/** The wound `event` dealt `unitId`, or undefined when it drew no blood from it. */
function woundIn(
  event: TacticalEvent,
  unitId: UnitId,
  kinds: ReadonlyMap<UnitId, UnitKind>,
): NemesisWound | undefined {
  switch (event.type) {
    case ATTACK_RESOLVED:
      return event.payload.targetId === unitId &&
        event.payload.hit &&
        event.payload.damage > 0
        ? attackerWound(kinds.get(event.payload.attackerId))
        : undefined;
    case BLAST_RESOLVED:
      return event.payload.victims.some(
        (victim) => victim.targetId === unitId && victim.damage > 0,
      )
        ? "blast"
        : undefined;
    case EFFECT_DAMAGED:
      return event.payload.targetId === unitId &&
        event.payload.kind === "fire" &&
        event.payload.damage > 0
        ? "fire"
        : undefined;
    default:
      return undefined;
  }
}

/** The wound a direct hit leaves, by what fired it. */
function attackerWound(kind: UnitKind | undefined): NemesisWound {
  if (kind === "mech") {
    return "mech";
  }
  if (kind === "turret") {
    return "turret";
  }
  return "gunfire";
}

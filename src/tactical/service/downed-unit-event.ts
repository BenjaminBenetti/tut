import { GENERATOR_DESTROYED } from "../model/generator-destroyed-event";
import type { TacticalEvent } from "../model/tactical-event";
import { TURRET_DESTROYED } from "../model/turret-destroyed-event";
import { UNIT_DIED } from "../model/unit-died-event";
import type { Unit, UnitId } from "../model/unit";

// ===========================================
// Downed unit
// ===========================================

/**
 * The event for a unit that damage just took to zero hit points: a
 * `UnitDied` for a squad, a mech or a bug, a `TurretDestroyed` for a
 * turret (#1155). The one place the two are told apart, so a shot, a
 * blast and a fire all end a turret the same way and none of them
 * hands the debrief a turret to mourn or a kill to credit.
 *
 * ```
 *   hp → 0 ──► kind turret ──► TurretDestroyed { turretId, pos, killerId? }
 *          └─► anything else ──► UnitDied { unitId, killerId?, dropped? }
 * ```
 *
 * A squad that falls carrying a specimen (#1179) drops it where it
 * stood: the unit keeps its `carrying` on its record, and the event
 * says so in `dropped`, so the log and the scene learn of it together.
 *
 * @param unit - The unit as it stood before the blow.
 * @param killerId - Who dealt it, when a unit did.
 * @returns The event to announce.
 */
export function downedEvent(unit: Unit, killerId?: UnitId): TacticalEvent {
  const credit = killerId === undefined ? {} : { killerId };
  if (unit.kind === "turret") {
    return {
      type: TURRET_DESTROYED,
      payload: { turretId: unit.id, pos: unit.pos, ...credit },
    };
  }
  if (unit.kind === "generator") {
    return {
      type: GENERATOR_DESTROYED,
      payload: { generatorId: unit.id, pos: unit.pos, ...credit },
    };
  }
  const dropped = unit.carrying === undefined ? {} : { dropped: unit.carrying };
  return {
    type: UNIT_DIED,
    payload: { unitId: unit.id, ...credit, ...dropped },
  };
}

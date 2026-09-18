import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { TileIndex } from "../../mapgen/service/tile-index";
import type { TacticalError } from "../model/tactical-error";
import type { TacticalState } from "../model/tactical-state";
import type { Unit } from "../model/unit";
import type { UnitWeapon } from "../model/unit-weapon";
import type { AttackTarget } from "../model/attack-target";
import { unitCanSee } from "./vision-service";
import { smokeBlocksSight } from "./obscuration-service";
import { hasLineOfSight } from "./sight-service";

/** A fitting refusal with player-facing text, shared by previews and commands. */
export function systemsRefusal(reason: string): TacticalError {
  return { kind: "systems-unavailable", reason };
}

/** Checks thermal headroom, recovery time and deployed stabilisers, including reactions. */
export function weaponSystemRefusal(
  mission: TacticalState,
  unit: Unit,
  weapon: UnitWeapon,
): TacticalError | undefined {
  const systems = mission.templates[unit.templateId]?.systems;
  if (
    systems &&
    (unit.heat ?? 0) + (weapon.profile.heat ?? 0) > systems.heatCapacity
  )
    return systemsRefusal(
      "Insufficient heat capacity; vent or use coolant first",
    );
  if ((unit.weaponReadyOnTurn?.[weapon.id] ?? 0) > mission.turn)
    return systemsRefusal("Weapon is recovering from its previous volley");
  if (weapon.profile.requiresBrace && !unit.braced)
    return systemsRefusal("Brace before firing this weapon");
  return undefined;
}

/** Applies conditional aiming bonuses without changing the frozen weapon template. */
export function aimedWeapon(
  mission: TacticalState,
  unit: Unit,
  weapon: UnitWeapon,
  target?: AttackTarget,
): UnitWeapon {
  const systems = mission.templates[unit.templateId]?.systems;
  const marked =
    target && mission.units.find((candidate) => candidate.id === target.id);
  const designation =
    weapon.profile.guided &&
    marked?.designatedBy === unit.team &&
    (marked.designatedUntilTurn ?? 0) > mission.turn
      ? (marked.designatedAccuracy ?? 0)
      : 0;
  const accuracy =
    (unit.braced ? (systems?.braceAccuracy ?? 0) : 0) +
    (!unit.movedThisTurn ? (systems?.stationaryAccuracy ?? 0) : 0) +
    designation;
  return accuracy === 0
    ? weapon
    : {
        ...weapon,
        profile: {
          ...weapon.profile,
          accuracy: weapon.profile.accuracy + accuracy,
        },
      };
}

/** Direct weapons need an unobscured line; indirect fire needs a living allied visual spotter. */
export function weaponSeesTile(
  mission: TacticalState,
  unit: Unit,
  weapon: UnitWeapon,
  from: TileCoord,
  to: TileCoord,
  index: TileIndex,
): boolean {
  if (weapon.profile.indirect) {
    return mission.units.some(
      (spotter) =>
        spotter.hp > 0 &&
        spotter.team === unit.team &&
        unitCanSee(mission, spotter, to, index),
    );
  }
  return (
    hasLineOfSight(mission.map, from, to, index) &&
    (weapon.profile.range <= 1 || !smokeBlocksSight(mission, from, to))
  );
}

/** Actual damage after remaining ablative protection, before the hit point floor. */
export function protectedDamage(
  mission: TacticalState,
  targetId: string,
  damage: number,
): number {
  const unit = mission.units.find((candidate) => candidate.id === targetId);
  const systems = unit && mission.templates[unit.templateId]?.systems;
  const absorption =
    unit && systems && (unit.ablativeSpent ?? 0) < (systems.ablativeHits ?? 0)
      ? (systems.ablativeAbsorption ?? 0)
      : 0;
  return Math.max(0, damage - absorption);
}

/** The ablative counter after a damaging impact; zero-damage smoke cannot consume it. */
export function ablativeSpentAfter(
  mission: TacticalState,
  unit: Unit,
  rawDamage: number,
): number {
  const hits = mission.templates[unit.templateId]?.systems?.ablativeHits ?? 0;
  return Math.min(hits, (unit.ablativeSpent ?? 0) + (rawDamage > 0 ? 1 : 0));
}

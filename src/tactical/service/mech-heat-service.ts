import type { TacticalState } from "../model/tactical-state";
import type { Unit } from "../model/unit";

/** Opens a mech's own phase: cools its reactor and resets stationary aiming. */
export function refreshMechSystems(mission: TacticalState, unit: Unit): Unit {
  const systems = mission.templates[unit.templateId]?.systems;
  if (!systems) return unit;
  return {
    ...unit,
    heat: Math.min(
      systems.heatCapacity,
      Math.max(0, (unit.heat ?? 0) + systems.idleHeat - systems.cooling),
    ),
    movedThisTurn: false,
  };
}

/** Movement releases stabilisers and spends movement heat once per action used. */
export function movedMech(
  mission: TacticalState,
  unit: Unit,
  actions: number,
): Unit {
  const systems = mission.templates[unit.templateId]?.systems;
  if (!systems) return unit;
  return {
    ...unit,
    braced: false,
    movedThisTurn: true,
    heat: Math.min(
      systems.heatCapacity,
      (unit.heat ?? 0) + systems.movementHeat * actions,
    ),
  };
}

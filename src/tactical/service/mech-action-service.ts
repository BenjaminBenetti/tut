import { err, ok } from "../../core/model/result";
import type { Result } from "../../core/model/result";
import { TileIndex } from "../../mapgen/service/tile-index";
import type {
  MechActionCommand,
  MechActionPayload,
} from "../model/mech-action-command";
import { MECH_SYSTEM_USED } from "../model/mech-system-used-event";
import type { TacticalError } from "../model/tactical-error";
import type { TacticalHandler } from "../model/tactical-handler";
import type { TacticalState } from "../model/tactical-state";
import type { Unit } from "../model/unit";
import { passMaskFor } from "../model/unit";
import { UNIT_MOVED } from "../model/unit-moved-event";
import type { StepReaction } from "../model/step-reaction";
import { NO_REACTION } from "../model/step-reaction";
import type { TacticalEvent } from "../model/tactical-event";
import { actingUnit } from "./acting-unit";
import { unitFootprintTiles } from "./footprint-service";
import { jumpFlightApex, jumpObstruction } from "./mech-jump-service";
import { buildMoveGraph, occupiedKeys } from "./movement-service";
import { systemsRefusal } from "./mech-weapon-service";
import { unitCanSee } from "./vision-service";

/** Shared preview and command validation for jumping, bracing, cooling and designation. */
export function validateMechAction(
  mission: TacticalState,
  payload: MechActionPayload,
): Result<Unit, TacticalError> {
  const acting = actingUnit(
    mission,
    payload.unitId,
    payload.action === "coolant" ? 0 : 1,
  );
  if (!acting.ok) return acting;
  const unit = acting.value;
  const systems = mission.templates[unit.templateId]?.systems;
  const refuse = (reason: string): Result<Unit, TacticalError> =>
    err(systemsRefusal(reason));
  if (unit.kind !== "mech" || !systems)
    return refuse("This unit has no fitted mech systems");
  if (payload.action === "brace") {
    if (
      !(systems.braceAccuracy ?? 0) &&
      !mission.templates[unit.templateId]?.weapons.some(
        (weapon) => weapon.profile.requiresBrace,
      )
    )
      return refuse("No stabilisers fitted");
    if (unit.braced) return refuse("Stabilisers already deployed");
  } else if (payload.action === "coolant") {
    if (!systems.equipment?.includes("mech-coolant"))
      return refuse("No coolant injector fitted");
    if ((unit.equipment?.["mech-coolant"] ?? systems?.coolantUses ?? 0) <= 0)
      return refuse("Emergency coolant exhausted");
    if ((unit.heat ?? 0) <= 0) return refuse("Reactor is already cool");
  } else if (payload.action === "designate") {
    if (!systems.equipment?.includes("mech-designator"))
      return refuse("No target designator fitted");
    const target = mission.units.find(
      (candidate) =>
        candidate.id === payload.targetId &&
        candidate.hp > 0 &&
        candidate.team !== unit.team,
    );
    if (
      !target ||
      !unitFootprintTiles(mission, target).some((tile) =>
        unitCanSee(mission, unit, tile, new TileIndex(mission.map)),
      )
    )
      return refuse("Designate a visible enemy unit");
  } else {
    if (!(systems.jumpRange ?? 0)) return refuse("No jump actuators fitted");
    const tile = payload.tile;
    if (!tile) return refuse("Choose a landing tile");
    const distance =
      Math.abs(tile.x - unit.pos.x) + Math.abs(tile.z - unit.pos.z);
    if (distance === 0 || distance > (systems.jumpRange ?? 0))
      return refuse(`Jump range is ${String(systems.jumpRange)} tiles`);
    if (Math.abs(tile.y - unit.pos.y) > (systems.jumpHeight ?? 0))
      return refuse("Landing exceeds the jump height limit");
    if ((unit.heat ?? 0) + (systems.jumpHeat ?? 0) > systems.heatCapacity)
      return refuse("Insufficient heat capacity for a jump");
    const index = new TileIndex(mission.map);
    // Landing must be observed; jumping cannot probe unseen units or interiors.
    if (
      !mission.units.some(
        (ally) =>
          ally.hp > 0 &&
          ally.team === unit.team &&
          unitCanSee(mission, ally, tile, index),
      )
    )
      return refuse("An ally must see the landing tile");
    const landing = index.getAt(tile);
    if (
      !landing ||
      !buildMoveGraph(mission.map).reachability.canOccupy(
        landing,
        passMaskFor(unit.passClass),
      ) ||
      occupiedKeys(mission, index, unit.id).has(index.keyOf(landing))
    )
      return refuse("Jump needs an unoccupied outdoor or flat-roof landing");
    const obstruction = jumpObstruction(mission.map, index, unit.pos, tile);
    if (obstruction) return refuse(obstruction);
  }
  return ok(unit);
}

/** Applies a validated system order and allows overwatch to react to a jump landing. */
export function createMechActionHandler(
  react: StepReaction = NO_REACTION,
): TacticalHandler<MechActionCommand> {
  return (mission, command, ctx) => {
    const checked = validateMechAction(mission, command.payload);
    if (!checked.ok) return checked;
    const unit = checked.value;
    const { action, tile, targetId } = command.payload;
    const systems = mission.templates[unit.templateId]?.systems;
    const changed: Unit = {
      ...unit,
      ap: unit.ap - (action === "coolant" ? 0 : 1),
      ...(action === "brace" ? { braced: true } : {}),
      ...(action === "coolant"
        ? {
            heat: 0,
            equipment: {
              ...unit.equipment,
              "mech-coolant":
                (unit.equipment?.["mech-coolant"] ??
                  systems?.coolantUses ??
                  0) - 1,
            },
          }
        : {}),
      ...(action === "jump" && tile
        ? {
            pos: tile,
            braced: false,
            movedThisTurn: true,
            heat: (unit.heat ?? 0) + (systems?.jumpHeat ?? 0),
          }
        : {}),
    };
    const state: TacticalState = {
      ...mission,
      units: mission.units.map((candidate) =>
        candidate.id === unit.id
          ? changed
          : action === "designate" && candidate.id === targetId
            ? {
                ...candidate,
                designatedBy: unit.team,
                designatedUntilTurn: mission.turn + 1,
                designatedAccuracy: systems?.designationAccuracy ?? 0,
              }
            : candidate,
      ),
    };
    const events: TacticalEvent[] = [
      {
        type: MECH_SYSTEM_USED,
        payload: { unitId: unit.id, action, ...(targetId ? { targetId } : {}) },
      },
    ];
    if (action === "jump" && tile) {
      events.push({
        type: UNIT_MOVED,
        payload: {
          unitId: unit.id,
          from: unit.pos,
          to: tile,
          path: [tile],
          jump: true,
          jumpApex: jumpFlightApex(
            mission.map,
            new TileIndex(mission.map),
            unit.pos,
            tile,
          ),
        },
      });
      const reaction = react(state, unit.id, ctx);
      return ok({
        state: reaction.state,
        events: [...events, ...reaction.events],
      });
    }
    return ok({ state, events });
  };
}

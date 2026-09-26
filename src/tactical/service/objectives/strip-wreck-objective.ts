import { err, ok } from "../../../core/model/result";
import { manhattanDistance } from "../../../core/service/grid-math";
import type { TileCoord } from "../../../mapgen/model/tile-coord";
import type { MechWreck } from "../../model/mech-wreck";
import type {
  ObjectiveInteraction,
  ObjectiveRules,
  ObjectiveTarget,
} from "../../model/objective-rules";
import type {
  StripWreckObjective,
  TacticalState,
} from "../../model/tactical-state";
import type { Unit } from "../../model/unit";
import { isInfantrySquad } from "../../model/unit";
import { WRECK_WORKED } from "../../model/wreck-worked-event";

// ===========================================
// Progress
// ===========================================

/**
 * Where a strip stands (arc §6.6):
 *
 * ```
 *   open       still being worked
 *   stripped   the parts are loose; a squad that worked it must board
 *   complete   a squad that worked it is aboard with the parts
 *   failed     lost, or nobody is left who could finish it
 * ```
 */
export type StripStatus = "open" | "stripped" | "complete" | "failed";

/** The live reading of a strip, for the tracker and the debrief. */
export interface StripProgress {
  readonly status: StripStatus;
  readonly turnsWorked: number;
  readonly turnsNeeded: number;
}

/**
 * The strip as it stands in `mission`, read live: the objective's
 * `complete` flag never changes, because boarding the drop ship is what
 * completes it and the Extract handler knows nothing of wrecks.
 *
 * @param objective - The strip-wreck objective.
 * @param mission - The mission it belongs to.
 */
export function stripProgress(
  objective: StripWreckObjective,
  mission: TacticalState,
): StripProgress {
  return {
    status: stripStatus(objective, mission),
    turnsWorked: objective.turnsWorked,
    turnsNeeded: objective.turnsNeeded,
  };
}

/** True once the wreck has been worked every turn it takes. */
export function isStripped(objective: StripWreckObjective): boolean {
  return objective.turnsWorked >= objective.turnsNeeded;
}

// ===========================================
// Interaction
// ===========================================

/**
 * `strip-wreck`: the squad spends its interact action on the wreck for
 * this turn. The Interact handler has already checked the unit is a TDF
 * unit in its phase with the points, and bills them after.
 *
 * ```
 *   not an infantry squad             ──► not-a-squad
 *   wreck not on the map              ──► objective-target-missing
 *   turnsWorked ≥ turnsNeeded         ──► wreck-stripped
 *   already worked this turn          ──► objective-worked-this-turn
 *   nearest wreck tile > interactRange ──► objective-out-of-reach
 *          │
 *          ▼
 *   turnsWorked + 1, lastWorkedTurn = turn, workedBy + unit
 *   WreckWorked { unitId, wreckId, objectiveId, turnsWorked, turnsNeeded }
 * ```
 *
 * Once a turn, whoever does it: two squads beside the wreck do not
 * strip it in one turn, so the recovery always costs the turns the
 * record says. The same squad may do both turns, or two may share them.
 *
 * Who strips (#1179), one predicate, `isInfantrySquad`:
 *
 * ```
 *   tdf squad, hands free                     ──► strips
 *   tdf squad carrying a netted specimen      ──► strips
 *   mech, turret, generator, bug              ──► not-a-squad
 *   civilian group, trapped or freed          ──► refused by the Interact
 *                                                  handler (cannot-interact);
 *                                                  not-a-squad here
 * ```
 *
 * Ruling on a carrier: a squad hauling a specimen home still strips.
 * The specimen costs it movement (`movePenalty`), not its hands for
 * work — a carrier also harvests a carcass and frees a trapped group —
 * and the only thing its full hands refuse is a second specimen
 * (`carryRefusal`). A civilian group is who the force came for, not its
 * salvage crew: it neither strips nor, standing on the map, keeps an
 * unstripped wreck open (`stripStatus`).
 */
export const workWreck: ObjectiveInteraction = (
  mission,
  objective,
  unit,
  tuning,
) => {
  if (objective.kind !== "strip-wreck") {
    return err({
      kind: "objective-not-interactive",
      objectiveId: objective.id,
    });
  }
  if (!isInfantrySquad(unit)) {
    return err({ kind: "not-a-squad", unitId: unit.id });
  }
  const wreck = trackedWreck(objective, mission);
  if (wreck === undefined) {
    return err({
      kind: "objective-target-missing",
      objectiveId: objective.id,
      targetId: objective.targetId,
    });
  }
  if (isStripped(objective)) {
    return err({ kind: "wreck-stripped", objectiveId: objective.id });
  }
  if (objective.lastWorkedTurn === mission.turn) {
    return err({
      kind: "objective-worked-this-turn",
      objectiveId: objective.id,
    });
  }
  const distance = manhattanDistance(unit.pos, nearestTile(wreck, unit.pos));
  if (distance > tuning.interactRange) {
    return err({
      kind: "objective-out-of-reach",
      objectiveId: objective.id,
      distance,
      range: tuning.interactRange,
    });
  }

  const worked: StripWreckObjective = {
    ...objective,
    turnsWorked: objective.turnsWorked + 1,
    lastWorkedTurn: mission.turn,
    workedBy: objective.workedBy.includes(unit.id)
      ? objective.workedBy
      : [...objective.workedBy, unit.id],
  };
  return ok({
    state: {
      ...mission,
      objectives: mission.objectives.map((candidate) =>
        candidate.id === objective.id ? worked : candidate,
      ),
    },
    events: [
      {
        type: WRECK_WORKED,
        payload: {
          unitId: unit.id,
          wreckId: wreck.id,
          objectiveId: objective.id,
          turnsWorked: worked.turnsWorked,
          turnsNeeded: worked.turnsNeeded,
        },
      },
    ],
  });
};

// ===========================================
// Rules
// ===========================================

/**
 * `strip-wreck` (arc §6.6): work a lost mech's wreck for its turns,
 * then carry the parts to the drop ship. The shape of the carcass
 * harvest (#1171) — a squad's interact action on a thing lying on the
 * map — spread over turns and tied to extraction.
 *
 * ```
 *   complete       stripped, and a squad that worked it is in `extracted`
 *   failed         the mission was lost; or nobody is left who could finish:
 *                    not stripped and no squad standing, or
 *                    stripped and no worker standing or aboard
 *   interaction    workWreck
 *   reachable      the wreck's tile nearest the unit, for a squad, while
 *                  it is not stripped and not yet worked this turn
 *   marker         the wreck's middle tile, until it is stripped
 *   destination    the wreck's middle tile
 *   tally          turns worked / turns needed
 *   resultFields   wreck { stripped, turnsWorked, turnsNeeded }
 * ```
 */
export const STRIP_WRECK_OBJECTIVE: ObjectiveRules<"strip-wreck"> = {
  kind: "strip-wreck",
  /** Done once the parts are loose and a squad that worked it has boarded. */
  complete(objective, mission) {
    return stripStatus(objective, mission) === "complete";
  },
  /** Lost with the mission, or with every squad that could still finish it. */
  failed(objective, mission) {
    return stripStatus(objective, mission) === "failed";
  },
  interaction: workWreck,
  /** The wreck tile nearest the unit, when that unit could work it now. */
  reachable(objective, mission, unit) {
    const wreck = trackedWreck(objective, mission);
    if (
      wreck === undefined ||
      isStripped(objective) ||
      objective.lastWorkedTurn === mission.turn ||
      (unit !== undefined && !isInfantrySquad(unit))
    ) {
      return undefined;
    }
    return targetFor(wreck, unit);
  },
  /** The wreck's middle tile until the parts are loose: where to go. */
  marker(objective, mission) {
    return isStripped(objective)
      ? undefined
      : trackedWreck(objective, mission)?.pos;
  },
  /** Where the wreck lies: public intel, like a nest's tile. */
  destination(objective, mission) {
    return { position: trackedWreck(objective, mission)?.pos };
  },
  /** Turns worked over turns needed, for the objective's result row. */
  tally(objective) {
    return {
      done: Math.min(objective.turnsWorked, objective.turnsNeeded),
      total: objective.turnsNeeded,
    };
  },
  /** How far the stripping got, for the debrief's wreck line. */
  resultFields(objective) {
    return {
      wreck: {
        stripped: isStripped(objective),
        turnsWorked: objective.turnsWorked,
        turnsNeeded: objective.turnsNeeded,
      },
    };
  },
};

// ===========================================
// Helpers
// ===========================================

/**
 * The strip's status, read live from the mission:
 *
 * ```
 *   stripped and a worker in `extracted`          ──► complete
 *   outcome lost                                   ──► failed
 *   stripped, no worker standing on the map        ──► failed
 *   not stripped, no infantry squad standing       ──► failed
 *   stripped                                       ──► stripped
 *   otherwise                                      ──► open
 * ```
 *
 * Complete is checked first so an abandon after the carriers boarded
 * still reads complete, as the leave summary counts it.
 */
function stripStatus(
  objective: StripWreckObjective,
  mission: TacticalState,
): StripStatus {
  const stripped = isStripped(objective);
  const workers = new Set(objective.workedBy);
  if (stripped && mission.extracted.some((unit) => workers.has(unit.id))) {
    return "complete";
  }
  if (mission.outcome === "lost") {
    return "failed";
  }
  const standing = mission.units.filter((unit) => unit.hp > 0);
  if (stripped) {
    return standing.some((unit) => workers.has(unit.id))
      ? "stripped"
      : "failed";
  }
  return standing.some(isInfantrySquad) ? "open" : "failed";
}

/** The wreck the objective strips, if it is on the map. */
function trackedWreck(
  objective: StripWreckObjective,
  mission: TacticalState,
): MechWreck | undefined {
  return (mission.wrecks ?? []).find(
    (candidate) => candidate.id === objective.targetId,
  );
}

/**
 * The wreck as a target: its tile nearest the unit, so the reach the
 * HUD measures is the reach the interaction measures; its middle tile
 * when no unit is asking.
 */
function targetFor(wreck: MechWreck, unit: Unit | undefined): ObjectiveTarget {
  return {
    id: wreck.id,
    pos: unit === undefined ? wreck.pos : nearestTile(wreck, unit.pos),
  };
}

/** The wreck tile nearest `from` by manhattan distance; the first of a tie, in tile order. */
function nearestTile(wreck: MechWreck, from: TileCoord): TileCoord {
  let best = wreck.pos;
  let bestDistance = manhattanDistance(from, best);
  for (const tile of wreck.tiles) {
    const distance = manhattanDistance(from, tile);
    if (distance < bestDistance) {
      best = tile;
      bestDistance = distance;
    }
  }
  return best;
}

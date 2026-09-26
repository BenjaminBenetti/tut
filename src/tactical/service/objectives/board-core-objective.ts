import type { TileCoord } from "../../../mapgen/model/tile-coord";
import type { ObjectiveRules } from "../../model/objective-rules";
import { OBJECTIVE_UPDATED } from "../../model/objective-updated-event";
import type { TacticalApplied } from "../../model/tactical-event";
import type {
  BoardCoreObjective,
  TacticalState,
} from "../../model/tactical-state";
import type { Unit } from "../../model/unit";
import { isCombatUnit, isStandingForce } from "../../model/unit";

// ===========================================
// Reading the hull
// ===========================================

/**
 * True once a squad or mech of ours has gone through the hatch: the
 * hull's extraction is the hatch down to the core, so a combat unit
 * among the extracted has boarded. Civilians and turrets never count.
 *
 * @param mission - The hull stage as it stands.
 */
export function hasBoarded(mission: TacticalState): boolean {
  return mission.extracted.some(isBoarder);
}

/**
 * The hatch's middle tile, for an entity controller heading for it or
 * a bug holding it: the middle of the stage's extraction tiles in the
 * order they were given, or undefined on a map with none.
 *
 * @param mission - The hull stage.
 */
export function hatchTile(mission: TacticalState): TileCoord | undefined {
  return mission.extraction[Math.floor(mission.extraction.length / 2)];
}

// ===========================================
// Extraction
// ===========================================

/**
 * What `board-core` hears when a unit leaves the map: a squad or mech
 * of ours going through the hatch completes it there and then, so the
 * tracker ticks the moment the first unit is aboard. Anything else, or
 * an objective already settled, leaves the mission as it was.
 *
 * ```
 *   a combat unit of ours, objective open ──► complete, ObjectiveUpdated
 *   anything else                         ──► unchanged, no events
 * ```
 *
 * @param objective - The hull's objective.
 * @param mission - The mission with the unit already among the extracted.
 * @param unit - The unit as it left.
 */
export function boardCoreOnExtracted(
  objective: BoardCoreObjective,
  mission: TacticalState,
  unit: Unit,
): TacticalApplied<TacticalState> {
  if (!isBoarder(unit) || objective.complete || objective.failed === true) {
    return { state: mission, events: [] };
  }
  return {
    state: {
      ...mission,
      objectives: mission.objectives.map((candidate) =>
        candidate.id === objective.id
          ? { ...objective, complete: true }
          : candidate,
      ),
    },
    events: [
      {
        type: OBJECTIVE_UPDATED,
        payload: { objectiveId: objective.id, complete: true },
      },
    ],
  };
}

// ===========================================
// Rules
// ===========================================

/**
 * `board-core` (campaign arc §6.9): get through the Spore Platform's
 * hull to the hatch and board the core. The stage's extraction is the
 * hatch, so boarding is extracting there, and the ordinary end of a
 * mission ends the stage: once the force has left the hull (aboard,
 * dead, or left behind by Leave) with at least one unit aboard, the
 * stage is won and the linked mission carries whoever boarded into the
 * core.
 *
 * ```
 *   complete      the flag, or a combat unit of ours among the extracted
 *   failed        none aboard and none of ours left on the map
 *   onExtracted   boardCoreOnExtracted: the first unit aboard completes it
 *   destination   the hatch's middle tile
 *   tally         1 / 1 once someone is aboard, 0 / 1 otherwise
 * ```
 *
 * No interaction, no marker: the hatch is the extraction, which the map
 * already draws, and nothing is worked there.
 */
export const BOARD_CORE_OBJECTIVE: ObjectiveRules<"board-core"> = {
  kind: "board-core",
  /** Done once a squad or mech of ours has gone through the hatch. */
  complete(objective, mission) {
    return objective.complete || hasBoarded(mission);
  },
  /** Lost once nobody went through and nobody of ours is left to. */
  failed(_objective, mission) {
    return !hasBoarded(mission) && !mission.units.some(isStandingForce);
  },
  /** The first combat unit through the hatch completes it at once. */
  onExtracted(objective, mission, unit) {
    return boardCoreOnExtracted(objective, mission, unit);
  },
  /** The hatch: where the squad is going, public to anyone who can see the deck. */
  destination(_objective, mission) {
    return { position: hatchTile(mission) };
  },
  /** One boarding, made or not. */
  tally(objective, mission) {
    return {
      done: objective.complete || hasBoarded(mission) ? 1 : 0,
      total: 1,
    };
  },
};

// ===========================================
// Helpers
// ===========================================

/** A squad or mech of ours: the units whose going through the hatch is boarding. */
function isBoarder(unit: Unit): boolean {
  return unit.team === "tdf" && isCombatUnit(unit);
}

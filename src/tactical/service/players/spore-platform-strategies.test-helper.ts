import type { Objective } from "../../model/tactical-state";
import type { TacticalState } from "../../model/tactical-state";
import {
  objectiveComplete,
  objectiveFailed,
} from "../objectives/objective-status";
import type { ObjectiveStrategy } from "./objective-strategy.test-helper";
import { frontier } from "./player-goals.test-helper";

// ===========================================
// The Spore Platform (#1179, campaign arc §6.9)
// ===========================================
//
// Two maps played as one mission: the hull, then the core chamber, the
// survivors carried across with their wounds and their ammunition.
//
//   hull   board-core             no blip; the HUD's waypoint is the
//                                 hatch (the stage's drop zone): make
//                                 for it and go through
//   core   destroy-platform-core  the core's blip: at it at full pace,
//                                 firing on it before the bugs, charges
//                                 once beside it; the Sovereign and the
//                                 guards are what stand in the way

/**
 * Board the core: the whole force makes for the hatch and goes
 * through. The first aboard completes the objective; the rest follow as
 * everyone does once only getting there is left, so the stage never
 * sits settled while the force is still crossing the hull.
 */
export const BOARD_CORE_STRATEGY: ObjectiveStrategy<"board-core"> = {
  /** Done once someone is through the hatch (or nobody is left to go). */
  settled(objective, view) {
    return closed(objective, view.mission);
  },
  /** Everyone to the hatch, and through it. */
  jobs(_objective, view) {
    const hatch = view.mission.extraction;
    return hatch.length === 0
      ? []
      : [{ order: { kind: "extract", goals: hatch } }];
  },
};

/**
 * Destroy the platform core: to its blip at full pace, firing on it
 * before the bugs once it is in sight, and charges once beside it. The
 * core falling ends the mission on the spot, so nothing comes after.
 * With no blip (never, as the stage is built), the unexplored ground.
 */
export const DESTROY_PLATFORM_CORE_STRATEGY: ObjectiveStrategy<"destroy-platform-core"> =
  {
    /** Done the moment the core falls. */
    settled(objective, view) {
      return closed(objective, view.mission);
    },
    /** The whole force at the core, the core first; the fog before it is found. */
    jobs(objective, view) {
      const goals = view.places.get(objective.id) ?? [];
      if (goals.length > 0) {
        return [
          {
            order: {
              kind: "destroy",
              goals,
              interact: objective.id,
              targetId: objective.targetId,
              urgent: true,
              focus: true,
            },
          },
        ];
      }
      const unexplored = frontier(view);
      return unexplored.length === 0
        ? []
        : [{ order: { kind: "explore", goals: unexplored, urgent: true } }];
    },
  };

// ===========================================
// Private
// ===========================================

/** Complete or failed, as the tracker reads it. */
function closed(objective: Objective, mission: TacticalState): boolean {
  return (
    objective.complete ||
    objectiveComplete(mission, objective) ||
    objectiveFailed(mission, objective)
  );
}

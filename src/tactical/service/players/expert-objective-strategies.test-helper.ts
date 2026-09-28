import type { TileCoord } from "../../../mapgen/model/tile-coord";
import type { RescueCiviliansObjective } from "../../model/tactical-state";
import {
  rescueProgress,
  trappedGroups,
} from "../objectives/rescue-civilians-objective";
import { OBJECTIVE_STRATEGIES } from "./objective-strategies.test-helper";
import type {
  Job,
  ObjectiveStrategies,
  ObjectiveStrategy,
} from "./objective-strategy.test-helper";
import { fieldFor } from "./player-navigation.test-helper";
import type { PlayerView } from "./player-view.test-helper";

// ===========================================
// The expert's own strategies (#1179, campaign arc §12)
// ===========================================
//
// Where the careful player reads an objective differently from the new
// one, not only fights it differently. The table is the shared one with
// the expert's own entries laid over it, so every other kind is played
// exactly as the new player plays it, and a kind the shared table gains
// reaches the expert with no edit here.
//
//   OBJECTIVE_STRATEGIES ──► both players
//   EXPERT_OBJECTIVE_STRATEGIES = OBJECTIVE_STRATEGIES
//                                 + rescue-civilians (below)  ──► the expert
//
// Rescue (arc §6.4). The bugs hunt the trapped groups, so the rescue is
// a race. The expert policy works one job with the whole force, and
// escorts every freed group with one unit, and on the shared table that
// loses the race twice over (C2b-1-field, forces 15/35 and filled):
//
// - The force frees one group at a time while the others wait to be
//   eaten.
// - An escort holding beside a group just out of its building stands
//   in its doorway, and the group never gets out. Freed groups were
//   left on the map at the turn cap with their escort beside them.
//
// So the expert splits the force and leaves the freed groups to walk:
//
//   every trapped group ──► a job, cheapest round trip first
//                             (force → group → drop ship)
//     the cheapest ──► the main job: everyone not on a team
//     each other   ──► a team of RESCUE_TEAM
//     all of them  ──► at full pace (urgent): no creeping from cover
//   freed groups   ──► walk home on their own (the standing order)

/** Units sent to free each group other than the one the force works. */
const RESCUE_TEAM = 2;

// ===========================================
// Rescue
// ===========================================

/**
 * The expert's rescue: every trapped group at once, the one the round
 * trip makes cheapest with the whole force and each other with a team,
 * at full pace; no escort standing in a freed group's way.
 */
export const EXPERT_RESCUE_CIVILIANS_STRATEGY: ObjectiveStrategy<"rescue-civilians"> =
  {
    /** Done once the tracker reads complete or failed, as for the new player. */
    settled(objective, view) {
      return rescueProgress(view.mission, objective).status !== "open";
    },
    /** A job for every trapped group: the cheapest for the force, the rest for teams. */
    jobs(objective, view) {
      return cheapestFirst(view, objective).map((place, index): Job => ({
        order: {
          kind: "work",
          goals: [place],
          interact: objective.id,
          urgent: true,
        },
        ...(index === 0 ? {} : { crew: RESCUE_TEAM }),
      }));
    },
  };

// ===========================================
// The table
// ===========================================

/** The expert's strategy table: the shared one, with the expert's own rescue. */
export const EXPERT_OBJECTIVE_STRATEGIES: ObjectiveStrategies = {
  ...OBJECTIVE_STRATEGIES,
  "rescue-civilians": EXPERT_RESCUE_CIVILIANS_STRATEGY,
};

// ===========================================
// Private
// ===========================================

/**
 * The trapped groups' places, cheapest round trip first: the walk from
 * the nearest unit of the force to the group, plus the group's walk
 * from there to the drop ship. Ties keep the objective's order.
 *
 * ```
 *   drop ship ◄──── back ──── group ◄──── out ──── force
 *   cost = out + back          (not out alone: a group near the force
 *                               but far from home costs the walk home)
 * ```
 */
function cheapestFirst(
  view: PlayerView,
  objective: RescueCiviliansObjective,
): readonly TileCoord[] {
  return trappedGroups(view.mission, objective)
    .map((group, order) => ({
      place: group.pos,
      order,
      cost: roundTrip(view, group.pos),
    }))
    .sort((a, b) => a.cost - b.cost || a.order - b.order)
    .map((entry) => entry.place);
}

/**
 * Steps from the force's nearest unit to `place`, plus steps from
 * `place` to the nearest drop-ship tile; infinite when nobody can get
 * there or back.
 */
function roundTrip(view: PlayerView, place: TileCoord): number {
  const index = view.graph.index;
  let out = Number.POSITIVE_INFINITY;
  let back = Number.POSITIVE_INFINITY;
  for (const unit of view.force) {
    const field = fieldFor(view.graph, unit, [place]);
    out = Math.min(out, field.get(index.keyOf(unit.pos)) ?? out);
    for (const tile of view.mission.extraction) {
      back = Math.min(back, field.get(index.keyOf(tile)) ?? back);
    }
  }
  return out + back;
}

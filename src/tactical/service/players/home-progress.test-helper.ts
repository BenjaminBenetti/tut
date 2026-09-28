import type { UnitId } from "../../model/unit";
import type { ObjectiveStrategies } from "./objective-strategy.test-helper";
import { strategyFor } from "./objective-strategy.test-helper";
import { fieldFor } from "./player-navigation.test-helper";
import type { PlayerView } from "./player-view.test-helper";

// ===========================================
// Getting somewhere on the walk home (#1179 C3a)
// ===========================================
//
// The driver gives up on a force that is settled and has got nobody out
// for STALL_TURNS turns. A hive's walk home from the core is longer than
// that, so for an objective whose strategy says the walk is long, a turn
// in which a unit stands nearer the drop ship than it has since the
// force settled is a turn of getting somewhere, not of waiting:
//
//   settled ──► each unit's steps home ──► below its own best? ──► nearer
//                                           └─ best := min(best, steps)
//
// A unit boxed in never beats its own best, so the stall still fires.

/** Each unit's fewest steps home since the force settled. */
export type HomeBests = ReadonlyMap<UnitId, number>;

/** One turn's reading of the walk home. */
export interface HomeProgress {
  readonly bests: HomeBests;
  /** Some unit stands nearer the drop ship than it has since the force settled. */
  readonly nearer: boolean;
}

/** No walk being watched: nobody has a best, nobody got nearer. */
export const NO_HOME_PROGRESS: HomeProgress = {
  bests: new Map(),
  nearer: false,
};

// ===========================================
// Reading the walk
// ===========================================

/**
 * Whether any objective on the map has a strategy whose walk home is
 * longer than the driver's patience, so progress home counts.
 */
export function walksFarHome(
  view: PlayerView,
  strategies: ObjectiveStrategies,
): boolean {
  return view.mission.objectives.some(
    (objective) => strategyFor(strategies, objective).longWalkHome === true,
  );
}

/**
 * Whether any of `view`'s force stands nearer the drop ship than its
 * best in `bests`, with the bests brought up to date. A unit new to
 * `bests` only sets its first best, which is not getting nearer; a unit
 * that cannot reach the drop ship has no best.
 */
export function homeProgress(view: PlayerView, bests: HomeBests): HomeProgress {
  const next = new Map<UnitId, number>();
  let nearer = false;
  for (const unit of view.force) {
    const steps = fieldFor(view.graph, unit, view.mission.extraction).get(
      view.graph.index.keyOf(unit.pos),
    );
    if (steps === undefined) {
      continue;
    }
    const best = bests.get(unit.id);
    if (best !== undefined && steps < best) {
      nearer = true;
    }
    next.set(unit.id, Math.min(steps, best ?? steps));
  }
  return { bests: next, nearer };
}

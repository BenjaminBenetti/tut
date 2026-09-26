import { STOREY_LAYERS } from "../../../core/model/elevation";
import { err, ok } from "../../../core/model/result";
import { manhattanDistance } from "../../../core/service/grid-math";
import { CIVILIANS_EXTRACTED } from "../../model/civilians-extracted-event";
import { CIVILIANS_FREED } from "../../model/civilians-freed-event";
import { isTrapped } from "../../model/civilian";
import { OBJECTIVE_UPDATED } from "../../model/objective-updated-event";
import type {
  ObjectiveInteraction,
  ObjectiveRules,
} from "../../model/objective-rules";
import type { PhaseStep } from "../../model/phase-step";
import type {
  TacticalApplied,
  TacticalEvent,
} from "../../model/tactical-event";
import type {
  Objective,
  RescueCiviliansObjective,
  TacticalState,
} from "../../model/tactical-state";
import type { Unit } from "../../model/unit";

// ===========================================
// Types
// ===========================================

/** Where a rescue stands (campaign arc §6.4): open, half out, or beyond saving. */
export type RescueStatus = "open" | "complete" | "failed";

/**
 * The numbers the tracker shows for a rescue.
 *
 * ```
 *   Evacuate the civilians   2 / 4 aboard · 1 trapped · 1 lost · need 2
 * ```
 */
export interface RescueProgress {
  /** Groups aboard the drop ship. */
  readonly rescued: number;
  /** Groups still shut in their buildings. */
  readonly trapped: number;
  /** Groups freed and walking, still on the map. */
  readonly freed: number;
  /** Groups dead, or left on the map when the mission ended. */
  readonly lost: number;
  /** Groups the rescue tracks. */
  readonly total: number;
  /** Groups that must get out for the rescue to count: half, rounded up. */
  readonly needed: number;
  readonly status: RescueStatus;
}

// ===========================================
// Status
// ===========================================

/**
 * How many groups must get out (campaign arc §6.4: "at least half the
 * groups extracted"): half, rounded up, and never fewer than one, so a
 * rescue with no groups at all can never be won.
 *
 * ```
 *   3 groups ──► 2     4 groups ──► 2     5 groups ──► 3
 * ```
 */
export function rescueNeeded(total: number): number {
  return Math.max(1, Math.ceil(total / 2));
}

/**
 * The live count behind a rescue (campaign arc §6.4). A group is
 * rescued once it is among the extracted, trapped while it waits in its
 * building, freed while it walks, and lost when it is dead — or when the
 * mission has ended with it still on the map, since the drop ship does
 * not wait. Complete at `needed` aboard; failed once aboard plus every
 * group that could still get out falls short of it.
 *
 * ```
 *   rescued ≥ needed                     ──► complete
 *   rescued + savable < needed           ──► failed    savable: alive on the map,
 *   otherwise                            ──► open               none once it ended
 * ```
 *
 * @param mission - The mission the rescue belongs to.
 * @param objective - The rescue.
 * @returns The counts and the status they add up to.
 */
export function rescueProgress(
  mission: TacticalState,
  objective: RescueCiviliansObjective,
): RescueProgress {
  const groups = new Set(objective.groupIds);
  const rescued = mission.extracted.filter((unit) =>
    groups.has(unit.id),
  ).length;
  let trapped = 0;
  let freed = 0;
  for (const unit of mission.units) {
    if (!groups.has(unit.id) || unit.hp <= 0) {
      continue;
    }
    if (isTrapped(unit)) {
      trapped++;
    } else {
      freed++;
    }
  }
  const total = objective.groupIds.length;
  const over = mission.outcome !== undefined;
  const savable = over ? 0 : trapped + freed;
  const needed = rescueNeeded(total);
  const status: RescueStatus =
    rescued >= needed
      ? "complete"
      : rescued + savable < needed
        ? "failed"
        : "open";
  return {
    rescued,
    trapped: over ? 0 : trapped,
    freed: over ? 0 : freed,
    lost: total - rescued - savable,
    total,
    needed,
    status,
  };
}

// ===========================================
// Reach
// ===========================================

/**
 * The trapped groups of a rescue still alive on the map, in objective
 * order.
 *
 * @param mission - The mission.
 * @param objective - The rescue.
 */
export function trappedGroups(
  mission: TacticalState,
  objective: RescueCiviliansObjective,
): readonly Unit[] {
  const groups = new Set(objective.groupIds);
  return mission.units.filter(
    (unit) => groups.has(unit.id) && unit.hp > 0 && isTrapped(unit),
  );
}

/**
 * The trapped group `unit` would free: the nearest on its own storey,
 * ties in objective order, or undefined when none shares its storey. A
 * rescuer must stand beside the group, not on the floor above it, and
 * the Interact handler measures only the ground plane, so the storey is
 * judged here: within half a storey either way, as a ramp's step is.
 *
 * ```
 *   trapped groups on the unit's storey ──► nearest by manhattan
 *   none                                ──► undefined
 * ```
 *
 * @param mission - The mission.
 * @param objective - The rescue.
 * @param unit - The squad or mech that would free it.
 */
export function groupToFree(
  mission: TacticalState,
  objective: RescueCiviliansObjective,
  unit: Pick<Unit, "pos">,
): Unit | undefined {
  let best: Unit | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const group of trappedGroups(mission, objective)) {
    if (Math.abs(group.pos.y - unit.pos.y) >= STOREY_LAYERS) {
      continue;
    }
    const distance = manhattanDistance(unit.pos, group.pos);
    if (distance < bestDistance) {
      best = group;
      bestDistance = distance;
    }
  }
  return best;
}

// ===========================================
// Interaction
// ===========================================

/**
 * What Interact does to a rescue (campaign arc §6.4): the squad or mech
 * beside a trapped group breaks it out. The group loses its `trapped`
 * flag and gets its full action points, so the player can start walking
 * it to the drop ship at once; the rescuer pays the Interact cost as
 * for any objective.
 *
 * ```
 *   not a rescue                       ──► objective-not-interactive
 *   no group left trapped              ──► no-objective-in-reach
 *   nearest trapped group on its storey
 *     farther than interactRange       ──► objective-out-of-reach
 *   otherwise ──► group freed (ap = maxAp), CiviliansFreed
 * ```
 *
 * The status flags do not move: freeing a group gets nobody out.
 */
export const freeCivilians: ObjectiveInteraction = (
  mission,
  objective,
  unit,
  tuning,
) => {
  if (objective.kind !== "rescue-civilians") {
    return err({
      kind: "objective-not-interactive",
      objectiveId: objective.id,
    });
  }
  if (trappedGroups(mission, objective).length === 0) {
    return err({ kind: "no-objective-in-reach", unitId: unit.id });
  }
  const group = groupToFree(mission, objective, unit);
  const distance =
    group === undefined
      ? nearestAnyStorey(mission, objective, unit)
      : manhattanDistance(unit.pos, group.pos);
  if (group === undefined || distance > tuning.interactRange) {
    return err({
      kind: "objective-out-of-reach",
      objectiveId: objective.id,
      distance,
      range: tuning.interactRange,
    });
  }
  const freed: TacticalState = {
    ...mission,
    units: mission.units.map((candidate) => {
      if (candidate.id !== group.id) {
        return candidate;
      }
      const { trapped: _trapped, ...rest } = candidate;
      return { ...rest, ap: candidate.maxAp };
    }),
  };
  return ok({
    state: freed,
    events: [
      {
        type: CIVILIANS_FREED,
        payload: {
          unitId: group.id,
          rescuerId: unit.id,
          objectiveId: objective.id,
        },
      },
    ],
  });
};

/**
 * The ground-plane distance to the nearest trapped group on any storey,
 * for the refusal's "how far" when none shares the rescuer's.
 */
function nearestAnyStorey(
  mission: TacticalState,
  objective: RescueCiviliansObjective,
  unit: Pick<Unit, "pos">,
): number {
  return Math.min(
    ...trappedGroups(mission, objective).map((group) =>
      manhattanDistance(unit.pos, group.pos),
    ),
  );
}

// ===========================================
// Flags
// ===========================================

/**
 * The rescue with its flags brought up to the live status, and the
 * `ObjectiveUpdated` announcing the change; the objective unchanged and
 * no event when nothing moved. A flag never goes back, and the two are
 * never both set.
 */
function mirrored(
  mission: TacticalState,
  objective: RescueCiviliansObjective,
): { objective: RescueCiviliansObjective; events: TacticalEvent[] } {
  const status = rescueProgress(mission, objective).status;
  const failed = objective.failed || status === "failed";
  const complete = objective.complete || (!failed && status === "complete");
  if (complete === objective.complete && failed === objective.failed) {
    return { objective, events: [] };
  }
  return {
    objective: { ...objective, complete, failed },
    events: [
      {
        type: OBJECTIVE_UPDATED,
        payload: { objectiveId: objective.id, complete, failed },
      },
    ],
  };
}

/**
 * Mirrors the live status onto every rescue's flags at each phase start,
 * as the defence's step does (#1175): a group the bugs killed during
 * their phase can put the half out of reach, and the tracker and the log
 * hear of it here. Completion is mirrored at the moment a group boards
 * (`onExtracted`), so this mostly records failures.
 */
export function createRescueStep(): PhaseStep {
  return (mission) => {
    const events: TacticalEvent[] = [];
    const objectives = mission.objectives.map((objective): Objective => {
      if (objective.kind !== "rescue-civilians") {
        return objective;
      }
      const next = mirrored(mission, objective);
      events.push(...next.events);
      return next.objective;
    });
    return events.length === 0
      ? { state: mission, events: [] }
      : { state: { ...mission, objectives }, events };
  };
}

/**
 * Counts a group that has just boarded (campaign arc §6.4): announces it
 * with the running tally and, when it makes the half, marks the rescue
 * complete. Any other unit boarding is not the rescue's business.
 *
 * ```
 *   unit not one of the groups ──► mission unchanged, no events
 *   one of them ──► CiviliansExtracted { rescued, total }
 *                   [ObjectiveUpdated { complete }]  when it makes the half
 * ```
 */
function countAboard(
  objective: RescueCiviliansObjective,
  mission: TacticalState,
  unit: Unit,
): TacticalApplied<TacticalState> {
  if (!objective.groupIds.includes(unit.id)) {
    return { state: mission, events: [] };
  }
  const progress = rescueProgress(mission, objective);
  const next = mirrored(mission, objective);
  const state =
    next.objective === objective
      ? mission
      : {
          ...mission,
          objectives: mission.objectives.map((candidate) =>
            candidate.id === objective.id ? next.objective : candidate,
          ),
        };
  return {
    state,
    events: [
      {
        type: CIVILIANS_EXTRACTED,
        payload: {
          unitId: unit.id,
          objectiveId: objective.id,
          rescued: progress.rescued,
          total: progress.total,
        },
      },
      ...next.events,
    ],
  };
}

// ===========================================
// Rules
// ===========================================

/**
 * `rescue-civilians` (campaign arc §6.4): free the civilian groups
 * trapped in the town's buildings and walk them to the drop ship; at
 * least half must get out. Worked until no group is left trapped,
 * whatever the flags say, because every group aboard adds to the reward.
 *
 * ```
 *   complete / failed   rescueProgress, live
 *   interaction         freeCivilians: a squad or mech beside a trapped group
 *   workedUntilEmpty    true
 *   reachable           the trapped group nearest the unit, on its storey
 *   markers             every trapped group, one fog blip each
 *   destination         the first trapped group's tile and every group on the map
 *   onExtracted         counts a group aboard, marks the half
 *   phaseStep           createRescueStep, mirrors failure
 *   tally               groups aboard / groups
 *   resultFields        civiliansRescued, civiliansTotal
 * ```
 */
export const RESCUE_CIVILIANS_OBJECTIVE: ObjectiveRules<"rescue-civilians"> = {
  kind: "rescue-civilians",
  /** Half the groups, rounded up, are aboard. */
  complete(objective, mission) {
    return rescueProgress(mission, objective).status === "complete";
  },
  /** So many are dead, or left behind, that half can no longer get out. */
  failed(objective, mission) {
    return rescueProgress(mission, objective).status === "failed";
  },
  interaction: freeCivilians,
  workedUntilEmpty: true,
  phaseStep: createRescueStep(),
  /** The trapped group the asking unit would free; any trapped group when nobody asks. */
  reachable(objective, mission, unit) {
    const group =
      unit === undefined
        ? trappedGroups(mission, objective)[0]
        : groupToFree(mission, objective, unit);
    return group === undefined ? undefined : { id: group.id, pos: group.pos };
  },
  /** Every group still trapped: a blip each, until someone has them in view. */
  markers(objective, mission) {
    return trappedGroups(mission, objective).map((group) => group.pos);
  },
  /**
   * Where a controller should head: the first group still trapped, and
   * the ids of every group still on the map, freed or not.
   */
  destination(objective, mission) {
    const groups = new Set(objective.groupIds);
    const first = trappedGroups(mission, objective)[0];
    return {
      ...(first === undefined ? {} : { position: first.pos }),
      targetIds: mission.units
        .filter((unit) => groups.has(unit.id) && unit.hp > 0)
        .map((unit) => unit.id),
    };
  },
  onExtracted: countAboard,
  /** Groups aboard, of the groups the rescue tracks. */
  tally(objective, mission) {
    const progress = rescueProgress(mission, objective);
    return { done: progress.rescued, total: progress.total };
  },
  /** How many groups got out, and of how many. */
  resultFields(objective, mission) {
    const progress = rescueProgress(mission, objective);
    return {
      civiliansRescued: progress.rescued,
      civiliansTotal: progress.total,
    };
  },
};

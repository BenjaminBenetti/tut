import { OBJECTIVE_UPDATED } from "../../model/objective-updated-event";
import type { ObjectiveRules } from "../../model/objective-rules";
import type { PhaseStep } from "../../model/phase-step";
import type { TacticalEvent } from "../../model/tactical-event";
import type {
  KillBroodmotherObjective,
  Objective,
  TacticalState,
} from "../../model/tactical-state";
import { isStandingForce } from "../../model/unit";
import type { Unit } from "../../model/unit";
import { lastWoundOf } from "../wound-service";

// ===========================================
// Types
// ===========================================

/** Where a hunt stands (#1179): she lives and can still be killed, she is dead, or she is out of reach. */
export type HuntStatus = "open" | "complete" | "failed";

// ===========================================
// Status
// ===========================================

/**
 * The live answer for a kill-broodmother objective (#1179, campaign arc
 * §6.8). Complete the moment her unit lies on the map at zero hit
 * points, whatever happens to the squad afterwards. Failed once nobody
 * can kill her any more: she ran off the map edge, the mission has
 * ended with her alive, or no squad or mech of the force is left on the
 * map to do it.
 *
 * ```
 *   her unit on the map, hp ≤ 0                   ──► complete
 *   her unit among the escaped                    ──► failed
 *   mission over, or no standing force on the map ──► failed
 *   she was never placed                          ──► failed
 *   otherwise                                     ──► open
 * ```
 *
 * Never flips back: the dead stay dead, the escaped never return, and a
 * force that has left or fallen does not come back to the map.
 *
 * @param objective - The hunt.
 * @param mission - The mission.
 * @returns Where it stands.
 */
export function huntStatus(
  objective: KillBroodmotherObjective,
  mission: TacticalState,
): HuntStatus {
  const quarry = quarryOf(objective, mission);
  if (quarry !== undefined && quarry.hp <= 0) {
    return "complete";
  }
  if (
    quarry === undefined ||
    mission.outcome !== undefined ||
    !mission.units.some(isStandingForce)
  ) {
    return "failed";
  }
  return "open";
}

/**
 * Her unit while she is on the map, dead or alive; undefined once she
 * has escaped off its edge (`TacticalState.escaped`) or if she was never
 * placed.
 */
export function quarryOf(
  objective: KillBroodmotherObjective,
  mission: TacticalState,
): Unit | undefined {
  return mission.units.find((unit) => unit.id === objective.targetId);
}

/** True once she has fled off the map edge alive. */
export function quarryEscaped(
  objective: KillBroodmotherObjective,
  mission: TacticalState,
): boolean {
  return (mission.escaped ?? []).some((unit) => unit.id === objective.targetId);
}

// ===========================================
// Phase step
// ===========================================

/**
 * Mirrors the live status onto every hunt's `complete` and `failed`
 * flags at each phase start, and announces a change through
 * `ObjectiveUpdated`, as a capture's and a defence's steps do, so the
 * log, the tracker and Jev's objective list see it. It runs after the
 * Broodmother's flight step, so an escape that step has just recorded
 * fails the hunt in the same phase opening. A flag never goes back, and
 * the two are never both set.
 */
export const KILL_BROODMOTHER_STEP: PhaseStep = (mission) => {
  const events: TacticalEvent[] = [];
  const objectives = mission.objectives.map((objective): Objective => {
    if (objective.kind !== "kill-broodmother") {
      return objective;
    }
    const next = mirrored(objective, mission);
    events.push(...next.events);
    return next.objective;
  });
  return events.length === 0
    ? { state: mission, events: [] }
    : { state: { ...mission, objectives }, events };
};

/**
 * The hunt with its flags brought up to the live status, and the
 * `ObjectiveUpdated` announcing the change; the objective unchanged and
 * no event when nothing moved.
 */
function mirrored(
  objective: KillBroodmotherObjective,
  mission: TacticalState,
): { objective: KillBroodmotherObjective; events: TacticalEvent[] } {
  const status = huntStatus(objective, mission);
  const complete =
    objective.complete || (objective.failed !== true && status === "complete");
  const failed =
    objective.failed === true || (!complete && status === "failed");
  if (
    complete === objective.complete &&
    failed === (objective.failed ?? false)
  ) {
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

// ===========================================
// Rules
// ===========================================

/**
 * `kill-broodmother` (#1179, campaign arc §6.8): kill her before she
 * reaches the map edge, then board the drop ship. Not worked by
 * `Interact`: she is killed with the squad's guns, blasts and fire.
 *
 * ```
 *   complete / failed   huntStatus, live
 *   phaseStep           KILL_BROODMOTHER_STEP: flags mirrored, ObjectiveUpdated
 *   marker              her tile while she lives on the map: the objective
 *                       is the mission, so where she is is never withheld
 *   destination         her tile while she lives, and her unit id
 *   tally               1 / 1 once she is dead, 0 / 1 otherwise
 *   resultFields        broodmotherKilled, broodmotherEscaped, and while
 *                       she lives, her last wound for the scar
 * ```
 *
 * The marker is a location blip like a nest's (#1173): it discloses no
 * health, and it never changes vision or what a behaviour may know.
 */
export const KILL_BROODMOTHER_OBJECTIVE: ObjectiveRules<"kill-broodmother"> = {
  kind: "kill-broodmother",
  /** Done once her unit lies dead on the map. */
  complete(objective, mission) {
    return huntStatus(objective, mission) === "complete";
  },
  /** Lost once she escaped, or nobody is left who could kill her. */
  failed(objective, mission) {
    return huntStatus(objective, mission) === "failed";
  },
  phaseStep: KILL_BROODMOTHER_STEP,
  /** Her tile while she lives on the map (#1173): location only. */
  marker(objective, mission) {
    return livingPos(objective, mission);
  },
  /** Where she is while she lives, and who she is. */
  destination(objective, mission) {
    const position = livingPos(objective, mission);
    return {
      ...(position === undefined ? {} : { position }),
      targetIds: [objective.targetId],
    };
  },
  /** One Broodmother, dead or not. */
  tally(objective, mission) {
    return {
      done: huntStatus(objective, mission) === "complete" ? 1 : 0,
      total: 1,
    };
  },
  /**
   * Whether she died and whether she escaped, for the Alpha Hunt's
   * consequence rule; and, when she lived, what last hurt her, for the
   * scar the nemesis record gives her.
   */
  resultFields(objective, mission) {
    const killed = huntStatus(objective, mission) === "complete";
    const wound = killed ? undefined : lastWoundOf(mission, objective.targetId);
    return {
      broodmotherKilled: killed,
      broodmotherEscaped: quarryEscaped(objective, mission),
      ...(wound === undefined ? {} : { broodmotherWound: wound }),
    };
  },
};

// ===========================================
// Helpers
// ===========================================

/** Her anchor tile while she lives on the map; undefined once dead or gone. */
function livingPos(
  objective: KillBroodmotherObjective,
  mission: TacticalState,
): Unit["pos"] | undefined {
  const quarry = quarryOf(objective, mission);
  return quarry !== undefined && quarry.hp > 0 ? quarry.pos : undefined;
}

import type { Rng } from "../../core/model/rng";
import type { CombatTuning } from "../../tactical/model/combat-tuning";
import type { MissionView } from "../../tactical/model/mission-view";
import type { TacticalCommand } from "../../tactical/model/tactical-command";
import type { UnitId } from "../../tactical/model/unit";
import type { MoveGraph } from "../../tactical/service/movement-service";
import type { BehaviourTag } from "../model/bug-species";

// ===========================================
// Context
// ===========================================

/** What a behaviour may draw on beyond the mission state. */
export interface BehaviourContext {
  /** Forked for this unit's decision; the only randomness a behaviour may use. */
  readonly rng: Rng;
  /** Hit and damage formulae the utility scorers price targets with. */
  readonly combat: CombatTuning;
  /**
   * The mission map's move graph, built once per bug phase and shared
   * across units; a behaviour that omits it pays for its own build.
   */
  readonly graph?: MoveGraph;
}

// ===========================================
// Behaviour
// ===========================================

/**
 * How one species plays its turn (GDD §6.4). Pure: reads the view,
 * draws only from `ctx.rng`, and returns the commands the bug phase
 * should dispatch for `unitId`, in order, without applying any of them.
 * Returning nothing is a legal choice (hold position). Behaviours are
 * looked up by the species' `BehaviourTag` from a `BehaviourRegistry`,
 * so a new species needs a data entry and one behaviour module, never
 * an edit to the phase (open/closed).
 *
 * ```
 *   species.behaviour ──► registry.get(tag) ──► behaviour.choose(view, unitId, ctx)
 *                                                       │
 *                                                       ▼
 *                                             [move(...), attack(...)]
 * ```
 */
export interface BugBehaviour {
  /** The tag this behaviour answers to; one behaviour per tag. */
  readonly tag: BehaviourTag;

  /**
   * The commands for `unitId` this turn, in dispatch order.
   *
   * Takes the mission **as this side perceives it** (ADR 0006 §2.3), not
   * the mission: `view.units` holds its own side plus the enemies it has
   * spotted, so a behaviour physically cannot path toward a squad it has
   * no way of knowing about. A raw `TacticalState` does not compile here.
   */
  choose(
    view: MissionView,
    unitId: UnitId,
    ctx: BehaviourContext,
  ): readonly TacticalCommand[];
}

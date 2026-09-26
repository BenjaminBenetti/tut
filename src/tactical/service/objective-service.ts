import { err, ok } from "../../core/model/result";
import { manhattanDistance } from "../../core/service/grid-math";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { ExtractCommand } from "../model/extract-command";
import type { InteractCommand } from "../model/interact-command";
import type {
  ObjectiveInteraction,
  ObjectiveRulesTable,
  ObjectiveTarget,
} from "../model/objective-rules";
import type { ObjectiveTuning } from "../model/objective-tuning";
import type { TacticalEvent } from "../model/tactical-event";
import type { TacticalHandler } from "../model/tactical-handler";
import type { Objective, TacticalState } from "../model/tactical-state";
import { TEAM_FOR_PHASE } from "../model/tactical-state";
import type { Unit, UnitId } from "../model/unit";
import { isAutonomous, isStandingForce } from "../model/unit";
import { isCivilian, isTrapped } from "../model/civilian";
import { UNIT_EXTRACTED } from "../model/unit-extracted-event";
import { nearestFootprintTile } from "./footprint-service";
import { endIfOver } from "./mission-end-service";
import {
  OBJECTIVE_RULES,
  objectiveRulesFor,
} from "./objectives/objective-rules";
import { objectiveWorkable } from "./objectives/objective-status";

// ===========================================
// Objective kinds
// ===========================================

/** Re-exported from the objective rules contract, where it now lives (ADR 0013 §2.3). */
export type { ObjectiveInteraction } from "../model/objective-rules";

/**
 * The answer of every objective kind with no interaction of its own:
 * refused as not interactive, so the wheel never offers it. Named for
 * the defence (#1175), the first kind that is held rather than worked.
 */
export const holdTheLine: ObjectiveInteraction = (_mission, objective) =>
  err({ kind: "objective-not-interactive", objectiveId: objective.id });

/**
 * The interaction each objective kind ships with, read off
 * `OBJECTIVE_RULES` (ADR 0013 §2.3): a kind's own `interaction`, or
 * `holdTheLine` when it has none. The Interact handler's default table;
 * tests spread it and override one kind.
 */
export const DEFAULT_OBJECTIVE_INTERACTIONS: Readonly<
  Record<Objective["kind"], ObjectiveInteraction>
> = interactionsOf(OBJECTIVE_RULES);

/**
 * The interaction per kind in a rules table, falling back to
 * `holdTheLine`. Built over the table's own keys, so it names no kind.
 */
function interactionsOf(
  rules: ObjectiveRulesTable,
): Readonly<Record<Objective["kind"], ObjectiveInteraction>> {
  const interactions: Partial<Record<Objective["kind"], ObjectiveInteraction>> =
    {};
  for (const kind of Object.keys(rules) as Objective["kind"][]) {
    interactions[kind] = rules[kind].interaction ?? holdTheLine;
  }
  // Every key of the table was filled, and the table has every kind.
  return interactions as Record<Objective["kind"], ObjectiveInteraction>;
}

// ===========================================
// Interact
// ===========================================

/**
 * Builds the `Interact` handler (GDD §6.2: "interact with objective").
 * It owns what every objective kind shares — who may act, what an action
 * costs, and whether the mission is now over — and hands the objective's
 * own effect to the interaction registered for its kind.
 *
 * ```
 *   unit missing ──► unit-not-on-map     down ──► unit-dead
 *   not a TDF unit ──► objective-not-yours
 *   a civilian group ──► cannot-interact (campaign arc §6.4)
 *   other side's phase ──► wrong-phase   no actions ──► no-action-points
 *   unknown objective ──► objective-not-found
 *   already done ──► objective-complete  (unless its kind is workedUntilEmpty)
 *          │
 *          ▼
 *   interactions[objective.kind](mission, objective, unit, tuning)
 *          ├── err ──► the interaction's rejection, nothing spent
 *          └── ok ──► ap − interactApCost, then the terminal check:
 *                     every objective done ──► outcome won, MissionEnded
 * ```
 *
 * The mission ends here rather than at the next turn boundary, so the
 * last spawner's destruction is the end of the mission (#328's
 * `missionOutcome` decides; this only asks it). Pure; draws nothing.
 */
export function createInteractHandler(
  tuning: ObjectiveTuning,
  interactions: Readonly<
    Record<Objective["kind"], ObjectiveInteraction>
  > = DEFAULT_OBJECTIVE_INTERACTIONS,
  rules: ObjectiveRulesTable = OBJECTIVE_RULES,
): TacticalHandler<InteractCommand> {
  return (mission, command) => {
    const { unitId, objectiveId } = command.payload;
    const unit = mission.units.find((candidate) => candidate.id === unitId);
    if (unit === undefined) {
      return err({ kind: "unit-not-on-map", unitId });
    }
    if (unit.hp <= 0) {
      return err({ kind: "unit-dead", unitId });
    }
    // Objectives are the player's (GDD §6.3). Without this a bug in its
    // own phase satisfies the phase check and can plant charges on its
    // own hive, winning the mission for the player (#434). If M3 ever
    // gives a side its own objectives, the eligible team moves onto the
    // interaction, beside its effect.
    if (unit.team !== "tdf") {
      return err({ kind: "objective-not-yours", unitId });
    }
    // Only the force works objectives (campaign arc §6.4): a civilian
    // group freeing another would empty a town without a squad in it.
    if (isCivilian(unit)) {
      return err({ kind: "cannot-interact", unitId });
    }
    if (unit.team !== TEAM_FOR_PHASE[mission.phase]) {
      return err({ kind: "wrong-phase", unitId });
    }
    if (unit.ap < tuning.interactApCost) {
      return err({ kind: "no-action-points", unitId });
    }
    const objective = mission.objectives.find(
      (candidate) => candidate.id === objectiveId,
    );
    if (objective === undefined) {
      return err({ kind: "objective-not-found", objectiveId });
    }
    if (!objectiveWorkable(objective, rules)) {
      return err({ kind: "objective-complete", objectiveId });
    }
    const worked = interactions[objective.kind](
      mission,
      objective,
      unit,
      tuning,
    );
    if (!worked.ok) {
      return worked;
    }
    const billed: TacticalState = {
      ...worked.value.state,
      units: worked.value.state.units.map((candidate) =>
        candidate.id === unitId
          ? { ...candidate, ap: candidate.ap - tuning.interactApCost }
          : candidate,
      ),
    };
    return ok(endIfOver(billed, worked.value.events));
  };
}

// ===========================================
// Reach
// ===========================================

/** An objective a unit can work from where it stands. */
export interface ReachableObjective {
  readonly objective: Objective;
  /** What the unit would work: the kind's `reachable` target. */
  readonly target: ObjectiveTarget;
  /**
   * The same target as `target`.
   *
   * @deprecated Read `target`. Kept while the HUD migrates to the
   *   objective presentation table (ADR 0013 §2.3); named for the only
   *   kind that could be worked when it was added.
   */
  readonly spawner: ObjectiveTarget;
  /** Manhattan tiles between the unit and the target. */
  readonly distance: number;
}

/**
 * The objectives the unit could work right now, nearest first. This is
 * the `Interact` handler's own precondition set asked as a question, the
 * way `previewAttack` answers for `Attack`: a HUD that offers only what
 * this returns can never offer a command the handler refuses, and can
 * never hide one it would accept.
 *
 * ```
 *   unit missing, down, not TDF, a civilian group,
 *     off-phase, out of actions                  ──► []
 *   objective complete, kind not workedUntilEmpty ──► skipped
 *   kind has no reachable target, or it is gone  ──► skipped
 *   manhattan(unit, nearest target tile) > interactRange ──► skipped
 *   otherwise ──► { objective, target, distance }, nearest first
 * ```
 *
 * The kind's rules say what its target is for this unit (ADR 0013
 * §2.3, `ObjectiveRules.reachable`): a spawner while it stands, nothing
 * for a defence, which is held rather than worked, the trapped group
 * nearest the unit for a rescue, the dropped specimen nearest a squad
 * with free hands for a capture, and a wreck's nearest tile for a squad
 * that may still work it this turn. A failed objective whose target
 * still stands is still offered, as the handler still accepts it: the
 * charges still wreck the target, though the objective stays failed.
 *
 * Ties keep `objectives` order, so the same mission always suggests the
 * same objective: a squad beside both a trapped group and a wreck
 * (#1179) is offered first whichever of the two the mission lists
 * first, and the wheel lists the other after it. Pure; reads only its
 * arguments.
 */
export function reachableObjectives(
  mission: TacticalState,
  unitId: UnitId,
  tuning: ObjectiveTuning,
  rules: ObjectiveRulesTable = OBJECTIVE_RULES,
): readonly ReachableObjective[] {
  const unit = mission.units.find((candidate) => candidate.id === unitId);
  if (
    unit === undefined ||
    unit.hp <= 0 ||
    unit.team !== "tdf" ||
    isCivilian(unit) ||
    unit.team !== TEAM_FOR_PHASE[mission.phase] ||
    unit.ap < tuning.interactApCost
  ) {
    return [];
  }
  const reachable: ReachableObjective[] = [];
  for (const objective of mission.objectives) {
    if (!objectiveWorkable(objective, rules)) {
      continue;
    }
    const target = objectiveRulesFor(objective, rules).reachable?.(
      objective,
      mission,
      unit,
    );
    if (target === undefined) {
      continue;
    }
    // To the target's nearest tile: any face of the 3×3 hive core.
    const distance = manhattanDistance(
      unit.pos,
      nearestFootprintTile(target.pos, target.footprint ?? 1, unit.pos),
    );
    if (distance <= tuning.interactRange) {
      reachable.push({ objective, target, spawner: target, distance });
    }
  }
  return reachable.sort((a, b) => a.distance - b.distance);
}

// ===========================================
// Extract
// ===========================================

/**
 * Builds the `Extract` handler (GDD §6.3: missions end on objective
 * completion, full extraction, or squad wipe). A TDF unit standing on an
 * extraction tile leaves the map: it moves out of `units` into
 * `extracted`, exactly as it stood, so nothing can shoot it afterwards
 * and the resolver (#330) still knows what came home. When it was the
 * last one standing the mission ends here.
 *
 * ```
 *   unit missing ──► unit-not-on-map     down ──► unit-dead
 *   a bug ──► not-extractable            other side's phase ──► wrong-phase
 *   a trapped group ──► unit-trapped (campaign arc §6.4)
 *   no actions ──► no-action-points      off the zone ──► not-in-extraction-zone
 *          │
 *          ▼
 *   units − unit, extracted + unit, UnitExtracted { remaining }
 *   each objective's onExtracted (a rescue counting a group aboard)
 *   nobody of the force left standing ──► outcome, MissionEnded
 * ```
 *
 * A civilian group boards like a squad (campaign arc §6.4); its
 * objective hears of it through `onExtracted` before the terminal
 * check, so the group that makes the half is counted in the outcome.
 *
 * Pure; draws nothing.
 */
export function createExtractHandler(
  tuning: ObjectiveTuning,
  rules: ObjectiveRulesTable = OBJECTIVE_RULES,
): TacticalHandler<ExtractCommand> {
  return (mission, command) => {
    const { unitId } = command.payload;
    const unit = mission.units.find((candidate) => candidate.id === unitId);
    if (unit === undefined) {
      return err({ kind: "unit-not-on-map", unitId });
    }
    if (unit.hp <= 0) {
      return err({ kind: "unit-dead", unitId });
    }
    // A bug cannot board, and neither can a deployed turret (#1138): it
    // is equipment the force leaves behind, not a passenger.
    if (unit.team !== "tdf" || isAutonomous(unit)) {
      return err({ kind: "not-extractable", unitId });
    }
    // Boarding is free by default, so a group's empty action points would
    // not stop it: a trapped group must be freed first (campaign arc §6.4).
    if (isTrapped(unit)) {
      return err({ kind: "unit-trapped", unitId });
    }
    if (unit.team !== TEAM_FOR_PHASE[mission.phase]) {
      return err({ kind: "wrong-phase", unitId });
    }
    if (unit.ap < tuning.extractApCost) {
      return err({ kind: "no-action-points", unitId });
    }
    if (!mission.extraction.some((tile) => sameTile(tile, unit.pos))) {
      return err({ kind: "not-in-extraction-zone", unitId });
    }

    const left: Unit = { ...unit, ap: unit.ap - tuning.extractApCost };
    const units = mission.units.filter((candidate) => candidate.id !== unitId);
    const pulled: TacticalState = {
      ...mission,
      units,
      extracted: [...mission.extracted, left],
    };
    const events: TacticalEvent[] = [
      {
        type: UNIT_EXTRACTED,
        payload: { unitId, remaining: standingCount(units) },
      },
    ];
    // Each objective as it now stands: an earlier one's hook may have
    // replaced the list.
    let counted = pulled;
    for (const { id } of pulled.objectives) {
      const objective = counted.objectives.find((o) => o.id === id);
      const heard =
        objective === undefined
          ? undefined
          : objectiveRulesFor(objective, rules).onExtracted?.(
              objective,
              counted,
              left,
            );
      if (heard !== undefined) {
        counted = heard.state;
        events.push(...heard.events);
      }
    }
    return ok(endIfOver(counted, events));
  };
}

// ===========================================
// Helpers
// ===========================================

/**
 * Members of the force still standing on the map (`isStandingForce`):
 * squads and mechs only, so a civilian group waiting to board, a
 * deployed turret or a generator never reads as somebody left to come
 * home.
 */
function standingCount(units: readonly Unit[]): number {
  return units.filter(isStandingForce).length;
}

/** True when both coordinates name the same tile, level included. */
function sameTile(a: TileCoord, b: TileCoord): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

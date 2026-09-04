import { err, ok } from "../../core/model/result";
import { manhattanDistance } from "../../core/service/grid-math";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { ExtractCommand } from "../model/extract-command";
import type { InteractCommand } from "../model/interact-command";
import type { ObjectiveTuning } from "../model/objective-tuning";
import type { TacticalEvent } from "../model/tactical-event";
import type {
  TacticalHandler,
  TacticalOutcome,
} from "../model/tactical-handler";
import type { Objective, TacticalState } from "../model/tactical-state";
import { TEAM_FOR_PHASE } from "../model/tactical-state";
import type { Unit } from "../model/unit";
import { UNIT_EXTRACTED } from "../model/unit-extracted-event";
import { endIfOver } from "./mission-end-service";
import { damageSpawner } from "./spawner-damage-service";

// ===========================================
// Objective kinds
// ===========================================

/**
 * What one objective kind does when a unit works it. The `Interact`
 * handler has already checked the unit and found the objective open, so
 * an interaction only validates its own preconditions, applies its own
 * effect and announces it; the handler bills the action point and asks
 * whether the mission is over.
 *
 * One per `Objective.kind`, the way `PhaseStep` is one per thing a phase
 * does: M3's rescue, defend and escort objectives add their own without
 * touching the handler or each other (ADR 0003 §2.2 — pure, no mutation).
 */
export type ObjectiveInteraction = (
  mission: TacticalState,
  objective: Objective,
  unit: Unit,
  tuning: ObjectiveTuning,
) => TacticalOutcome;

/**
 * `destroy-spawner`: the unit plants charges on the egg spawner the
 * objective tracks. The spawner loses `chargeDamage` hit points and, at
 * zero, is destroyed and its objective completed.
 *
 * ```
 *   target gone ──► objective-target-missing
 *   manhattan(unit, spawner) > interactRange ──► objective-out-of-reach
 *          │
 *          ▼
 *   spawner.hp − chargeDamage, SpawnerDamaged
 *   hp <= 0 ──► destroyed, objective complete, ObjectiveUpdated
 * ```
 */
export const plantCharges: ObjectiveInteraction = (
  mission,
  objective,
  unit,
  tuning,
) => {
  const spawner = mission.spawners.find(
    (candidate) => candidate.id === objective.targetId,
  );
  if (spawner === undefined || spawner.destroyed) {
    return err({
      kind: "objective-target-missing",
      objectiveId: objective.id,
      targetId: objective.targetId,
    });
  }
  const distance = manhattanDistance(unit.pos, spawner.pos);
  if (distance > tuning.interactRange) {
    return err({
      kind: "objective-out-of-reach",
      objectiveId: objective.id,
      distance,
      range: tuning.interactRange,
    });
  }

  return ok(damageSpawner(mission, spawner.id, tuning.chargeDamage, unit.id));
};

/** The interaction each objective kind ships with (GDD §6.3: M2 clears egg spawners). */
export const DEFAULT_OBJECTIVE_INTERACTIONS: Readonly<
  Record<Objective["kind"], ObjectiveInteraction>
> = {
  "destroy-spawner": plantCharges,
};

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
 *   other side's phase ──► wrong-phase   no actions ──► no-action-points
 *   unknown objective ──► objective-not-found
 *   already done ──► objective-complete
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
    if (objective.complete) {
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
 *   no actions ──► no-action-points      off the zone ──► not-in-extraction-zone
 *          │
 *          ▼
 *   units − unit, extracted + unit, UnitExtracted { remaining }
 *   nobody left standing ──► outcome extracted, MissionEnded
 * ```
 *
 * Pure; draws nothing.
 */
export function createExtractHandler(
  tuning: ObjectiveTuning,
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
    if (unit.team !== "tdf") {
      return err({ kind: "not-extractable", unitId });
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
    return ok(endIfOver(pulled, events));
  };
}

// ===========================================
// Helpers
// ===========================================

/** TDF units still standing on the map. */
function standingCount(units: readonly Unit[]): number {
  return units.filter((unit) => unit.team === "tdf" && unit.hp > 0).length;
}

/** True when both coordinates name the same tile, level included. */
function sameTile(a: TileCoord, b: TileCoord): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

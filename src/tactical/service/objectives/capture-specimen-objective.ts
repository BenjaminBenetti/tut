import type { BugSpeciesId } from "../../../content/model/bug-species-id";
import { err } from "../../../core/model/result";
import { canCarrySpecimen } from "../../model/carried-specimen";
import type { EquipmentCatalogue } from "../../model/equipment";
import { usesLeftOf } from "../../model/equipment";
import type { MissionSetupDeps } from "../../model/mission-setup-rule";
import { OBJECTIVE_UPDATED } from "../../model/objective-updated-event";
import type {
  ObjectiveInteraction,
  ObjectiveRules,
} from "../../model/objective-rules";
import type { PhaseStep } from "../../model/phase-step";
import type { TacticalEvent } from "../../model/tactical-event";
import type {
  CaptureSpecimenObjective,
  Objective,
  TacticalState,
} from "../../model/tactical-state";
import { OBJECTIVE_ID_PREFIX } from "../../model/tactical-state";
import type { Unit } from "../../model/unit";
import {
  droppedSpecimens,
  pickUpSpecimen,
  specimenCarriers,
  specimenExtracted,
} from "../specimen-service";

// ===========================================
// Types
// ===========================================

/** Where a capture stands (#1179): open, brought home, or out of reach for good. */
export type CaptureStatus = "open" | "complete" | "failed";

// ===========================================
// Status
// ===========================================

/**
 * The live answer for a capture (#1179, campaign arc §6.9). Complete the
 * moment a unit carrying the species has extracted. Failed once nobody
 * left on the map could still bring one home: no squad carries one, no
 * dropped one lies with a squad free to pick it up, and no squad with
 * free hands has a net left to throw.
 *
 * ```
 *   an extracted unit carries the species              ──► complete
 *   a living squad carries one                         ──► open
 *   one lies dropped, a squad has free hands           ──► open
 *   a squad with free hands has a net left             ──► open
 *   otherwise                                          ──► failed
 * ```
 *
 * Never flips back: squads do not come back to life and nets are not
 * refilled, so once nothing can bring a specimen home nothing will.
 *
 * @param objective - The capture.
 * @param mission - The mission.
 * @param nets - The catalogue that says which carried items are nets.
 * @returns Where it stands.
 */
export function captureStatus(
  objective: CaptureSpecimenObjective,
  mission: TacticalState,
  nets: EquipmentCatalogue,
): CaptureStatus {
  if (specimenExtracted(mission, objective.species)) {
    return "complete";
  }
  if (specimenCarriers(mission, objective.species).length > 0) {
    return "open";
  }
  const freeHands = mission.units.filter(
    (unit) =>
      unit.team === "tdf" &&
      unit.hp > 0 &&
      canCarrySpecimen(unit) &&
      unit.carrying === undefined,
  );
  if (
    freeHands.length > 0 &&
    droppedSpecimens(mission, objective.species).length > 0
  ) {
    return "open";
  }
  return freeHands.some((unit) => hasNetLeft(mission, unit, nets))
    ? "open"
    : "failed";
}

// ===========================================
// Setup
// ===========================================

/**
 * Adds an open capture objective for `species` to a mission being set
 * up (#1179): the story mission's setup rule calls this for Live
 * Specimen with `"lurker"`. Draws one objective id, so the objective is
 * named like every other (`"objective-3"`).
 *
 * @param state - The mission so far.
 * @param species - The species wanted alive.
 * @param deps - The setup's id generator.
 * @returns The mission with the objective appended.
 */
export function addCaptureObjective(
  state: TacticalState,
  species: BugSpeciesId,
  deps: Pick<MissionSetupDeps, "ids">,
): TacticalState {
  const objective: CaptureSpecimenObjective = {
    id: deps.ids.nextId(OBJECTIVE_ID_PREFIX),
    kind: "capture-specimen",
    species,
    complete: false,
    failed: false,
  };
  return { ...state, objectives: [...state.objectives, objective] };
}

// ===========================================
// Phase step
// ===========================================

/**
 * Mirrors the live status onto every capture objective's `complete` and
 * `failed` flags at each phase start, and announces a change through
 * `ObjectiveUpdated` so the log and the tracker see it (#1179), the way
 * a defence's step does. A flag never goes back, and the two are never
 * both set.
 *
 * @param nets - The catalogue that says which carried items are nets.
 * @returns The step.
 */
export function createCaptureStep(nets: EquipmentCatalogue): PhaseStep {
  return (mission) => {
    const events: TacticalEvent[] = [];
    const objectives = mission.objectives.map((objective): Objective => {
      if (objective.kind !== "capture-specimen") {
        return objective;
      }
      const status = captureStatus(objective, mission, nets);
      const complete =
        objective.complete ||
        (objective.failed !== true && status === "complete");
      const failed =
        objective.failed === true || (!complete && status === "failed");
      if (
        complete === objective.complete &&
        failed === (objective.failed ?? false)
      ) {
        return objective;
      }
      events.push({
        type: OBJECTIVE_UPDATED,
        payload: { objectiveId: objective.id, complete, failed },
      });
      return { ...objective, complete, failed };
    });
    return events.length === 0
      ? { state: mission, events: [] }
      : { state: { ...mission, objectives }, events };
  };
}

// ===========================================
// Interaction
// ===========================================

/**
 * `Interact` on a capture (#1179): pick up the dropped specimen of its
 * species nearest the squad, within the interact range. Throwing the net
 * is not an interaction: it is `UseEquipment` with the net.
 */
export const pickUpDroppedSpecimen: ObjectiveInteraction = (
  mission,
  objective,
  unit,
  tuning,
) => {
  if (objective.kind !== "capture-specimen") {
    return err({
      kind: "objective-not-interactive",
      objectiveId: objective.id,
    });
  }
  return pickUpSpecimen(
    mission,
    unit,
    objective.species,
    tuning.interactRange,
    objective.id,
  );
};

// ===========================================
// Rules
// ===========================================

/**
 * `capture-specimen` (#1179): take a bug of the objective's species
 * alive with the capture net and extract with it. Judged live by
 * `captureStatus`, mirrored onto the flags by its phase step, worked
 * only to pick up a specimen a fallen carrier dropped.
 *
 * ```
 *   complete / failed   captureStatus, live
 *   interaction         pickUpDroppedSpecimen
 *   phaseStep           createCaptureStep
 *   reachable           the first dropped specimen, while one lies
 *   marker              the same tile: it lies still, like a nest
 *   destination         the dropped specimen's tile, and the carriers
 *   tally               specimens home / one wanted
 *   resultFields        specimenCaptured, once it is home
 * ```
 *
 * @param nets - The catalogue that says which carried items are nets.
 * @returns The rules.
 */
export function createCaptureSpecimenObjective(
  nets: EquipmentCatalogue,
): ObjectiveRules<"capture-specimen"> {
  return {
    kind: "capture-specimen",
    /** Home: a unit carrying the species has extracted. */
    complete(objective, mission) {
      return captureStatus(objective, mission, nets) === "complete";
    },
    /** Out of reach: nobody on the map can bring one home now. */
    failed(objective, mission) {
      return captureStatus(objective, mission, nets) === "failed";
    },
    interaction: pickUpDroppedSpecimen,
    phaseStep: createCaptureStep(nets),
    /** The first dropped specimen of the species, where its carrier fell. */
    reachable(objective, mission) {
      const [dropped] = droppedSpecimens(mission, objective.species);
      return dropped === undefined
        ? undefined
        : { id: dropped.carrierId, pos: dropped.pos };
    },
    /** A dropped specimen's tile (#1173): it lies still, so its place stays known. */
    marker(objective, mission) {
      return droppedSpecimens(mission, objective.species)[0]?.pos;
    },
    /** Where a specimen lies, and who is carrying one home. */
    destination(objective, mission) {
      const position = droppedSpecimens(mission, objective.species)[0]?.pos;
      const carriers = specimenCarriers(mission, objective.species).map(
        (unit) => unit.id,
      );
      return {
        ...(position === undefined ? {} : { position }),
        ...(carriers.length === 0 ? {} : { targetIds: carriers }),
      };
    },
    /** One specimen wanted; one once it is home. */
    tally(objective, mission) {
      return {
        done: specimenExtracted(mission, objective.species) ? 1 : 0,
        total: 1,
      };
    },
    /** The species brought home, for the story's consequences; nothing until then. */
    resultFields(objective, mission) {
      return specimenExtracted(mission, objective.species)
        ? { specimenCaptured: objective.species }
        : {};
    },
  };
}

// ===========================================
// Helpers
// ===========================================

/** Whether the unit carries a net it has a use left of. */
function hasNetLeft(
  mission: TacticalState,
  unit: Unit,
  nets: EquipmentCatalogue,
): boolean {
  return (mission.templates[unit.templateId]?.equipment ?? []).some((id) => {
    const definition = nets.get(id);
    return definition?.kind === "net" && usesLeftOf(unit, definition) > 0;
  });
}

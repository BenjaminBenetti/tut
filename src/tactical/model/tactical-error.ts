import type { MissionOutcome } from "../../overworld/model/mission-result";

// ===========================================
// Tactical error
// ===========================================

/** Why a `Move` was refused (#325). Closed so the HUD can phrase each one. */
export type MoveRejection =
  | "empty-path"
  | "unit-down"
  | "wrong-phase"
  | "over-budget"
  | "unreachable"
  | "not-a-step";

/** Human-readable text per move rejection. */
const MOVE_REJECTION_TEXT: Readonly<Record<MoveRejection, string>> = {
  "empty-path": "the path is empty",
  "unit-down": "the unit is down",
  "wrong-phase": "it is not that side's phase",
  "over-budget": "the path is longer than its action points allow",
  unreachable: "a tile on the path cannot be entered",
  "not-a-step": "the path does not step from tile to tile",
};

/** Why a tactical command or mission start was rejected. Serializable. */
export type TacticalError =
  | { readonly kind: "no-active-mission" }
  | { readonly kind: "mission-active"; readonly missionId: string }
  | { readonly kind: "mission-not-found"; readonly missionId: string }
  | { readonly kind: "empty-deployment" }
  | { readonly kind: "unit-not-found"; readonly unitId: string }
  | {
      readonly kind: "illegal-move";
      readonly unitId: string;
      readonly reason: MoveRejection;
    }
  | { readonly kind: "mission-over"; readonly outcome: MissionOutcome }
  | { readonly kind: "invalid-loadout"; readonly mechId: string }
  | { readonly kind: "map-recipe"; readonly reason: string }
  | {
      readonly kind: "no-deploy-room";
      readonly unitId: string;
      readonly passClass: string;
    }
  | { readonly kind: "unit-not-on-map"; readonly unitId: string }
  | { readonly kind: "unit-dead"; readonly unitId: string }
  | { readonly kind: "wrong-phase"; readonly unitId: string }
  | { readonly kind: "no-action-points"; readonly unitId: string }
  | { readonly kind: "self-target"; readonly unitId: string }
  | { readonly kind: "friendly-target"; readonly targetId: string }
  | {
      readonly kind: "out-of-range";
      readonly distance: number;
      readonly range: number;
    }
  | { readonly kind: "no-line-of-sight"; readonly targetId: string }
  | { readonly kind: "no-charges"; readonly unitId: string }
  | { readonly kind: "charges-full"; readonly unitId: string }
  | { readonly kind: "no-reload"; readonly unitId: string }
  | { readonly kind: "objective-not-found"; readonly objectiveId: string }
  | { readonly kind: "objective-complete"; readonly objectiveId: string }
  | { readonly kind: "objective-not-yours"; readonly unitId: string }
  | {
      readonly kind: "objective-target-missing";
      readonly objectiveId: string;
      readonly targetId: string;
    }
  | {
      readonly kind: "objective-out-of-reach";
      readonly objectiveId: string;
      readonly distance: number;
      readonly range: number;
    }
  | { readonly kind: "not-in-extraction-zone"; readonly unitId: string }
  | { readonly kind: "not-extractable"; readonly unitId: string };

/** Human-readable text for a tactical error, for the status line and logs. */
export function describeTacticalError(error: TacticalError): string {
  switch (error.kind) {
    case "no-active-mission":
      return "No mission is in progress";
    case "mission-active":
      return `Mission "${error.missionId}" is already in progress`;
    case "mission-not-found":
      return `No mission "${error.missionId}" is on offer`;
    case "empty-deployment":
      return "A deployment needs at least one unit";
    case "unit-not-found":
      return `Unit "${error.unitId}" is not in the roster`;
    case "illegal-move":
      return `Unit "${error.unitId}" cannot make that move: ${MOVE_REJECTION_TEXT[error.reason]}`;
    case "mission-over":
      return `The mission is over: ${error.outcome}`;
    case "invalid-loadout":
      return `Mech "${error.mechId}" has a loadout that no longer validates`;
    case "map-recipe":
      return `The mission's map cannot be generated: ${error.reason}`;
    case "no-deploy-room":
      return `No ${error.passClass} tile is left in the deploy zone for "${error.unitId}"`;
    case "unit-not-on-map":
      return `Unit "${error.unitId}" is not in this mission`;
    case "unit-dead":
      return `Unit "${error.unitId}" is dead`;
    case "wrong-phase":
      return `Unit "${error.unitId}" cannot act in this phase`;
    case "no-action-points":
      return `Unit "${error.unitId}" has no action points left`;
    case "self-target":
      return `Unit "${error.unitId}" cannot attack itself`;
    case "friendly-target":
      return `Unit "${error.targetId}" is on the same side`;
    case "out-of-range":
      return `Target is ${String(error.distance)} tiles away; weapon reaches ${String(error.range)}`;
    case "no-line-of-sight":
      return `No line of sight to "${error.targetId}"`;
    case "no-charges":
      return `Unit "${error.unitId}" is out of charges; reload or vent first`;
    case "charges-full":
      return `Unit "${error.unitId}" is already fully loaded`;
    case "no-reload":
      return `Unit "${error.unitId}" has nothing to reload`;
    case "objective-not-found":
      return `No objective "${error.objectiveId}" is in this mission`;
    case "objective-complete":
      return `Objective "${error.objectiveId}" is already done`;
    case "objective-not-yours":
      return `Unit "${error.unitId}" is not on the side whose objective that is`;
    case "objective-target-missing":
      return `Objective "${error.objectiveId}" tracks unknown target "${error.targetId}"`;
    case "objective-out-of-reach":
      return `Objective is ${String(error.distance)} tiles away; charges reach ${String(error.range)}`;
    case "not-in-extraction-zone":
      return `Unit "${error.unitId}" is not standing in the extraction zone`;
    case "not-extractable":
      return `Unit "${error.unitId}" cannot leave through the extraction zone`;
  }
}

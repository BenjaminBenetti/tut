import type { CommandError } from "../../core/model/command-error";
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
  | {
      readonly kind: "oversized-deployment";
      readonly size: number;
      readonly max: number;
    }
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
  | { readonly kind: "target-destroyed"; readonly targetId: string }
  | { readonly kind: "no-charges"; readonly unitId: string }
  | { readonly kind: "no-such-weapon"; readonly unitId: string }
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
  | { readonly kind: "no-objective-in-reach"; readonly unitId: string }
  | { readonly kind: "not-in-extraction-zone"; readonly unitId: string }
  | { readonly kind: "not-extractable"; readonly unitId: string }
  | { readonly kind: "mission-not-over"; readonly missionId: string }
  | {
      readonly kind: "mission-mismatch";
      readonly expected: string;
      readonly active: string;
    }
  | { readonly kind: "unhandled-command"; readonly commandType: string };

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
    case "oversized-deployment":
      return `A deployment carries at most ${String(error.max)} units, but ${String(error.size)} were sent`;
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
    case "target-destroyed":
      return `Egg spawner "${error.targetId}" is already destroyed`;
    case "no-charges":
      return `Unit "${error.unitId}" is out of charges; reload or vent first`;
    case "no-such-weapon":
      return `Unit "${error.unitId}" is not carrying that weapon`;
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
    case "no-objective-in-reach":
      return `Unit "${error.unitId}" has no objective within reach`;
    case "not-in-extraction-zone":
      return `Unit "${error.unitId}" is not standing in the extraction zone`;
    case "not-extractable":
      return `Unit "${error.unitId}" cannot leave through the extraction zone`;
    case "mission-not-over":
      return `Mission "${error.missionId}" is still being fought`;
    case "mission-mismatch":
      return `Mission "${error.expected}" was expected but "${error.active}" is in progress`;
    case "unhandled-command":
      return `No rule handles "${error.commandType}" in this mission`;
  }
}

// ===========================================
// Carrying the error through a dispatch
// ===========================================

/**
 * Every kind in the union, as a runtime set.
 *
 * Typed as a total `Record` on purpose: adding a member to
 * `TacticalError` without adding it here is a compile error, so the set
 * cannot silently fall behind the union. A kind missing from it would
 * not throw -- `tacticalCause` would simply return `undefined` and the
 * status line would quietly go back to showing raw ids, which is the
 * defect this whole path exists to remove.
 */
export const TACTICAL_ERROR_KINDS: Readonly<
  Record<TacticalError["kind"], true>
> = {
  "no-active-mission": true,
  "mission-active": true,
  "mission-not-found": true,
  "empty-deployment": true,
  "oversized-deployment": true,
  "unit-not-found": true,
  "illegal-move": true,
  "mission-over": true,
  "invalid-loadout": true,
  "map-recipe": true,
  "no-deploy-room": true,
  "unit-not-on-map": true,
  "unit-dead": true,
  "wrong-phase": true,
  "no-action-points": true,
  "self-target": true,
  "friendly-target": true,
  "out-of-range": true,
  "no-line-of-sight": true,
  "target-destroyed": true,
  "no-charges": true,
  "no-such-weapon": true,
  "charges-full": true,
  "no-reload": true,
  "objective-not-found": true,
  "objective-complete": true,
  "objective-not-yours": true,
  "objective-target-missing": true,
  "objective-out-of-reach": true,
  "no-objective-in-reach": true,
  "not-in-extraction-zone": true,
  "not-extractable": true,
  "mission-not-over": true,
  "mission-mismatch": true,
  "unhandled-command": true,
};

/**
 * The command error for a tactical refusal: its kind as the code, its
 * sentence as the message, and the refusal itself as the cause.
 *
 * One function rather than a `commandError(e.kind, describeTacticalError(e))`
 * at each boundary, because that is how the id leak got in (#1035): every
 * site flattened the typed error independently, so the UI could only ever
 * receive the sentence that `describeTacticalError` had already built --
 * ids and all. With the cause attached here, a refusal added tomorrow
 * carries its data to the screen without anyone remembering to.
 *
 * The code is the kind by construction, which is what the hand-written
 * sites did too; `NO_ACTIVE_MISSION` and the other exported codes stay
 * equal to their kinds, and a test pins that.
 */
export function tacticalRefusal<TError extends TacticalError>(
  error: TError,
): CommandError<TError["kind"], TacticalError> {
  return {
    code: error.kind,
    message: describeTacticalError(error),
    cause: error,
  };
}

/**
 * The tactical refusal a command error is carrying, or `undefined` when
 * it is carrying something else -- an overworld refusal, a replay loaded
 * from a save written before `cause` existed, or nothing at all.
 *
 * This is how a caller gets the typed error back without `core` knowing
 * what a `TacticalError` is: the domain that owns the union narrows it.
 * Checked at runtime rather than asserted, because `cause` arrives as
 * `unknown` and a save is not a trusted source.
 */
export function tacticalCause(error: {
  readonly cause?: unknown;
}): TacticalError | undefined {
  const cause = error.cause;
  if (typeof cause !== "object" || cause === null || !("kind" in cause)) {
    return undefined;
  }
  const { kind } = cause as { readonly kind: unknown };
  return typeof kind === "string" && Object.hasOwn(TACTICAL_ERROR_KINDS, kind)
    ? (cause as TacticalError)
    : undefined;
}

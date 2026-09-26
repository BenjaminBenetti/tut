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

/**
 * Why a `Tunnel`, `Surface` or `Burrow` was refused (#1179). Closed so
 * the HUD can phrase each one.
 */
export type BurrowRejection =
  | "not-a-burrower"
  | "already-burrowed"
  | "not-burrowed"
  | "cooldown"
  | "hard-ground"
  | "no-footing"
  | "tile-held";

/** Human-readable text per burrow rejection. */
const BURROW_REJECTION_TEXT: Readonly<Record<BurrowRejection, string>> = {
  "not-a-burrower": "it cannot dig",
  "already-burrowed": "it is already under the ground",
  "not-burrowed": "it is not under the ground",
  cooldown: "it came up too recently to dig again",
  "hard-ground": "the ground there is too hard to dig through",
  "no-footing": "there is no footing on the ground above",
  "tile-held": "something is standing on the ground above",
};

/** Why a tactical command or mission start was rejected. Serializable. */
export type TacticalError =
  | { readonly kind: "systems-unavailable"; readonly reason: string }
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
  | {
      readonly kind: "illegal-burrow";
      readonly unitId: string;
      readonly reason: BurrowRejection;
    }
  | { readonly kind: "unit-burrowed"; readonly unitId: string }
  | { readonly kind: "target-burrowed"; readonly targetId: string }
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
      /** Tiles to the target, in three dimensions (#1119). */
      readonly distance: number;
      /** The weapon's reach for this shot, height bonus included. */
      readonly range: number;
    }
  | { readonly kind: "no-line-of-sight"; readonly targetId: string }
  | { readonly kind: "target-destroyed"; readonly targetId: string }
  | { readonly kind: "no-charges"; readonly unitId: string }
  | { readonly kind: "no-such-weapon"; readonly unitId: string }
  | { readonly kind: "no-area-weapon"; readonly unitId: string }
  | {
      readonly kind: "no-such-tile";
      readonly x: number;
      readonly y: number;
      readonly z: number;
    }
  | { readonly kind: "no-aim"; readonly unitId: string }
  | {
      readonly kind: "tile-out-of-sight";
      readonly x: number;
      readonly y: number;
      readonly z: number;
    }
  | { readonly kind: "charges-full"; readonly unitId: string }
  | { readonly kind: "no-reload"; readonly unitId: string }
  | {
      readonly kind: "no-equipment";
      readonly unitId: string;
      readonly equipmentId: string;
    }
  | {
      readonly kind: "equipment-spent";
      readonly unitId: string;
      readonly equipmentId: string;
    }
  | { readonly kind: "radar-out-of-reach"; readonly range: number }
  | { readonly kind: "radar-tile-blocked" }
  // A medkit or a repair kit with nobody of its side and make to mend in
  // its footprint (#1138): a use that would spend the kit on nothing.
  | {
      readonly kind: "nothing-to-heal";
      readonly unitId: string;
      readonly equipmentId: string;
    }
  // A turret's site (#1138): the radar's two refusals, worded for a gun.
  | { readonly kind: "turret-out-of-reach"; readonly range: number }
  | { readonly kind: "turret-tile-blocked" }
  // A unit nobody orders (#1138): a deployed turret fires by rule and
  // refuses every command that asks it to act.
  | { readonly kind: "takes-no-orders"; readonly unitId: string }
  // A civilian group still shut in its building (campaign arc §6.4):
  // it waits for a squad or mech to free it with Interact.
  | { readonly kind: "unit-trapped"; readonly unitId: string }
  // Only the force works objectives (campaign arc §6.4): a civilian
  // group is who the squad came for, not a hand to plant charges.
  | { readonly kind: "cannot-interact"; readonly unitId: string }
  | { readonly kind: "objective-not-found"; readonly objectiveId: string }
  | { readonly kind: "objective-complete"; readonly objectiveId: string }
  // Held, not worked (#1175): a defence has nothing to interact with.
  | { readonly kind: "objective-not-interactive"; readonly objectiveId: string }
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
  // Stripping a wreck (arc §6.6): one turn's work a turn, and nothing
  // left to work once its parts are loose.
  | {
      readonly kind: "objective-worked-this-turn";
      readonly objectiveId: string;
    }
  | { readonly kind: "wreck-stripped"; readonly objectiveId: string }
  // Sealing the tunnels (arc §6.7): one charge a mouth, and none to set
  // while every open mouth already has one burning.
  | { readonly kind: "tunnels-charged"; readonly objectiveId: string }
  // Stripping a tech carcass (#1171): only an infantry squad can, only
  // once, and only from beside it.
  | { readonly kind: "not-a-squad"; readonly unitId: string }
  | { readonly kind: "unknown-carcass"; readonly carcassId: string }
  | { readonly kind: "carcass-already-harvested"; readonly carcassId: string }
  | {
      readonly kind: "carcass-out-of-reach";
      readonly carcassId: string;
      readonly distance: number;
      readonly range: number;
    }
  // The capture net and the specimens it takes (#1179): a net needs a
  // spotted bug next to the squad that a capture objective wants and
  // that is worn down far enough; a specimen needs free hands to carry.
  | {
      readonly kind: "no-capture-target";
      readonly x: number;
      readonly y: number;
      readonly z: number;
    }
  | { readonly kind: "specimen-not-wanted"; readonly targetId: string }
  | {
      readonly kind: "target-too-healthy";
      readonly targetId: string;
      readonly hp: number;
      /** The most hit points the net still holds at. */
      readonly threshold: number;
    }
  | { readonly kind: "already-carrying"; readonly unitId: string }
  | { readonly kind: "cannot-carry"; readonly unitId: string }
  | { readonly kind: "not-in-extraction-zone"; readonly unitId: string }
  | { readonly kind: "not-extractable"; readonly unitId: string }
  | { readonly kind: "mission-not-over"; readonly missionId: string }
  | { readonly kind: "not-player-phase" }
  | {
      readonly kind: "mission-mismatch";
      readonly expected: string;
      readonly active: string;
    }
  | { readonly kind: "unhandled-command"; readonly commandType: string }
  // The development tools' placement (#1136): a dev-only command that a
  // production build refuses outright, and three ways a placement can
  // fail on the map.
  | { readonly kind: "debug-disabled" }
  | {
      readonly kind: "unknown-unit-type";
      readonly unitKind: string;
      readonly id: string;
    }
  | {
      readonly kind: "tile-blocked";
      readonly x: number;
      readonly y: number;
      readonly z: number;
    }
  | {
      readonly kind: "tile-occupied";
      readonly x: number;
      readonly y: number;
      readonly z: number;
    };

/** Human-readable text for a tactical error, for the status line and logs. */
export function describeTacticalError(error: TacticalError): string {
  switch (error.kind) {
    case "systems-unavailable":
      return error.reason;
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
    case "illegal-burrow":
      return `Unit "${error.unitId}" cannot do that: ${BURROW_REJECTION_TEXT[error.reason]}`;
    case "unit-burrowed":
      return `Unit "${error.unitId}" is under the ground`;
    case "target-burrowed":
      return `Unit "${error.targetId}" is under the ground`;
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
    case "no-area-weapon":
      return `Unit "${error.unitId}" has no weapon that can be fired at the ground`;
    case "no-such-tile":
      return `There is no tile at (${String(error.x)}, ${String(error.y)}, ${String(error.z)})`;
    case "no-aim":
      return `Unit "${error.unitId}" was told to fire at nothing, or at two things`;
    case "tile-out-of-sight":
      return `No line of sight to the tile at (${String(error.x)}, ${String(error.y)}, ${String(error.z)})`;
    case "charges-full":
      return `Unit "${error.unitId}" is already fully loaded`;
    case "no-reload":
      return `Unit "${error.unitId}" has nothing to reload`;
    case "no-equipment":
      return `Unit "${error.unitId}" does not carry "${error.equipmentId}"`;
    case "equipment-spent":
      return `Unit "${error.unitId}" has no uses of "${error.equipmentId}" left`;
    case "radar-out-of-reach":
      return `Deploy radar within ${String(error.range)} tiles of the squad`;
    case "radar-tile-blocked":
      return "Deploy radar on a free tile within reach that the squad can walk to";
    case "nothing-to-heal":
      return `Unit "${error.unitId}" has nothing "${error.equipmentId}" can mend there`;
    case "turret-out-of-reach":
      return `Deploy the turret within ${String(error.range)} tiles of the squad`;
    case "turret-tile-blocked":
      return "Deploy the turret on a free tile within reach that the squad can walk to";
    case "takes-no-orders":
      return `Unit "${error.unitId}" takes no orders; it fires on its own`;
    case "unit-trapped":
      return `Unit "${error.unitId}" is trapped; a squad or mech beside it must free it first`;
    case "cannot-interact":
      return `Unit "${error.unitId}" cannot work objectives; a squad or mech must`;
    case "objective-not-found":
      return `No objective "${error.objectiveId}" is in this mission`;
    case "objective-complete":
      return `Objective "${error.objectiveId}" is already done`;
    case "objective-not-interactive":
      return `Objective "${error.objectiveId}" is held, not worked`;
    case "objective-not-yours":
      return `Unit "${error.unitId}" is not on the side whose objective that is`;
    case "objective-target-missing":
      return `Objective "${error.objectiveId}" tracks unknown target "${error.targetId}"`;
    case "objective-out-of-reach":
      return `Objective is ${String(error.distance)} tiles away; charges reach ${String(error.range)}`;
    case "no-objective-in-reach":
      return `Unit "${error.unitId}" has no objective within reach`;
    case "objective-worked-this-turn":
      return `Objective "${error.objectiveId}" has already been worked this turn`;
    case "wreck-stripped":
      return `Objective "${error.objectiveId}" is stripped; its parts only need carrying out`;
    case "tunnels-charged":
      return `Objective "${error.objectiveId}" has a charge burning on every open tunnel mouth`;
    case "not-a-squad":
      return `Unit "${error.unitId}" is not an infantry squad; only a squad can harvest`;
    case "unknown-carcass":
      return `No tech carcass "${error.carcassId}" is in this mission`;
    case "carcass-already-harvested":
      return `Tech carcass "${error.carcassId}" has already been stripped`;
    case "carcass-out-of-reach":
      return `Tech carcass is ${String(error.distance)} tiles away; harvesting reaches ${String(error.range)}`;
    case "no-capture-target":
      return `There is no bug to net at (${String(error.x)}, ${String(error.y)}, ${String(error.z)})`;
    case "specimen-not-wanted":
      return `Nobody asked for "${error.targetId}" alive`;
    case "target-too-healthy":
      return `"${error.targetId}" has ${String(error.hp)} hit points; the net holds at ${String(error.threshold)} or less`;
    case "already-carrying":
      return `Unit "${error.unitId}" is already carrying a specimen`;
    case "cannot-carry":
      return `Unit "${error.unitId}" cannot carry a specimen; only an infantry squad can`;
    case "not-in-extraction-zone":
      return `Unit "${error.unitId}" is not standing in the extraction zone`;
    case "not-extractable":
      return `Unit "${error.unitId}" cannot leave through the extraction zone`;
    case "mission-not-over":
      return `Mission "${error.missionId}" is still being fought`;
    case "not-player-phase":
      return "The mission cannot be left during the bug phase";
    case "mission-mismatch":
      return `Mission "${error.expected}" was expected but "${error.active}" is in progress`;
    case "unhandled-command":
      return `No rule handles "${error.commandType}" in this mission`;
    case "debug-disabled":
      return "The development tools are not available in this build";
    case "unknown-unit-type":
      return `No ${error.unitKind} of type "${error.id}" can be placed`;
    case "tile-blocked":
      return `A unit of that size cannot stand at (${String(error.x)}, ${String(error.y)}, ${String(error.z)})`;
    case "tile-occupied":
      return `Something already stands at (${String(error.x)}, ${String(error.y)}, ${String(error.z)})`;
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
  "systems-unavailable": true,
  "no-active-mission": true,
  "mission-active": true,
  "mission-not-found": true,
  "empty-deployment": true,
  "oversized-deployment": true,
  "unit-not-found": true,
  "illegal-move": true,
  "illegal-burrow": true,
  "unit-burrowed": true,
  "target-burrowed": true,
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
  "no-area-weapon": true,
  "no-such-tile": true,
  "no-aim": true,
  "tile-out-of-sight": true,
  "charges-full": true,
  "no-reload": true,
  "no-equipment": true,
  "equipment-spent": true,
  "radar-out-of-reach": true,
  "radar-tile-blocked": true,
  "nothing-to-heal": true,
  "turret-out-of-reach": true,
  "turret-tile-blocked": true,
  "takes-no-orders": true,
  "unit-trapped": true,
  "cannot-interact": true,
  "objective-not-found": true,
  "objective-complete": true,
  "objective-not-interactive": true,
  "objective-not-yours": true,
  "objective-target-missing": true,
  "objective-out-of-reach": true,
  "no-objective-in-reach": true,
  "objective-worked-this-turn": true,
  "wreck-stripped": true,
  "tunnels-charged": true,
  "not-a-squad": true,
  "unknown-carcass": true,
  "carcass-already-harvested": true,
  "carcass-out-of-reach": true,
  "no-capture-target": true,
  "specimen-not-wanted": true,
  "target-too-healthy": true,
  "already-carrying": true,
  "cannot-carry": true,
  "not-in-extraction-zone": true,
  "not-extractable": true,
  "mission-not-over": true,
  "not-player-phase": true,
  "mission-mismatch": true,
  "unhandled-command": true,
  "debug-disabled": true,
  "unknown-unit-type": true,
  "tile-blocked": true,
  "tile-occupied": true,
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

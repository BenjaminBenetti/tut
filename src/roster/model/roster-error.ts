import type { LoadoutError } from "./loadout-error";
import type { MechId } from "./mech";
import type { SquadId } from "./squad";
import type { SquadTypeId } from "./squad-type";

// ===========================================
// Errors
// ===========================================

/** A hire named a squad type the catalogue lacks. */
export interface UnknownSquadTypeError {
  readonly code: "unknown-squad-type";
  readonly typeId: SquadTypeId;
}

/** A reinforcement named a squad not in the roster. */
export interface UnknownSquadError {
  readonly code: "unknown-squad";
  readonly squadId: SquadId;
}

/**
 * A reinforcement asked for a soldier count that is not a positive
 * whole number or exceeds what the squad is missing.
 */
export interface InvalidReinforcementError {
  readonly code: "invalid-reinforcement";
  readonly squadId: SquadId;
  /** Soldiers the command asked for. */
  readonly requested: number;
  /** Soldiers the squad can still take, `maxStrength − strength`. */
  readonly missing: number;
}

/** A build or delete named a loadout that is not saved. */
export interface UnknownLoadoutError {
  readonly code: "unknown-loadout";
  readonly name: string;
}

/** A loadout failed validation; `errors` lists every reason. */
export interface InvalidLoadoutError {
  readonly code: "invalid-loadout";
  readonly name: string;
  readonly errors: readonly LoadoutError[];
}

/** A repair named a mech not in the roster. */
export interface UnknownMechError {
  readonly code: "unknown-mech";
  readonly mechId: MechId;
}

/** A repair was asked for a mech with no damage. */
export interface MechUndamagedError {
  readonly code: "mech-undamaged";
  readonly mechId: MechId;
}

/** A squad, mech or loadout name was empty. */
export interface InvalidNameError {
  readonly code: "invalid-name";
  readonly name: string;
}

/** The treasury could not cover a purchase. Mirrors the economy's error. */
export interface RosterInsufficientCreditsError {
  readonly code: "insufficient-credits";
  readonly required: number;
  readonly available: number;
}

/**
 * Why a roster command was rejected. Plain data discriminated on `code`
 * so a handler can fold it into a `CommandError` and a screen can point
 * at the field concerned.
 *
 * | code                     | command                    |
 * |--------------------------|----------------------------|
 * | `unknown-squad-type`     | HireSquad                  |
 * | `unknown-squad`          | ReinforceSquad             |
 * | `invalid-reinforcement`  | ReinforceSquad             |
 * | `unknown-mech`           | RepairMech                 |
 * | `mech-undamaged`         | RepairMech                 |
 * | `unknown-loadout`        | BuildMech, DeleteLoadout   |
 * | `invalid-loadout`        | SaveLoadout, BuildMech     |
 * | `invalid-name`           | HireSquad, SaveLoadout, BuildMech |
 * | `insufficient-credits`   | HireSquad, ReinforceSquad, BuildMech, RepairMech |
 */
export type RosterError =
  | UnknownSquadTypeError
  | UnknownSquadError
  | InvalidReinforcementError
  | UnknownMechError
  | MechUndamagedError
  | UnknownLoadoutError
  | InvalidLoadoutError
  | InvalidNameError
  | RosterInsufficientCreditsError;

/** The `code` tag of a `RosterError`. */
export type RosterErrorCode = RosterError["code"];

// ===========================================
// Messages
// ===========================================

/** One human-readable sentence for a roster error, for logs and command errors. */
export function describeRosterError(error: RosterError): string {
  switch (error.code) {
    case "unknown-squad-type":
      return `No squad type "${error.typeId}" exists.`;
    case "unknown-squad":
      return `No squad "${error.squadId}" is in the roster.`;
    case "invalid-reinforcement":
      return `Cannot add ${error.requested} soldiers to squad "${error.squadId}"; it is missing ${error.missing}.`;
    case "unknown-mech":
      return `No mech "${error.mechId}" is in the roster.`;
    case "mech-undamaged":
      return `Mech "${error.mechId}" has no damage to repair.`;
    case "unknown-loadout":
      return `No loadout named "${error.name}" is saved.`;
    case "invalid-loadout":
      return `Loadout "${error.name}" is not buildable: ${error.errors.map((e) => e.detail).join(" ")}`;
    case "invalid-name":
      return `"${error.name}" is not a valid name.`;
    case "insufficient-credits":
      return `Needs ${error.required} credits but only ${error.available} are available.`;
  }
}

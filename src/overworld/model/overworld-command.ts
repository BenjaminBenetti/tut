import type { Command } from "../../core/model/command";
import type { MechId } from "../../roster/model/mech";
import type { MechLoadout } from "../../roster/model/mech-loadout";
import type { SquadId } from "../../roster/model/squad";
import type { SquadTypeId } from "../../roster/model/squad-type";

// ===========================================
// Advance day
// ===========================================

/**
 * Command type that moves the campaign one day forward (GDD §5.2).
 * Namespaced like the domain events so the two vocabularies never collide.
 */
export const ADVANCE_DAY = "overworld:advance-day";

/** `AdvanceDay` carries no data: one command, one day. */
export type AdvanceDayPayload = Record<string, never>;

/** Asks the overworld to run one day's tick pipeline (#68). */
export type AdvanceDayCommand = Command<typeof ADVANCE_DAY, AdvanceDayPayload>;

/** Builds an `AdvanceDay` command. */
export function advanceDay(): AdvanceDayCommand {
  return { type: ADVANCE_DAY, payload: {} };
}

// ===========================================
// Roster commands (#63)
// ===========================================

/** Command type that hires a squad (GDD §5.7). */
export const HIRE_SQUAD = "roster:hire-squad";

/** Which type to hire and what to call it. */
export interface HireSquadPayload {
  readonly typeId: SquadTypeId;
  readonly name: string;
}

/** Buys a fresh, full-strength squad. */
export type HireSquadCommand = Command<typeof HIRE_SQUAD, HireSquadPayload>;

/** Builds a `HireSquad` command. */
export function hireSquad(typeId: SquadTypeId, name: string): HireSquadCommand {
  return { type: HIRE_SQUAD, payload: { typeId, name } };
}

/** Command type that brings a depleted squad back toward full strength. */
export const REINFORCE_SQUAD = "roster:reinforce-squad";

/** Which squad and how many soldiers to add. */
export interface ReinforceSquadPayload {
  readonly squadId: SquadId;
  /** Positive whole number, at most what the squad is missing. */
  readonly soldiers: number;
}

/** Pays per soldier to reinforce a squad. */
export type ReinforceSquadCommand = Command<
  typeof REINFORCE_SQUAD,
  ReinforceSquadPayload
>;

/** Builds a `ReinforceSquad` command. */
export function reinforceSquad(
  squadId: SquadId,
  soldiers: number,
): ReinforceSquadCommand {
  return { type: REINFORCE_SQUAD, payload: { squadId, soldiers } };
}

/** Command type that saves a validated loadout template by name (GDD §5.8). */
export const SAVE_LOADOUT = "roster:save-loadout";

/** The template to save; its `name` is the key and overwrites a same-named template. */
export interface SaveLoadoutPayload {
  readonly loadout: MechLoadout;
}

/** Saves or replaces a loadout template. */
export type SaveLoadoutCommand = Command<
  typeof SAVE_LOADOUT,
  SaveLoadoutPayload
>;

/** Builds a `SaveLoadout` command. */
export function saveLoadout(loadout: MechLoadout): SaveLoadoutCommand {
  return { type: SAVE_LOADOUT, payload: { loadout } };
}

/** Command type that removes a saved loadout template. */
export const DELETE_LOADOUT = "roster:delete-loadout";

/** The template name to delete. */
export interface DeleteLoadoutPayload {
  readonly name: string;
}

/** Deletes a loadout template; built mechs keep their own copy. */
export type DeleteLoadoutCommand = Command<
  typeof DELETE_LOADOUT,
  DeleteLoadoutPayload
>;

/** Builds a `DeleteLoadout` command. */
export function deleteLoadout(name: string): DeleteLoadoutCommand {
  return { type: DELETE_LOADOUT, payload: { name } };
}

/** Command type that builds a mech from a saved template (GDD §5.8). */
export const BUILD_MECH = "roster:build-mech";

/** Which template to build and what to call the mech. */
export interface BuildMechPayload {
  readonly loadoutName: string;
  readonly mechName: string;
}

/** Validates and buys a mech from a saved loadout. */
export type BuildMechCommand = Command<typeof BUILD_MECH, BuildMechPayload>;

/** Builds a `BuildMech` command. */
export function buildMech(
  loadoutName: string,
  mechName: string,
): BuildMechCommand {
  return { type: BUILD_MECH, payload: { loadoutName, mechName } };
}

/** Command type that repairs a damaged mech for credits (GDD §5.7). */
export const REPAIR_MECH = "roster:repair-mech";

/** Which mech to repair; repairs are always full. */
export interface RepairMechPayload {
  readonly mechId: MechId;
}

/** Pays `repairCostPerPoint × damage` to bring a mech back to zero damage. */
export type RepairMechCommand = Command<typeof REPAIR_MECH, RepairMechPayload>;

/** Builds a `RepairMech` command. */
export function repairMech(mechId: MechId): RepairMechCommand {
  return { type: REPAIR_MECH, payload: { mechId } };
}

// ===========================================
// Union
// ===========================================

/**
 * Every command the overworld dispatcher accepts, one line per command
 * so the list stays discoverable. Later issues add a member here
 * (#65 build/decommission deployable, #67 launch mission, #70 resolve
 * event) and register a handler at the composition root; the dispatcher
 * itself never changes.
 */
export type OverworldCommand =
  | AdvanceDayCommand
  | HireSquadCommand
  | ReinforceSquadCommand
  | SaveLoadoutCommand
  | DeleteLoadoutCommand
  | BuildMechCommand
  | RepairMechCommand;

/** The `type` tag of an `OverworldCommand`. */
export type OverworldCommandType = OverworldCommand["type"];

/** The member of `OverworldCommand` with the given `type` tag. */
export type CommandFor<TType extends OverworldCommandType> = Extract<
  OverworldCommand,
  { readonly type: TType }
>;

import type { Command } from "../../core/model/command";

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
// Union
// ===========================================

/**
 * Every command the overworld dispatcher accepts, one line per command
 * so the list stays discoverable. Later issues add a member here
 * (#65 build/decommission deployable, #67 launch mission, #70 resolve
 * event) and register a handler at the composition root; the dispatcher
 * itself never changes.
 */
export type OverworldCommand = AdvanceDayCommand;

/** The `type` tag of an `OverworldCommand`. */
export type OverworldCommandType = OverworldCommand["type"];

/** The member of `OverworldCommand` with the given `type` tag. */
export type CommandFor<TType extends OverworldCommandType> = Extract<
  OverworldCommand,
  { readonly type: TType }
>;

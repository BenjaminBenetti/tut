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
// Registration
// ===========================================

declare module "./overworld-command" {
  interface OverworldCommandMap {
    [ADVANCE_DAY]: AdvanceDayCommand;
  }
}

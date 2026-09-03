import type { Command } from "../../core/model/command";
import type { SquadTypeId } from "../../roster/model/squad-type";

// ===========================================
// Hire squad
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

// ===========================================
// Registration
// ===========================================

declare module "./overworld-command" {
  interface OverworldCommandMap {
    [HIRE_SQUAD]: HireSquadCommand;
  }
}

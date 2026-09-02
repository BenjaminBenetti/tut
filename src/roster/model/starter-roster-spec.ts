import type { MechLoadout } from "./mech-loadout";
import type { SquadTypeId } from "./squad-type";

/** A squad the player starts with: which type, and what to call it. */
export interface StarterSquadSpec {
  readonly typeId: SquadTypeId;
  readonly name: string;
}

/** A mech the player starts with: its name and the loadout it is built from. */
export interface StarterMechSpec {
  readonly name: string;
  readonly loadout: MechLoadout;
}

/**
 * What a new campaign's roster holds before the first purchase. Content,
 * not logic: `createInitialRosterState` turns it into owned squads and
 * mechs with fresh ids. Defaults live in `roster/data/starter-roster.ts`.
 */
export interface StarterRosterSpec {
  readonly squads: readonly StarterSquadSpec[];
  readonly mechs: readonly StarterMechSpec[];
}

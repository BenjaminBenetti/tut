import type { SquadTypeId } from "./squad-type";

/**
 * Identifier of an owned squad, issued by core's `IdGenerator` with the
 * `"squad"` prefix (e.g. `"squad-3"`). Plain string, matching the
 * generator's contract.
 */
export type SquadId = string;

/** Prefix the id generator uses for squads, e.g. `"squad-3"`. */
export const SQUAD_ID_PREFIX = "squad";

/** Soldiers in a full squad (GDD §5.7: "one squad token of ~5 soldiers"). */
export const SQUAD_MAX_STRENGTH = 5;

/**
 * One roster entry: a squad token of several soldiers that persists
 * across missions with casualties, kills and experience (GDD §5.7).
 * Plain data; it lives inside `GameState.roster` and is saved as-is.
 *
 * Invariants (enforced by the services that mutate squads, not by the
 * type): `strength` is an integer in `0..maxStrength`; a squad at
 * strength `0` is wiped and removed from the roster.
 */
export interface Squad {
  /** Unique id from the id generator. */
  readonly id: SquadId;
  /** Player-facing name, e.g. `"Alpha"`. */
  readonly name: string;
  /** Key into the squad type catalogue. */
  readonly typeId: SquadTypeId;
  /** Soldiers currently alive, `0..maxStrength`. */
  readonly strength: number;
  /** Soldiers when the squad is at full strength. */
  readonly maxStrength: number;
  /** Lifetime confirmed kills across missions. */
  readonly kills: number;
  /** Missions the squad has returned from. */
  readonly missionsSurvived: number;
  /** Accumulated experience points. */
  readonly xp: number;
}

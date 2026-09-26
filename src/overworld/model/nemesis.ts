import type { BugSpeciesId } from "../../content/model/bug-species-id";
import type { RegionId } from "./region";

// ===========================================
// Ids
// ===========================================

/** Id of a named enemy the campaign remembers. Plain string (ADR 0003 §2.4). */
export type NemesisId = string;

// ===========================================
// Nemesis
// ===========================================

/**
 * A named enemy that survived a mission and is remembered by the
 * campaign (campaign arc §8–§9, ADR 0013 §2.1): a Broodmother or an alpha
 * that escaped, carrying the scar the player gave it, who comes back
 * stronger. Plain serializable data inside `CampaignProgress.nemeses`.
 *
 * ```
 *   Nemesis
 *   ├── id          stable across missions
 *   ├── speciesId   what it is (brute, broodmother, …)
 *   ├── name        what the briefing calls it
 *   ├── scar        what the player did to it last time
 *   ├── regionId    where it hunts
 *   ├── level       how much stronger it has grown, 1 on first meeting
 *   └── escapes     how many missions it has survived
 * ```
 */
export interface Nemesis {
  readonly id: NemesisId;
  /** The species it belongs to. */
  readonly speciesId: BugSpeciesId;
  /** Its name, e.g. "Old Scald". */
  readonly name: string;
  /** Free text: the wound or mark it carries from the player's squads. */
  readonly scar: string;
  /** The region it was last seen in, where its hunts are offered. */
  readonly regionId: RegionId;
  /** Growth level, a positive integer; higher is stronger. */
  readonly level: number;
  /** Missions it has survived, a non-negative integer. */
  readonly escapes: number;
}

// ===========================================
// Wounds
// ===========================================

/**
 * What last hurt a named enemy before it got away (campaign arc §6.8:
 * "the briefing names her scar"): read by the tactical resolver off the
 * mission log and carried on the result, so the nemesis record can give
 * it a scar that says what happened. Plain strings, so the overworld
 * reads them without the tactical layer's event types.
 *
 * ```
 *   gunfire   a squad's shot                    mech    a mech's weapon
 *   turret    a deployed or garrison turret     blast   a grenade, charge or shell's burst
 *   fire      burning ground
 * ```
 */
export type NemesisWound = "gunfire" | "mech" | "turret" | "blast" | "fire";

/** Every `NemesisWound`, in a fixed order, for tables keyed by it and their tests. */
export const NEMESIS_WOUNDS: readonly NemesisWound[] = [
  "gunfire",
  "mech",
  "turret",
  "blast",
  "fire",
];

/**
 * How a named enemy came out of the mission, for its scar: a wound, or
 * `"unmarked"` when it got away without one.
 */
export type NemesisMark = NemesisWound | "unmarked";

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

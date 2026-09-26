import type { ActId } from "../../content/model/act-id";
import type { BugSpeciesId } from "../../content/model/bug-species-id";

// ===========================================
// Debut
// ===========================================

/**
 * When a rolled species first joins the spawn table (campaign arc §3):
 * from `missionsInAct` missions played in `act` onwards, and in every
 * later act. It counts missions played, so it follows the player's pace;
 * it is not a gate.
 *
 * ```
 *   { act: "act-1", missionsInAct: 4 }   the brute: from the fifth mission (M5)
 *   { act: "act-1", missionsInAct: 0 }   from the campaign's first mission
 * ```
 */
export interface SpeciesDebut {
  /** The act it debuts in. */
  readonly act: ActId;
  /**
   * Missions already played in `act` when it first appears; `0` is the
   * act's first mission. Whole and non-negative.
   */
  readonly missionsInAct: number;
}

// ===========================================
// Bestiary entry
// ===========================================

/**
 * A species the spawners and edge waves roll: its share of the rolled
 * hatches and waves in each act (arc §8) and its debut. Shares are the
 * arc's percentages as written; a mix renormalises over the species
 * that have debuted, so the shares of one act need not sum to 100.
 */
export interface RolledBestiaryEntry {
  readonly kind: "rolled";
  /**
   * Its share of rolled bugs in each act. Keyed by the closed `ActId`,
   * so every act must be named; `0` keeps it out of that act.
   */
  readonly shares: Readonly<Record<ActId, number>>;
  /** When it first joins the roll. */
  readonly debut: SpeciesDebut;
}

/**
 * A species that is never rolled: a boss or a placed bug (the
 * Broodmother, Hive Guard, the Sovereign), which its mission's setup
 * rule stands on the map (ADR 0013 §2.6). It has no share in any mix.
 */
export interface PlacedBestiaryEntry {
  readonly kind: "placed";
}

/**
 * What the bestiary knows about one species (arc §8): rolled by act
 * share once it has debuted, or placed by its mission.
 *
 * ```
 *   BestiaryEntry
 *   ├── rolled  shares { act-1, act-2, act-3, finale }, debut { act, missionsInAct }
 *   └── placed  never rolled; a setup rule places it
 * ```
 */
export type BestiaryEntry = RolledBestiaryEntry | PlacedBestiaryEntry;

// ===========================================
// Bestiary
// ===========================================

/**
 * The bestiary table: one entry per species. `Partial`, so a species
 * that has no entry yet (or is not in the campaign) is never rolled by a
 * mix, and a new species adds one entry when it lands.
 */
export type Bestiary = Readonly<Partial<Record<BugSpeciesId, BestiaryEntry>>>;

import type { RegionId } from "./region";

// ===========================================
// Ids
// ===========================================

/**
 * A continent-scale grouping of regions (campaign arc §6.9: the Great
 * Hives sit "one per continent-scale region"). A closed union: the
 * grouping is content, and a Great Hive freezes the one it sits on.
 */
export type ContinentId =
  | "north-america"
  | "south-america"
  | "europe"
  | "africa-middle-east"
  | "asia"
  | "oceania";

/**
 * Every continent id, in map order: the order the Great Hive reveal
 * visits them before its draw. Append-only, since the draw shuffles
 * this list (ADR 0013 §2.3, ordering is part of determinism).
 */
export const CONTINENT_IDS: readonly ContinentId[] = [
  "north-america",
  "south-america",
  "europe",
  "africa-middle-east",
  "asia",
  "oceania",
];

// ===========================================
// Continent
// ===========================================

/**
 * A continent: a name and the regions it covers. Every region of the
 * Earth map belongs to exactly one continent.
 *
 * ```
 *   europe ──► western-europe, eastern-europe, mediterranean-basin,
 *              arctic-north-atlantic
 * ```
 */
export interface Continent {
  readonly id: ContinentId;
  /** Display name: "Europe", "Africa and the Middle East". */
  readonly name: string;
  /** The regions it covers, in map order. */
  readonly regionIds: readonly RegionId[];
}

/** Every continent by id: the shipped grouping in `overworld/data/continents.ts`. */
export type ContinentCatalogue = Readonly<Record<ContinentId, Continent>>;

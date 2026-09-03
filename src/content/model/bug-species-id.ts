// ===========================================
// Bug species id
// ===========================================

/**
 * Bug species the game ships (GDD §6.4). A closed union so the
 * `BUG_SPECIES` record in `bugs/data/species` must define every member;
 * later species (Track: Bestiary, hive and platform variants) are one
 * new member here plus one entry there, and any table keyed by this id
 * that forgets one fails to compile.
 */
export type BugSpeciesId = "swarmer" | "lurker" | "brute";

/** Every bug species id, in a fixed order. */
export const BUG_SPECIES_IDS: readonly BugSpeciesId[] = [
  "swarmer",
  "lurker",
  "brute",
];

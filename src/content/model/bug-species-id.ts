// ===========================================
// Bug species id
// ===========================================

/**
 * Bug species the game ships (GDD §6.4). A closed union so the
 * `BUG_SPECIES` record in `bugs/data/species` must define every member;
 * later species (Track: Bestiary, hive and platform variants) are one
 * new member here plus one entry there, and any table keyed by this id
 * that forgets one fails to compile.
 *
 * An armoured variant (campaign arc §8, #1179) is named `<base>-armoured`:
 * the base species first, so the id reads as its model id without the
 * `bug.` prefix (`bug.swarmer-armoured`), sorts beside its base, and a
 * check for the swarmer family (`startsWith("bug.swarmer")`) covers both.
 */
export type BugSpeciesId =
  | "swarmer"
  | "lurker"
  | "brute"
  | "spitter"
  | "burrower"
  | "hive-guard"
  | "swarmer-armoured"
  | "lurker-armoured"
  | "brute-armoured"
  | "broodmother"
  | "sovereign";

/**
 * Every bug species id, in a fixed order. New species append, so every
 * reader that walks the list in order (the bestiary's mix, the default
 * spawn roll) sees the earlier species exactly as before. The burrower
 * sits before the Hive Guard rather than after it: the guard is placed,
 * never walked into a mix or a roll, so no rolled species moves.
 */
export const BUG_SPECIES_IDS: readonly BugSpeciesId[] = [
  "swarmer",
  "lurker",
  "brute",
  "spitter",
  "burrower",
  "hive-guard",
  "swarmer-armoured",
  "lurker-armoured",
  "brute-armoured",
  "broodmother",
  "sovereign",
];

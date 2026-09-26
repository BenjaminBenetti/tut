import { BUG_SPECIES } from "../../bugs/data/species";
import type { BugSpeciesId } from "../../content/model/bug-species-id";

// ===========================================
// Types
// ===========================================

/** Where a species' display name comes from: any table of names by id. */
export type SpeciesNames = Readonly<
  Record<BugSpeciesId, { readonly name: string }>
>;

// ===========================================
// Public Functions
// ===========================================

/**
 * What running text calls a species: its display name, lower-cased for
 * the middle of a sentence ("netted a live armoured lurker"). Never the
 * id, which reads backwards and hyphenated for an armoured variant
 * (#1179) and hyphenated for the Hive Guard.
 *
 * ```
 *   swarmer            ──► swarmer
 *   hive-guard         ──► hive guard
 *   swarmer-armoured   ──► armoured swarmer
 * ```
 *
 * The unit card's title and the log's unit names already use the
 * species name through the unit's template; this is the same name where
 * the text holds only a species id: a netted specimen and the objective
 * that asks for one.
 *
 * @param id - The species.
 * @param species - The names to draw on; the shipped species by default.
 * @returns The species as a noun in a sentence.
 */
export function speciesNoun(
  id: BugSpeciesId,
  species: SpeciesNames = BUG_SPECIES,
): string {
  return species[id].name.toLowerCase();
}

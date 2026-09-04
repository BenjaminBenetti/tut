import type { BugSpeciesId } from "../../content/model/bug-species-id";
import { BUG_SPECIES_IDS } from "../../content/model/bug-species-id";
import type { SpeciesLookup } from "../ai/behaviour-registry";
import type { BugSpecies } from "../model/bug-species";

// ===========================================
// Species lookup
// ===========================================

/**
 * A `SpeciesLookup` over a species catalogue: the bug phase hands it a
 * unit's `sourceId`, which for a bug is its species id (`tactical/model/unit`),
 * and gets the definition its behaviour is registered against.
 *
 * ```
 *   unit.sourceId "lurker" ──► BUG_SPECIES.lurker ──► behaviour "flank"
 *   unit.sourceId "squad-1" ─► undefined ──────────► the unit holds still
 * ```
 *
 * An id outside the closed `BugSpeciesId` union resolves to nothing
 * rather than indexing the record blind, so a squad's `sourceId` — or
 * `"toString"` — can never be mistaken for a species.
 */
export function createSpeciesLookup(
  species: Readonly<Record<BugSpeciesId, BugSpecies>>,
): SpeciesLookup {
  return (id) =>
    BUG_SPECIES_IDS.includes(id as BugSpeciesId)
      ? species[id as BugSpeciesId]
      : undefined;
}

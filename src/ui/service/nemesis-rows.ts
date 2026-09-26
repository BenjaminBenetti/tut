import { BUG_SPECIES } from "../../bugs/data/species";
import type { NemesisId } from "../../overworld/model/nemesis";
import { findRegion } from "../../overworld/service/earth-map-query-service";
import type { GameState } from "../../save/model/game-state";
import { formatWhole } from "./format";
import type { SpeciesNames } from "./species-noun";

// ===========================================
// Types
// ===========================================

/** One remembered enemy as the overworld's readout shows it (campaign arc §8). */
export interface NemesisRow {
  /** The record's id, for the row's `data-nemesis-id`. */
  readonly id: NemesisId;
  /** What the campaign calls it: "Old Scald". */
  readonly name: string;
  /** "Level 2". */
  readonly level: string;
  /** Its species and where it hunts: "Broodmother · East Asia". */
  readonly where: string;
  /** What the squad did to it: "burned along the flank". */
  readonly scar: string;
}

// ===========================================
// Public Functions
// ===========================================

/**
 * The campaign's nemeses as the readout's rows, in the order the record
 * holds them (the order they first got away). Empty with no campaign or
 * no nemesis, which hides the readout.
 *
 * ```
 *   { name: "Old Scald", level: 2, speciesId: "broodmother", regionId: "east-asia", scar }
 *     ──► Old Scald   Level 2
 *         Broodmother · East Asia
 *         burned along the flank
 * ```
 *
 * A species or region this build does not know (an older save) keeps
 * its id rather than dropping the row.
 *
 * @param state - The campaign, or undefined before one exists.
 * @param species - Species display names; the shipped species by default.
 * @returns One row per nemesis.
 */
export function nemesisRows(
  state: GameState | undefined,
  species: Partial<SpeciesNames> = BUG_SPECIES,
): readonly NemesisRow[] {
  if (state === undefined) {
    return [];
  }
  const map = state.overworld.map;
  return state.overworld.progress.nemeses.map((nemesis) => ({
    id: nemesis.id,
    name: nemesis.name,
    level: `Level ${formatWhole(nemesis.level)}`,
    where: `${species[nemesis.speciesId]?.name ?? nemesis.speciesId} · ${findRegion(map, nemesis.regionId)?.name ?? nemesis.regionId}`,
    scar: nemesis.scar,
  }));
}

import type { GameState } from "../model/game-state";
import { isRecord } from "../../core/model/record-guard";

// ===========================================
// Guard
// ===========================================

/**
 * Shallow structural check that decoded data is a `GameState`: the root
 * carries `meta`, `overworld`, `roster` and `economy`, and each slice has
 * the fields every reader touches first. It catches a pasted file that
 * is a valid envelope of something else; it does not validate domain
 * invariants, which belong to the domains and their migrations. The one
 * per-entry check is the map's cities: each has a numeric `population`,
 * which every save at v24 carries (#1154) and the city wheel reads.
 *
 * ```
 *   { meta: { seed, rng, ids, createdAt },
 *     overworld: { day, map: { cities: [{ population }] }, ... },
 *     roster: { squads[], mechs[], savedLoadouts[], graveyard[] },
 *     economy: { credits, ledger[] } }
 * ```
 */
export function isGameStateShape(value: unknown): value is GameState {
  if (!isRecord(value)) {
    return false;
  }
  const { meta, overworld, roster, economy } = value;
  return (
    isRecord(meta) &&
    typeof meta.seed === "number" &&
    meta.rng !== undefined &&
    isRecord(meta.ids) &&
    typeof meta.createdAt === "string" &&
    isRecord(overworld) &&
    typeof overworld.day === "number" &&
    isRecord(overworld.map) &&
    Array.isArray(overworld.map.cities) &&
    overworld.map.cities.every(hasPopulation) &&
    isRecord(roster) &&
    Array.isArray(roster.squads) &&
    Array.isArray(roster.mechs) &&
    Array.isArray(roster.savedLoadouts) &&
    Array.isArray(roster.graveyard) &&
    isRecord(economy) &&
    typeof economy.credits === "number" &&
    Array.isArray(economy.ledger)
  );
}

// ===========================================
// Helpers
// ===========================================

/** True when a city entry carries the numeric population v24 requires. */
function hasPopulation(city: unknown): boolean {
  return isRecord(city) && typeof city.population === "number";
}

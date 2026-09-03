import type { GameState } from "../model/game-state";

// ===========================================
// Guard
// ===========================================

/**
 * Shallow structural check that decoded data is a `GameState`: the root
 * carries `meta`, `overworld`, `roster` and `economy`, and each slice has
 * the fields every reader touches first. It catches a pasted file that
 * is a valid envelope of something else; it does not validate domain
 * invariants, which belong to the domains and their migrations.
 *
 * ```
 *   { meta: { seed, rng, ids, createdAt },
 *     overworld: { day, map, ... },
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

/** True for a plain object (not null, not an array). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

import type { Migration } from "../model/migration";

// ===========================================
// Steps
// ===========================================

/** True for a plain object (not null, not an array). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * v1 → v2 (#58): the overworld slice gains `spreadCooldowns`, the days
 * each city must wait before spreading again. No city had spread in a
 * v1 save, so every city starts off cooldown.
 */
const ADD_SPREAD_COOLDOWNS: Migration = {
  from: 1,
  to: 2,
  apply(state) {
    if (!isRecord(state) || !isRecord(state.overworld)) {
      throw new Error("v1 state has no overworld slice");
    }
    return {
      ...state,
      overworld: { ...state.overworld, spreadCooldowns: {} },
    };
  },
};

// ===========================================
// Chain
// ===========================================

/**
 * Ordered forward migrations for `GameState`. Append one entry per
 * schema bump; never edit or remove an existing entry, since old saves
 * in players' browsers depend on it.
 */
export const GAME_STATE_MIGRATIONS: readonly Migration[] = [
  ADD_SPREAD_COOLDOWNS,
];

import type { Migration } from "../model/migration";

/**
 * Ordered forward migrations for `GameState`. Append one entry per
 * schema bump; never edit or remove an existing entry, since old saves
 * in players' browsers depend on it.
 */
export const GAME_STATE_MIGRATIONS: readonly Migration[] = [];

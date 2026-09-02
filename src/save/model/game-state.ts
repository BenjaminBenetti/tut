import type { IdGeneratorState } from "../../core/model/id-generator";
import type { RngState } from "../../core/model/rng";

/**
 * Schema version of `GameState`. Bump it whenever the shape changes and
 * add a matching `Migration` to `save/data/migrations.ts`.
 */
export const GAME_STATE_SCHEMA_VERSION = 1;

/**
 * Bookkeeping that every save needs regardless of gameplay content.
 */
export interface GameMeta {
  /** Seed the campaign was created from; everything derives from it. */
  readonly seed: number;
  /** Serialized master RNG so a reload continues the same sequence. */
  readonly rng: RngState;
  /** Serialized id counters so new entities never collide with saved ones. */
  readonly ids: IdGeneratorState;
  /** ISO-8601 timestamp supplied by the app when the campaign started. */
  readonly createdAt: string;
}

/**
 * Root of all game truth. Plain data; saving serializes this object.
 *
 * ```
 *   GameState
 *   ├── meta        seed, rng, ids, createdAt
 *   ├── overworld   (M1) earth map, cities, infestation, time, missions
 *   ├── roster      (M1) squads, mechs, parts, loadouts
 *   ├── economy     (M1) credits, transactions
 *   └── activeMission?  (M2) tactical state while a mission is live
 * ```
 *
 * The M1 slices are added by the engineers who build those domains:
 * add the field here, bump `GAME_STATE_SCHEMA_VERSION`, and add a
 * migration that fills the new slice for older saves.
 */
export interface GameState {
  readonly meta: GameMeta;
}

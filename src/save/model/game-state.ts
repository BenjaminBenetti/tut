import type { IdGeneratorState } from "../../core/model/id-generator";
import type { RngState } from "../../core/model/rng";
import type { EconomyState } from "../../economy/model/economy-state";
import type { OverworldState } from "../../overworld/model/overworld-state";
import type { RosterState } from "../../roster/model/roster-state";
import type { TacticalState } from "../../tactical/model/tactical-state";

/**
 * Schema version of `GameState`. Bump it whenever the shape changes and
 * add a matching `Migration` to `save/data/migrations.ts` (ADR 0003 §2.1).
 *
 * History:
 *
 * - `1`: the M1 slices (#54). No earlier save existed to migrate from.
 * - `2`: `overworld.spreadCooldowns` (#58).
 * - `3`: `overworld.map.cities[].scale` (#61).
 * - `4`: `roster.graveyard` (#64).
 * - `5`: `overworld.threatOffset` (#307).
 * - `6`: `activeMission` becomes the `TacticalState` slot (#323).
 * - `7`: `meta.debug` removed; dev switches live in the composition (#304).
 * - `8`: `activeMission.extracted` (#328).
 * - `9`: `activeMission.units[].charges` from each unit's template (#409).
 * - `10`: `activeMission.difficulty`, `.threat` and `spawners[].timer` (#329).
 * - `11`: `activeMission.vision`, per-side fog of war (#531, ADR 0006).
 */
export const GAME_STATE_SCHEMA_VERSION = 11;

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
 *   ├── meta            seed, rng, ids, createdAt
 *   ├── overworld       day, earth map, threat, missions, events, deployables
 *   ├── roster          squads, mechs, saved loadouts, graveyard
 *   ├── economy         credits, ledger
 *   └── activeMission?  (M2) tactical state while a mission is live
 * ```
 *
 * Each slice is typed by its domain's `*State` interface and built by
 * that domain's factory; `save/service/new-game-service.ts` composes
 * them into a fresh campaign. Adding or reshaping a slice means bumping
 * `GAME_STATE_SCHEMA_VERSION` and appending a migration.
 */
export interface GameState {
  readonly meta: GameMeta;
  /** Earth, time, threat, missions, events and deployables (GDD §5). */
  readonly overworld: OverworldState;
  /** Squads, mechs, saved loadouts and the graveyard (GDD §5.7, §5.8). */
  readonly roster: RosterState;
  /** Credits and the transaction ledger (GDD §5.5). */
  readonly economy: EconomyState;
  /**
   * Tactical state while a mission is being played (M2); absent between
   * missions. Set by the tactical mission start and cleared when the
   * mission resolves.
   */
  readonly activeMission?: TacticalState;
}

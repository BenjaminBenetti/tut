import type { IdGeneratorState } from "../../core/model/id-generator";
import type { RngState } from "../../core/model/rng";
import type { EconomyState } from "../../economy/model/economy-state";
import type { RosterState } from "../../roster/model/roster-state";
import type { OverworldState } from "./overworld-state";

// ===========================================
// Campaign state
// ===========================================

/**
 * The part of `meta` the command dispatcher owns: the serialized master
 * RNG and id counters it restores before a handler runs and writes back
 * after (the `createNewGame` pattern from #7/#54).
 */
export interface CampaignMeta {
  readonly rng: RngState;
  readonly ids: IdGeneratorState;
}

/**
 * The root state as the overworld sees it: every slice a command handler
 * may read or replace. `save/model/game-state.ts`'s `GameState` satisfies
 * this structurally (it adds `meta.seed`, `meta.createdAt` and the M2
 * `activeMission` slot), and the dispatcher is generic over
 * `TState extends CampaignState`, so the app drives it with the full
 * `GameState` type while `overworld/` never imports `save/` (ADR 0002).
 *
 * ```
 *   save/GameState ──satisfies──► overworld/CampaignState
 *   { meta, overworld, roster,     { meta: { rng, ids },
 *     economy, activeMission? }      overworld, roster, economy }
 * ```
 */
export interface CampaignState {
  readonly meta: CampaignMeta;
  readonly overworld: OverworldState;
  readonly roster: RosterState;
  readonly economy: EconomyState;
}

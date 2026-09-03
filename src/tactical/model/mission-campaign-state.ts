import type { CampaignState } from "../../overworld/model/campaign-state";
import type { TacticalState } from "./tactical-state";

// ===========================================
// Mission campaign state
// ===========================================

/**
 * The root state as the tactical domain sees it: the campaign slices plus
 * the optional active mission. `save/model/game-state.ts`'s `GameState`
 * satisfies this structurally, so the mission start and the tactical
 * handlers are generic over `TState extends MissionCampaignState` and the
 * app drives them with the full `GameState` while `tactical/` never
 * imports `save/` (ADR 0002 §3; same shape as `overworld/CampaignState`).
 *
 * ```
 *   save/GameState ──satisfies──► tactical/MissionCampaignState
 *   { meta, overworld, roster,     { meta, overworld, roster, economy,
 *     economy, activeMission? }      activeMission?: TacticalState }
 * ```
 */
export interface MissionCampaignState extends CampaignState {
  /** The mission being played, or absent between missions. */
  readonly activeMission?: TacticalState;
}

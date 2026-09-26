import type { TechConditions } from "../../tech/model/tech-conditions";
import { killedFlag } from "../../tech/model/tech-conditions";
import type { CampaignProgress } from "../model/campaign-progress";

// ===========================================
// Conditions
// ===========================================

/**
 * The campaign's conditions as the tech tree sees them (ADR 0013 §2.7):
 * every flag the story has set, plus a `killed:<species>` flag for each
 * species in the first-kill record, so an autopsy node with
 * `requiresFlags: ["killed:spitter"]` appears after the first spitter
 * dies (campaign arc §8, §10.2).
 *
 * ```
 *   flags ∪ { "killed:" + species | species ∈ speciesKilled }
 *   { flags: [spore-sample], speciesKilled: [swarmer] }
 *     ──► { "spore-sample", "killed:swarmer" }
 * ```
 *
 * The composition root hands this, over the root state, to the unlock
 * handler, the tech tree screen and the mech bay, so all three agree on
 * which nodes are hidden.
 */
export function campaignTechConditions(
  progress: CampaignProgress,
): TechConditions {
  return {
    flags: new Set<string>([
      ...progress.flags,
      ...progress.speciesKilled.map(killedFlag),
    ]),
  };
}

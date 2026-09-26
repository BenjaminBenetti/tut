import type { KillGroup } from "../../bugs/model/kill-group";
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
 * dies (campaign arc §8, §10.2), plus a `killed:<group>` flag for each
 * kill group with any member in that record, so the armoured carapace
 * autopsy appears after whichever armoured variant dies first.
 *
 * ```
 *   flags ∪ { "killed:" + species | species ∈ speciesKilled }
 *         ∪ { "killed:" + group.id | group.members ∩ speciesKilled ≠ ∅ }
 *   { flags: [spore-sample], speciesKilled: [swarmer, lurker-armoured] }
 *     ──► { "spore-sample", "killed:swarmer", "killed:lurker-armoured",
 *           "killed:armoured-carapace" }
 * ```
 *
 * The composition root hands this, over the root state and the
 * bestiary's `KILL_GROUPS`, to the unlock handler, the tech tree screen
 * and the mech bay, so all three agree on which nodes are hidden.
 *
 * @param progress - The campaign's story flags and first-kill record.
 * @param groups - The kill groups whose flags to derive.
 * @returns The flags the tree's `requiresFlags` are checked against.
 */
export function campaignTechConditions(
  progress: CampaignProgress,
  groups: readonly KillGroup[],
): TechConditions {
  const killed = new Set<string>(progress.speciesKilled);
  return {
    flags: new Set<string>([
      ...progress.flags,
      ...progress.speciesKilled.map(killedFlag),
      ...groups
        .filter((group) => group.members.some((member) => killed.has(member)))
        .map((group) => killedFlag(group.id)),
    ]),
  };
}

import type { BugSpeciesId } from "../../content/model/bug-species-id";
import type { KillGroupId } from "../../content/model/kill-group-id";

// ===========================================
// Kill group
// ===========================================

/**
 * Species whose first kill counts as one (campaign arc §10.2): the
 * first death of any member sets the group's `killed:<group>` flag,
 * which reveals the group's autopsy.
 *
 * ```
 *   speciesKilled ∋ any member ──► "killed:" + id
 * ```
 */
export interface KillGroup {
  /** The group's id, the flag's suffix. */
  readonly id: KillGroupId;
  /** The species that count toward it. At least one. */
  readonly members: readonly BugSpeciesId[];
}

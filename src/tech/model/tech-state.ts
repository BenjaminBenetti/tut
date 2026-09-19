import type { TechNodeId } from "./tech-node";

/**
 * The tech slice of `GameState` (#1171): which nodes of the tree the
 * player has bought. Plain serializable data. The tech points themselves
 * live in `EconomyState.techPoints` beside the credits they are shown
 * with; this slice is what they were spent on.
 *
 * ```
 *   TechState
 *   └── unlocked   node ids in the order they were bought
 * ```
 */
export interface TechState {
  /** Ids of every unlocked node, oldest first. Never holds a duplicate. */
  readonly unlocked: readonly TechNodeId[];
}

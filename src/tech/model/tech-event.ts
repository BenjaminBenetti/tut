import type { DomainEvent } from "../../core/model/domain-event";
import type { EconomyEvent } from "../../economy/model/economy-event";
import type { EconomyState } from "../../economy/model/economy-state";
import type { PartId } from "../../roster/model/mech-part";
import type { TechNodeId } from "./tech-node";
import type { TechState } from "./tech-state";

// ===========================================
// Tech unlocked
// ===========================================

/** Event type emitted when a tech node is bought. */
export const TECH_UNLOCKED = "tech:unlocked";

/** What presentation needs to announce an unlock. */
export interface TechUnlockedPayload {
  readonly nodeId: TechNodeId;
  /** Tech points the unlock cost. */
  readonly cost: number;
  /** The parts that just became purchasable. */
  readonly parts: readonly PartId[];
}

/** A node of the tech tree was unlocked. */
export type TechUnlockedEvent = DomainEvent<
  typeof TECH_UNLOCKED,
  TechUnlockedPayload
>;

// ===========================================
// Union and applied shape
// ===========================================

/** Every event the tech domain can emit. */
export type TechEvent = TechUnlockedEvent;

/**
 * What a tech command returns: the next tech and economy slices plus the
 * tech event and the `TechPointsChanged` the spend produced.
 *
 * ```
 *   (tech, economy, command) ──► service ──► { tech', economy', events[] }
 * ```
 */
export interface TechApplied {
  readonly tech: TechState;
  readonly economy: EconomyState;
  readonly events: readonly (TechEvent | EconomyEvent)[];
}

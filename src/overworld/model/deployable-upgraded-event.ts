import type { DomainEvent } from "../../core/model/domain-event";
import type { Deployable } from "./deployable";
import type { DeployableLevel } from "./deployable-level";

// ===========================================
// Deployable upgraded
// ===========================================

/** Event type emitted when an installation is raised one level. */
export const DEPLOYABLE_UPGRADED = "overworld:deployable-upgraded";

/** What presentation needs to show the upgrade. */
export interface DeployableUpgradedPayload {
  /** The installation after the upgrade, at its new level. */
  readonly deployable: Deployable;
  /** The level it was at. */
  readonly from: DeployableLevel;
  /** The level it is now at. Always `from + 1`. */
  readonly to: DeployableLevel;
  /** Credits paid. */
  readonly cost: number;
}

/** An installation was upgraded one level (GDD §5.6). */
export type DeployableUpgradedEvent = DomainEvent<
  typeof DEPLOYABLE_UPGRADED,
  DeployableUpgradedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./overworld-domain-event" {
  interface OverworldEventMap {
    [DEPLOYABLE_UPGRADED]: DeployableUpgradedEvent;
  }
}

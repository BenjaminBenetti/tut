import type { DomainEvent } from "../../core/model/domain-event";
import type { DeployableStatusPayload } from "./deployable-status-event";

// ===========================================
// Deployable removed
// ===========================================

/** Event type emitted when an installation is decommissioned. */
export const DEPLOYABLE_REMOVED = "overworld:deployable-removed";

/** An installation was decommissioned and is gone; nothing was refunded. */
export type DeployableRemovedEvent = DomainEvent<
  typeof DEPLOYABLE_REMOVED,
  DeployableStatusPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./overworld-domain-event" {
  interface OverworldEventMap {
    [DEPLOYABLE_REMOVED]: DeployableRemovedEvent;
  }
}

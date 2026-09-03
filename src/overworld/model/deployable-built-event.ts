import type { DomainEvent } from "../../core/model/domain-event";
import type { Deployable } from "./deployable";

// ===========================================
// Deployable built
// ===========================================

/** Event type emitted when an installation is bought and placed. */
export const DEPLOYABLE_BUILT = "overworld:deployable-built";

/** What presentation needs to show the new installation. */
export interface DeployableBuiltPayload {
  readonly deployable: Deployable;
  /** Credits paid. */
  readonly cost: number;
}

/** An installation was built in a region (GDD §5.6). */
export type DeployableBuiltEvent = DomainEvent<
  typeof DEPLOYABLE_BUILT,
  DeployableBuiltPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./overworld-domain-event" {
  interface OverworldEventMap {
    [DEPLOYABLE_BUILT]: DeployableBuiltEvent;
  }
}

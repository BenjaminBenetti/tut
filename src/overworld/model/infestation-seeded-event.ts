import type { DomainEvent } from "../../core/model/domain-event";
import type { CityId } from "./city";

// ===========================================
// Infestation seeded
// ===========================================

/** Event type emitted when a clean city gains a fresh infestation. */
export const INFESTATION_SEEDED = "overworld:infestation-seeded";

/** What presentation needs to animate a new landing. */
export interface InfestationSeededPayload {
  /** The city that was clean and is now infested. */
  readonly cityId: CityId;
}

/** A clean city was seeded with a new infestation (GDD §5.3). */
export type InfestationSeededEvent = DomainEvent<
  typeof INFESTATION_SEEDED,
  InfestationSeededPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./overworld-domain-event" {
  interface OverworldEventMap {
    [INFESTATION_SEEDED]: InfestationSeededEvent;
  }
}

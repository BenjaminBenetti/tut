import type { DomainEvent } from "../../core/model/domain-event";
import type { GreatHive } from "./great-hive";

// ===========================================
// Great Hives revealed
// ===========================================

/** Event type emitted when Uplink's tracking data reveals the Great Hives. */
export const GREAT_HIVES_REVEALED = "overworld:great-hives-revealed";

/** What presentation needs to tell the story beat. */
export interface GreatHivesRevealedPayload {
  /** The Great Hives, in reveal order, each naming its continent. */
  readonly greatHives: readonly GreatHive[];
}

/**
 * The Spore Platform's three beacons are found (campaign arc §3 Act III,
 * §6.9): "Three Great Hives: the platform's beacons". Emitted once, by
 * the `great-hive-reveal` tick step on the first day tick after Uplink
 * is won; the overworld screen opens its story beat from it.
 */
export type GreatHivesRevealedEvent = DomainEvent<
  typeof GREAT_HIVES_REVEALED,
  GreatHivesRevealedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./overworld-domain-event" {
  interface OverworldEventMap {
    [GREAT_HIVES_REVEALED]: GreatHivesRevealedEvent;
  }
}

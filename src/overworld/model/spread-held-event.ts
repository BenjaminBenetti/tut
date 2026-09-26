import type { DomainEvent } from "../../core/model/domain-event";
import type { CityId } from "./city";

// ===========================================
// Spread held
// ===========================================

/** Event type emitted when a city's next spread is put off (arc §6.7). */
export const SPREAD_HELD = "overworld:spread-held";

/** Which city is held, and for how long. */
export interface SpreadHeldPayload {
  /** The city whose spread is held. */
  readonly cityId: CityId;
  /** Its spread cooldown now, in days: it spreads no sooner than this many days on. */
  readonly days: number;
}

/**
 * A city's spread cooldown was lengthened by something other than its
 * own spread: a won Tunnel Sabotage sealed its tunnels (arc §6.7).
 */
export type SpreadHeldEvent = DomainEvent<
  typeof SPREAD_HELD,
  SpreadHeldPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./overworld-domain-event" {
  interface OverworldEventMap {
    [SPREAD_HELD]: SpreadHeldEvent;
  }
}

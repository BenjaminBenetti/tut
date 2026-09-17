import type { DomainEvent } from "../../core/model/domain-event";
import type { CityId } from "./city";
import type { RegionId } from "./region";

// ===========================================
// City detected
// ===========================================

/** Event type emitted when an infested city's infestation is first found. */
export const CITY_DETECTED = "overworld:city-detected";

/** What presentation needs to announce the find. */
export interface CityDetectedPayload {
  readonly cityId: CityId;
  readonly regionId: RegionId;
  /** The infestation revealed. Positive. */
  readonly infestation: number;
}

/**
 * An infested city was detected (GDD §5.3): its infestation is now shown
 * to the player and it may offer missions.
 */
export type CityDetectedEvent = DomainEvent<
  typeof CITY_DETECTED,
  CityDetectedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./overworld-domain-event" {
  interface OverworldEventMap {
    [CITY_DETECTED]: CityDetectedEvent;
  }
}

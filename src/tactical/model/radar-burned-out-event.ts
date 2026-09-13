import type { DomainEvent } from "../../core/model/domain-event";
import type { TileCoord } from "../../mapgen/model/tile-coord";

// ===========================================
// RadarBurnedOut
// ===========================================

/** Event type: a scanner's battery ran out. */
export const RADAR_BURNED_OUT = "tactical:radar-burned-out";

/** Payload of `RadarBurnedOut`. */
export interface RadarBurnedOutPayload {
  readonly radarId: string;
  /** Where the dead scanner stands; it stays on the map. */
  readonly pos: TileCoord;
}

/** A scanner's battery ran down as a player turn opened (#1130). */
export type RadarBurnedOutEvent = DomainEvent<
  typeof RADAR_BURNED_OUT,
  RadarBurnedOutPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [RADAR_BURNED_OUT]: RadarBurnedOutEvent;
  }
}
